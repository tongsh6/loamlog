# Project Ledger — Loamlog 事实台账

## 0. 当前门禁 (Product Gate) — 2026-05-13

> **新会话 AI 必读**：本节是项目当前优先级的唯一权威来源。

| 维度 | 状态 | 说明 |
| :--- | :--- | :--- |
| **代码编译** | ✅ 通过 | `pnpm -r build` 全部 22 个包成功 |
| **测试** | ✅ 207 pass / 0 fail | 2026-05-13 复跑 `pnpm run test` 全绿；新增 output-language / evidence refs / 中文标题去重回归测试 |
| **代码闭环** | ✅ 已落成 | 炼矿四工序 + AssetStore + Registry + Sinks + `loam show` / `loam list --format md` |
| **产品闭环** | ✅ **Phase 2 Go / 小批量复验通过** | 2026-05-13 中文复验：9 个真实 session → 10 张 knowledge-card，人工评分 10/10 ≥3/5，总分 41/50，平均 4.1/5 |
| **下一道门禁** | Cross-Asset Dogfooding | 不再只验证 knowledge-card；下一批要同时覆盖 `knowledge-card`、`issue-draft`，并选择 `prd-draft` 或 `pitfall-card` 做第三条资产线 |

**当前最高优先级 = 跨资产类型 dogfooding，验证「本机多 AI 工具会话 → 多类型可复用资产」能否稳定闭环，而非继续单点优化 knowledge-card 或启动新架构（MCP / Action Executor / Dashboard / Auto-Skill）。**

证据：
- `AIEF/reports/dogfooding/2026-05-04-validation-phase2-knowledge-card.md`：噪声过滤 -90% 已证明；LM Studio 可用性已验证
- 2026-05-11 batch 6 日志：`/tmp/loam-distill-phase2-batch6.log`：12 verified → 10 refined，212s，0 errors
- 人工 review 视图：`/tmp/loam-phase2-batch6-review.md`（或 `loam list --distill --pending --format md`）
- 终版人工评分报告：`AIEF/reports/dogfooding/2026-05-12-validation-phase2-final.md`：6/10 通过，Conditional Go；低分卡暴露前因后果不足、evidence 不支撑、技术解法不严谨、输出语言不符合项目偏好等质量问题
- 中文复验 review：`AIEF/reports/dogfooding/2026-05-12-validation-phase2-zh-rerun-review.md`：10 张卡逐张人工评分，总分 41/50
- 中文复验终版报告：`AIEF/reports/dogfooding/2026-05-13-validation-phase2-zh-rerun-final.md`：10/10 ≥3/5，Phase 2 Go；仍需收紧 evidence selection 与技术机制验证
- 最新 AI completion gate：`AIEF/reports/static-scan/2026-05-12T17-29-38Z`：typescript / biome / pnpm-audit exit 0，blocking 0

### 0.1 已知缺陷 / 修复状态

- ✅ `packages/distill/src/shard.test.ts > reduceResults`：3 条失败用例已修复（去重 by message_id / 去重 by similar title / drops single-shard low confidence），并补充中文标题去重覆盖。2026-05-13 `pnpm run test`：207 pass / 0 fail。
- `tasks/2026-05-03-issue-draft-v2/progress.md` 与代码不同步：commit `542109f` 已实现 parts data / multi-output / target_repo，但 progress.md 仍写 "Step 1 待开始"。

### 0.2 Review 新发现（2026-05-13）

- ⚠️ **跨资产 evidence fallback 不一致**：`knowledge-card` 已改为无有效 `evidence_refs` 则拒绝；但 `prd-draft` / `pitfall-card` 仍会在 evidence refs 无效时回退到首条 message。影响：Cross-Asset Dogfooding 中可能出现“证据不支撑但仍产出”的资产。处理：不纳入本次 knowledge-card 小修；#57 执行前应统一 distiller evidence 策略并补测试。
- ⚠️ **DAG 聚合后 result / candidate / quality 对齐风险**：`process_results` 会把 `acc.results` 替换为 refined assets，`deliver_to_sinks` 再用 id 或 index 回找 candidate/quality。聚合合并或改 ID 后可能造成 audit / quality 与输出资产错配。影响：多资产 review / sink 审计可信度。处理：不在本次小修中重构 DAG；应在 #57 或单独 task 中设计稳定的 refined asset lineage 映射。

---

## 1. 当前阶段目标 (v0.7.0)

**核心任务**：从"线性采集-蒸馏"向"工业化炼矿中心"架构转型 → **代码层已完成**，现进入**产品验证阶段**。
**战略重点**：用真实数据证明「本机多 AI 工具会话 → 结构化证据 → 多类型本地资产草稿 → 人工 review → 后续复用」这条主流程的持续价值。

