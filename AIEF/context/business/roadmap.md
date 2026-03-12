# 路线图与里程碑 | Roadmap & Milestones

## 阶段总览 | Phase Overview

| 阶段 | 目标 | 关键包 | 预计耗时 | 状态 |
|------|------|--------|----------|------|
| M0 | 对齐 OpenCode 事件 payload | — | 0.5 day | ✅ 已完成 |
| M1 | 采集层 MVP — 自动归档会话 | core, archive, providers/opencode, cli | 1–2 days | ✅ 已完成 |
| M2 | 萃取层 MVP — SDK + demo distiller + file sink | distill, distillers/pitfall-card, sinks/file | 2–4 days | ✅ 已完成 |
| M3 | 多模型 LLM 路由 | distill/llm-providers/* | 1–2 days | ✅ 已完成 |
| **Milestone A** | **可信底盘** — 脱敏、触发控制、质量评估 | sanitizer, trigger, evaluation-harness | 2–3 weeks | ✅ **已完成** |
| M4 | 多数据源接入 | providers/claude-code | 1–2 days | ◐ 主路径已落地，待补强 |
| M5 | 生态化与工作流 | sinks/github, approve-flow, more distillers | Ongoing | ⏳ 规划中 |

---

## 当前进度 | Current Progress

截至 2026-03-13，Loamlog 已完成 **Milestone A：可信底盘**，新增了 sanitizer、trigger、evaluation-harness 三个基础设施包。
As of 2026-03-13, Loamlog has completed **Milestone A: Trust Infrastructure**, adding three foundational packages: sanitizer, trigger, and evaluation-harness.

Milestone A 通过以下 Issues 和 PRs 完成：
- Issue #26 (Sanitization Gateway) → PR #39 ✅
- Issue #22 (Triggered Intelligence Pipeline) → PR #41 ✅
- Issue #23 (Evaluation Harness MVP) → PR #37 ✅

已完成项 / Completed items:

- OpenCode 薄插件转发 `session.idle/session.status:idle` 到 `POST /capture`
- daemon 按 `LOAM_DUMP_DIR` 规则控制写入（未配置不写）
- `@loamlog/provider-opencode` 使用本地 HTTP API 拉取 session/messages/path/vcs
- 默认脱敏规则接入（`sk-*`, `ghp_*`, `AKIA*`, `Bearer *`, `auth/credentials/.env`）
- 测试覆盖包含 provider mapping、redaction、daemon 落盘与端到端链路
- `@loamlog/distill` 落地：plugin registry、state、query、metadata、LLM router、engine
- `@loamlog/distiller-sdk` 落地：`defineDistiller`、`createEvidence`
- `@loamlog/distiller-pitfall-card` 与 `@loamlog/sink-file` 落地，支持本地候选输出
- CLI 新增 `loam distill` 命令，支持 `--distiller/--llm/--since/--until/--test-session`
- M3 多 provider LLM 路由已落地：OpenAI / Anthropic / DeepSeek / Ollama
- CLI 已支持 `--llm-timeout-ms`，Router 支持 fallback 与类型化错误
- `packages/providers/claude-code` 与 CLI provider wiring 已在仓库落地，验证多源 provider 主路径可行
- GitHub 工作流治理已补齐：`develop` / `master` 受保护，已开启合并后自动删分支

### Milestone A 完成项 (2026-03-13)

- `@loamlog/sanitizer` — 日志脱敏硬前置层，支持 API Key/Token/邮箱/手机号识别与语义占位替换
- `@loamlog/trigger` — 智能触发管道，支持阈值触发、异步批处理、限流降级
- `@loamlog/evaluation-harness` — 质量评估框架，支持信号提取与 Issue 草稿质量评测
- Issue #26, #22, #23 已完成并关闭；PR #39, #41, #37 已合并到 `develop`

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

**目标 / Goal**: 接入第二个 AI 工具，验证 ProviderAdapter 接口可扩展性。

**交付 / Deliverables**:
- `packages/providers/claude-code`（Claude Code 文件系统监听 provider）
- `loam capture` 命令（手动触发单次采集，不启动 daemon）
- daemon `--providers` flag 实际解析（修复当前只在 usage 文本中存在的问题）

**验收 / Acceptance**:
1. pnpm run test 全部通过（含 @loamlog/provider-claude-code 单元测试，使用 fixture JSONL 文件）
2. loam daemon --providers opencode,claude-code 启动后日志中同时出现两个 provider 的确认信息
3. 通过 loam capture 或 daemon 触发的 Claude Code 会话，归档 snapshot 的 .meta.provider 字段值为 "claude-code"
4. Claude Code provider 与 OpenCode provider 可并行采集，互不干扰，归档路径结构完全一致

详细执行计划 / Detailed execution plan: `AIEF/context/business/m4-execution-plan.md`

状态说明 / Status note:

- `packages/providers/claude-code` 与 CLI 主路径已进入仓库，说明 M4 不再是“未开始”状态
- 当前剩余工作更偏验证、补强与文档回收，而不是从零开始设计该阶段

---

## M5：生态化与工作流 | Ecosystem & Workflow

**目标 / Goal**: 补齐外发链路、审批流和更多萃取器。

**交付 / Deliverables**:
- `packages/sinks/github`（创建 issue/PR）
- `packages/sinks/notion`
- 人工审批流（`loam review`）
- 更多内置 distiller（issue-candidate、prd-draft、knowledge-card）
- distiller 结果合并去重

### M5 子阶段拆解 | M5 Sub-phase Breakdown

| 子阶段 | 目标 | 关键交付 | 解锁条件 |
|--------|------|----------|----------|
| M5.0 | `loam list` 命令 + 细粒度 redaction 配置 | CLI `list`、redaction config file | M4 完成 |
| M5.1 | GitHub sink | `@loamlog/sink-github`（创建 Issue/PR） | M4 + evidence 质量评分机制就绪 |
| M5.2 | 人工审批流 | `loam review` 命令、approved/rejected 目录 | M5.1 完成 |
| M5.3 | 更多内置萃取器 | issue-candidate、prd-draft、knowledge-card distillers | M5.1 完成 |
| M5.4 | Notion sink | `@loamlog/sink-notion` | M5.2 完成 |

---

## 遗留项追踪 | Deferred Item Tracking

以下各项在 M1/M2 阶段标注为"下阶段实现"，现正式分配至里程碑：
The following items were marked "planned in next phase" in M1/M2 and are now formally assigned:

| 项目 / Item | 来源 / Source | 分配至 / Assigned To |
|-------------|---------------|----------------------|
| Markdown transcript 输出（JSON 已有，MD 待实现）| architecture.md M2 Status | M4（P3+，视 P0-P2 完成情况）|
| OpenCode HTTP 不可用时 SDK fallback | architecture.md M2 Status | M4（P3+，Out of Scope 若资源不足）|
| 细粒度 redaction 规则配置文件 | architecture.md M2 Status | M5.0 |
| `loam list` 命令 | AGENTS.md、README（已文档化，未实现）| M5.0 |
| `loam capture` 手动采集命令 | AGENTS.md（已文档化，未实现）| M4 P3 |

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
