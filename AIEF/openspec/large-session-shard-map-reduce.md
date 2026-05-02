# Large Session Shard-Map-Reduce — 大 Session 分片蒸馏

> **Status:** Design | 设计中
>
> 将超出模型上下文窗口的大 session 自动切分为重叠分片，并行 Map 蒸馏，最终 Reduce 合并为结构化资产。

## 要解决什么问题 | Problem to Solve

### 现状

当前 distiller 的 `buildPrompt()` 将一个 session 的全部消息拼接到一条 prompt 中。每条消息截断到 1200 字符，但**消息数量无上限**。对于超大 session，构建出的 prompt 可能超出 LLM 的上下文窗口，导致：

- LLM 请求失败（LM Studio 直接拒绝或超时）
- 即使能处理，推理时间随消息数 O(n²) 增长
- "Lost in the middle"——模型对 prompt 中间部分的信息利用率下降

狗粮验证中已观察到：999 条消息的 session 在 LM Studio 35B 上超时失败，而它只占上下文窗口 token 容量的 ~10%——问题不是容量，是**消息数量带来的推理延迟和模型注意力稀释**。

### 业界实践

LLM MapReduce 已成为处理超长文本的标准模式：

- **LLM×MapReduce**（ACL 2025，清华大学）：结构化信息协议 + 置信度校准，信息保留率 95.5%，事实准确率 97.22%，可处理基础模型上下文窗口 10 倍的文档
- **LangChain MapReduceDocumentsChain**：生产环境最广泛使用的实现，Map（并行）+ Collapse（可选）+ Reduce（单次）三阶段管道
- 120 页剧本分析：245 chunks，27 分钟，总成本 $0.073（GPT-4o-mini）

Loamlog 的场景比通用 MapReduce 更有利——中间产物是强类型的 `DistillResultDraft` 而非自由文本，Reduce 阶段是结构化合并而非文本摘要。

## 目标状态 | Target State

大 session 自动走分片管道，小 session 保持现有单次蒸馏路径不变：

```
Session 到达
  │
  ▼
check_size: prompt tokens > model_context_window × 0.8 ?
  │
  ├─ 否 → run_distiller（现有路径，不变）
  │
  └─ 是 → shard → map（并行）→ reduce → process_results → deliver
```

### 用户故事

> 小北有一段和 AI 连续讨论了 3 小时的 session，999 条消息，涵盖了架构设计、bug 修复和重构讨论。他不需要知道这个 session 被切成了几个分片、不需要关心 LLM 调用了多少次。他只是某天打开 `loam list --distill`，看到这段 session 产出了 2 条 Issue 草稿、1 条知识卡片——和任何其他 session 一样。

## 边界 | Boundary

### 做什么

| 项 | 说明 |
|----|------|
| 实现 `check_size` 逻辑：比较 prompt 估计 token 数与模型上下文窗口 | 模型感知，通过 LLM Router 获取当前模型的上下文窗口 |
| 实现 `shard` 策略：将 session 消息切分为重叠分片 | 每片固定消息数（可配置），相邻片重叠 20%，零信息丢失 |
| Map 阶段：每个分片独立蒸馏，复用现有 distiller | 并行执行，产出 `DistillResultDraft[]`（类型不变） |
| Reduce 阶段：合并所有分片的产出，去重去冲突 | 一次 LLM 调用，输入为分片产出的结构化摘要而非原始消息 |
| 小 session（90%+ 的 session）路径完全不变 | 不增加 LLM 调用次数 |

### 不做什么

| 项 | 原因 |
|----|------|
| 不改变 distiller 接口 | Map 阶段就是标准 distiller 调用 |
| 不改变 sink 投递 | Reduce 产出就是标准 `DistillResultDraft[]` |
| 不改变 `process_results`（质量门禁、去重） | 现有 pipeline 不变 |
| 不在分片层做价值判断 | 价值判断交给 distiller（Map）和 reduce（合并）的 LLM |
| 不做跨 session 的分片合并 | 那是多 session merge 的设计范畴 |
| 不实现 Collapse（递归压缩）阶段 | 第一版只做 Map → Reduce；分片数 × 局部发现在 99% 场景下装得进上下文 |
| 不实现优先级分片（头尾先处理、中间后处理） | V2 优化项 |

