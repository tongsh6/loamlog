# 路线图与里程碑 | Roadmap & Milestones

## 阶段总览 | Phase Overview

| 阶段 | 目标 | 关键包 | 预计耗时 | 状态 |
|------|------|--------|----------|------|
| M0 | 对齐 OpenCode 事件 payload | — | 0.5 day | ✅ 已完成 |
| M1 | 采集层 MVP — 自动归档会话 | core, archive, providers/opencode, cli | 1–2 days | ✅ 已完成 |
| M2 | 萃取层 MVP — SDK + demo distiller + file sink | distill, distillers/pitfall-card, sinks/file | 2–4 days | ✅ 已完成 |
| M3 | 多模型 LLM 路由 | distill/llm-providers/* | 1–2 days | ⏳ 规划中 |
| M4 | 多数据源接入 | providers/claude-code | 1–2 days | ⏳ 规划中 |
| M5 | 生态化与工作流 | sinks/github, approve-flow, more distillers | Ongoing | ⏳ 规划中 |

---

## 当前进度 | Current Progress

截至 2026-03-02，采集链路已完成可运行闭环（插件转发 → daemon 接收 → provider 拉取 → 脱敏 → 原子 JSON 落盘）。  
As of 2026-03-02, the capture pipeline is fully runnable end-to-end (plugin forward → daemon receive → provider pull → redaction → atomic JSON snapshot write).

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

## M4：多数据源接入 | Multi-source Providers

**目标 / Goal**: 接入第二个 AI 工具，验证 ProviderAdapter 接口可扩展性。

**交付 / Deliverables**:
- `packages/providers/claude-code`（首选）
- 或 `packages/providers/cursor`

**验收 / Acceptance**:
1. 与 OpenCode provider 并行采集，无代码耦合
2. 归档结构与 OpenCode 一致

---

## M5：生态化与工作流 | Ecosystem & Workflow

**目标 / Goal**: 补齐外发链路、审批流和更多萃取器。

**交付 / Deliverables**:
- `packages/sinks/github`（创建 issue/PR）
- `packages/sinks/notion`
- 人工审批流（`loam review`）
- 更多内置 distiller（issue-candidate、prd-draft、knowledge-card）
- distiller 结果合并去重

---

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
