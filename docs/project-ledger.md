# Project Ledger — Loamlog 事实台账

## 0. 当前门禁 (Product Gate) — 2026-05-18

> **新会话 AI 必读**：本节是项目当前优先级的唯一权威来源。

| 维度 | 状态 | 说明 |
| :--- | :--- | :--- |
| **代码编译** | ✅ 通过 | 2026-05-19 `pnpm run build` 全绿，包含 Signal Gate rerun CLI、post-capture auto job、evidence-support verifier、follow-up open-work gate、代表性资产字段级 evidence gate、cited evidence hardening 与 signal consumption lineage 修复 |
| **测试** | ✅ 通过 | 2026-05-19 复跑 `pnpm run test` 全绿，289 pass / 0 fail；Signal routing focused tests：5 pass / 0 fail；DAG runner focused tests：9 pass / 0 fail |
| **代码闭环** | ✅ 已落成 | 炼矿四工序 + AssetStore + Registry + Sinks + `loam show` / `loam list --format md` + 代表性资产 distiller 包 |
| **产品闭环** | ⚠️ **Knowledge-card Phase 2 Go / 跨资产质量 No-Go** | 2026-05-13 中文复验：9 个真实 session → 10 张 knowledge-card，人工评分 10/10 ≥3/5；但 2026-05-15 代表性资产人工评分仅 37/205，平均 0.90/5，`>=3` 仅 7/41 |
| **下一道门禁** | Distiller Repair + Re-review | Signal Gate 入口已补齐；不再扩大样本，下一步重写 5 类代表性资产 distiller 的定义、prompt、schema、duplicate-topic / old-roadmap 过滤层，并小批量复评 |

**当前最高优先级 = 基于已落成的 Signal Gate，修复代表性资产 distiller 质量，先让「本机 AI 工具会话 → Signal → 多类型资产候选 → 人工 review」达到最低可用质量，而非继续单点优化 knowledge-card 或启动新架构（MCP / Action Executor / Dashboard / Auto-Skill）。**

证据：
- `AIEF/reports/dogfooding/2026-05-04-validation-phase2-knowledge-card.md`：噪声过滤 -90% 已证明；LM Studio 可用性已验证
- 2026-05-11 batch 6 日志：`/tmp/loam-distill-phase2-batch6.log`：12 verified → 10 refined，212s，0 errors
- 人工 review 视图：`/tmp/loam-phase2-batch6-review.md`（或 `loam list --distill --pending --format md`）
- 终版人工评分报告：`AIEF/reports/dogfooding/2026-05-12-validation-phase2-final.md`：6/10 通过，Conditional Go；低分卡暴露前因后果不足、evidence 不支撑、技术解法不严谨、输出语言不符合项目偏好等质量问题
- 中文复验 review：`AIEF/reports/dogfooding/2026-05-12-validation-phase2-zh-rerun-review.md`：10 张卡逐张人工评分，总分 41/50
- 中文复验终版报告：`AIEF/reports/dogfooding/2026-05-13-validation-phase2-zh-rerun-final.md`：10/10 ≥3/5，Phase 2 Go；仍需收紧 evidence selection 与技术机制验证
- 代表性资产 Batch 1 冒烟：`AIEF/reports/dogfooding/2026-05-13-representative-assets-batch1.md`：5 类 distiller 跑通，5 个真实 Loamlog session → 41 条 pending 资产，46/46 quality gate 通过，0 errors；结论为 Execution Smoke Go / Product Quality Pending
- 代表性资产 Batch 1 人工评分：`AIEF/reports/dogfooding/2026-05-15-representative-assets-batch1-review.md`：41 条逐条 review，总分 37/205，平均 0.90/5，`>=3` 7/41，`>=4` 2/41；结论为 Product Quality No-Go
- 本次 AI completion gate：`AIEF/reports/static-scan/2026-05-18T16-50-06Z`：typescript / biome / pnpm-audit exit 0，Findings 0，blocking 0，Top N 0；复扫对比 `2026-05-18T16-48-53Z`，0 fixed / 0 still present / 0 new

### 0.1 已知缺陷 / 修复状态

