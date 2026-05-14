# 当前焦点 | Current Focus

## 状态总览 | Status Summary

截至 2026-05-15，Loamlog v0.7.0 已完成 Refinery Pipeline 的代码层闭环，通过 knowledge-card 资产线的小批量中文复验，并完成 5 类代表性资产萃取器的 Batch 1 冒烟验证；但 Batch 1 人工评分为 Product Quality No-Go。
As of 2026-05-15, Loamlog v0.7.0 has completed the code-level Refinery Pipeline loop, passed a small-batch Chinese rerun for the `knowledge-card` asset line, and completed Batch 1 smoke validation for five representative asset distillers; however, Batch 1 manual review is Product Quality No-Go.

关键事实：
Key facts:

- Refinery Pipeline 已从线性 capture-distill 演进为「破碎 → 选矿 → 冶炼 → 精炼」流水线。
- The Refinery Pipeline has moved from linear capture-distill into a four-stage flow: normalize, distill, verify, refine.
- VS-01~VS-04 代码层已落成，`AssetStore`、`TemporalEvidenceRegistry`、file/github/notion sinks、`loam show` / `loam list --format md` 已就位。
- VS-01~VS-04 are implemented at code level, with `AssetStore`, `TemporalEvidenceRegistry`, file/github/notion sinks, and `loam show` / `loam list --format md` in place.
- Phase 2 中文复验：9 个真实 session → 10 张 knowledge-card，人工评分 41/50，平均 4.1/5，10/10 >=3，8/10 >=4。
- Phase 2 Chinese rerun: 9 real sessions -> 10 knowledge cards, manual score 41/50, average 4.1/5, 10/10 >=3, 8/10 >=4.
- Representative Assets Batch 1：5 个真实 Loamlog `claude-code` session → 41 条 pending 资产，5 类 distiller 均跑通，46/46 quality gate 通过，0 errors。
- Representative Assets Batch 1: 5 real Loamlog `claude-code` sessions -> 41 pending assets; all five distillers ran successfully, 46/46 candidates passed the current quality gate, with 0 errors.
- Representative Assets Batch 1 人工评分：41 条逐条 review，总分 37/205，平均 0.90/5，`>=3` 7/41，`>=4` 2/41；结论为 Product Quality No-Go。
- Representative Assets Batch 1 manual review: 41 assets reviewed one by one, total score 37/205, average 0.90/5, `>=3` 7/41, `>=4` 2/41; conclusion: Product Quality No-Go.
- #46 旧 milestone 自动报告已关闭，因为 issue-count 数据源已失真。
- #46 has been closed because the old issue-count milestone report no longer reflects project reality.
- #56 已关闭为 completed；下一阶段主线转入 #57 Cross-Asset Dogfooding。
- #56 is closed as completed; the active tracking issue is now #57 Cross-Asset Dogfooding.

当前权威台账：
Authoritative ledger:

- `docs/project-ledger.md`
- `AIEF/openspec/representative-asset-distillers.md`
- `AIEF/reports/dogfooding/2026-05-13-representative-assets-batch1.md`
- `AIEF/reports/dogfooding/2026-05-15-representative-assets-batch1-review.md`
- #57 `[Tracking] Cross-Asset Dogfooding`

## 当前产品问题 | Current Product Question

当前问题不再是 knowledge-card 能不能产出可读卡片，而是：
The current question is no longer whether `knowledge-card` can produce readable cards, but:

```text
local AI tools
  -> capture
  -> archive
  -> multi-asset distill
  -> human review
  -> local asset store
  -> reuse in later work
  -> feedback back into the system
```

是否能在真实本机多 AI 工具会话中稳定闭环。
Can this loop work reliably across real local sessions from multiple AI tools?

## 当前活跃议题 | Current Active Threads