## 分片策略

### 触发条件

```typescript
function shouldShard(artifact: SessionArtifact, modelContextWindow: number): boolean {
  const estimatedTokens = estimatePromptTokens(artifact);
  return estimatedTokens > modelContextWindow * 0.8;
}
```

`modelContextWindow` 通过 `llm.route()` 返回的模型信息获取。需要给 LLM Provider 接口增加 `contextWindow` 字段。

### 切分规则

```
Session: M1, M2, M3, M4, M5, M6, M7, M8, M9, M10, M11, M12, M13, M14, ...
                              │
                              ▼
Shard 1: [M1  ─────────────────────────── M50]
Shard 2:              [M41 ─────────────────────────── M90]
Shard 3:                            [M81 ─────────────────────────── M130]
Shard 4:                                          [M121 ────────────────────── M170]
                                       ↑ 重叠 10 条（20%），防止跨边界断裂
```

- **每片大小**：由 `(modelContextWindow × 0.8) / estimatedTokensPerMessage` 动态计算
- **重叠量**：每片的 20%，确保跨越片边界的讨论弧线不丢失
- **保留消息完整性**：不切断单条消息，边界落在消息间隙

### Map 阶段

每个分片独立调用 distiller：

```
shard_1 ──→ distiller.run() ──→ drafts_1: DistillResultDraft[]
shard_2 ──→ distiller.run() ──→ drafts_2: DistillResultDraft[]    ← 可并行（3-way）
shard_3 ──→ distiller.run() ──→ drafts_3: DistillResultDraft[]
...
shard_K ──→ distiller.run() ──→ drafts_K: DistillResultDraft[]
```

- distiller 不知道自己在处理分片——它收到的就是"一段完整的对话"
- 每片产出标准的 `DistillResultDraft[]`
- 并行度可配置（默认 3，适配本地模型 + 2 个远程 API）

### Reduce 阶段

```
drafts_1..K + session 元信息
     │
     ▼
  reduce prompt:
    "以下是同一个 AI 编程会话的 K 个片段各自产出的发现。
     请合并去重：同一问题在多个片段出现 → 合并；矛盾发现 → 保留置信度高的；
     互补发现 → 合并为一个。返回 DistillResultDraft[]"
     │
     ▼
  合并后的 DistillResultDraft[]
     │
     ▼
  process_results → deliver_to_sinks（现有 DAG 不变）
```

Reduce prompt 的关键指令：

```
- 同一 issue/knowledge/pitfall 在 ≥2 个分片中被独立发现 → 提高置信度（cross-validation）
- 同一问题在不同分片中有矛盾结论 → 保留高置信度的，注明存在分歧
- 不同分片提供了互补信息 → 合并为一条完整资产
- 只在单个分片中出现且置信度 <0.5 → 丢弃
- 每条产出的 evidence 保留原始分片的 message_id + excerpt
```

`★ Insight ─────────────────────────────────────`
Loamlog 的 Reduce 比通用 MapReduce 的 Reduce 更容易做好，因为中间产物是**强类型的结构化资产**而不是自由文本。通用 MapReduce 的 Reduce 要从一堆摘要段落中重新抽取信息，质量高度依赖 prompt 工程；Loamlog 的 Reduce 做的是**结构化合并**——同 `session_id`、同 `title`（相似度 >0.8）→ 去重；同 `evidence.message_id` → 去重；不一致的 `confidence` → 取最高。大部分合并逻辑可以用代码而非 LLM 完成，Reduce LLM 只负责"语义层面无法机械判断"的合并决策。
`─────────────────────────────────────────────────`

## DAG 拆分