- ✅ `packages/distill/src/shard.test.ts > reduceResults`：3 条失败用例已修复（去重 by message_id / 去重 by similar title / drops single-shard low confidence），并补充中文标题去重覆盖。2026-05-13 `pnpm run test`：220 pass / 0 fail。
- ✅ `tasks/2026-05-03-issue-draft-v2/progress.md` 与代码不同步：2026-05-17 已同步为完成态；commit `542109f` 已实现 parts data / multi-output / target_repo。

### 0.3 代表性资产 distiller 实现状态（2026-05-13）

- ✅ 新增 `@loamlog/distiller-representative-assets`，包含 5 个普通插件 entrypoint：`idea-seed`、`practice-pitfall`、`decision-rationale`、`follow-up-work-item`、`skill-candidate`。
- ✅ CLI built-in resolver 已支持 5 个新 specifier：`@loamlog/distiller-idea-seed`、`@loamlog/distiller-practice-pitfall`、`@loamlog/distiller-decision-rationale`、`@loamlog/distiller-follow-up-work-item`、`@loamlog/distiller-skill-candidate`。
- ✅ 新 distiller 均要求有效 `evidence_refs`，无有效 evidence 时直接丢弃候选，不 fallback 到首条 message。
- ✅ focused tests：representative-assets + CLI 共 26 pass；全量 `pnpm run test`：220 pass；`pnpm run build`：通过。
- ✅ Batch 1 dogfooding：隔离临时 dump 跑 5 个真实 Loamlog `claude-code` session，5 类 distiller 均成功，输出 41 条 pending 资产，0 errors。
- ❌ Batch 1 人工质量 No-Go：41 条人工评分总分 37/205，平均 0.90/5；`follow-up-work-item`、`idea-seed`、`skill-candidate` 均 No-Go，`practice-pitfall` Conditional，`decision-rationale` 需大改。
- ⚠️ 主要失败模式：AI 过程日志污染、已完成事项误转待办、动作壳标题、类型路由错误、无证据扩写、旧路线图机械复活、跨类型重复资产。
- ✅ 非代码资产 evidence-support review 已补最小 deterministic verifier：`EvidenceSupportVerifier` 可对 idea / decision / skill 等候选执行保守的 cited-evidence lexical support 检查；弱支撑仍保留 `unverified` 交给人工 review，真实样本复评效果待观察。

### 0.2 Review 新发现（2026-05-13）

