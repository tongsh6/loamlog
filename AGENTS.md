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
loam list --repo xxx --last 7d     # Browse archive

# Docs (AIEF bilingual)
node AIEF/scripts/check-bilingual-docs.js
node AIEF/scripts/check-bilingual-docs.js --strict
node AIEF/scripts/new-bilingual-doc.js --path "AIEF/context/tech/example.md" --titleZh "示例文档" --titleEn "Example Document"
```

## 架构概览 | Architecture Overview

```
Providers        ->  Archive           ->  Distill Engine   ->  Sinks
  opencode            JSON snapshot         LLM Router           file
  claude-code (*)     + Markdown            multi-model          github (*)
  cursor (*)          redact + trace        multi-distiller      notion (*)

(*) = future
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
│   │   └── opencode/      # OpenCode data source adapter
│   ├── distill/           # Distill engine + LLM router
│   ├── distillers/        # Built-in distillers
│   ├── sinks/             # Output adapters
│   └── cli/               # CLI entry point
├── plugins/
│   └── opencode/          # Thin OpenCode bridge plugin (event forwarding only)
└── config/
```

## 上下文入口 | Context Entry

- AIEF/context/INDEX.md

## 硬性约束 | Hard Constraints

- 插件错误不得导致宿主崩溃 | Plugin errors MUST NOT crash the host tool
- 默认开启脱敏 | Redaction ON by default: tokens/keys/sensitive paths auto-replaced
- 未配置 `LOAM_DUMP_DIR` 不写入 | No writes unless `LOAM_DUMP_DIR` is configured
- 无 evidence 的结果不得外发 | DistillResult without evidence MUST NOT enter external sinks
- 第一阶段仅本地文件输出 | Phase 1: local file output only; external sinks require explicit opt-in
