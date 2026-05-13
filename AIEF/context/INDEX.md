# 上下文索引 | Context Index

项目长期上下文导航入口。
Project long-term context navigation entry.

## 目录结构 | Directory

### business/ - 业务定位、决策、路线图 | Positioning, decisions, roadmap

| 文件 / File | 说明 / Description | 状态 / Status |
|---|---|---|
| [project-spec.md](business/project-spec.md) | 项目定义、核心价值、问题陈述、成功标准 / Project definition, core value, problem statement, success criteria | 已建立 / Established |
| [current-focus.md](business/current-focus.md) | 当前产品焦点、已完成 MVP 状态、下一阶段判断点 / Current product focus, completed MVP state, next-phase decision points | 活跃 / Active |
| [decisions.md](business/decisions.md) | 架构决策记录（ADR）与依据 / Architecture decision records with rationale | 活跃 / Active |
| [roadmap.md](business/roadmap.md) | 里程碑、交付物、验收标准 / Milestones, deliverables, acceptance criteria | 活跃 / Active |
| [m3-execution-plan.md](business/m3-execution-plan.md) | M3 多模型路由执行计划与 OpenCode 手工验证清单 / M3 multi-provider execution plan and OpenCode manual verification checklist | 参考 / Reference |
| [m4-execution-plan.md](business/m4-execution-plan.md) | M4 Claude Code provider 执行计划与手工验证清单 / M4 Claude Code provider execution plan and manual verification checklist | 参考 / Reference |

### tech/ - 架构、集成、契约 | Architecture, integrations, contracts

| 文件 / File | 说明 / Description | 状态 / Status |
|---|---|---|
| [architecture.md](tech/architecture.md) | 总体架构、包结构、数据流 / Overall architecture, package layout, data flow | 已建立 / Established |
| [engineering-principles.md](tech/engineering-principles.md) | 长期工程原则与 AI 开发准则：DRY、开闭、正交、切面、深模块、DAG、垂直切片、性能与业务建模 / Long-term engineering principles and AI development rules: DRY, open-closed design, orthogonality, aspects, deep modules, DAG, vertical slices, performance, and business modeling | 活跃 / Active |
| [opencode-integration.md](tech/opencode-integration.md) | OpenCode 插件系统调研（事件、SDK、模型）/ OpenCode plugin research (events, SDK, model) | 参考 / Reference |
| [contracts.md](tech/contracts.md) | 核心接口契约：Provider/Distiller/Sink/LLM / Core contracts: Provider/Distiller/Sink/LLM | 已建立 / Established |

### experience/ - 经验、模式、踩坑 | Learnings, patterns, pitfalls

| 文件 / File | 说明 / Description | 状态 / Status |
|---|---|---|
| [opencode-plugin-findings.md](experience/opencode-plugin-findings.md) | OpenCode 内部机制调研与 convodump 对比 / OpenCode internals research and convodump comparison | 参考 / Reference |
| [session-retrospective-2026-03-02.md](experience/session-retrospective-2026-03-02.md) | 2026-03-02 会话复盘：问题、经验、模板、checklist、最佳实践、自动化脚本 / Session retrospective: problems, learnings, templates, checklists, best practices, automation scripts | 参考 / Reference |
| [ai-tool-usage-learnings.md](experience/ai-tool-usage-learnings.md) | AI 协作工具使用经验：CLI vs API 选择、命令发现模式、过度工程化反思 / AI collaboration tool usage learnings: CLI vs API decision, command discovery patterns, over-engineering reflection | 活跃 / Active |
| [ssh-workflow-push-resolution.md](experience/ssh-workflow-push-resolution.md) | GitHub 工作流推送权限问题解决：HTTPS/OAuth vs SSH 方案对比、系统性反思 / GitHub workflow push permission resolution: HTTPS/OAuth vs SSH comparison, systematic reflection | 活跃 / Active |

### ../plans/ - 执行计划 | Execution Plans

| 文件 / File | 说明 / Description | 状态 / Status |
|---|---|---|
| [2026-03-10-issue-draft-mvp.md](../plans/2026-03-10-issue-draft-mvp.md) | issue-draft MVP 的分步执行计划 / Step-by-step implementation plan for issue-draft MVP | 参考 / Reference |
| [2026-03-11-distill-builtins-decoupling.md](../plans/2026-03-11-distill-builtins-decoupling.md) | `@loamlog/distill` 与内置插件解耦计划 / Decoupling plan for `@loamlog/distill` and built-in plugins | 参考 / Reference |
| [2026-04-30-architecture-dag-blueprint.md](../plans/2026-04-30-architecture-dag-blueprint.md) | 架构 DAG 蓝图：DRY、开闭、正交、切面、深模块、性能与资产图建模的长期推进事项 / Architecture DAG blueprint for DRY, open-closed design, orthogonality, aspects, deep modules, performance, and asset graph modeling | 活跃 / Active |
| [2026-05-01-ai-completion-static-scan-gate.md](../plans/2026-05-01-ai-completion-static-scan-gate.md) | AI 完成代码实现后的静态扫描门禁：扫描证据、Top N 修复计划、处理结果与复扫验证 / Static scan gate after AI implementation: scan evidence, Top N remediation plan, handling results, and rerun verification | 活跃 / Active |

### ../openspec/ - 最小规格层 | Minimal Spec Layer

| 文件 / File | 说明 / Description | 状态 / Status |
|---|---|---|
| [README.md](../openspec/README.md) | OpenSpec 层说明与使用边界 / OpenSpec purpose and usage boundary | 已建立 / Established |
| [current-focus.md](../openspec/current-focus.md) | 当前产品焦点、完成态与下一阶段判断点 / Current product focus, completed state, and next-phase decision points | 活跃 / Active |
| [distill-builtins-boundary.md](../openspec/distill-builtins-boundary.md) | 内置 distiller/sink 与 CLI bootstrap 的边界规格 / Boundary spec for built-in distiller/sink ownership and CLI bootstrap | 活跃 / Active |
| [issue-draft-module-boundary.md](../openspec/issue-draft-module-boundary.md) | `@loamlog/distiller-issue-draft` 的内部模块拆分边界 / Internal module boundary for `@loamlog/distiller-issue-draft` | 活跃 / Active |
| [mcp-exposure-layer.md](../openspec/mcp-exposure-layer.md) | Issue #24 的 MCP 暴露层边界规格：先定义 resource/tool/prompt 映射，再决定是否实现服务端 / Boundary spec for Issue #24 MCP exposure: define resource/tool/prompt mapping before any server implementation | 活跃 / Active |
| [representative-asset-distillers.md](../openspec/representative-asset-distillers.md) | 代表性 AI 协作资产萃取器与插件底座边界：`idea-seed`、`practice-pitfall`、`decision-rationale`、`follow-up-work-item`、`skill-candidate` / Boundary spec for representative AI collaboration asset distillers and plugin substrate | 活跃 / Active |