- ✅ **跨资产 evidence fallback 不一致已修复**：2026-05-17 已将 `prd-draft` / `pitfall-card` 对齐到 `knowledge-card`、`issue-draft` 和代表性资产策略：无有效 `evidence_refs`、引用不存在 message、或 malformed refs 时直接丢弃候选，不 fallback 到首条 message；新增 focused regression tests。
- ✅ **DAG 聚合后 result / candidate / quality 对齐风险已修复**：2026-05-18 已在 DAG 内引入 refined delivery item，把 `RefinedAsset -> DistillResult / AssetCandidate / QualityReport` 作为同一个内部投递单元流转；`deliver_to_sinks` 不再用 id/index fallback 回找 candidate/quality，audit 与 approval 使用 refined candidate 的重新计算质量报告。新增回归测试覆盖“两个候选聚合为一个 refined result，首个原始候选低置信度但 refined candidate 高置信度”的错配场景。
- ✅ **代表性资产高风险字段 evidence gate 已补齐**：2026-05-18 已在代表性资产共享 post-filter 中新增字段级 evidence 支撑检查，覆盖 owner / priority / due / acceptance / audience / next_probe / tradeoff / constraint / revisit_trigger / symptom / root_cause / prevention / skill constraints 等高风险扩写字段；无 evidence 支撑的可选字段会导致候选被丢弃，避免 Batch 1 中的无证据 owner、deadline、tradeoff、revisit trigger、acceptance 等扩写继续进入 review。
- ✅ **Aggregator 资产线边界已收紧**：2026-05-19 已修复 `TopicAggregator` 第二层语义合并只看标题导致不同 `candidate_type` / `distiller_id` 资产可能被折叠的问题；exact identity hash 现在包含 `candidate_type`，loose semantic merge 仅在同类型同 distiller 内执行。跨类型重复主题继续保留为独立资产，交给人工 review 或未来显式仲裁策略处理。
- ✅ **Signal consumption lineage 已收紧**：2026-05-19 已修复 Signal Gate routed distiller 的候选归因过宽问题；DAG 现在只把与候选 cited evidence 同 session/message 重叠的 routed signals 挂到候选并记录 `produced`，同 session 未被任何候选引用的 routed signals 记录为 `skipped`，避免 review/feedback 误以为所有 routed signals 都被同一资产成功消费。

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
| **选矿 (Distiller)** | ⚠️ **Knowledge-card 通过；代表性资产质量 No-Go** | `packages/distill`, `packages/distillers/representative-assets`, `knowledge-card`, `AIEF/openspec/signal-gate.md`, `AIEF/reports/dogfooding/2026-05-13-validation-phase2-zh-rerun-final.md`, `AIEF/reports/dogfooding/2026-05-15-representative-assets-batch1-review.md` | Signal Gate 已补齐；下一步重写 5 类代表性资产 distiller 的定义、prompt、schema、post-filter，并跑小批量复评 |
| **冶炼 (Verifier)** | ✅ **已闭环 (P0/P1 + evidence-support)** | `verifier/git-gap.ts`, `verifier/log-weave.ts`, `verifier/evidence-support.ts` | 真实数据下证据织补与非代码 evidence-support 效果待复评观察 |
| **精炼 (Aggregator)** | ✅ **已闭环 (代码)** | `packages/distill/src/aggregator.ts`（含 token-Jaccard 二次合并） | 跨 session 真实数据效果：12→6/7 refined |
| **底座 (Foundations)** | ✅ **已落成** | `store.ts`, `registry.ts`（已从 `src/` 泄漏产物清理为 package 公共 API） | 当前规模无检索性能瓶颈 |
| **储运 (Sink)** | ✅ **已闭环** | `dag-runner.ts`, `packages/sinks/{file,github,notion}`, `loam show` 命令 | 外部 sink 真实投递回报缺失 |

### 2.x 配套任务流

| Task | 状态 | 证据 |
| :--- | :--- | :--- |
| `tasks/2026-05-01-pipeline-integration` | ✅ 全部完成 (12 phase) | `progress.md`, 160 tests pass |
| `tasks/2026-05-02-shard-map-reduce` | ✅ 全部完成 (Steps 1-6 + code review) | `progress.md`, 185 tests pass, commits `dc50db3 / 9a51ea7 / 1112410 / 7d025b1` |
| `tasks/2026-05-03-issue-draft-v2` | ✅ 已完成并同步 | commit `542109f` 已实现 parts data / multi-output / target_repo；`progress.md` 已于 2026-05-17 对齐 |
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

### 2.z 2026-05-15 Signal Gate 设计入口

