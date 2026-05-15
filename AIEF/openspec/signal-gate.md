# Signal Gate Specification — 资产信号分级门规格

> 状态：活跃设计，2026-05-15  
> 目的：补齐 `NormalizedSession -> Signal -> AssetCandidate` 之间的通用信号分级层，让 Loamlog 先判断“会话里发生了什么有后续价值的变化”，再交给可插拔资产萃取器。

## 1. 背景

Refinery Pipeline 的四道工序已经有代码主干：

```text
RAW SessionArtifact
  -> NORMALIZED NormalizedSession
  -> CANDIDATE AssetCandidate
  -> VERIFIED VerifiedAsset
  -> REFINED RefinedAsset
```

但 Representative Assets Batch 1 的人工评分显示，当前链路把 `NormalizedSession` 太早交给具体 distiller。结果是：

- AI 执行过程日志被抽成用户待办；
- 已完成工作被误转成 follow-up；
- 旧路线图残留被重新复活为 idea；
- 普通命令或一次性 bug fix 被升成 skill；
- 决策、经验、错误日志、任务状态之间经常错路由；
- 同一弱信号被多个 distiller 重复包装。

所以当前缺口不是“没有炼矿管道”，而是选矿车间里缺少一个通用的分级门：

```text
NormalizedSession
  -> Signal Gate
  -> Signal
  -> typed distillers
  -> AssetCandidate
```

## 2. 目标

Signal Gate 要回答四个问题：

1. 这段会话片段里有没有值得保留的信号？
2. 这个信号代表了什么“价值变化”？
3. 这个信号现在处于什么状态？
4. 它适合被哪些插件继续消费，或者应该被拒绝、忽略、等待人工确认？

目标状态：

```text
SessionArtifact
  -> NormalizedSession
  -> Signal[]
  -> AssetCandidate[]
  -> ReviewDecision
  -> Delivery
  -> Feedback
```

Signal 是资产图的一等节点。它不是最终资产，但它必须可追溯、可 review、可被多个 distiller 消费、可形成后续训练样本。

## 3. 非目标

第一版不做：

- 不推翻现有 Refinery Pipeline；
- 不把 SignalKind 设计成固定资产类型枚举；
- 不把当前 5 个代表性 distiller 写死进核心流程；
- 不做复杂向量聚类；
- 不自动训练模型；
- 不自动发布 GitHub / Notion / AGENTS.md / skill 文件；
- 不把 `raw_model_output` 默认展示给普通用户。

## 4. 架构位置

Signal Gate 属于全局统一层，不属于某个 distiller。

```text
capture
  -> archive
  -> normalize
  -> signal gate
  -> signal store
  -> distiller routing
  -> asset candidate
```

运行策略：

- capture 后自动运行 Signal Gate；
- LLM 不可用时，capture/archive 仍然成功；
- Signal Gate 任务标记为 `failed` 或 `retry_scheduled`，稍后重试；
- distill 优先消费 Signal，而不是直接扫整段原始会话；
- 保留手动命令用于重跑和调试。

## 5. Signal 数据模型

### 5.1 Signal

```ts
interface Signal {
  id: string;
  scope: "message" | "session" | "cross_session";

  kind: SignalKind;
  tags: SignalTag[];
  raw_tags?: string[];
  notes?: string;

  actor: SignalActor;
  temporal_state: SignalTemporalState;
  confidence: number;

  spans: SignalSpan[];
  parent_signal_id?: string;
  related_signal_ids?: string[];

  review_status: SignalReviewStatus;
  machine_classification: SignalClassification;
  reviewed_classification?: ReviewedSignalClassification;

  promotion_hints: SignalPromotionHint[];
  raw_model_output?: unknown;

  classifier: {
    id: string;
    version: string;
    model: string;
    prompt_version: string;
  };

  created_at: string;
  updated_at: string;
}
```

### 5.2 SignalSpan

Signal 必须支持消息内部片段，也要预留跨会话聚合。

```ts
interface SignalSpan {
  session_id: string;
  message_id: string;
  excerpt: string;
  position?: {
    start: number;
    end: number;
  };
}
```

一个 Signal 可以引用：

- 单条消息的一小段；
- 同一会话里的多段 evidence；
- 多个会话聚合后的多个片段。

## 6. SignalKind

SignalKind 第一版按“会话中发生的价值变化”定义，不按资产类型定义。

