# Pre-LLM Filter Framework

> 状态：设计中
> 关联：ADR-004（Pluggable LLM Router）、ADR-007（Distill Idempotency）、ADR-008（Distiller Plugin Loading）

## 1. 问题陈述

### 1.1 当前架构

```
Session → distiller.run() → LLM (system prompt 软约束) → parse + dedup (硬约束) → 产出
```

每个 session 无论质量如何，都消耗一次 LLM 调用。1 条消息的 "hello world" 和 100 条消息的深入技术讨论，调用成本相同。

### 1.2 核心矛盾

- **成本**：LLM 调用是蒸馏管道中最昂贵的操作。2000+ session 全部走 LLM，即使 80% 注定无产出。
- **速度**：本地 LM Studio 35B 模型每个 session 30-60 秒。2000 session × 30s ≈ 17 小时连续运行。
- **准确性**：LLM 的 "return []" 软约束不可靠。模型有讨好倾向——prompt 说"返回空数组"，它还是会尽量找东西输出。

### 1.3 为什么这不是 distiller 内部的事

每个 distiller 独立实现噪声过滤会导致：
- `buildPrompt` 里塞噪声过滤指令 → 和萃取指令混在一起，prompt engineering 困难
- `parseXxx` 里加阈值 → 每个 distiller 重复实现
- 无法在引擎层做统一的可观测性（多少 session 被过滤？为什么？）

## 2. 设计方案

### 2.1 三层过滤架构

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 1: Prefilter (引擎层, 代码规则)                          │
│   输入: SessionArtifact                                       │
│   输出: { pass: boolean, reason?: string }                    │
│   成本: ~0.1ms (纯内存运算)                                    │
│   目标: 快速筛掉明显无信号的 session，节省 LLM 调用              │
├──────────────────────────────────────────────────────────────┤
│ Layer 2: LLM (distiller 层, 语义判断)                          │
│   输入: prompt + SessionArtifact                              │
│   输出: JSON array (可能是 [])                                 │
│   成本: 30s-5min (取决于模型)                                  │
│   目标: 语义理解，提取可复用洞察                                │
├──────────────────────────────────────────────────────────────┤
│ Layer 3: Parse + Dedup (distiller 层, 代码硬约束)              │
│   输入: LLM 原始输出                                           │
│   输出: DistillResultDraft[] (经过校验、去重、截断)             │
│   成本: ~1ms                                                  │
│   目标: 保证最低质量门槛，没有人能绕过                           │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 接口契约

```typescript
// packages/core/src/index.ts — 新增 DistillerPlugin 可选方法

export interface DistillerPlugin {
  // ... 现有字段保持不变 ...

  /**
   * 预过滤：在 LLM 调用前判断 session 是否值得蒸馏。
   *
   * - 由引擎层在 processSessionArtifact() 之前调用
   * - 不实现则默认通过（向后兼容）
   * - 必须是同步的、纯内存运算（不依赖外部服务）
   * - 返回 { pass: false } 的 session 会被标记为 processed 并跳过
   *
   * 设计约束：
   * - 宁可误放，不可误杀。预过滤的目标是节省成本，不是替代 LLM 判断。
   * - reason 字段用于可观测性（journal），不是给用户看的错误信息。
   */
  prefilter?(artifact: SessionArtifact): PrefilterResult;
}

export interface PrefilterResult {
  pass: boolean;
  /** 过滤原因，用于 journal 记录。例如 "session too short (1 msg)" */
  reason?: string;
}
```

### 2.3 默认预过滤器

引擎层提供一个共享的默认预过滤器，distiller 可以选择继承、扩展或完全替换。

```typescript
// packages/distill/src/prefilter.ts (新文件)

export function createDefaultPrefilter(options?: {
  minMessages?: number;      // 默认 2
  minUserMessages?: number;  // 默认 1
  minTotalChars?: number;    // 默认 100
}): (artifact: SessionArtifact) => PrefilterResult
```

默认规则：
1. **消息数 ≥ 2** — 单条消息无法形成讨论
2. **至少 1 条 user 消息** — 纯 system/assistant 独白无人类意图
3. **总文本 ≥ 100 字符** — 排除 "hello"/"test" 类 session
4. **不是纯 tool call** — 所有消息都有文本内容（排除自动化触发 session）

这些规则是保守的底线。每个 distiller 可以根据自身类型加更严格的规则。

### 2.4 数据流

```
DAG: run_distiller node
│
├─ for each artifact:
│   │
│   ├─ prefilter = distiller.prefilter?.(artifact) ?? { pass: true }
│   │   │
│   │   ├─ pass = false ──→ journal("prefiltered", reason)
│   │   │                   markProcessed(session_id)
│   │   │                   continue (跳过 LLM 调用)
│   │   │
│   │   └─ pass = true ──→ processSessionArtifact(artifact)
│   │                       ├─ Layer 2: LLM call
│   │                       ├─ Layer 3: parse + dedup + deliver
│   │                       └─ journal("produced" | "no_signal")
│   │
│   └─ ...
```

### 2.5 可观测性

Journal 新增 `prefiltered` 状态：

```typescript
// 现有 status: "produced" | "no_signal" | "error"
// 新增 status: "prefiltered"
```

`loam list --distill --journal` 可以看到：
```
prefiltered  | session=xxx reason="session too short (1 msg)"
no_signal    | session=yyy (LLM returned [])
produced     | session=zzz 3 drafts
```

### 2.6 与现有 distiller 的集成

**knowledge-card v0.2.0**：
- 现有 Layer 2（noise-filter-first system prompt）+ Layer 3（detail≥60, confidence≥0.5, dedup）保持不变
- 新增 Layer 1：使用默认 prefilter 并适当收紧（minMessages=3，因为知识萃取需要更多上下文）

**issue-draft**：
- 暂不实现 prefilter（保持向后兼容，走默认全通过）

**pitfall-card / prd-draft**：
- 暂不实现 prefilter（保持向后兼容）

## 3. 非目标

- **不做机器学习预过滤**：不做 embedding / classification model
- **不做持久化的过滤规则引擎**：不做 YAML/JSON 配置的规则文件（那是 `@loamlog/rules` 的职责，当前未集成）
- **不做跨 session 的预过滤**：不根据历史 session 的产出率动态调整阈值
- **不在 prefilter 中做语义判断**：关键词匹配之类的不做，那是 LLM 的职责

## 4. 设计决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 预过滤位置 | distiller 内部 vs 引擎层 | **引擎层** | 统一可观测性，避免重复实现 |
| 接口类型 | 新增方法 vs 配置项 | **DistillerPlugin.prefilter?()** | 每个 distiller 的过滤逻辑不同，配置项不够表达 |
| 向后兼容 | required vs optional | **optional** | 不实现 = 全通过，现有 distiller 无需修改 |
| 默认过滤器 | 引擎提供 vs distiller 各自实现 | **引擎提供 + distiller 可覆盖** | 减少重复，但保留灵活性 |
| 误杀策略 | 宁可误放不可误杀 vs 宁可误杀 | **宁可误放** | prefilter 是成本优化，不是质量门禁 |

## 5. 验证标准

1. `createDefaultPrefilter()` 能正确过滤掉 1-msg session、无文本 session
2. 实现 prefilter 的 distiller 在 DAG runner 中正确跳过不符合条件的 session
3. journal 正确记录 `prefiltered` 状态和原因
4. 现有 distiller（未实现 prefilter）行为不变，所有 session 正常通过
5. 已有测试全部通过
