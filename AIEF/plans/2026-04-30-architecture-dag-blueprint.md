# Architecture DAG Blueprint | 架构 DAG 蓝图

> **Status:** Active Blueprint / 活跃蓝图
>
> This document turns the 2026-04-30 architecture review into a durable project item. It should be used as the planning entry for improving Loamlog's maintainability, execution model, and long-term extensibility.
>
> 本文档将 2026-04-30 的架构讨论沉淀为项目事项。后续推进 Loamlog 的长期维护性、执行模型和扩展性时，以本文档作为规划入口。

## Goal | 目标

Evolve Loamlog from a set of working MVP pipelines into a maintainable asset platform with explicit DAG execution, deep module boundaries, orthogonal concerns, and performance-aware scheduling.

将 Loamlog 从已经可用的 MVP 管线，演进为具备显式 DAG 执行、深模块边界、正交关注点和性能感知调度的长期可维护资产平台。

The goal is not a rewrite. The work must be delivered in vertical slices that keep the current product loop working:

目标不是重写系统。所有工作必须按垂直切片交付，并保持当前产品闭环可运行：

```text
AI conversation -> structured evidence -> local issue draft
```

## Design Principles | 设计原则

| Principle | Engineering Rule | 工程规则 |
|---|---|---|
| DRY | Shared behavior belongs in registries, middleware, or reusable runtime modules. | 共享行为进入注册表、中间件或运行时模块，不在 CLI/provider/sink 中复制。 |
| Open-closed | New providers, distillers, sinks, and runtime steps should be added without editing central control flow. | 新增 provider、distiller、sink 和运行时步骤时，不应修改中心流程分支。 |
| Orthogonality | Capture, sanitize, archive, trigger, distill, evaluation, and delivery must remain independently testable. | 采集、脱敏、归档、触发、萃取、评估、投递必须可独立测试。 |
| Cross-cutting concerns | Logging, tracing, redaction, metrics, retries, timeout, and budget control should be modeled as execution aspects. | 日志、追踪、脱敏、指标、重试、超时、预算控制应作为执行切面建模。 |
| Deep modules | Public interfaces stay narrow while internal implementation can absorb scheduling, indexing, retry, and state complexity. | 对外接口保持窄，内部承接调度、索引、重试、状态等复杂性。 |
| Performance | Large archive scans, repeated LLM calls, and concurrent state writes must have explicit cost controls. | 大量归档扫描、重复 LLM 调用、并发状态写入必须有明确成本控制。 |
| Evidence-first | No result can leave local review boundaries without evidence and quality gates. | 无 evidence 和质量门禁的结果不得离开本地审阅边界。 |

## Current Baseline | 当前基线

Implemented strengths:

已具备的基础：

- Core contracts exist in `packages/core`: `SessionSnapshot`, `DistillerPlugin`, `SinkPlugin`, `ArtifactQueryClient`, `LLMRouter`.
- `@loamlog/distill` supports dynamic distiller loading, LLM routing, metadata injection, deduplication, and sink delivery.
- `@loamlog/sanitizer`, `@loamlog/trigger`, and `@loamlog/evaluation-harness` already form a trust and quality foundation.
- Multiple providers now exist in code: `opencode`, `claude-code`, `gemini-cli`, and `codex`.
- `loam list`, local file sink, and issue-draft output already exist.

Known gaps:

已知缺口：

- Distill execution is still a sequential loop over distillers rather than a DAG scheduler.
- Archive query is file-scan based and will degrade as session volume grows.
- Distiller state uses JSON file KV without explicit transaction or lock semantics.
- Provider registration in CLI still relies on central branching.
- Cross-cutting concerns are embedded in flow code instead of reusable aspects.
- Roadmap and code facts have drifted in a few places; docs must be kept aligned with shipped behavior.

## Target Architecture | 目标架构

### Runtime DAG | 运行时 DAG

The long-term execution model should be a typed DAG. Each node has a narrow input/output contract, an execution policy, and observable runtime metadata.

长期执行模型应是类型化 DAG。每个节点都有窄输入/输出契约、执行策略和可观测运行元数据。

```text
provider_event
  -> capture_validate
  -> pull_or_use_prefetched
  -> normalize_snapshot
  -> sanitize_snapshot
  -> persist_snapshot
  -> append_archive_index
  -> trigger_score
  -> batch_plan
  -> distill_issue_draft
  -> validate_evidence
  -> dedupe_fingerprint
  -> sink_file
  -> eval_record
```

Future asset branches should extend the DAG instead of changing the core control flow:

未来资产分支应扩展 DAG，而不是修改核心控制流：