```
A: LLM Provider 接口增加 contextWindow 字段
   → B: 实现 check_size 节点（比较 prompt tokens vs context window）
B
   → C: 实现 shard 逻辑（消息数组 → 重叠分片数组）
C
   → D: 实现并行 map（复用现有 distiller.run()）
D
   → E: 实现 reduce 节点（结构化合并 + LLM 语义合并）
E
   → F: 集成到现有 DAG（小 session 走原路径，大 session 走分片路径）
```

### 节点 A：LLM Provider + contextWindow

- **输入**：当前 `LLMProvider` 接口
- **输出**：接口增加 `contextWindow?: number` 字段
- **依赖**：无
- **失败影响**：无 contextWindow 信息的 provider 使用默认值 131072
- **验收**：
  1. LM Studio provider 声明 contextWindow（从模型 API 获取或配置）
  2. OpenAI/Anthropic/DeepSeek provider 声明各自的 contextWindow
  3. `llm.route()` 返回的 model 信息包含 contextWindow

### 节点 B：check_size 节点

- **输入**：`SessionArtifact` + `modelContextWindow`
- **输出**：`boolean`（是否需要分片）
- **依赖**：A
- **失败影响**：contextWindow 不可用时回退到消息数阈值（默认 >200 条 = 分片）
- **验收**：
  1. `estimatePromptTokens(artifact) > contextWindow × 0.8` 返回 true
  2. 小 session 返回 false，不变路径
  3. 有单元测试覆盖边界条件

### 节点 C：shard 逻辑

- **输入**：`SessionArtifact.messages[]` + `shardSize` + `overlapSize`
- **输出**：`SessionArtifact[]`（每个分片是一个独立的虚拟 session artifact）
- **依赖**：B
- **失败影响**：切分失败回退到不分片（走原路径，可能超时）
- **验收**：
  1. 999 条消息按 50 条/片、10 条重叠 → 约 23 片
  2. 最后一片的边界正确处理（不溢出）
  3. 每条消息至少出现在一个分片中
  4. 重叠区消息确实出现在相邻两个分片中

### 节点 D：并行 Map

- **输入**：分片数组 + distiller + LLM router
- **输出**：`DistillResultDraft[][]`（每个分片的产出列表）
- **依赖**：C
- **失败影响**：单个分片失败不影响其他分片（同现有的 per-session try/catch）；所有分片失败则 Reduce 无输入
- **验收**：
  1. 3 路并行时，分片分配均匀
  2. 单个分片错误被捕获，该分片返回 `[]`，其他分片继续
  3. 所有分片产出都有正确的 evidence（携带原始 message_id）

### 节点 E：Reduce

- **输入**：`DistillResultDraft[][]` + session 元信息
- **输出**：`DistillResultDraft[]`（合并去重后）
- **依赖**：D
- **失败影响**：Reduce 失败回退到不合并——所有分片产出直接作为最终结果（接受可能的重复）
- **验收**：
  1. 同 title（相似度 >0.8）的产出被合并为一条
  2. 同 evidence.message_id 的产出去重
  3. 跨分片独立发现的同一问题 confidence 被提升（+0.1，上限 1.0）
  4. 单个分片独占且 confidence <0.5 的产出被丢弃
  5. Reduce 的 LLM 调用只接收结构化摘要（不包含原始消息），token 数可控

### 节点 F：集成到现有 DAG

- **输入**：现有 `createDistillDAG()` 的 4 节点 DAG
- **输出**：扩展为 5 节点 DAG（增加 `check_and_route` 和 `reduce`）
- **依赖**：B、C、D、E
- **失败影响**：集成失败不影响现有小 session 路径
- **验收**：
  1. 小 session（<200 条消息且 token <80% 窗口）走原 4 节点 DAG
  2. 大 session 走 5 节点 DAG（query → check → shard + map → reduce → process → deliver）
  3. `loam distill --dag` 默认模式同时支持两种路径
  4. 现有 160 个测试全部通过

## 与现有架构的关系

### 复用