| 事项 | 状态 | 描述 |
| :--- | :--- | :--- |
| Signal Gate 规格 | ✅ 已登记 | `AIEF/openspec/signal-gate.md` 定义 `NormalizedSession -> Signal -> AssetCandidate` 全局分级门，覆盖 Signal 数据模型、review、插件消费、幂等、CLI、实施 DAG 与验收标准 |
| 台账对齐 | ✅ 已登记 | `docs/project-ledger.md`、`AIEF/context/business/current-focus.md`、`AIEF/context/INDEX.md` 和 `AIEF/openspec/README.md` 已把下一道门禁从直接修 distiller 调整为先做 Signal Gate |
| Signal contract 切片 | ✅ 已落成 | `@loamlog/core` 已新增 SignalKind/SignalTag/SignalReview/SignalConsumption/DistillerManifest contract、默认 review status 与 `validateSignal`；代表性资产 distiller 已声明 `consumes_signals`，后续 routing 可按 manifest 消费 signal |
| SignalStore 切片 | ✅ 已落成 | `AssetStore` contract 与 `LocalAssetStore` 已支持 signal 写入、列表/详情、人工 review、consumption 记录和基础 lineage 查询；classifier 重跑不会覆盖人工 review |
| Signal CLI 切片 | ✅ 已落成 | `loam signal list/show/review` 已支持读取 `LocalAssetStore` signals、按 kind/status/session/distiller/promotable 过滤、默认隐藏 `raw_model_output`、人工 review 覆盖 classification |
| Signal classifier schema 切片 | ✅ 已落成 | `@loamlog/distill` 已新增 `signal-classifier` 模块，导出 Signal Gate LLM 输出 JSON schema、prompt builder、LLM classify helper、deterministic normalize/policy check；无有效 evidence 的 classifier item 不落库，非法 tag 进入 `raw_tags` |
| Signal-based distiller routing 切片 | ✅ 已落成 | `runDistillDAG` 对声明 `consumes_signals` 的 distiller 先执行 Signal classifier、写入 `LocalAssetStore`、按 manifest 选择可消费 signal、将 distiller 输入缩小到 signal evidence messages，并按候选 cited evidence overlap 精确记录 `SignalConsumption` lineage；未声明 signal 消费的旧 distiller 行为不变 |
| Signal classifier rerun CLI 切片 | ✅ 已落成 | `loam signal rerun` 可按 repo / session / since / until / limit 读取 archive 快照、复用 Signal classifier 重跑、写入 `LocalAssetStore` signals，并输出 processed / signals / rejected_items / errors 摘要；人工 review 仍由 store 保留 |
| Post-capture Signal Gate job 切片 | ✅ 已落成 | daemon capture 写入 redacted snapshot 后会异步触发单会话 Signal Gate job，复用 `runSignalGateForArtifact` 写入 `LocalAssetStore`；classifier / LLM / enqueue 失败只记录日志，不影响 capture 返回 202 |

### 2.aa 2026-05-15 代表性资产通用过滤层

| 事项 | 状态 | 描述 |
| :--- | :--- | :--- |
| Common post-filter v0.2 | ✅ 已落成 | `@loamlog/distiller-representative-assets` 共享 `shouldKeepRepresentativeAsset` post-filter 已覆盖 assistant process log evidence、动作壳标题、follow-up 缺少验收标准、done-state / old-roadmap idea、decision 非明确决策、普通 API key 错误经验、one-off command / bug fix / CI skill-candidate，并新增低价值重复主题过滤：API key 排障不进 idea，Loamlog 内部 dogfooding / provider bug / CI 构建动作不升为 skill-candidate |
| Common post-filter v0.3 | ✅ 已落成 | 2026-05-17 继续收紧代表性资产低价值重复主题：routine repo implementation（CI / GitHub Actions / typecheck / build coverage）和 dogfooding execution 不再进入 `idea-seed`；API key / provider fallback 排障不再进入 `decision-rationale`；补充 focused regression tests |
| Prompt/schema repair v0.4 | ✅ 已落成 | 2026-05-17 为 5 类代表性资产 distiller 增加共享 prompt guardrails 与类型专属负例：evidence-first、不得无证据扩写 owner / due / tradeoff / value、拒绝 assistant process log / completed work / action-shell / old-roadmap / transient fallback；新增 prompt guardrails focused tests |
| Candidate duplicate-topic merge v0.5 | ✅ 已落成 | 2026-05-17 在代表性资产共享基类中增加单 artifact 内候选去重：同类型候选按精确 evidence excerpt 或标题 topic 相似度合并，保留最高置信候选并合并 evidence / tags；覆盖英文、中文与同长消息多主题误杀 regression tests；跨类型 / 跨 session 聚合仍交给后续复评与现有 aggregator 观察 |
| Old-roadmap repair v0.6 | ✅ 已落成 | 2026-05-17 收紧旧路线图残留过滤：`issue-candidate / prd-draft`、MCP API gateway、golden user testing、工具专属 AI 规则文件 Phase 4 等历史方向不再进入 `idea-seed` / `follow-up-work-item`；`decision-rationale` 仅在缺少明确 decision / deferral 语言时拒绝旧路线图题材，保留“明确暂缓 MCP”等有效决策；补充正负 focused regression tests |
| Evidence-first alignment v0.7 | ✅ 已落成 | 2026-05-17 统一内置文档类 distiller 的 evidence 策略：`prd-draft` / `pitfall-card` 不再在 invalid / missing `evidence_refs` 时 fallback 到首条 message，避免无证据资产进入 Cross-Asset Dogfooding；focused tests 覆盖 invalid refs 与 omitted refs |
| Follow-up open-work gate v0.8 | ✅ 已落成 | 2026-05-18 为 `follow-up-work-item` 增加确定性 open-work evidence gate：候选不仅要有 action / reason / acceptance，还要求 cited evidence 明确包含 future / pending / blocked / next-step / still-needs-follow-up 等开放工作信号；无开放工作证据的风险、经验、排障、review-only 记录或执行记录不再被 LLM payload 包装成后续待办；focused tests 覆盖英文拒绝、review-only 拒绝、中文保留和 distiller run path |
| Field evidence gate v0.9 | ✅ 已落成 | 2026-05-18 为 5 类代表性资产共享 post-filter 增加高风险字段 evidence 支撑检查：`idea-seed` 的 audience / next_probe 等、`follow-up-work-item` 的 priority / due / acceptance 等、`decision-rationale` 的 options / tradeoffs / constraints / revisit_trigger、`practice-pitfall` 的 symptom / root_cause / prevention、`skill-candidate` 的 required_context / inputs / outputs / constraints / negative_cases 均不得无证据扩写；设计记录见 `tasks/2026-05-18-representative-field-evidence-gate/plan.md` |
| Cited evidence hardening v0.10 | ✅ 已落成 | 2026-05-19 收紧代表性资产字段级 evidence gate：`collectEvidence` 会丢弃无法在源 message 中定位的 excerpt；高风险字段支撑和 `follow-up-work-item` open-work 判定只读取 anchored cited `evidence.excerpt`，不再借用同一条 source message 的未引用文本；全文 message 仅保留给 assistant-process / noise 类上下文过滤。设计记录见 `tasks/2026-05-19-cited-evidence-gate-hardening/plan.md` |

