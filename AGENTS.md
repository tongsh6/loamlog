# Loamlog - AI Collaboration Asset Platform

这是项目级 AI 协作入口。
This is the project-level AI collaboration entry point.

## 语言规则 | Language Rules

- 交流默认使用中文 | Communication defaults to Chinese
- 代码、命令、标识符、git commit 保持英文 | Code, commands, identifiers, and git commits stay in English

## 项目信息 | Project Info

- **一句话定义 / One-liner**: 独立的 AI 协作资产平台，自动沉淀多工具（OpenCode/Claude Code/Cursor/...）交互，并通过可插拔萃取引擎和多模型路由将原始会话转为可复用资产（issue 候选、PRD 草稿、知识卡、社媒选题等）。
  Independent AI collaboration asset platform that captures interactions from multiple tools (OpenCode/Claude Code/Cursor/...) and transforms raw sessions into reusable assets (issue candidates, PRD drafts, knowledge cards, social media topics) via a pluggable distill engine with multi-model routing.
- **核心价值 / Core Value**: 让每次 AI 交互从“一次性消费”升级为“可复利资产”。
  Turn every AI interaction from "one-time consumption" into "compounding assets".
- **项目性质 / Nature**: 独立程序（非 OpenCode 插件），OpenCode 只是一个 Provider。
  Standalone program (NOT an OpenCode plugin). OpenCode is one Provider among many.
- **技术栈 / Tech Stack**: TypeScript / Bun / monorepo (workspaces)
- **包管理器 / Package Manager**: pnpm（开发）/ bun（运行时） | pnpm (dev) / bun (runtime)

## 常用命令 | Common Commands

```bash
# Development
pnpm install                      # Install dependencies
pnpm run build                    # Build all packages
pnpm run test                     # Run tests

# Runtime
loam daemon --providers opencode   # Daemon mode (real-time capture)
loam capture --provider opencode   # Manual capture
loam distill --distiller pitfall-card --llm deepseek/deepseek-chat # Distill
loam list --repo xxx --since 7d     # Browse archive

# Docs (AIEF bilingual)
node AIEF/scripts/check-bilingual-docs.js
node AIEF/scripts/check-bilingual-docs.js --strict
node AIEF/scripts/new-bilingual-doc.js --path "AIEF/context/tech/example.md" --titleZh "示例文档" --titleEn "Example Document"

# AI completion quality gate
pnpm run ai:complete              # Static scan + Top N report after AI code changes
pnpm run ai:complete:security     # Static scan with optional secret/SAST tools
```

## 架构概览 | Architecture Overview

```
Providers        ->  Archive           ->  Distill Engine   ->  Sinks
  opencode            JSON snapshot         LLM Router           file
  claude-code         + Markdown            multi-model          github (*)
  cursor (*)          redact + trace        multi-distiller      notion (*)

(*) = planned
```

核心原则 | Core principles:
- **数据源可插拔 / Providers pluggable**: ProviderAdapter interface, any AI tool can be a data source
- **模型可插拔 / Models pluggable**: LLMRouter dispatches to OpenAI/Anthropic/Deepseek/Ollama/...
- **萃取器可插拔 / Distillers pluggable**: DistillerPlugin interface, anyone can write extractors
- **输出可插拔 / Sinks pluggable**: SinkPlugin interface, local file / GitHub / Notion / ...
- **证据必填 / Evidence required**: DistillResult must link to session_id + message_id + source text

## 项目结构 | Project Structure

```
loamlog/
├── packages/
│   ├── core/              # Core types & interface contracts
│   ├── archive/           # Unified storage (read/write/redact/fingerprint)
│   ├── providers/
│   │   ├── opencode/      # OpenCode data source adapter
│   │   └── claude-code/   # Claude Code transcript adapter
│   ├── distill/           # Distill engine + LLM router
│   ├── distillers/        # Built-in distillers
│   ├── sinks/             # Output adapters
│   └── cli/               # CLI entry point
├── plugins/
│   └── opencode/          # [deprecated] Bridge plugin — will be extracted to standalone repo
└── config/
```

## 上下文入口 | Context Entry

- Unified docs base directory: `AIEF/`
- Primary context index: `AIEF/context/INDEX.md`
- Long-term engineering rules: `AIEF/context/tech/engineering-principles.md`

## AI 开发准则 | AI Development Rules

任何 AI 接手本项目开发时，必须先按以下规则推进。
Any AI contributor working on this project MUST follow these rules first.

- **设计文档先行 / Design docs before code**: 任何涉及架构决策、模块边界变更、新能力引入或跨模块流程的任务，必须在编码前产出设计文档。纯 bug 修复、单行改动、不加新行为的重构可跳过，但须在 commit 中说明。设计文档位置规则见工程原则"设计文档先行"节。
  Any task involving architecture decisions, module boundary changes, new capability, or cross-module flow MUST produce a design document before coding. Pure bug fixes, single-line changes, and behavior-neutral refactors are exempt with commit message justification. See "Design Docs Before Code" in engineering principles for file placement rules.
- **先读工程原则 / Read principles first**: 开始设计或编码前，阅读 `AIEF/context/tech/engineering-principles.md`，并把它作为高于单个阶段计划的长期准则。
  Before design or coding, read `AIEF/context/tech/engineering-principles.md` and treat it as the long-term rulebook above individual phase plans.
- **保持 DRY / Keep DRY**: 不复制 provider、distiller、sink、CLI、日志、重试、脱敏、指标等控制流；重复逻辑应收敛到注册表、中间件、执行上下文或共享模块。
  Do not copy provider, distiller, sink, CLI, logging, retry, redaction, or metrics control flow; consolidate repeated logic into registries, middleware, execution context, or shared modules.