| 模块 | 如何复用 |
|------|----------|
| `@loamlog/core` | `DistillResultDraft`、`SessionArtifact`、`LLMProvider` 类型扩展 |
| `@loamlog/distill` | DAG runner、distiller 注册、LLM router |
| `@loamlog/pipeline` | DAG executor 的并行能力 |
| 所有 distiller 包 | Map 阶段就是标准 `distiller.run()` 调用 |
| `process_results` 节点 | 质量门禁 + fingerprint dedup 不变 |
| `deliver_to_sinks` 节点 | 投递逻辑不变 |

### 修改

| 模块 | 改动范围 |
|------|----------|
| `packages/core/src/index.ts` | `LLMProvider` 接口增加 `contextWindow?` |
| `packages/distill/src/dag-runner.ts` | DAG 增加 `check_and_route` 节点和 `reduce` 节点 |
| 各 LLM provider 文件 | 补充 contextWindow 声明 |

### 不影响

| 模块 | 原因 |
|------|------|
| distiller 接口 | `DistillerRunInput` 和 `DistillResultDraft` 不变 |
| sink 接口 | 投递层接收的还是 `DistillResult[]` |
| trigger / daemon | 分片是蒸馏引擎内部实现细节 |
| CLI | `loam distill` 行为不变（分片是透明的） |
| evaluation-harness | 评估的是最终结果 |

## 成本估算

以狗粮验证中 999 条消息的 session 为例（LM Studio 35B ~41s/次）：

| 路径 | LLM 调用次数 | 估计耗时 | 与现状对比 |
|------|-------------|---------|-----------|
| 当前（单次，超时失败） | 1 次 | 失败 | — |
| 分片（23 片 × 50 条 + 1 Reduce） | 24 次 | 3 路并行 ~6min | 从"失败"到"成功" |

以 DeepSeek API（~3s/次）为例：

| 路径 | LLM 调用次数 | 估计耗时 | 成本 |
|------|-------------|---------|------|
| 分片（23 + 1 Reduce） | 24 次 | 3 路并行 ~27s | ~$0.01 |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Map 阶段并行 LLM 调用量激增 | 并行度可配置（默认 3），通过 LLM Router 的 rate limit 控制 |
| 分片切在关键讨论中间，Map 阶段丢失完整上下文 | 20% 重叠 + Reduce 阶段的结构化合并 |
| Reduce 阶段 LLM 未正确合并 | 结构化去重（代码层）优先于语义合并（LLM 层）；失败回退不合并 |
| contextWindow 信息不准确 | 默认值 131072 + 用户可配置覆盖 |
| 小 session（90%+）受到影响 | 严格的条件分支，只有 `check_size` 为 true 才走分片 |
| 分片的 evidence 引用跨分片追踪 | 保留原始 `message_id`，Reduce 只做合并不改引用 |

## 配置

```json5
// aic.config.json
{
  "distill": {
    "sharding": {
      "enabled": true,              // 默认 true
      "max_messages_per_shard": 50, // 每片最大消息数（0 = 由 token 动态计算）
      "overlap_ratio": 0.2,         // 相邻片重叠比例
      "max_parallel_shards": 3,     // Map 阶段最大并行度
      "context_window_margin": 0.8  // 上下文窗口使用率阈值（超过此比例触发分片）
    }
  }
}
```

## 与 continuous-mining-mode 的关系

本设计文档和 `continuous-mining-mode.md` 是互补的：

| | Continuous Mining Mode | Shard-Map-Reduce |
|------|----------------------|-------------------|
| 解决什么问题 | 所有 session 都被处理（数量） | 大 session 能被处理（容量） |
| 改哪一层 | trigger 调度层 | distill 引擎层 |
| 不改什么 | distiller 接口 | distiller 接口 + trigger 调度 |
| 可以独立实现吗 | 可以 | 可以 |

两者组合起来的完整画面：

```
daemon 持续采集
  │
  ▼
trigger continuous mode: 所有 session 入队
  │
  ▼
distill engine: 每个 session
  ├── 小 session → 现有单次蒸馏
  └── 大 session → 分片 → Map → Reduce
       │
       ▼
  process_results + deliver_to_sinks
```