### 2.ab 2026-05-18 DAG refined lineage 修复

| 事项 | 状态 | 描述 |
| :--- | :--- | :--- |
| Refined delivery lineage | ✅ 已落成 | 修复 `process_results` 聚合后 result / candidate / quality parallel arrays 失配风险：DAG 内部维护 `DeliveryItem`，refined asset 重新生成 aligned result / candidate / quality，并让 sink approval 与 audit 只消费该结构；设计记录见 `tasks/2026-05-18-dag-refined-lineage/plan.md`，focused regression test 已覆盖聚合改 ID / 重排后的 quality 错配 |

### 2.ac 2026-05-18 非代码资产 evidence-support verifier

| 事项 | 状态 | 描述 |
| :--- | :--- | :--- |
| Evidence support verifier | ✅ 已落成 | 为 smelting 阶段新增 `EvidenceSupportVerifier`，对代表性资产等非代码候选做保守的 cited-evidence lexical support 检查；DAG 合并策略保持 git/log verifier 优先级，同时允许 evidence 明确支撑的非代码资产进入 `verified`，弱支撑保留 `unverified` 交给人工 review；设计记录见 `tasks/2026-05-18-evidence-support-verifier/plan.md`，focused tests 覆盖英文、中文、弱证据和无证据场景 |

### 2.ad 2026-05-19 Aggregator 资产线边界修复

| 事项 | 状态 | 描述 |
| :--- | :--- | :--- |
| TopicAggregator type boundary | ✅ 已落成 | 修复 `TopicAggregator` exact identity / loose semantic merge 的资产线边界：identity hash 从 repo + distiller + topic 收紧为 repo + distiller + type + topic，第二层标题相似合并要求 same `candidate_type` + same `distiller_id`；避免 cross-asset dogfooding 中同一主题的 decision / follow-up / idea 等不同资产线被静默折叠。设计记录见 `tasks/2026-05-19-aggregator-type-boundary/plan.md`，focused tests 覆盖跨类型、跨 distiller 同标题不合并。 |

### 2.ae 2026-05-19 Signal consumption lineage 修复

| 事项 | 状态 | 描述 |
| :--- | :--- | :--- |
| Signal evidence-scoped consumption | ✅ 已落成 | 修复 Signal Gate routed distiller 对候选/Signal 的过宽归因：新增 `selectSignalsForEvidence` helper，DAG 只给候选挂载与 cited evidence 同 session/message 重叠的 routed signals，并只对这些 signals 记录 `produced`；同 session 未被候选引用的 routed signals 记录为 `skipped`，保留负反馈。设计记录见 `tasks/2026-05-19-signal-consumption-lineage/plan.md`，focused tests 覆盖两个 routed signals 只产出一个候选时的 produced/skipped lineage。 |