- **遵守开闭原则 / Follow open-closed design**: 新增能力优先通过插件、注册表、配置、策略对象或 DAG 节点扩展，不优先修改中心流程分支。
  Add capability through plugins, registries, configuration, policy objects, or DAG nodes before editing central branching flow.
- **保持正交 / Preserve orthogonality**: capture、archive、trigger、distill、rules、evaluation、sink、CLI 的职责应独立建模、独立测试；跨层修改必须说明理由。
  Keep capture, archive, trigger, distill, rules, evaluation, sink, and CLI independently modeled and tested; justify cross-layer changes.
- **切面化处理 / Use aspects for cross-cutting concerns**: 日志、trace、redaction、timeout、retry、rate limit、LLM budget、metrics、quality gate 不应长期嵌入业务流程代码。
  Logging, tracing, redaction, timeout, retry, rate limit, LLM budget, metrics, and quality gates should not remain embedded in business flow code.
- **建设深模块 / Prefer deep modules**: 对外暴露窄接口，对内吸收复杂性；不要把存储索引、调度、重试、状态并发等复杂细节泄漏给调用方。
  Expose narrow interfaces and absorb complexity internally; do not leak storage indexes, scheduling, retry, or concurrent state details to callers.
- **复杂任务先拆 DAG / Split complex work into DAGs first**: 跨多个模块、涉及时序、并发、失败传播或性能风险的任务，先写出节点依赖，再实现。
  For work crossing modules or involving sequencing, concurrency, failure propagation, or performance risk, write the node dependency DAG before implementation.
- **优先垂直切片 / Prefer vertical slices**: 任务粒度优先按可运行端到端小闭环推进，而不是大规模横向重构。
  Deliver runnable end-to-end vertical slices before broad horizontal rewrites.
- **显式关注性能 / Make performance explicit**: 涉及 archive 查询、LLM 调用、state 写入、批处理时，必须考虑全量扫描、重复调用、幂等、并发写、范围过滤。
  For archive queries, LLM calls, state writes, and batching, consider full scans, repeated calls, idempotency, concurrent writes, and scoped filtering.
- **业务逻辑结构化 / Model business logic structurally**: 复杂业务不要只处理字符串；优先按 `SessionArtifact -> EvidenceSpan -> Signal -> AssetCandidate -> Decision -> Delivery -> Feedback` 演进。
  Do not treat complex business logic as string manipulation only; evolve toward `SessionArtifact -> EvidenceSpan -> Signal -> AssetCandidate -> Decision -> Delivery -> Feedback`.
- **文档随代码更新 / Keep docs with code**: 改变架构事实、模块边界、执行链路或阶段状态时，同步更新 AIEF 文档入口或对应上下文。
  When architecture facts, module boundaries, execution flow, or phase status change, update AIEF docs or context entries.

## AI 完成质量门禁 | AI Completion Quality Gate

任何 AI 工具完成代码实现后，必须主动执行静态扫描门禁。
Any AI tool that completes code implementation MUST run the static scan gate proactively.

- **运行统一入口 / Run the unified entrypoint**: 默认执行 `pnpm run ai:complete`；涉及 secret、安全规则或外部输入面时执行 `pnpm run ai:complete:security`。
  Run `pnpm run ai:complete` by default; run `pnpm run ai:complete:security` when secrets, security rules, or external input surfaces are involved.
- **保留扫描证据 / Preserve scan evidence**: 扫描报告必须保存在 `AIEF/reports/static-scan/<run-id>/`，包含原始日志、归一化结果、Top N 计划、Top N 处理结果和摘要。
  Scan reports must be saved under `AIEF/reports/static-scan/<run-id>/` with raw logs, normalized findings, Top N plan, Top N handling results, and summary.
- **处理 Top N / Handle Top N**: 默认 `TOP_N=5`。AI 必须按报告中的排序处理 Top N：可修复则修复；不能修复则在 `topN.results.md` 中标记 `deferred`、`false_positive`、`not_actionable` 或 `failed` 并说明原因。
  Default `TOP_N=5`. The AI must handle the ranked Top N findings: fix actionable findings, or mark `deferred`, `false_positive`, `not_actionable`, or `failed` in `topN.results.md` with reasons.
- **复扫验证 / Rerun verification**: Top N 处理后必须复跑同一门禁，并在最终回复中引用最新报告路径、剩余问题和处理状态。
  After handling Top N findings, rerun the same gate and reference the latest report path, remaining issues, and handling status in the final response.
- **未完成定义 / Definition of incomplete**: 没有扫描报告、Top N 处理记录和复扫说明的代码实现，不视为完成。
  Code implementation without a scan report, Top N handling record, and rerun note is not considered complete.
- **长期规划入口 / Long-term planning entry**: 完整 DAG、报告契约和分阶段规划见 `AIEF/plans/2026-05-01-ai-completion-static-scan-gate.md`。
  See `AIEF/plans/2026-05-01-ai-completion-static-scan-gate.md` for the complete DAG, report contract, and phased plan.

## 硬性约束 | Hard Constraints

- 插件错误不得导致宿主崩溃 | Plugin errors MUST NOT crash the host tool
- 默认开启脱敏 | Redaction ON by default: tokens/keys/sensitive paths auto-replaced
- 未配置 `LOAM_DUMP_DIR` 不写入 | No writes unless `LOAM_DUMP_DIR` is configured
- 无 evidence 的结果不得外发 | DistillResult without evidence MUST NOT enter external sinks
- 第一阶段仅本地文件输出 | Phase 1: local file output only; external sinks require explicit opt-in