- `#57` — Cross-Asset Dogfooding：当前主线；Batch 1 已证明 5 类代表性资产可从真实会话产出 pending 资产，但人工评分未达可用线，下一步是按失败类型修正 distiller 定义、prompt、schema 与过滤层。
- `#57` — Cross-Asset Dogfooding: current mainline; Batch 1 proved that five representative asset types can produce pending assets from real sessions, but manual review did not meet the usability bar. Next step: repair distiller definitions, prompts, schemas, and filters based on failure types.
- `#11` — config precedence：下一阶段候选，应先定义 explicit config、env、discovered values、defaults 的优先级。
- `#11` — config precedence: next candidate; define precedence among explicit config, env, discovered values, and defaults.
- `#9` — local session provider discovery：与“从本机所有 AI 工具抓会话”愿景强相关，应在 #11 边界清晰后推进。
- `#9` — local session provider discovery: closely tied to the multi-tool capture vision; should follow #11 boundary clarification.
- `#44` — instruction-summary distiller：有价值，但需重新定边界，避免与 instruction-rule / Auto-Skill 轨道重叠。
- `#44` — instruction-summary distiller: valuable, but needs boundary refinement to avoid overlap with instruction-rule / Auto-Skill tracks.

## 已关闭议题 | Closed Topics

- `#46` — 里程碑进度报告：数据源失真，已以 `not planned` 关闭。
- `#46` — Milestone report: closed as `not planned` because the data source was misleading.
- `#56` — Refinery Pipeline + dogfooding Phase 1/2：Phase 2 final、#46 关闭、#57 tracking 均已落位，已以 `completed` 关闭。
- `#56` — Refinery Pipeline + dogfooding Phase 1/2: closed as `completed` after Phase 2 final, #46 closure, and #57 creation.
- `#7` / `#12` / `#13` / `#14` — 首条 issue-draft MVP 闭环已完成。
- `#7` / `#12` / `#13` / `#14` — first issue-draft MVP loop is complete.
- `#15` / `#19` / `#21` — 已被 Refinery Pipeline、distill/sink/review 链路和 project ledger 覆盖。
- `#15` / `#19` / `#21` — covered by the Refinery Pipeline, distill/sink/review flow, and project ledger.

## 近期非目标 | Near-Term Non-Goals

当前不投入：
Do not invest in these now:

- MCP server 实现
- MCP server implementation
- Action Executor 自动执行
- Action Executor automation
- Dashboard / Web UI
- Dashboard / Web UI
- Auto-Skill Generation
- Auto-Skill Generation
- instruction-rule 全链路
- full instruction-rule pipeline
- 外部 GitHub / Notion 自动投递
- automatic external GitHub / Notion publishing
- 大规模向量搜索或 marketplace
- large-scale vector search or marketplace work

原因：当前最缺的是跨资产类型真实验证和资产生命周期闭环，不是更多平台能力。
Reason: the current gap is cross-asset validation and asset lifecycle closure, not more platform surface area.

## 下一阶段判断点 | Next-Phase Decision Points

- `idea-seed`、`practice-pitfall`、`decision-rationale`、`follow-up-work-item`、`skill-candidate` 等代表性资产线已经能在真实样本上产出 pending 资产；但本轮人工评分显示当前质量不达标，不能进入资产池。
- `idea-seed`, `practice-pitfall`, `decision-rationale`, `follow-up-work-item`, and `skill-candidate` can now produce pending assets on real samples; however, this manual review shows that current quality is below the bar and should not enter the asset pool.
- 下一轮是否能通过通用过滤层去掉 assistant process log、done-state、action-shell、old-roadmap、duplicate-topic、wrong-type？
- Can the next iteration use a common filter layer to remove assistant process logs, done-state items, action shells, old roadmap residue, duplicate topics, and wrong-type assets?
- 重写后的代表性资产 distiller 是否能在 5-10 条真实样本中达到每类 `>=3` 比例至少 50%？
- Can the revised representative asset distillers reach at least 50% `>=3` items per type on 5-10 real samples?
- 每类资产是否都有 evidence backlinks、review 状态、本地输出和失败类型记录？
- Does each asset type preserve evidence backlinks, review status, local output, and failure type records?
- 非代码资产的 verification 是否能从 git-gap 扩展到 evidence-support review？
- Can verification for non-code assets extend from git-gap checks to evidence-support review?
- 人工 review 后的资产能否进入本地复用池，并在后续任务中被引用或转化为工作项？
- Can reviewed assets enter a local reuse pool and later be referenced or converted into concrete work items?
- 本机多个 AI 工具的会话能否被稳定纳入同一条 capture / archive / distill / review 链路？
- Can sessions from multiple local AI tools reliably enter the same capture / archive / distill / review loop?