```text
persist_snapshot -> distill_issue_draft -> validate_evidence -> sink_file
persist_snapshot -> distill_knowledge_card -> validate_evidence -> sink_file
persist_snapshot -> distill_prd_draft -> validate_evidence -> sink_file
validate_evidence -> approval_gate -> external_sink
```

### Deep Module Shape | 深模块形态

Proposed packages:

建议包结构：

```text
packages/pipeline/
  src/node.ts          # PipelineNode<I, O>
  src/dag.ts           # DAG definition, validation, topological ordering
  src/executor.ts      # execution, concurrency, timeout, retry
  src/context.ts       # trace, logger, metrics, budgets
  src/aspects.ts       # middleware for cross-cutting concerns

packages/archive-index/
  src/index.ts         # append/query compact session metadata index
  src/sqlite.ts        # optional SQLite-backed implementation

packages/runtime-registry/
  src/providers.ts     # provider registry
  src/distillers.ts    # distiller registry facade if needed
  src/sinks.ts         # sink registry facade if needed
```

These packages should hide complexity internally. CLI and daemon should only compose runtime pieces.

这些包应在内部吸收复杂性。CLI 和 daemon 只负责组合运行时能力。

## Execution Phases | 推进阶段

| Phase | Status | Main Deliverable | 主要交付 |
|---|---|---|---|
| Phase 0: Baseline Alignment | Active | Official blueprint, context index entry, test isolation cleanup | 官方蓝图、上下文索引入口、测试隔离修正 |
| Phase 1: Registry and Aspects | Planned | Provider registry, execution context, reusable aspects | Provider 注册表、执行上下文、可复用切面 |
| Phase 2: State and Archive Performance | Planned | Transaction-safe state, archive metadata index, performance fixtures | 事务安全状态、归档元数据索引、性能夹具 |
| Phase 3: Minimal DAG Runtime | Planned | `packages/pipeline`, DAG executor, issue-draft DAG slice | `packages/pipeline`、DAG 执行器、issue-draft DAG 切片 |
| Phase 4: Asset Graph Modeling | Planned | Evidence/signal/candidate/decision model and eval gates | 证据、信号、候选资产、决策模型与评估门禁 |
| Phase 5: External Workflow Readiness | Planned | Approval gate and opt-in external sink readiness | 审批门禁与显式启用的外部 sink 准备 |

### Phase 0: Baseline Alignment | 基线对齐

Purpose:

目的：

- Turn this blueprint into the official active item.
- Fix documentation drift before introducing new architecture.
- Establish clean verification expectations.

Scope:

范围：

- Add this blueprint to `AIEF/context/INDEX.md`.
- Update roadmap/current-focus only when implementation starts or shipped status changes.
- Fix test isolation around daemon tests so `LOAM_DUMP_DIR` from the developer environment cannot change test semantics.

Acceptance:

验收：

- Blueprint is linked from the context index.
- `pnpm run test` result is understood and environment-sensitive failures are removed or documented.
- No runtime behavior changes except test isolation fixes.

### Phase 1: Registry and Aspects | 注册表与切面

Purpose:

目的：

- Improve DRY, open-closed design, and operational observability without changing the product flow.

Scope:

范围：

- Replace central provider branching with a provider registry.
- Introduce `ExecutionContext` with logger, trace id, metrics hooks, timeout, and budget fields.
- Move logging, metrics, retry, timeout, and redaction policy handling toward reusable execution aspects.
- Keep existing CLI commands and provider behavior stable.

Suggested vertical slice:

建议垂直切片：

```text
daemon capture request -> provider registry -> pull session -> sanitize -> persist
```

Acceptance:

验收：

- Adding a provider does not require editing a long `if providerId === ...` chain.
- Capture path logs include a stable trace id.
- Existing provider tests and daemon tests pass.
- No public CLI breaking change.

### Phase 2: State and Archive Performance | 状态与归档性能

Purpose:

目的：

- Remove the biggest scaling risks before adding a DAG executor.

Scope:

范围：

- Replace or wrap JSON state KV with a transaction-safe implementation.
- Add an archive metadata index for fast list/query by repo, provider, captured time, and session id.
- Keep raw JSON snapshots as the source of truth.
- Add performance regression tests using generated fixture archives.

Suggested vertical slice:

建议垂直切片：

```text
persist_snapshot -> append_archive_index -> loam list/query reads index first
```

Acceptance:

验收：

- `loam list --limit 20` does not need to parse every snapshot in large archives.
- State writes are safe under concurrent distill attempts for the same distiller.
- Existing snapshot layout remains backward compatible.

### Phase 3: Minimal DAG Runtime | 最小 DAG 运行时

Purpose:

目的：