**最新 tag**：`v0.7.0`（2026-05-11，45 commits since v0.6.0）
**已完成 tracking issue**：[#56](https://github.com/tongsh6/loamlog/issues/56)
**当前 tracking issue**：[#57](https://github.com/tongsh6/loamlog/issues/57)

---

## 2. 工序状态台账

| 车间 (工序) | 状态 | 关键组件/证据 | 当前缺口 |
| :--- | :--- | :--- | :--- |
| **破碎 (Normalizer)** | ✅ **已闭环 (代码)** | `packages/distill/src/normalizer.ts` | 真实样本验证 |
| **选矿 (Distiller)** | ✅ **小批量复验通过 (产品)** | `packages/distill`, `issue-draft`, `knowledge-card`, `AIEF/reports/dogfooding/2026-05-13-validation-phase2-zh-rerun-final.md` | 中文复验 10/10 通过；下一步收紧 evidence selection、技术机制验证与推荐资产门槛 |
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
- `AIEF/reports/dogfooding/2026-05-12-validation-phase2-final.md` — Phase 2 终版人工评分：10 张 card，6/10 ≥3/5，Conditional Go
- `AIEF/reports/dogfooding/2026-05-12-validation-phase2-zh-rerun-review.md` — 中文复验逐卡评分：10 张 card，总分 41/50
- `AIEF/reports/dogfooding/2026-05-13-validation-phase2-zh-rerun-final.md` — 中文复验终版结论：10/10 ≥3/5，Phase 2 Go
- `/tmp/loam-distill-phase2-batch6.log` — 2026-05-11 终版 batch：12 verified → 10 refined，212s，0 errors
- `/tmp/loam-phase2-batch6-review.md` — 10 张卡人类可读视图（`loam list --distill --pending --format md` 输出）

### GitHub
- **已完成追踪 issue**：[#56](https://github.com/tongsh6/loamlog/issues/56) — Refinery Pipeline 全量 audit trail，2026-05-12 已关闭
- **当前追踪 issue**：[#57](https://github.com/tongsh6/loamlog/issues/57) — Cross-Asset Dogfooding
- **tag**：`v0.7.0`（annotated，已推 origin）
- **CHANGELOG**：`CHANGELOG.md` §[0.7.0]

---

## 4. 下一步 Top 3 优先级

> 以下顺序基于 §0 当前门禁结论。**MCP / FTS5 / 增量冶炼在产品质量稳定前不启动。**

1. **[P0] 执行 Cross-Asset Dogfooding tracking (#57)**
   - 目标：同时验证 `knowledge-card`、`issue-draft`，并选择 `prd-draft` 或 `pitfall-card` 做第三条资产线
   - 每类资产单独人工评分，避免 knowledge-card 成功掩盖其他资产线失败
   - 产物：本地 dogfooding 报告模板 + 明确 Go/No-Go 标准 + review 结果
2. **[P1] 用真实新增会话跑多资产样本**
   - 输入优先覆盖 OpenCode / Claude Code / Cursor 等本机 provider 路径
   - 每个结果必须保留 evidence backlinks、review 状态和本地输出
   - 抽样验证资产能否被后续任务引用或转成下一步工作项
3. **[P2] 收紧跨资产质量门禁**
   - 通用失败类型：evidence 不支撑、上下文缺失、语言不符合偏好、技术结论过度
   - 技术机制类资产标记“需可复现实验 / 官方文档 / 代码验证”
   - `>=4/5` 进入推荐资产，`3/5` 进入待修订池，低于 3/5 不进入复用池

### 已废弃 / 降级

| 原 Top 3 | 当前判断 | 何时再考虑 |
| :--- | :--- | :--- |
| MCP 接入层 | P2 冻结 | 跨资产 dogfooding 连续多批次稳定后 |
| Action Executor | P2 冻结 | review 与资产质量稳定后 |
| Dashboard / Web UI | P2 冻结 | 有稳定资产流和真实观察需求后 |
| Auto-Skill Generation | 远期 | instruction-rule / reusable-instruction 边界清晰后 |
| FTS5 检索升级 | 过早优化 | 出现实测延迟回报后 |
| 增量冶炼 | 过早优化 | dogfooding 持续运行后若证实瓶颈 |

---

## 5. 待验证的核心假设

1. 经噪声过滤 v0.2/v0.3 后，knowledge-card distiller 在 ≥10 真实样本上能否保持 ≥60% 人工质量评分？ → **已刚好达标：6/10 = 60%，Conditional Go**
2. 收紧质量门禁后，下一批 knowledge-card 能否达到更稳的 ≥70% 人工质量评分？ → **已达标：中文复验 10/10 = 100%，平均 4.1/5**
3. `issue-draft`、`prd-draft`、`pitfall-card` 等资产线能否在真实样本上达到可 review、可复用的最低质量线？
4. 本机多个 AI 工具的会话能否被稳定纳入同一条 capture / archive / distill / review 链路？
5. 人工 review 后的资产能否进入本地复用池，并在后续任务中被引用或转化为工作项？
6. 当前 LLM 选型（LM Studio / DeepSeek）在大 session 和多资产 distiller 上是否能稳定完成蒸馏？

---

## 6. GitHub Issue 台账

> 本节登记与仓库 issue 的对应关系，防止 GitHub 端状态与代码现实脱节。

### 6.1 已关闭的 issue

| # | 标题 | 关闭原因 | 覆盖证据 |
| :--- | :--- | :--- | :--- |
| **#15** | Action Intelligence Engine | 被 distill + sink + review 流程覆盖 | `dag-runner.ts`, `packages/sinks/`, `loam review` |
| **#16** | Architecture Proposal | 被 Refinery Pipeline 11 篇 spec 覆盖 | `AIEF/openspec/refinery-pipeline.md` 等 |
| **#17** | Evolution Roadmap | 被 project-ledger + current-focus 取代 | `docs/project-ledger.md` §0, `AIEF/openspec/current-focus.md` |
| **#19** | Signal Extraction Design | 被 distill 引擎 + Verifier 工序覆盖 | `verifier/git-gap.ts`, `verifier/log-weave.ts`, noise filter v0.2 |
| **#21** | 下一阶段 P0/P1/P2 规划 | P0 项全部 close（#22/#23/#26） | Sanitization / Trigger / Evaluation 均已实现 |
| **#46** | 里程碑进度报告 | 自动生成报告的数据源已失真，2026-05-12 以 `not planned` 关闭 | GitHub 评论已说明后续报告必须改读 ledger + active tracking issue |
| **#56** | Refinery Pipeline — VS-01~04 + dogfooding Phase 1/2 | Phase 2 final、#46 关闭、下一阶段 #57 tracking 均已落位，2026-05-12 以 `completed` 关闭 | `AIEF/reports/dogfooding/2026-05-13-validation-phase2-zh-rerun-final.md`, #57 |

### 6.2 当前主线

| # | 标题 | 用途 |
| :--- | :--- | :--- |
| **#57** | [Tracking] Cross-Asset Dogfooding — knowledge-card + issue-draft + prd-draft/pitfall-card | 验证 Loamlog 能否从真实本地 AI 会话中稳定产出多种可复用资产 |

### 6.3 下一阶段候选

| # | 标题 | 当前判断 |
| :--- | :--- | :--- |
| **#11** | config precedence between auto-discovery and explicit configuration | 与多 provider 捕获愿景强相关；应先定义显式配置、env、发现值、默认值的优先级 |
| **#9** | auto-detect local session providers and instances | 与“从本机所有 AI 工具抓会话”直接相关；应在 #11 规则清晰后推进 |
| **#44** | instruction-summary distiller | 有价值，但需重新定边界，避免与 #51 / instruction-rule / Auto-Skill 重叠 |

### 6.4 后置能力

| # | 标题 | 当前判断 |
| :--- | :--- | :--- |
| **#24** | MCP Exposure Layer | spec 已完成；实现继续冻结到跨资产 dogfooding 稳定后 |
| **#20** | Plugin System: Action Executor | p2 deferred；review 与资产质量稳定前不做自动执行 |
| **#25** | Signal Monitor / Dashboard | p2 deferred；当前没有稳定资产流前不做 UI |

### 6.5 远期资产扩展

| # | 标题 | 当前判断 |
| :--- | :--- | :--- |
| **#51** | Instruction Rule Assets umbrella | 长期方向，不是当前主线 |
| **#47 / #48 / #49 / #50** | instruction evidence / rule / publish 链路 | 后续资产扩展线，当前不全做 |
| **#6** | Auto-Skill Generation | 远期方向，不应现在做 |
| **#5 / #10** | zero-config umbrella / LLM service discovery | 后置；当前 #11 / #9 优先级更高 |

### 6.6 待新建 tracking

已新增：

```text
#57 [Tracking] Cross-Asset Dogfooding — knowledge-card + issue-draft + prd-draft/pitfall-card
```

验收重点：
- 每类资产单独评分；
- 每条结果保留 evidence backlinks；
- 记录 review 状态和失败类型；
- 至少抽样证明资产能被后续任务引用或转化为下一步工作项。
