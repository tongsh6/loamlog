# Session Normalizer：LLM 交互内容加工层

> 状态：设计中
> 前置：ADR-004（Pluggable LLM Router）、ADR-007（Distill Idempotency）

## 1. 问题陈述

### 1.1 现状

四个 distiller 各自用 `buildPrompt()` 把 `SessionArtifact` 拼成 prompt 字符串：

| distiller | 单条消息截断 | parts 处理 | 上下文注入 | 输出格式指令 |
|-----------|------------|-----------|-----------|------------|
| knowledge-card | 1500 chars | 仅 reasoning/tool/file name | session_id + "return []" | JSON 模板 |
| issue-draft | 1200 chars | reasoning→text, tool→name+output, file→name | session_id | JSON 模板 |
| pitfall-card | 1200 chars | 不处理 | session_id | JSON 模板 |
| prd-draft | 1500 chars | 不处理 | session_id + 分类枚举 | JSON 模板 |

四个 distiller，四种 prompt 构造方式。每个 distiller 作者都要重新思考"消息怎么格式化、内容怎么取舍"。

### 1.2 核心矛盾

- distiller 的核心职责是**萃取逻辑**（从对话中识别什么值得提取），不是**prompt 工程**（怎么把对话呈现给 LLM）
- 当前这两个职责混在 `buildPrompt()` 里，distiller 作者被迫同时处理两者
- 没有一个统一的"loamlog 如何与 LLM 对话"的接口契约

### 1.3 非目标

- ❌ 不是 session 级别的预过滤（那之前讨论走错方向了）
- ❌ 不是 LLM 输出解析
- ❌ 不是替代 shard 机制——shard 处理"拆分"，normalizer 处理"整理"

## 2. 设计方案

### 2.1 定位

```
                     Session Normalizer
                          │
SessionArtifact ──────────┤
  (原始 session 数据)       │  内容清洗 + 结构规范化
                          │
                          ▼
                  NormalizedSession
                    (结构化表示)
                          │
                          ▼
                   distiller.run()
              (自己决定如何渲染给 LLM)
```

### 2.2 输出：NormalizedSession（结构化对象）

```typescript
interface NormalizedSession {
  /** 会话元信息，用于上下文注入 */
  header: {
    sessionId: string;
    repo?: string;
    branch?: string;
    commit?: string;
    provider: string;
    capturedAt: string;
    /** 会话中检测到的主要语言 */
    language: string;
  };

  /** 清洗后的消息列表 */
  messages: NormalizedMessage[];

  /** 统计信息，distiller 可用于决策 */
  stats: {
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    totalChars: number;
    durationSeconds: number;
  };
}

interface NormalizedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  timestamp: string;

  /**
   * 主文本内容。
   * 聚合自 message.content + message.parts[type=text]
   */
  text: string;

  /**
   * 推理/thinking 内容。
   * 提取自 message.parts[type=reasoning]
   * 默认截断到 500 chars（可配），distiller 可选择忽略
   */
  reasoning?: string;

  /**
   * 工具调用摘要。
   * 压缩自 message.parts[type=tool]
   * 默认只保留 tool name + 前 200 chars 输出或错误信息
   */
  tools?: Array<{
    name: string;
    summary: string;  // "output: ..." | "error: ..." | "called"
  }>;

  /**
   * 文件引用。
   * 提取自 message.parts[type=file]
   * 只保留文件名，不含内容
   */
  files?: string[];
}
```

### 2.3 结构化的理由

| 对比维度 | 字符串（当前） | 结构化对象（目标） |
|---------|-------------|-----------------|
| distiller 控制力 | 拼死，改不了 | 自己决定渲染方式 |
| 跨 distiller 复用 | 各自实现 | 统一入口 |
| 程序化处理 | 只能正则 | 字段级操作 |
| 可测试性 | 对比字符串 | 对比结构化字段 |

### 2.4 消息内容的取舍规则

| 内容类型 | 处理方式 | 理由 |
|---------|---------|------|
| `message.content`（纯文本） | → `text` 字段，原样保留 | 核心信号 |
| `parts[type=text]` | → 与 content 合并到 `text` 字段 | 多片段文本，语义相同 |
| `parts[type=reasoning]` | → `reasoning` 字段，截断 500 chars | 可能有价值但噪音大，distiller 自行决定用不用 |
| `parts[type=tool]` | → `tools[]` 摘要，仅保留 name + 前 200 chars output/error | input 体积太大且信息密度低 |
| `parts[type=file]` | → `files[]`，仅文件名 | 无文件内容 |
| system 消息 | → `text` 字段，role 保留 "system" | 工具注入的上下文，需标记来源 |

### 2.5 与分片机制的协作

这是设计的关键部分。分片（shard）解决"太长怎么办"，normalizer 解决"每条消息怎么整理"。

