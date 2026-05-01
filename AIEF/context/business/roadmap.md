# 路线图与里程碑 | Roadmap & Milestones

## 阶段总览 | Phase Overview

| 阶段 | 目标 | 关键包 | 预计耗时 | 状态 |
|------|------|--------|----------|------|
| M0 | 对齐 OpenCode 事件 payload | — | 0.5 day | ✅ 已完成 |
| M1 | 采集层 MVP — 自动归档会话 | core, archive, providers/opencode, cli | 1–2 days | ✅ 已完成 |
| M2 | 萃取层 MVP — SDK + demo distiller + file sink | distill, distillers/pitfall-card, sinks/file | 2–4 days | ✅ 已完成 |
| M3 | 多模型 LLM 路由 | distill/llm-providers/* | 1–2 days | ✅ 已完成 |
| **Milestone A** | **可信底盘** — 脱敏、触发控制、质量评估 | sanitizer, trigger, evaluation-harness | 2–3 weeks | ✅ **已完成** |
| M4 | 多数据源接入 | providers/opencode, claude-code, gemini-cli, codex | 1–2 days | ✅ 已完成 |
| M5 | 生态化与工作流 | sinks/github, approve-flow, more distillers | Ongoing | ⏳ 规划中 |

---

## 当前进度 | Current Progress

截至 2026-05，Loamlog v0.5.0 已完成 **M4：多数据源接入**，现支持 4 个 AI 工具的主动采集。
As of 2026-05, Loamlog v0.5.0 has completed **M4: Multi-source Providers** with active watchers for 4 AI tools.

Milestone A 通过以下 Issues 和 PRs 完成：
- Issue #26 (Sanitization Gateway) → PR #39 ✅
- Issue #22 (Triggered Intelligence Pipeline) → PR #41 ✅
- Issue #23 (Evaluation Harness MVP) → PR #37 ✅

M4 通过以下工作完成：
- Issue #48 (Codex provider + OpenCode SQLite watcher) ✅
- Issue #49 (Gemini CLI provider) ✅
- Issue #50 (loam list 命令) ✅

已完成项 / Completed items:

- OpenCode 薄插件转发 `session.idle/session.status:idle` 到 `POST /capture`
- daemon 按 `LOAM_DUMP_DIR` 规则控制写入（未配置不写）
- `@loamlog/provider-opencode` SQLite 主动发现 + HTTP API 拉取 session/messages/path/vcs
- `@loamlog/provider-claude-code` JSONL 文件系统 watcher
- `@loamlog/provider-gemini-cli` session JSON 文件系统 watcher
- `@loamlog/provider-codex` JSONL session 文件系统 watcher
- 默认脱敏规则接入（`sk-*`, `ghp_*`, `AKIA*`, `Bearer *`, `auth/credentials/.env`）
- 测试覆盖 79 个测试（含 4 个 provider 的单元测试）、redaction、daemon 落盘与端到端链路
- `@loamlog/distill` 落地：plugin registry、state、query、metadata、LLM router、engine
- `@loamlog/distiller-sdk` 落地：`defineDistiller`、`createEvidence`
- `@loamlog/distiller-pitfall-card` 与 `@loamlog/distiller-issue-draft` 落地
- `@loamlog/sink-file` 落地，支持本地候选输出 + Markdown 渲染
- CLI 新增 `loam distill` 命令，支持 `--distiller/--llm/--since/--until/--test-session`
- CLI 新增 `loam list` 命令，支持 `--repo/--since/--distill/--pending/--limit/--json`
- M3 多 provider LLM 路由已落地：OpenAI / Anthropic / DeepSeek / Ollama
- CLI 已支持 `--llm-timeout-ms`，Router 支持 fallback 与类型化错误
- Provider Registry 已用 Map 注册表替代 if/else 链
- Archive 元数据索引 (`index.json`) 已落地，`loam list` 优先读索引
- GitHub 工作流治理已补齐：`develop` / `master` 受保护，已开启合并后自动删分支

### Milestone A 完成项 (2026-03-13)

- `@loamlog/sanitizer` — 日志脱敏硬前置层，支持 API Key/Token/邮箱/手机号识别与语义占位替换
- `@loamlog/trigger` — 智能触发管道，支持阈值触发、异步批处理、限流降级
- `@loamlog/evaluation-harness` — 质量评估框架，支持信号提取与 Issue 草稿质量评测
- Issue #26, #22, #23 已完成并关闭；PR #39, #41, #37 已合并到 `develop`

### 架构 DAG 蓝图推进 (2026-05-01)

架构蓝图（`AIEF/plans/2026-04-30-architecture-dag-blueprint.md`）的 Phase 0-5 代码已全部提交到 `develop`：

- **Phase 0 (基线对齐)** ✅ — 蓝图索引、测试隔离 (`54f8d5a`)
- **Phase 1 (注册表与切面)** ✅ — Provider Map 注册表 (`8736c01`)、ExecutionContext (`ce1aa36`)、withTimeout/withRetry 切面 (`9bddb20`)
- **Phase 2 (状态与归档性能)** ⏳ — 原子 state update (`1658c21`)、归档索引文件系统校验 (`4db0255`)，事务安全与性能夹具仍在推进
- **Phase 3 (最小 DAG 运行时)** ✅ — `@loamlog/pipeline` typed DAG executor (`360c99f`)
- **Phase 4 (资产图建模)** ✅ — EvidenceSpan/Signal/AssetCandidate/Decision/QualityReport + mapDistillResultToCandidate + validateAssetCandidate (`2bbfb5e`)
- **Phase 5 (外部工作流准备)** ✅ — approvalGate 四层检查 + AuditRecord + auditRecordDelivered/Failed (`2df3990`)

> **注意**: Phase 3-5 的模块代码已就绪（含单元测试），但尚未集成到实际 daemon/distill/sink 产品链路中。集成工作见 `tasks/2026-05-01-pipeline-integration/plan.md`。

### 当前产品聚焦说明 | Current Product Focus Note

虽然 M4 的 provider 扩展主路径已经进入仓库，但当前最需要验证的不是继续扩基础设施抽象，而是打穿第一条明确的用户价值闭环：

```text
AI conversation -> structured evidence -> local issue draft
```

因此，当前这条产品闭环已经完成首轮实现并合并到 `develop`：

- `#7` umbrella：已关闭
- `#12`：已完成并关闭
- `#13`：已完成并关闭
- `#14`：已完成并关闭

当前更重要的是评估这条闭环是否已经证明真实价值，以及是否进入下一阶段自动化。

M4 执行计划仍保留为参考文档，但不再代表当前唯一焦点。

同时，Milestone B 的协议化方向已经有了第一份正式边界规格：

- Issue #24（MCP Exposure Layer）现已形成仓库内设计边界文档：`AIEF/openspec/mcp-exposure-layer.md`
- 当前含义是“先明确 resource/tool/prompt 映射与安全边界”，而不是立即投入完整 MCP Server 实现

At the same time, Milestone B's protocol direction now has its first formal boundary spec:

- Issue #24 (MCP Exposure Layer) now has an in-repo boundary document: `AIEF/openspec/mcp-exposure-layer.md`
- The current meaning is design-first protocol mapping and safety boundaries, not immediate investment in a full MCP server implementation

---

## M0：验证阶段 | Validation

**目标 / Goal**: 确认 OpenCode 事件路径与 SDK 拉取能力。

**交付 / Deliverables**:
- 最小日志插件（输出关键事件）
- `client.session.messages()` 可用性验证
- 一份真实脱敏 payload 样本

---

## M1：采集层 MVP | Capture Layer MVP

**目标 / Goal**: 统一目录、idle 自动落盘、脱敏、追溯信息。

**交付 / Deliverables**:
- `packages/core`: 核心类型与契约
- `packages/archive`: 存储、脱敏、指纹
- `packages/providers/opencode`: OpenCode Provider
- `plugins/opencode`: 薄桥接插件（仅事件转发）
- `packages/cli`: `loam capture`

**验收 / Acceptance**:
1. 配置 `LOAM_DUMP_DIR` 后会话可自动归档
2. 输出按 repo 分桶并附带 session/时间/repo 上下文
3. 先稳定生成 JSON（Markdown transcript 在下一阶段补齐）
4. 脱敏生效且不影响主流程

---

## M2：萃取层 MVP | Distill Platform MVP

**目标 / Goal**: Distill SDK + 插件加载 + demo distiller + file sink。

**交付 / Deliverables**:
- `packages/distill`: engine + llm-router + plugin loader
- `packages/distillers/pitfall-card`
- `packages/sinks/file`
- CLI: `loam distill --distiller pitfall-card --llm deepseek/deepseek-chat`

**验收 / Acceptance**:
1. Distiller 按契约可运行
2. 结果包含 evidence 引用
3. 支持本地候选输出

---

## M3：多模型路由 | Multi-model LLM Routing

**目标 / Goal**: 统一 LLM Router，让 distiller 与具体模型解耦。

**交付 / Deliverables**:
- `distill/llm-providers/openai`
- `distill/llm-providers/anthropic`
- `distill/llm-providers/deepseek`
- `distill/llm-providers/ollama`（本地）
- CLI: `loam distill --llm openai/gpt-4o`

**验收 / Acceptance**:
1. 同一 distiller 可不改代码切换模型
2. provider 不可用时有明确错误提示

详细执行计划 / Detailed execution plan: `AIEF/context/business/m3-execution-plan.md`

---

## Milestone A：可信底盘 | Trust Infrastructure

**目标 / Goal**: 让 Loamlog 能在真实日志上安全运行，建立可验证的质量基准。

**交付 / Deliverables**:
- `packages/sanitizer` — 日志脱敏硬前置层
  - 敏感信息识别与语义占位替换
  - 审计摘要生成（数量、类型分布、风险等级）
  - 支持 API Key/Token/邮箱/手机号等多种模式
  
- `packages/trigger` — 智能触发管道
  - 阈值触发机制（频率/严重度/语义/人工）
  - 异步批处理与性能隔离
  - 限流、降级、熔断基础机制
  
- `packages/evaluation-harness` — 质量评估框架
  - 信号提取准确性评测
  - Issue 草稿质量评估
  - 支持不同规则/提示词/模型版本对比

**验收 / Acceptance**:
1. 原始日志在进入 AI 前已脱敏
2. AI 分析异步、可限流、可降级
3. 能用样本集评估提炼质量

**完成状态 / Status**: ✅ 已完成 (2026-03-13)
- Issue #26 → PR #39 (sanitizer)
- Issue #22 → PR #41 (trigger)
- Issue #23 → PR #37 (evaluation-harness)

---

## M4：多数据源接入 | Multi-source Providers

**目标 / Goal**: 接入多个 AI 工具，验证 ProviderAdapter 接口可扩展性。

**交付 / Deliverables**:
- `packages/providers/claude-code`（Claude Code 文件系统监听 provider）
- `packages/providers/gemini-cli`（Gemini CLI session watcher）
- `packages/providers/codex`（Codex JSONL session watcher）
- `packages/providers/opencode` SQLite 主动发现（opencode.db 监听）
- `loam list` 命令（会话和蒸馏结果浏览）
- daemon `--providers` flag 实际解析（支持 4 个 provider）

**验收 / Acceptance**:
1. pnpm run test 全部通过（79 个测试，含 4 个 provider 的单元测试）
2. `loam daemon --providers opencode,claude-code,gemini-cli,codex` 启动后日志中同时出现 4 个 provider 的确认信息
3. 所有 provider 可并行采集，互不干扰，归档路径结构完全一致
4. `loam list` 可按 repo、时间范围浏览会话和蒸馏结果

**完成状态 / Status**: ✅ 已完成 (2026-04-30, v0.5.0)

参考执行计划 / Reference execution plan: `AIEF/context/business/m4-execution-plan.md`

---

## M5：生态化与工作流 | Ecosystem & Workflow

**目标 / Goal**: 补齐外发链路、审批流和更多萃取器。

**当前状态 / Status**: ✅ 基本完成 — 基础设施（Pipeline DAG、Asset Graph、Approval Gate）已全部集成到产品链路；4 个 provider、5 个 distiller、3 个 sink、审批流、redaction 配置、CI 工作流、静态扫描门禁均已落地。`loam list --scan` 支持扫描报告查询。

**交付 / Deliverables**:
- `packages/sinks/github`（创建 issue/PR）✅ 已实现
- `packages/sinks/notion` ✅ 已实现
- 人工审批流（`loam review`）✅ 已实现
- 更多内置 distiller（issue-candidate、prd-draft、knowledge-card）🟡 knowledge-card ✅、prd-draft ✅，issue-candidate 待实现
- distiller 结果合并去重
- Pipeline DAG 执行器集成到 distill 引擎 ✅ 已具备代码基础
- 资产图质量门禁（validateAssetCandidate）✅ 已具备代码基础
- 审批门禁与审计追踪（approvalGate + AuditRecord）✅ 已具备代码基础

### M5 子阶段拆解 | M5 Sub-phase Breakdown

| 子阶段 | 目标 | 关键交付 | 解锁条件 |
|--------|------|----------|----------|
| M5.0 | `loam list` 命令 + 细粒度 redaction 配置 | ~~CLI `list`~~（✅ 已完成）、~~redaction config file~~（✅ 已完成） | M4 完成 |
| M5.1 | GitHub sink | `@loamlog/sink-github`（创建 Issue/PR）✅ 已完成 | M4 + evidence 质量评分机制就绪 |
| M5.2 | 人工审批流 | `loam review` 命令、approved/rejected 目录 ✅ 已完成 | M5.1 完成 |
| M5.3 | 更多内置萃取器 | knowledge-card ✅、prd-draft ✅、issue-candidate distiller | M5.1 完成 |
| M5.4 | Notion sink | `@loamlog/sink-notion` ✅ 已完成 | M5.2 完成 |

---

## 遗留项追踪 | Deferred Item Tracking

以下各项在 M1/M2 阶段标注为"下阶段实现"，现正式分配至里程碑：
The following items were marked "planned in next phase" in M1/M2 and are now formally assigned:

| 项目 / Item | 来源 / Source | 分配至 / Assigned To |
|-------------|---------------|----------------------|
| Markdown transcript 输出（JSON 已有，MD 待实现）| architecture.md M2 Status | M4（P3+，视 P0-P2 完成情况）|
| OpenCode HTTP 不可用时 SDK fallback | architecture.md M2 Status | M4（P3+，Out of Scope 若资源不足）|
| 细粒度 redaction 规则配置文件 | architecture.md M2 Status | M5.0 |
| `loam list` 命令 | AGENTS.md、README | ✅ 已完成 (v0.5.0) |
| `loam capture` 手动采集命令 | AGENTS.md（已文档化，未实现）| M5.1 |

## 非目标 | Non-Goals

非目标分为两类：**永不做** 和 **阶段性不做（有明确解锁条件）**。

---

### 永不做 | Absolute Non-Goals

这些超出项目核心定位，无论规模增长都不会纳入：

| 项目 | 原因 |
|------|------|
| 替代 AI 编程工具本身 | Loamlog 是资产层，不是编辑器或 AI 对话层 |
| 训练数据集生成 / 模型微调 | 数据归属和合规问题超出范围 |
| 实时协作 / 多人共享工作区 | 核心场景是个人/小团队离线沉淀，实时协作另立产品 |

---

### 阶段性不做 | Deferred Until Conditions Are Met

这些在当前阶段刻意推迟，达到对应条件后再启动：

| 项目 | 现阶段不做的原因 | 解锁条件 |
|------|----------------|----------|
| **自动外发发布**（直接推送到 GitHub Issue / Notion） | 无人审核的外发容易产生噪声和幻觉，影响协作质量 | M2 完成后，本地候选输出稳定运行 ≥ 2 周，且有明确的 evidence 质量评分机制 |
| **向量检索 / 语义召回** | M2 前无足够归档数据支撑检索价值，过早引入增加基础复杂度 | 归档会话数 ≥ 500 条，或用户明确提出跨会话搜索需求 |
| **Web UI** | CLI 优先可快速迭代验证核心价值；UI 开发成本高且分散精力 | M3 完成后，核心功能稳定，有 ≥ 3 个外部用户提出 UI 需求 |
| **distiller 市场 / 社区分发平台** | M2 前 distiller 接口尚未稳定，过早建设市场会锁死 API | distiller 接口保持向后兼容 ≥ 2 个 minor 版本，且有 ≥ 3 个社区贡献的 distiller |
| **移动端 / 桌面 GUI 客户端** | 优先完成 CLI + 核心引擎，GUI 层不影响核心价值验证 | M5 完成后，用户量和使用频率证明有 GUI 需求 |