| SignalKind | 中文含义 |
|---|---|
| `intent` | 用户表达了目标、需求、偏好、约束 |
| `insight` | 出现新的理解、经验、规律、判断 |
| `commitment` | 有人决定、同意、否定、暂缓某件事 |
| `task_delta` | 工作状态变化：新增、完成、取消、阻塞 |
| `problem_event` | 出现问题、错误、风险、异常 |
| `workflow_pattern` | 出现可复用流程、协作方式、操作套路 |
| `artifact_reference` | 提到可沉淀对象：文档、代码、issue、规则、skill |
| `noise` | 过程性、重复性、无后续价值内容 |

`noise` 也要入库。它默认不进入资产萃取器，但有审计、负例、去重和误杀分析价值。

## 7. Tags

Tags 是横切维度，用来描述信号属性；不是资产类型，也不是某次评分失败模式。

Tag 由平台白名单控制。LLM classifier 只能建议，系统负责规范化、校验和落库。

```ts
{
  tags: SignalTag[];      // 平台认可，可用于路由和统计
  raw_tags?: string[];    // LLM 原始建议，不参与路由
  notes?: string;         // 自由说明
}
```

第一版 tag 分组：

| 分组 | Tags | 中文含义 |
|---|---|---|
| 意图类 | `goal`, `requirement`, `preference`, `constraint`, `objection` | 目标、需求、偏好、约束、反对意见 |
| 状态类 | `created`, `updated`, `completed`, `blocked`, `cancelled`, `deferred`, `obsolete` | 新增、更新、完成、阻塞、取消、暂缓、过期 |
| 证据类 | `reason`, `example`, `cause`, `fix`, `metric`, `tradeoff` | 理由、例子、原因、修法、指标、取舍 |
| 复用类 | `repeatable`, `multi_step`, `rule_like`, `workflow_like`, `content_seed` | 可重复、多步骤、像规则、像流程、内容种子 |
| 风险类 | `process_log`, `duplicate`, `low_information`, `unsupported_inference`, `ambiguous_type` | 过程日志、重复、信息量低、无证据推断、类型不清 |
| 对象类 | `document`, `code`, `issue`, `rule`, `skill`, `dataset`, `config` | 文档、代码、issue、规则、skill、数据集、配置 |

系统可以建议 SignalKind 与 tags 的常见匹配关系，但不做硬限制。插件和用户可以自行选择。

## 8. Actor 与时间状态

### 8.1 SignalActor

| SignalActor | 中文含义 |
|---|---|
| `user` | 用户表达 |
| `assistant` | AI 回复或过程说明 |
| `tool` | 工具调用、命令输出、错误输出 |
| `system` | 系统或规则注入内容 |
| `mixed` | 跨多段证据，涉及多个角色 |

### 8.2 SignalTemporalState

| SignalTemporalState | 中文含义 |
|---|---|
| `future` | 未来要做 |
| `current` | 当前有效状态 |
| `in_progress` | 正在执行 |
| `completed` | 已完成 |
| `obsolete` | 已过期、旧路线图、已不再采纳 |
| `unknown` | 无法判断 |

时间状态会影响 promotion policy。例如：

- `follow-up-work-item` 不能消费 `completed`；
- `idea-seed` 默认不消费 `obsolete`；
- `decision-rationale` 可以消费已完成的决策；
- `practice-pitfall` 可以消费完成后的经验；
- `noise` 通常是 `in_progress` 或 `unknown`。

## 9. Review

Signal review 和 Asset review 必须分开。

```text
Signal review = 这段会话片段有没有价值信号
Asset review = 基于这个信号生成的资产质量如何
```

### 9.1 SignalReviewStatus

| 状态 | 中文含义 |
|---|---|
| `accepted` | 确认这是有效 signal |
| `pending` | 等待人工确认 |
| `ignored` | 信号可能存在，但当前不处理 |
| `rejected` | 确认识别错误或无有效 evidence |

默认状态可以由 confidence 和 policy 自动分配。

平台默认阈值：

```text
confidence >= 0.80      -> accepted
0.50 <= confidence < 0.80 -> pending
confidence < 0.50       -> ignored
```

叠加硬规则：

- `noise` 默认 `ignored`；
- 无有效 evidence 默认 `rejected`；
- policy 明确 `ineligible` 默认 `ignored` 或 `rejected`；
- workspace / plugin / run 可以覆盖默认阈值。