```
SessionArtifact (650 messages)
    │
    ▼
shouldShard() → true
    │
    ▼
shardSession() → [Shard1 (332 msgs), Shard2 (318 msgs, 20 msg overlap)]
    │
    ▼
mapDistiller() → 对每个 shard 独立调用 distiller.run()
    │                    │
    │                    ▼
    │              distiller.run({ artifactStore })
    │                    │
    │                    ▼
    │              for-await (artifact of artifactStore.getUnprocessed())
    │                    │
    │                    ▼
    │              normalizeSession(artifact) → NormalizedSession
    │                    │
    │                    ▼
    │              buildPrompt(normalized) → "..." → LLM
    │
    ▼
reduceResults() → 合并去重
```

**normalizer 不替代 shard**。shard 切割消息列表，normalizer 整理单条消息。两者正交：

- shard：决定"哪些消息在这一批"
- normalizer：决定"每条消息呈现哪些字段、以什么粒度"

**normalizer 解决的核心问题**：当前 shard 只是把消息切片，但每条消息仍然可能很长（1200 chars 的 content + 巨大的 tool input/output）。normalizer 通过压缩 tool call 和 reasoning，让每个 shard 的信息密度更高。

### 2.6 引擎层集成

正常流程（默认）：

```
processSessionArtifact(artifact, ctx)
    │
    ├─ shouldShard? → shardSession()
    │
    ├─ 对每个 shard:
    │     normalizeSession(shard) → NormalizedSession
    │     distiller.run({ normalizedSession, ... })
    │
    └─ reduceResults()
```

distiller 的 `run()` 输入新增 `normalized` 字段：

```typescript
interface DistillerRunInput {
  // ... 现有字段保持不变（向后兼容）...

  /**
   * 引擎层提供的 session 内容加工函数。
   * 不实现 normalize 的 distiller 仍可通过 artifactStore 获取原始数据。
   */
  normalize?: (artifact: SessionArtifact) => NormalizedSession;
}
```

distiller 选择使用：`const s = input.normalize?.(artifact) ?? artifact;`

### 2.7 配置项

```typescript
interface NormalizeOptions {
  /** 单条消息最大保留字符数。默认 2000。0 = 不限制。 */
  maxMessageChars?: number;
  /** reasoning 内容最大字符数。默认 500。0 = 不保留。 */
  maxReasoningChars?: number;
  /** tool output 摘要最大字符数。默认 200。0 = 不保留。 */
  maxToolSummaryChars?: number;
  /** 是否保留 file 引用。默认 false（只保留文件名）。 */
  includeFiles?: boolean;
}
```

全局默认值通过 `loam.config.ts` 或 `AICConfig` 配置，单个 distiller 可以覆盖。

## 3. 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 输出形态 | **结构化对象**（B） | distiller 保留渲染控制权，可程序化处理 |
| 内容取舍 | **保留 text/reasoning，压缩 tool，丢弃 file 内容** | 信息密度权衡，后续持续观察 |
| 长度控制 | **复用 shard 机制** | shard 处理"拆分"，normalizer 处理"整理"，正交协作 |
| 放置位置 | **引擎层，distiller 可选，默认使用** | distiller 可退回到原始 artifactStore |
| 接口兼容 | **新增 normalize 字段，不删旧字段** | 向后兼容，现有 distiller 无需修改 |

## 4. 与当前实现的对比

**当前（v0.2.0 knowledge-card buildPrompt）**：
```typescript
function buildPrompt(artifact: SessionArtifact): string {
  const chunks = artifact.messages.map((m) => {
    const text = (m.content ?? "").slice(0, 1500);  // 硬编码截断
    const partsText = formatParts(m.parts);          // 自定义 parts 处理
    return `[${m.id}] (${m.role}) ${text}${partsText}`;
  });
  return [`session_id: ${artifact.meta.session_id}`, "messages:", ...chunks].join("\n");
}
```

**目标（NormalizedSession + distiller 自己渲染）**：
```typescript
function buildPrompt(ns: NormalizedSession): string {
  const chunks = ns.messages.map((m) => {
    let line = `[${m.id}] (${m.role}) ${m.text}`;   // text 已聚合+截断
    if (m.reasoning) line += `\n  thinking: ${m.reasoning}`;
    if (m.tools) line += m.tools.map(t => `\n  tool:${t.name} ${t.summary}`).join("");
    return line;
  });
  return [
    `session: ${ns.header.sessionId} repo: ${ns.header.repo}`,
    `stats: ${ns.stats.userMessages} msgs, ${ns.stats.toolCalls} tools`,
    ...chunks
  ].join("\n");
}
```

distiller 作者只需关注"怎么渲染"，不用关注"消息怎么取、怎么截、parts 怎么拆"。

## 5. 验证标准

1. `normalizeSession()` 正确处理含 content、parts（text/reasoning/tool/file）的完整 session
2. 处理后的 `NormalizedSession` 各字段符合阈值约定
3. 现有 knowledge-card distiller 切换到 `NormalizedSession` 后，行为不变（同输入 → 同输出）
4. 其他 distiller（issue-draft/pitfall-card/prd-draft）可逐步迁移，不强制
