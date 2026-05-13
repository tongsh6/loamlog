# 当前焦点规格 | Current Focus Spec

> 当前优先级权威来源：[`docs/project-ledger.md` §0 当前门禁](../../docs/project-ledger.md#0-当前门禁-product-gate--2026-05-13)
>
> 简明结论：代码闭环已落成，knowledge-card 小批量中文复验已通过。下一阶段不是继续单点优化 knowledge-card，也不是启动 MCP / Dashboard / Action Executor，而是验证代表性 AI 协作资产能否稳定进入 review 和复用流程。

## 1. 已落成事实

- Capture、archive、redaction 和本地 file sink 已存在。
- 多模型 LLM routing 已存在。
- OpenCode、Claude Code、Gemini CLI、Codex 等 provider 方向已验证过多来源抽象。
- Refinery Pipeline 已进入 DAG 默认路径。
- `AssetCandidate` 质量门禁、review、audit、sink delivery 已进入主流程。
- GitHub sink、Notion sink 已实现，但外部自动投递仍不作为当前主线。
- `loam show` / `loam list --format md` 已提供人类可读 review 视图。
- Phase 2 中文复验：9 个真实 session 产出 10 张 knowledge-card，人工评分 41/50，平均 4.1/5。

## 2. 当前产品问题

当前问题是：

```text
local AI tools
  -> capture
  -> archive
  -> representative asset distillers
  -> human review
  -> local asset store
  -> reuse in later work
  -> feedback back into the system
```

能否在真实本机多 AI 工具会话中稳定闭环。

这不是“生成某几种固定文档”的问题，而是验证 Loamlog 能不能把 AI 协作过程中容易遗忘的内容沉淀下来。

## 3. 当前主线

当前主线是 #57 Cross-Asset Dogfooding，但验证对象已从旧的 `issue-draft / prd-draft / pitfall-card` 调整为代表性 AI 协作资产：

- `idea-seed`：捕获还没来得及展开的想法、机会、假设、选题。
- `practice-pitfall`：沉淀经验、踩坑、修法、可复用工作方式。
- `decision-rationale`：保存方向判断、取舍、暂缓原因和 revisit trigger。
- `follow-up-work-item`：提取待办、验证任务、文档更新、review action 或候选 issue。

边界规格见：

- `AIEF/openspec/representative-asset-distillers.md`

## 4. 当前活跃议题

- `#57` — Cross-Asset Dogfooding：当前主线，验证代表性 AI 协作资产。
- `#11` — config precedence：下一阶段候选，应先定义 explicit config、env、discovered values、defaults 的优先级。
- `#9` — local session provider discovery：与“从本机所有 AI 工具抓会话”愿景强相关，应在 #11 边界清晰后推进。
- `#44` — instruction-summary distiller：有价值，但需重新定边界，避免与 instruction-rule / Auto-Skill 轨道重叠。

## 5. 近期非目标

当前不投入：

- MCP server 实现；
- Action Executor 自动执行；
- Dashboard / Web UI；
- Auto-Skill Generation；
- instruction-rule 全链路；
- 外部 GitHub / Notion 自动投递；
- 大规模向量搜索或 marketplace。

原因：当前最缺的是跨资产类型真实验证和资产生命周期闭环，不是更多平台能力。

## 6. 下一阶段判断点

- 四类代表性资产能否在真实样本上达到可 review、可复用的最低质量线？
- 每类资产是否都有 evidence backlinks、review 状态、本地输出和失败类型记录？
- 人工 review 后的资产能否进入本地复用池，并在后续任务中被引用或转化为工作项？
- 本机多个 AI 工具的会话能否被稳定纳入同一条 capture / archive / distill / review 链路？
- 插件底座是否允许继续接入任意新资产类型，而不修改核心流程分支？
