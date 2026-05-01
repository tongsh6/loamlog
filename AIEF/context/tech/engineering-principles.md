# 工程原则与 AI 开发准则 | Engineering Principles and AI Development Rules

本文档是 Loamlog 的长期工程准则。任何 AI 或人类开发者在本项目中做设计、实现、重构、评审、规划时，都必须优先遵循本文档。

This document defines Loamlog's long-term engineering rules. Any AI or human developer working on design, implementation, refactoring, review, or planning in this project must follow it first.

## 核心目标 | Core Goal

Loamlog 要持续演进为一个可长期维护的 AI 协作资产平台，而不是一组临时脚本或一次性 MVP 功能。

Loamlog must evolve into a maintainable AI collaboration asset platform, not a pile of temporary scripts or one-off MVP features.

所有开发都应服务于以下方向：

All development should support these directions:

- 把 AI 交互沉淀为可追溯、可评估、可复用资产。
- Turn AI interactions into traceable, evaluable, reusable assets.
- 让 provider、distiller、LLM、sink、workflow 都能独立扩展。
- Keep providers, distillers, LLMs, sinks, and workflows independently extensible.
- 让复杂执行流程可观测、可重放、可分批、可按 DAG 推进。
- Make complex execution flows observable, replayable, batchable, and DAG-oriented.
- 保持 local-first、安全默认、evidence-first。
- Preserve local-first, secure-by-default, evidence-first behavior.

## 必须遵守的工程原则 | Mandatory Engineering Principles

### DRY

重复的注册、解析、错误处理、日志、超时、重试、脱敏、指标逻辑，应收敛到共享模块、注册表、中间件或执行上下文。

Repeated registration, parsing, error handling, logging, timeout, retry, redaction, and metrics logic should be consolidated into shared modules, registries, middleware, or execution context.

不接受为了快速接入新 provider/sink/distiller 而复制大段控制流。

Do not copy large control-flow blocks just to add a new provider, sink, or distiller.

### 开闭原则 | Open-Closed Principle

新增能力时，优先通过插件、注册表、配置、DAG 节点、策略对象扩展，而不是修改中心流程分支。

When adding capability, prefer plugins, registries, configuration, DAG nodes, and policy objects instead of editing central branching flow.

典型要求：

Typical requirements:

- 新增 provider 不应修改 daemon 主流程。
- Adding a provider should not modify the daemon main flow.
- 新增 distiller 不应修改 distill engine。
- Adding a distiller should not modify the distill engine.
- 新增 sink 不应修改业务萃取器。
- Adding a sink should not modify business distillers.
- 新增策略不应散落在 CLI 参数解析中。
- Adding policy should not be scattered through CLI argument parsing.

### 正交性 | Orthogonality

采集、脱敏、归档、触发、萃取、评估、审批、投递必须尽量独立建模、独立测试、独立替换。

Capture, redaction, archive, trigger, distill, evaluation, approval, and delivery must be modeled, tested, and replaceable as independently as possible.

如果一个改动同时修改多个层次，必须说明原因，并优先按垂直切片拆分。

If a change modifies multiple layers at once, explain why and prefer splitting it into vertical slices.

### 切面 | Cross-Cutting Aspects

日志、追踪、脱敏、权限、重试、超时、限流、预算、指标、质量门禁是切面能力，不应长期内嵌在业务流程代码里。

Logging, tracing, redaction, authorization, retry, timeout, rate limiting, budget, metrics, and quality gates are cross-cutting aspects. They should not remain embedded inside business flow code.

新增流程时，必须考虑这些切面如何接入：

When adding a flow, consider how these aspects are attached:

- trace id / session id / batch id
- timeout and retry policy
- redaction and risk level
- LLM budget and token cost
- evidence validation
- metrics and evaluation output

### 深模块 | Deep Modules

模块对外接口要窄，对内可以承接复杂实现。不要把复杂性泄漏给调用方。

Modules should expose narrow interfaces while absorbing internal complexity. Do not leak complexity to callers.

优先建设深模块：

Prefer deep modules:

- `archive` 对外提供查询和写入语义，内部可以使用文件、索引或 SQLite。
- `archive` exposes query/write semantics; internally it may use files, indexes, or SQLite.
- `distill` 对外提供萃取运行语义，内部处理 plugin lifecycle、metadata、dedup、state。
- `distill` exposes distillation semantics; internally it handles plugin lifecycle, metadata, dedup, and state.
- `pipeline` 对外提供 DAG 运行语义，内部处理拓扑排序、并发、失败传播、重试和报告。
- `pipeline` exposes DAG execution semantics; internally it handles topological order, concurrency, failure propagation, retry, and reports.

浅模块、大量透传参数、让调用方理解内部顺序的设计，都应被视为架构债务。

Shallow modules, excessive pass-through parameters, and designs that force callers to understand internal ordering should be treated as architecture debt.

### 性能与时序 | Performance and Sequencing

本项目涉及会话归档、批处理、LLM 调用、状态去重和多 provider 采集，必须显式关心时序和性能。

This project involves session archives, batching, LLM calls, state deduplication, and multi-provider capture, so sequencing and performance must be explicit.

任何可能扩大数据量或调用量的改动，都必须回答：

Any change that may increase data volume or call volume must answer:

- 是否会全量扫描 archive？
- Will it scan the full archive?
- 是否会重复调用 LLM？
- Will it repeat LLM calls?
- 是否有幂等键、fingerprint 或水位线？
- Does it have idempotency keys, fingerprints, or watermarks?
- 并发写 state 是否安全？
- Are concurrent state writes safe?
- 是否能按 session、repo、provider、time range 限定范围？
- Can it scope by session, repo, provider, and time range?