配置层级：

```text
platform default
  -> workspace config
  -> plugin manifest
  -> run override
```

### 9.2 人工修正

人工 review 必须能修改：

- `kind`
- `tags`
- `actor`
- `temporal_state`
- `review_status`
- `notes`

结构上保留机器结果和人工修正：

```ts
interface SignalClassification {
  kind: SignalKind;
  tags: SignalTag[];
  actor: SignalActor;
  temporal_state: SignalTemporalState;
  confidence: number;
}

interface ReviewedSignalClassification extends SignalClassification {
  reviewer: string;
  reviewed_at: string;
  note?: string;
}
```

后续路由优先使用：

```text
reviewed_classification ?? machine_classification
```

## 10. Promotion 与插件消费

一个 Signal 可以被多个资产萃取器消费。

```text
Signal -> AssetCandidate[]
```

Signal Gate 会给出 promotion 建议：

```ts
interface SignalPromotionHint {
  target_distiller: string;
  eligibility: "eligible" | "needs_review" | "ineligible";
  reason: string;
}
```

插件不能依赖核心写死的 5 个资产类型。插件 manifest 应动态声明自己消费哪些 SignalKind：

```ts
interface SignalConsumptionRule {
  kind: SignalKind;
  tags?: SignalTag[];
  min_confidence?: number;
  allowed_actors?: SignalActor[];
  allowed_temporal_states?: SignalTemporalState[];
}

interface DistillerManifest {
  id: string;
  version: string;
  consumes_signals: SignalConsumptionRule[];
}
```

消费关系必须记录：

```ts
interface SignalConsumption {
  signal_id: string;
  distiller_id: string;
  distiller_version: string;
  result: "produced" | "rejected" | "skipped" | "error";
  asset_id?: string;
  reason?: string;
  created_at: string;
}
```

这样可以回答：

- 这个 signal 被哪些 distiller 看过；
- 哪些 distiller 产出了资产；
- 哪些 distiller 拒绝或跳过；
- 错误发生在 signal 分类、路由、还是资产生成。

## 11. LLM 分类与策略校验

第一版采用 LLM 分类优先：

```text
NormalizedSession
  -> LLM signal classifier
  -> deterministic policy check
  -> Signal store
  -> distiller routing
```

LLM 负责语义理解，规则层负责硬约束和规范化：

- 校验 kind / tags 是否在平台白名单；
- 校验 evidence 是否有效；
- 处理 confidence 阈值；
- 将明显无 evidence 的结果拒绝；
- 将 raw tags 移到 `raw_tags`；
- 标记 `raw_model_output` 仅供 debug/audit。

`raw_model_output` 必须保留，但默认不展示给普通用户。普通视图展示结构化字段和证据；debug/audit 视图展示模型原始输出、prompt 版本、解析日志和 policy trace。

## 12. 跨会话聚合

Signal 第一版支持跨会话聚合，但范围要保守。

```ts
scope: "message" | "session" | "cross_session";
parent_signal_id?: string;
related_signal_ids?: string[];
```

第一版允许系统自动创建 parent signal：

- 同一 workspace / repo；
- 同一 SignalKind；
- 相似 tags；
- 相近 topic fingerprint；
- 至少 2 个 child signals。

不做复杂向量聚类。parent signal 也要独立 review。

```text
child signal review = 这段证据是否有效
parent signal review = 聚合后的模式是否成立、是否值得沉淀
```

高置信 parent signal 可以自动进入 distiller：

```text
parent confidence >= 0.90 -> eligible for auto routing
otherwise -> pending
```

## 13. 存储

Signal 逻辑上归 `AssetStore`，是资产图的一等节点。物理实现可以使用独立结构：

```text
AssetStore
  - signals
  - signal_runs
  - signal_consumptions
  - asset_candidates
  - reviews
  - deliveries
  - feedback
```

对外 API 应统一在资产图语义下：

```text
AssetStore.listSignals()
AssetStore.getSignal(id)
AssetStore.reviewSignal(id, decision)
AssetStore.listSignalConsumptions(signal_id)
AssetStore.getLineage(id)
```

普通 Signal 对用户可见。`signal-label-example` 这类训练样本默认是内部系统资产。

## 14. 幂等与版本

Signal Gate 必须幂等。

幂等键：

```text
session_id
classifier_id
classifier_version
normalized_session_fingerprint
```