---

## 3. 关键证据索引

### 架构与设计
- **架构转型定义**：`AIEF/openspec/refinery-pipeline.md`
- **运行编排规格**：`AIEF/openspec/refinery-runtime-orchestration.md`
- **正常化规格**：`AIEF/openspec/session-normalizer.md`
- **代表性资产萃取器规格**：`AIEF/openspec/representative-asset-distillers.md`
- **Signal Gate 规格**：`AIEF/openspec/signal-gate.md`
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
- `AIEF/reports/dogfooding/2026-05-13-representative-assets-batch1.md` — 代表性资产 Batch 1：5 类 distiller、5 个真实 session、41 条 pending 资产，Execution Smoke Go
- `AIEF/reports/dogfooding/2026-05-15-representative-assets-batch1-review.md` — 代表性资产 Batch 1 人工评分：37/205，平均 0.90/5，Product Quality No-Go
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

1. **[P0] 实现 Signal Gate 设计入口 (#57)**
   - 输入：`AIEF/openspec/signal-gate.md` 与 `AIEF/reports/dogfooding/2026-05-15-representative-assets-batch1-review.md`
   - 目标：在 `NormalizedSession` 和 typed distillers 之间补全全局 `Signal` 分级、review、consumption 记录和插件路由契约
   - 已完成：Signal contract、默认 review status、`validateSignal`、代表性资产插件 `consumes_signals`、AssetStore signal 节点、`loam signal list/show/review/rerun` 最小人工审阅与重跑入口、classifier schema/prompt/normalize helper、DAG 内 signal-based distiller routing、capture 后自动 Signal Gate job
   - 剩余产物：当前 dogfooding 主线可进入 P1 duplicate-topic / old-roadmap / prompt-schema repair 与小批量复评
2. **[P1] 增加跨资产通用过滤层**
   - 已完成 v0.2：过滤 assistant process log、done-state、action-shell、old-roadmap、部分 wrong-type；`follow-up-work-item` 已要求验收标准；`skill-candidate` 已拒绝普通命令、bug fix、CI 等一次性任务；API key 排障、内部 dogfooding / provider bug / CI 构建动作等低价值重复主题已增加确定性过滤
   - 已完成 v0.5：单 artifact 内同类型候选 duplicate-topic 合并，避免 LLM 单次返回重复包装同一主题
   - 已完成 v0.6：更细的 old-roadmap 判定，覆盖旧资产路线、MCP API gateway、golden user testing、Phase 4 工具规则文件，同时保留明确暂缓类 decision
   - 剩余：跨类型重复主题观察、基于真实样本的小批量复评
3. **[P2] 小批量复评而非扩大样本**
   - 用 5-10 条真实 session rerun，目标是每类资产 `>=3` 比例至少 50%
   - 仅当复评达标后，再讨论多 provider 样本、复用池、页面或 MCP 暴露
   - 暂不启动 MCP / Action Executor / Dashboard / Auto-Skill

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
3. `idea-seed`、`practice-pitfall`、`decision-rationale`、`follow-up-work-item`、`skill-candidate` 等代表性资产线能否在真实样本上达到可 review、可复用的最低质量线？ → **当前未达标：41 条人工评分 37/205，平均 0.90/5，Product Quality No-Go**
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
| **#57** | [Tracking] Cross-Asset Dogfooding | 验证 Loamlog 能否从真实本地 AI 会话中稳定产出 `idea-seed`、`practice-pitfall`、`decision-rationale`、`follow-up-work-item`、`skill-candidate` 等代表性可复用资产 |

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
#57 [Tracking] Cross-Asset Dogfooding — representative AI collaboration assets
```

验收重点：
- 每类资产单独评分；
- 每条结果保留 evidence backlinks；
- 记录 review 状态和失败类型；
- 至少抽样证明资产能被后续任务引用或转化为下一步工作项。
