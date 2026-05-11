# Project Ledger — Loamlog 事实台账

## 0. 当前门禁 (Product Gate) — 2026-05-12

> **新会话 AI 必读**：本节是项目当前优先级的唯一权威来源。

| 维度 | 状态 | 说明 |
| :--- | :--- | :--- |
| **代码编译** | ✅ 通过 | `pnpm -r build` 全部 22 个包成功 |
| **测试** | ⚠️ 197 pass / 3 fail | 3 个失败均在 `packages/distill/src/shard.test.ts > reduceResults`（既存 bug） |
| **代码闭环** | ✅ 已落成 | 炼矿四工序 + AssetStore + Registry + Sinks + `loam show` / `loam list --format md` |
| **产品闭环** | ⚠️ **样本已足，待人工评分** | 2026-05-11 batch 6 产出 10 张 knowledge-card（12 verified → 10 refined），0 errors，LM Studio `gpt-oss-120b`。尚未按 ledger 标准 ≥60% / ≥3-of-5 评分 |
| **下一道门禁** | Dogfooding Phase 2 终版 Go/No-Go | 人工评分 ≥10 条 card → 输出 `AIEF/reports/dogfooding/2026-05-1x-validation-phase2-final.md` |

**当前最高优先级 = 关闭产品门禁，而非启动新架构（MCP / FTS5 / 增量冶炼）。**

证据：
- `AIEF/reports/dogfooding/2026-05-04-validation-phase2-knowledge-card.md`：噪声过滤 -90% 已证明；LM Studio 可用性已验证
- 2026-05-11 batch 6 日志：`/tmp/loam-distill-phase2-batch6.log`：12 verified → 10 refined，212s，0 errors
- 人工 review 视图：`/tmp/loam-phase2-batch6-review.md`（或 `loam list --distill --pending --format md`）

### 0.1 已知缺陷（非门禁阻塞）

- `packages/distill/src/shard.test.ts > reduceResults`：3 条用例失败（去重 by message_id / 去重 by similar title / drops single-shard low confidence）。shard map-reduce 去重逻辑回归。
- `tasks/2026-05-03-issue-draft-v2/progress.md` 与代码不同步：commit `542109f` 已实现 parts data / multi-output / target_repo，但 progress.md 仍写 "Step 1 待开始"。

---

## 1. 当前阶段目标 (v0.7.0)

**核心任务**：从"线性采集-蒸馏"向"工业化炼矿中心"架构转型 → **代码层已完成**，现进入**产品验证阶段**。
**战略重点**：用真实数据证明「AI 会话 → 结构化证据 → 本地 Issue/Knowledge 草稿」这条主流程的持续价值。