同一键重跑：

- 不重复生成 signal；
- 可以更新机器分类结果；
- 保留 run history；
- 不覆盖人工 review 修改。

classifier 版本升级后，老 signal 不自动重跑。系统只标记：

```text
stale_by_classifier_version: true
```

用户手动选择重跑：

```bash
loam signal rerun --stale
```

## 15. CLI

第一版需要专门 CLI。

```bash
loam signal list
loam signal show <id>
loam signal review <id>
loam signal run --session <id>
```

`loam signal list` 默认显示所有 signal，包括 `noise` 和 `ignored`。

默认排序：

```text
pending
accepted
ignored
rejected
```

每组内部按 `created_at desc`。

常用过滤：

```bash
loam signal list --kind noise
loam signal list --status ignored
loam signal list --promotable
loam signal list --session <id>
loam signal list --distiller <id>
```

`loam signal show <id>` 默认展示：

- signal id；
- kind / tags 中文解释；
- review_status；
- confidence；
- actor；
- temporal_state；
- evidence spans；
- promotion hints；
- consumed_by / produced assets。

调试信息通过：

```bash
loam signal show <id> --debug
```

## 16. 内部系统资产：signal-label-example

人工修正后的 Signal 要回流成 classifier 改进样本。

```text
LLM 分类
  -> Signal 入库
  -> 人工 review / 修正
  -> signal-label-example
  -> classifier prompt / rules / eval dataset
```

`signal-label-example` 默认是内部系统资产，不进入普通资产列表。它用于：

- 改进 Signal Gate；
- 给插件作者提供正例/负例；
- 形成个人或 workspace 的资产偏好；
- 支撑后续评估集。

## 17. 实施 DAG

```text
A. Contract update
  -> B. Signal classifier prompt and schema
  -> C. SignalStore inside AssetStore
  -> D. Signal Gate runner after capture
  -> E. Signal CLI list/show/review
  -> F. Plugin manifest consumes_signals
  -> G. Distiller routing through signals
  -> H. Cross-session parent signal
  -> I. Dogfooding re-review
```

节点说明：

| 节点 | 输入 | 输出 | 失败影响 |
|---|---|---|---|
| A | 本规格、现有 `Signal` 类型 | 更新核心类型和 contract | 不能进入代码实现 |
| B | SignalKind/tags/schema | LLM classifier 输出契约 | 无法稳定生成 signal |
| C | AssetStore 现状 | signals/run/consumption 存储 | CLI 和 lineage 缺失 |
| D | capture/archive 流程 | capture 后自动 signal job | Signal Gate 不能闭环 |
| E | SignalStore | `loam signal` 命令 | 人工 review 不可用 |
| F | distiller SDK | 插件声明消费规则 | 插件路由仍需硬编码 |
| G | signals + manifest | distiller 消费 signal | 资产仍从 raw session 直出 |
| H | child signals | parent signal | 跨会话模式不可见 |
| I | 真实 session | 评分报告和台账更新 | 无法判断修复是否有效 |

## 18. 验收标准

第一阶段验收：

- capture 成功不依赖 Signal Gate 成功；
- 每个 Signal 都有有效 `SignalSpan`；
- `noise` 入库但默认不进入 distiller；
- Signal review 和 Asset review 分开记录；
- Signal 被哪些 distiller 消费、结果如何必须可查；
- 人工修正不会被 classifier 重跑覆盖；
- classifier 版本升级只标记 stale，不自动改历史；
- 插件通过 manifest 声明消费哪些 signal，不由核心写死；
- `loam signal list/show/review` 可用于人工审阅；
- `raw_model_output` 保留，但默认只在 debug/audit 中展示；
- 下一轮 5-10 条真实 session 复评，每类代表性资产 `>=3` 比例至少 50%。

## 19. 与现有文档的关系

- `refinery-pipeline.md` 定义四道工序；本规格补齐选矿阶段的通用信号分级门。
- `session-normalizer.md` 解决消息内容整理；本规格不替代 normalizer。
- `representative-asset-distillers.md` 定义首批资产萃取器；本规格不把首批 5 类资产写死进核心。
- `refinery-contracts-atlas.md` 当前从 `NormalizedSession` 直接到 `AssetCandidate`；后续应补 `Signal` contract。
- `docs/project-ledger.md` 中的 Batch 1 No-Go 结论，是本规格的直接触发证据。