- Introduce DAG execution without moving every feature at once.

Scope:

范围：

- Add `packages/pipeline`.
- Model node contracts, DAG validation, topological execution, node-level timeout, retry, and concurrency caps.
- Port only the issue-draft vertical slice first.
- Keep current direct engine path available until the DAG path is proven.

Suggested vertical slice:

建议垂直切片：

```text
capture_validate
  -> sanitize_snapshot
  -> persist_snapshot
  -> trigger_score
  -> distill_issue_draft
  -> validate_evidence
  -> sink_file
```

Acceptance:

验收：

- A DAG run can export an execution report with node duration, status, inputs summary, outputs summary, and errors.
- Independent nodes can run with bounded concurrency.
- Failed nodes do not run dependent nodes, but unrelated branches can continue.
- Current `loam distill` behavior remains available.

### Phase 4: Asset Graph Modeling | 资产图建模

Purpose:

目的：

- Move business logic from one-off distill results toward reusable asset lifecycle modeling.

Scope:

范围：

- Introduce explicit domain objects: `EvidenceSpan`, `Signal`, `AssetCandidate`, `Decision`, `Delivery`, `Feedback`.
- Map existing `issue-draft` output into this model first.
- Connect rules and evaluation harness to the main flow as quality gates, not just side tools.

Suggested vertical slice:

建议垂直切片：

```text
SessionArtifact -> EvidenceSpan -> Signal -> AssetCandidate(issue-draft) -> Decision -> FileSink
```

Acceptance:

验收：

- Issue draft output can be explained as evidence-backed signals and decisions.
- Low-evidence, low-confidence, or high-redaction-risk candidates are blocked from external sinks.
- Evaluation reports can compare model/rule variants against the same asset graph.

### Phase 5: External Workflow Readiness | 外部工作流准备

Purpose:

目的：

- Prepare GitHub/Notion/external sinks without violating local-first safety.

Scope:

范围：

- Add approval gate as a DAG node.
- Add external sink capability only behind explicit opt-in.
- Preserve local file output as the default sink.
- Add audit records for every external delivery.

Suggested vertical slice:

建议垂直切片：

```text
AssetCandidate -> Decision -> approval_gate -> github_sink
```

Acceptance:

验收：

- External delivery is impossible without evidence, approval, and explicit config.
- Delivery result is traceable back to session id, message id, and source text.
- Re-running the pipeline is idempotent.

## Work Breakdown DAG | 事项拆分 DAG

```text
P0-blueprint
  -> P0-test-isolation
  -> P1-provider-registry
  -> P1-execution-context
  -> P1-aspects
  -> P2-state-transactions
  -> P2-archive-index
  -> P3-pipeline-package
  -> P3-issue-draft-dag-slice
  -> P4-asset-graph-types
  -> P4-eval-gates
  -> P5-approval-gate
  -> P5-external-sink-readiness
```

Parallelizable work:

可并行事项：

- `P1-provider-registry` can run in parallel with `P1-execution-context` after `P0-test-isolation`.
- `P2-state-transactions` can run in parallel with `P2-archive-index`.
- `P4-asset-graph-types` can be designed while the minimal DAG runtime is implemented, but it should not block Phase 3.

Critical path:

关键路径：

```text
P0-blueprint -> P0-test-isolation -> P1-execution-context -> P3-pipeline-package -> P3-issue-draft-dag-slice
```

## Quality Gates | 质量门禁

Every phase should preserve:

每个阶段都必须保持：

- `pnpm run test` passes.
- `pnpm run build` passes.
- `pnpm run typecheck` passes when touched package APIs change.
- No result without evidence enters any external sink.
- Redaction stays on by default.
- No write happens unless `LOAM_DUMP_DIR` or an explicit dump dir is configured.

Performance gates should be added from Phase 2 onward:

从 Phase 2 开始增加性能门禁：

- Large archive list/query fixture.
- Concurrent state write fixture.
- Distill run with repeated sessions should avoid duplicate LLM calls.
- DAG execution report should include per-node duration.

## Documentation Policy | 文档策略

This blueprint is the active planning artifact. Implementation details should be added as smaller specs or task plans only when a phase starts.

本文档是活跃规划入口。进入具体阶段时，再为该阶段补充更小的规格或执行计划。

Recommended future documents:

后续建议文档：

- `AIEF/openspec/provider-registry-boundary.md`
- `AIEF/openspec/pipeline-runtime-boundary.md`
- `AIEF/openspec/asset-graph-model.md`

When a phase is completed, update this document's phase status and move detailed implementation notes into a reference plan if needed.

阶段完成后，应更新本文档的阶段状态；如有必要，把详细实现记录转为 reference plan。
