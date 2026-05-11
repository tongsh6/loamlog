# Project Ledger — Loamlog 事实台账

## 0. 当前门禁 (Product Gate) — 2026-05-11

> **新会话 AI 必读**：本节是项目当前优先级的唯一权威来源。

| 维度 | 状态 | 说明 |
| :--- | :--- | :--- |
| **代码编译** | ✅ 通过 | `pnpm -r build` 全部 22 个包成功（2026-05-11 修复 3 个 TS 错误：refine/RefinedAsset → DistillResult 转换、QualityReport.name 误用） |
| **测试** | ⚠️ 197 pass / 3 fail | 3 个失败均在 `packages/distill/src/shard.test.ts > reduceResults`（既存 bug，与本次门禁修复无关）|
| **代码闭环** | ✅ 已落成 | 炼矿四工序 (Normalizer / Distiller / Verifier / Aggregator) + AssetStore + Registry + Sinks 全部进入主流程 (DAG 默认模式) |
| **产品闭环** | ❌ **未通过** | Dogfooding Phase 2 至 2026-05-04 仅产出 2 条 knowledge-card，**未达到 ≥10 样本门禁，未做 Go/No-Go 决策** |
| **下一道门禁** | Dogfooding Phase 2 终版 Go/No-Go | 验收：≥10 条真实 card + 人工质量评分 ≥60%（≥3/5）+ 决策报告归档 |

**当前最高优先级 = 关闭产品门禁，而非启动新架构（MCP / FTS5 / 增量冶炼）。**

证据：
- `AIEF/reports/dogfooding/2026-05-04-validation-phase2-knowledge-card.md`：明文「暂不做出 Go/No-Go 决策……样本量不足」
- `AIEF/openspec/current-focus.md`：声明 *"Current Priority: Dogfooding Validation"*
- 编译/测试现状：`pnpm -r build` ✅ / `pnpm test` 197 pass + 3 既存 reduceResults fail

### 0.1 已知缺陷（非门禁阻塞）

- `packages/distill/src/shard.test.ts > reduceResults`：3 条用例失败（去重 by message_id / 去重 by similar title / drops single-shard low confidence）。属于 shard map-reduce 的去重逻辑回归，不影响 dogfooding 主路径，建议在 P1 改造期间一并修。

---

## 1. 当前阶段目标 (v0.6.0+)

**核心任务**：从“线性采集-蒸馏”向“工业化炼矿中心”架构转型 → **代码层已完成**，现进入**产品验证阶段**。
**战略重点**：用真实数据证明「AI 会话 → 结构化证据 → 本地 Issue/Knowledge 草稿」这条主流程的持续价值。

---

## 2. 工序状态台账

| 车间 (工序) | 状态 | 关键组件/证据 | 当前缺口 |
| :--- | :--- | :--- | :--- |
| **破碎 (Normalizer)** | ✅ **已闭环 (代码)** | `packages/distill/src/normalizer.ts` | 真实样本验证 |
| **选矿 (Distiller)** | ✅ **已闭环 (代码)** | `packages/distill`, `issue-draft`, `knowledge-card v0.2` | 噪声过滤 -90% 已证明，规模化样本不足 |
| **冶炼 (Verifier)** | ✅ **已闭环 (P0/P1)** | `verifier/git-gap.ts`, `verifier/log-weave.ts` | 真实数据下证据织补效果未观察 |
| **精炼 (Aggregator)** | ✅ **已闭环 (代码)** | `packages/distill/src/aggregator.ts` | 跨 session 真实数据效果未观察 |
| **底座 (Foundations)** | ✅ **已落成** | `store.ts`, `registry.ts` | 当前规模 (1304 sessions) 无检索性能瓶颈证据 |
| **储运 (Sink)** | ✅ **已闭环** | `dag-runner.ts`, `packages/sinks/{file,github,notion}` | 外部 sink 真实投递回报缺失 |

### 2.x 配套任务流

| Task | 状态 | 证据 |
| :--- | :--- | :--- |
| `tasks/2026-05-01-pipeline-integration` | ✅ 全部完成 (12 phase) | `progress.md`, 160 tests pass |
| `tasks/2026-05-02-shard-map-reduce` | ✅ 全部完成 (Steps 1-6 + code review) | `progress.md`, 185 tests pass, commits `dc50db3 / 9a51ea7 / 1112410 / 7d025b1` |
| `tasks/2026-05-03-issue-draft-v2` | ⚠️ 部分完成（progress.md 未同步） | commit `542109f` 已实现 parts data / multi-output / target_repo；progress.md 仅停留在 "Step 1 待开始" |

---

## 3. 关键证据索引

- **架构转型定义**：`AIEF/openspec/refinery-pipeline.md` (2026-05-11)
- **正常化规格**：`AIEF/openspec/session-normalizer.md`
- **运行编排规格**：`AIEF/openspec/refinery-runtime-orchestration.md`
- **MCP 边界 spec（仅设计，非实现承诺）**：`AIEF/openspec/mcp-exposure-layer.md`
- **最新执行记录**：`tasks/2026-05-01-pipeline-integration/`、`tasks/2026-05-02-shard-map-reduce/`
- **产品验证记录（核心证据）**：
  - `AIEF/reports/dogfooding/2026-05-02-validation-phase1.md` — 采集链路通过 (1304 sessions / 72h+)
  - `AIEF/reports/dogfooding/2026-05-04-validation-phase2-knowledge-card.md` — **未决策**

---

## 4. 下一步 Top 3 优先级（已按门禁重排）

> 以下顺序基于 §0 当前门禁结论。**MCP / FTS5 / 增量冶炼在产品门禁未通过前不启动。**

1. **[P0] 完成 Dogfooding Phase 2 终版 Go/No-Go 决策**
   - 累积 ≥10 条 knowledge-card 真实样本
   - 人工按 ≥60% / ≥3/5 标准打分
   - 输出 `AIEF/reports/dogfooding/2026-05-1x-validation-phase2-final.md`
2. **[P1] 修复大 session 蒸馏链路（P0 的前置依赖）**
   - `dag-runner.ts` 改为 per-session 流式写 pending（避免批末统一落盘卡死）
   - CLI 新增 `--max-sessions <n>` 与 `--skip-larger-than <chars>`
   - README/CLI usage 把 DeepSeek 列为「推荐规模化验证 provider」
3. **[P2 / 待解锁] MCP 接入层实现 (Issue #24)** — **冻结，等待产品门禁通过**

### 已废弃 / 降级的 Top 3 候选

| 原 Top 3 | 当前判断 | 何时再考虑 |
| :--- | :--- | :--- |
| MCP 接入层实现 | 降级为 P2，需先过产品门禁 | dogfooding Phase 2 = Go 之后 |
| FTS5 检索升级 | 当前规模 1304 sessions 无性能瓶颈证据，过早优化 | 出现实测延迟回报后 |
| 增量冶炼 | 缺「全量太慢」实测证据，抽象提前 | dogfooding 持续运行后若证实瓶颈 |

---

## 5. 待验证的核心假设

1. 经噪声过滤 v0.2 后，knowledge-card distiller 在 ≥10 真实样本上能否保持 ≥60% 人工质量评分？
2. 当前 LLM 选型（LM Studio / DeepSeek）在大 session 上是否能稳定完成蒸馏？
3. 「AI 会话 → 结构化证据 → 本地草稿」的闭环是否在持续真实使用中可被人接受？
