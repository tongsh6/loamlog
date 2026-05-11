# Project Ledger — Loamlog 事实台账

## 1. 当前阶段目标 (v0.6.0+)

**核心任务**：从“线性采集-蒸馏”向“工业化炼矿中心”架构转型。
**战略重点**：补齐 `Normalizer` (破碎)、`Verifier` (冶炼) 和 `Aggregator` (精炼) 三大缺失环节。

---

## 2. 工序状态台账

| 车间 (工序) | 状态 | 关键组件/证据 | 当前缺口 |
| :--- | :--- | :--- | :--- |
| **破碎 (Normalizer)** | ✅ **已闭环** | `packages/distill/src/normalizer.ts` | 物理层降噪已集成 (VS-01)。 |
| **选矿 (Distiller)** | ✅ **已闭环** | `packages/distill`, `issue-draft` | 核心信号提取稳定。 |
| **冶炼 (Verifier)** | ✅ **已闭环 (P0/P1)** | `git-gap.ts`, `log-weave.ts` | 实现状态对账与证据织补已通 (VS-02/04)。 |
| **精炼 (Aggregator)** | ✅ **已闭环** | `packages/distill/src/aggregator.ts` | 跨会话聚合与去重已通 (VS-03)。 |
| **底座 (Foundations)** | ✅ **已落成** | `store.ts`, `registry.ts` | 持久化账本与全局索引已上线 (VS-04)。 |
| **储运 (Sink)** | ✅ **已闭环** | `packages/distill/src/dag-runner.ts` | 交付管道已重构为批次交付模式。 |


---

## 3. 关键证据索引

- **架构转型定义**：`AIEF/openspec/refinery-pipeline.md` (2026-05-11)
- **正常化规格**：`AIEF/openspec/session-normalizer.md`
- **最新执行记录**：`tasks/2026-05-01-pipeline-integration/` (DAG 引擎已通)

---

## 4. 下一步 Top 3 优先级

1. **[P0] MCP 接入层实现 (Issue #24)**：将炼好的“纯金属”资产通过 MCP 协议暴露给 Claude/Cursor 等工具。
2. **[P1] 工业级检索优化 (FTS5)**：将 `TemporalEvidenceRegistry` 升级为基于 SQLite FTS5 的高性能实现。
3. **[P1] 增量冶炼逻辑**：优化 DAG，仅针对 `AssetStore` 中未验证或有新信号的资产执行冶炼。