### 业务逻辑建模 | Business Logic Modeling

不要只把 LLM 输出当作字符串处理。业务逻辑应逐步建模为资产生命周期。

Do not treat LLM output as plain strings only. Business logic should gradually be modeled as an asset lifecycle.

推荐方向：

Recommended direction:

```text
SessionArtifact -> EvidenceSpan -> Signal -> AssetCandidate -> Decision -> Delivery -> Feedback
```

当前 `DistillResult` 可以继续使用，但新增复杂能力时应优先考虑是否需要引入更明确的中间模型。

The current `DistillResult` can remain, but new complex capabilities should consider whether clearer intermediate models are needed.

## 任务拆分规则 | Task Decomposition Rules

### 优先垂直切片 | Prefer Vertical Slices

任务粒度优先按“可运行的端到端小闭环”拆分，而不是只按技术层横向拆分。

Tasks should be split by small runnable end-to-end loops, not only by technical layers.

好的切片：

Good slice:

```text
provider event -> sanitize -> persist -> distill one asset -> local sink
```

不好的切片：

Bad slice:

```text
rewrite all providers
rewrite all storage
rewrite all distillers
```

### 大任务必须变成 DAG | Large Tasks Must Become DAGs

当任务跨越多个模块、存在依赖顺序、并发机会或失败传播时，必须先拆成 DAG。

When a task crosses modules, has dependency order, concurrency opportunities, or failure propagation, split it into a DAG first.

最小格式：

Minimum format:

```text
A -> B -> C
A -> D -> E
C + E -> F
```

每个节点必须说明：

Each node must state:

- 输入 / input
- 输出 / output
- 依赖 / dependencies
- 失败影响 / failure impact
- 验收 / acceptance

### 线性分批推进 | Linear Batch Progression

即使最终 DAG 有并行分支，实际交付也应按稳定批次推进：

Even when the final DAG has parallel branches, delivery should proceed in stable batches:

1. 基线与测试稳定 / stabilize baseline and tests
2. 最小接口与边界 / define minimal interfaces and boundaries
3. 一个垂直切片 / implement one vertical slice
4. 扩展第二个分支 / add the second branch
5. 性能与质量门禁 / add performance and quality gates

不要在第一批同时大规模引入抽象、迁移所有实现和改变用户行为。

Do not introduce broad abstractions, migrate all implementations, and change user behavior in the same first batch.

## AI 接手项目时的默认流程 | Default Flow for AI Contributors

任何 AI 接手 Loamlog 开发时，应按以下顺序工作：

Any AI contributor working on Loamlog should follow this order:

1. 阅读 `AGENTS.md`、`AIEF/context/INDEX.md` 和本文档。
2. Read `AGENTS.md`, `AIEF/context/INDEX.md`, and this document.
3. 判断任务属于哪个层次：capture、archive、trigger、distill、rules、evaluation、sink、CLI、docs。
4. Identify the task layer: capture, archive, trigger, distill, rules, evaluation, sink, CLI, or docs.
5. 明确是否需要新增抽象；只有当它降低真实复杂性或匹配既有模式时才新增。
6. Decide whether a new abstraction is needed; add one only when it reduces real complexity or matches an existing pattern.
7. 若任务跨模块，先写出 DAG 和垂直切片边界。
8. If the task crosses modules, write the DAG and vertical-slice boundary first.
9. 实现时保持现有行为可用，优先兼容迁移。
10. Keep existing behavior working during implementation and prefer compatible migration.
11. 修改后运行相关测试；涉及契约或共享模块时运行更广测试。
12. Run focused tests after changes; run broader tests when contracts or shared modules change.
13. 更新 AIEF 文档，使后续接手者知道当前事实。
14. Update AIEF docs so future contributors inherit the current facts.

## 架构评审清单 | Architecture Review Checklist

提交或合并前，至少检查：

Before submitting or merging, check at minimum:

- 这个改动是否破坏 local-first 或 evidence-first？
- Does this change break local-first or evidence-first behavior?
- 是否新增了中心分支，导致开闭原则变差？
- Did it add central branching that weakens open-closed design?
- 是否复制了已有 provider/distiller/sink/CLI 模式？
- Did it duplicate existing provider/distiller/sink/CLI patterns?
- 是否把日志、重试、超时、脱敏等切面硬编码到业务逻辑？
- Did it hard-code logging, retry, timeout, or redaction aspects into business logic?
- 是否引入全量扫描、重复 LLM 调用或并发 state 风险？
- Did it introduce full scans, repeated LLM calls, or concurrent state risks?
- 是否可以按 session/repo/provider/time range 限定执行范围？
- Can execution be scoped by session, repo, provider, and time range?
- 是否有证据链、fingerprint、idempotency 或质量门禁？
- Does it have evidence, fingerprint, idempotency, or quality gates?
- 是否按垂直切片交付，而不是大爆炸式重构？
- Is it delivered as a vertical slice instead of a big-bang rewrite?
- 是否更新了相关 AIEF 文档？
- Were the relevant AIEF docs updated?

## 与规划文档的关系 | Relationship to Planning Docs

本文档是长期工程准则，优先级高于单个阶段计划。

This document is the long-term engineering rulebook and has higher priority than any single phase plan.

阶段性蓝图见：

Phase blueprint:

- `AIEF/plans/2026-04-30-architecture-dag-blueprint.md`

若阶段计划与本文档冲突，应优先修改阶段计划，而不是放松本文档原则。

If a phase plan conflicts with this document, update the phase plan rather than weakening these principles.