**最新 tag**：`v0.7.0`（2026-05-11，45 commits since v0.6.0）
**GitHub tracking issue**：[#56](https://github.com/tongsh6/loamlog/issues/56)

---

## 2. 工序状态台账

| 车间 (工序) | 状态 | 关键组件/证据 | 当前缺口 |
| :--- | :--- | :--- | :--- |
| **破碎 (Normalizer)** | ✅ **已闭环 (代码)** | `packages/distill/src/normalizer.ts` | 真实样本验证 |
| **选矿 (Distiller)** | ✅ **已闭环 (代码)** | `packages/distill`, `issue-draft`, `knowledge-card v0.2` | 噪声过滤 -90% 已证明；已产出 10 张 card 待人工评分 |
| **冶炼 (Verifier)** | ✅ **已闭环 (P0/P1)** | `verifier/git-gap.ts`, `verifier/log-weave.ts` | 真实数据下证据织补效果未观察 |
| **精炼 (Aggregator)** | ✅ **已闭环 (代码)** | `packages/distill/src/aggregator.ts`（含 token-Jaccard 二次合并） | 跨 session 真实数据效果：12→6/7 refined |
| **底座 (Foundations)** | ✅ **已落成** | `store.ts`, `registry.ts`（已从 `src/` 泄漏产物清理为 package 公共 API） | 当前规模无检索性能瓶颈 |
| **储运 (Sink)** | ✅ **已闭环** | `dag-runner.ts`, `packages/sinks/{file,github,notion}`, `loam show` 命令 | 外部 sink 真实投递回报缺失 |

### 2.x 配套任务流

| Task | 状态 | 证据 |
| :--- | :--- | :--- |
| `tasks/2026-05-01-pipeline-integration` | ✅ 全部完成 (12 phase) | `progress.md`, 160 tests pass |
| `tasks/2026-05-02-shard-map-reduce` | ✅ 全部完成 (Steps 1-6 + code review) | `progress.md`, 185 tests pass, commits `dc50db3 / 9a51ea7 / 1112410 / 7d025b1` |
| `tasks/2026-05-03-issue-draft-v2` | ⚠️ progress.md 不同步 | commit `542109f` 已实现；progress.md 待同步 |
| 2026-05-11 bug fix batch | ✅ 全部完成 | 见 §2.y |

### 2.y 2026-05-11 门禁日修复批次

| 修复 | commit | 描述 |
| :--- | :--- | :--- |
| 编译恢复 | `bad82ba` | 3 个 TS 错误：refine typing / QualityReport.name / RefinedAsset → DistillResult |
| CLI 限流 flag | `e6b0e6d` | `--max-sessions` / `--skip-larger-than` + 4 单测 |
| ledger 对齐 | `d646fa3` | §0 当前门禁段；current-focus.md 链接 |
| session 去重 | `8757093` | `getUnprocessed` 按 session_id 取最新 snapshot（修复 cap bug 根源） |
| cap 计数 | `71bd496` | `--max-sessions` 改用 LLM-completed 计数 |
| aggregator 语义合并 | `f69ced9` | token-Jaccard ≥0.25 二次合并（12→6/7 refined） |
| `loam show` / list md | `8669d8f` | 人类可读卡片视图 |
| registry 清理 | `77b028e` | `TemporalEvidenceRegistry` 纳入 `@loamlog/archive` 公共 API，删除 src/ 泄漏产物 |
| CHANGELOG + tag | `abde7d8` / `d4508ba` | v0.7.0 CHANGELOG + annotated tag |

---

## 3. 关键证据索引

### 架构与设计
- **架构转型定义**：`AIEF/openspec/refinery-pipeline.md`
- **运行编排规格**：`AIEF/openspec/refinery-runtime-orchestration.md`
- **正常化规格**：`AIEF/openspec/session-normalizer.md`
- **MCP 边界 spec（仅设计）**：`AIEF/openspec/mcp-exposure-layer.md`

### 执行记录
- `tasks/2026-05-01-pipeline-integration/` — DAG 整合
- `tasks/2026-05-02-shard-map-reduce/` — 大 session 分片

### 产品验证记录
- `AIEF/reports/dogfooding/2026-05-02-validation-phase1.md` — 采集链路通过 (1304 sessions / 72h+)
- `AIEF/reports/dogfooding/2026-05-04-validation-phase2-knowledge-card.md` — 噪声过滤验证
- `/tmp/loam-distill-phase2-batch6.log` — 2026-05-11 终版 batch：12 verified → 10 refined，212s，0 errors
- `/tmp/loam-phase2-batch6-review.md` — 10 张卡人类可读视图（`loam list --distill --pending --format md` 输出）

### GitHub
- **追踪 issue**：[#56](https://github.com/tongsh6/loamlog/issues/56) — Refinery Pipeline 全量 audit trail
- **tag**：`v0.7.0`（annotated，已推 origin）
- **CHANGELOG**：`CHANGELOG.md` §[0.7.0]

---

## 4. 下一步 Top 3 优先级

> 以下顺序基于 §0 当前门禁结论。**MCP / FTS5 / 增量冶炼在产品门禁未通过前不启动。**

1. **[P0] 完成 Dogfooding Phase 2 终版 Go/No-Go 决策** ← **当前卡点**
   - 人工对 10 张 card 按 ≥60% / ≥3-of-5 标准评分
   - 输出 `AIEF/reports/dogfooding/2026-05-1x-validation-phase2-final.md`
   - 更新 §0 产品闭环状态
2. **[P1] 大 session 蒸馏链路（已基本完成）**
   - ✅ `dag-runner.ts` per-session 流式写（batch 6 已验证）
   - ✅ `--max-sessions` / `--skip-larger-than` CLI flag
   - ⏳ 剩余：README/CLI usage 推荐 DeepSeek 为规模化 provider
3. **[P2 / 待解锁] MCP 接入层实现 (Issue #24)** — **冻结**

### 已废弃 / 降级

| 原 Top 3 | 当前判断 | 何时再考虑 |
| :--- | :--- | :--- |
| MCP 接入层 | P2 冻结 | dogfooding Phase 2 = Go 之后 |
| FTS5 检索升级 | 过早优化 | 出现实测延迟回报后 |
| 增量冶炼 | 过早优化 | dogfooding 持续运行后若证实瓶颈 |

---

## 5. 待验证的核心假设

1. 经噪声过滤 v0.2 后，knowledge-card distiller 在 ≥10 真实样本上能否保持 ≥60% 人工质量评分？ ← **当前卡点**
2. 当前 LLM 选型（LM Studio / DeepSeek）在大 session 上是否能稳定完成蒸馏？
3. 「AI 会话 → 结构化证据 → 本地草稿」的闭环是否在持续真实使用中可被人接受？

---

## 6. GitHub Issue 台账

> 本节登记与仓库 issue 的对应关系，防止 GitHub 端状态与代码现实脱节。

### 6.1 本次关闭的 issue（2026-05-11）

| # | 标题 | 关闭原因 | 覆盖证据 |
| :--- | :--- | :--- | :--- |
| **#15** | Action Intelligence Engine | 被 distill + sink + review 流程覆盖 | `dag-runner.ts`, `packages/sinks/`, `loam review` |
| **#16** | Architecture Proposal | 被 Refinery Pipeline 11 篇 spec 覆盖 | `AIEF/openspec/refinery-pipeline.md` 等 |
| **#17** | Evolution Roadmap | 被 project-ledger + current-focus 取代 | `docs/project-ledger.md` §0, `AIEF/openspec/current-focus.md` |
| **#19** | Signal Extraction Design | 被 distill 引擎 + Verifier 工序覆盖 | `verifier/git-gap.ts`, `verifier/log-weave.ts`, noise filter v0.2 |
| **#21** | 下一阶段 P0/P1/P2 规划 | P0 项全部 close（#22/#23/#26） | Sanitization / Trigger / Evaluation 均已实现 |

### 6.2 本次新增的 issue

| # | 标题 | 用途 |
| :--- | :--- | :--- |
| **#56** | [Tracking] Refinery Pipeline — VS-01~04 + dogfooding Phase 1/2 | 补 audit trail，索引 v0.6.0 → v0.7.0 的 45 个 commit |

### 6.3 仍 open 的关键 issue

| # | 标题 | 当前判断 |
| :--- | :--- | :--- |
| **#24** | MCP Exposure Layer | spec 已完成，实现冻结至产品门禁通过（已注释） |
| **#20** | Plugin System: Action Executor | p2 deferred；当前 distiller + sink 插件已就位（已注释） |
| **#46** | 里程碑进度报告 | 自动生成，数据源已失真（A 67% / B 0% 不代表真实进度） |
| 其余 13 个 | stage:later / p2 延迟项 | 不影响当前迭代 |
