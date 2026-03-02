# 路线图与里程碑 | Roadmap & Milestones

## 阶段总览 | Phase Overview

| 阶段 / Phase | 目标 / Goal | 关键包 / Key Packages | 预计耗时 / Effort | 状态 / Status |
|---|---|---|---|
| M0 | 对齐 OpenCode 事件 payload | - | 0.5 day | ✅ Completed |
| M1 | 沉淀层 MVP / Capture MVP | core, archive, providers/opencode, cli | 1-2 days | ✅ Completed |
| M2 | 萃取层 MVP / Distill MVP | distill, distillers/pitfall-card, sinks/file | 2-4 days | ⏳ Planned |
| M3 | 多模型路由 / Multi-model support | distill/llm-providers/* | 1-2 days | ⏳ Planned |
| M4 | 多数据源接入 / Multi-source support | providers/claude-code | 1-2 days | ⏳ Planned |
| M5 | 生态化与工作流 / Ecosystem | sinks/github, approve flow, more distillers | Ongoing | ⏳ Planned |

## 当前进度 | Current Progress

截至 2026-03-02，采集链路已完成可运行闭环（插件转发 -> daemon 接收 -> provider 拉取 -> 脱敏 -> 原子 JSON 落盘）。
As of 2026-03-02, the capture pipeline is fully runnable end-to-end (plugin forward -> daemon receive -> provider pull -> redaction -> atomic JSON snapshot write).

已完成项：
Completed items:

- OpenCode 薄插件转发 `session.idle/session.status:idle` 到 `POST /capture`
- daemon 按 `LOAM_DUMP_DIR` 规则控制写入（未配置不写）
- `@loamlog/provider-opencode` 使用本地 HTTP API 拉取 session/messages/path/vcs
- 默认脱敏规则接入（`sk-*`, `ghp_*`, `AKIA*`, `Bearer *`, `auth/credentials/.env`）
- 测试覆盖包含 provider mapping、redaction、daemon 落盘与端到端链路

---

## M0：验证阶段 | Validation

**目标 / Goal**: 确认 OpenCode 事件路径与 SDK 拉取能力。  
**交付 / Deliverables**:
- 最小日志插件（输出关键事件）
- `client.session.messages()` 可用性验证
- 一份真实脱敏 payload 样本

---

## M1：沉淀层 MVP | Capture Layer MVP

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

## M3-M5：扩展阶段 | Expansion

- **M3**: OpenAI/Anthropic/Deepseek/Ollama 统一路由
- **M4**: 新 Provider（Claude Code 等）
- **M5**: 多 distiller 合并去重、人工审批、GitHub/Notion sink

---

## 非目标（第一阶段） | Non-Goals (Phase 1)

- 不做自动外发发布（先本地草稿 + 人审）
- 不做复杂向量检索
- 不做 Web UI（CLI 优先）
