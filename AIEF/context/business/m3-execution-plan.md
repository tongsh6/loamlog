# M3 执行计划（M2 完成后） | M3 Execution Plan (Post-M2)

## 背景 | Background

M2（Distill Platform MVP）已完成并发布，`master` 与 `develop` 已同步。下一阶段进入 M3：多模型 LLM 路由，目标是在不改 distiller 代码的前提下切换模型与 provider。
M2 (Distill Platform MVP) is completed and released, and `master` / `develop` are synchronized. The next stage is M3: multi-model LLM routing, so distillers can switch models/providers without code changes.

## 目标 | Goals

- 抽象并落地多 provider LLM 适配层（OpenAI / DeepSeek / Anthropic / Ollama）。
- 保持 `DistillerPlugin` 与 `DistillEngine` 契约稳定，避免破坏 M2 已有能力。
- 让 CLI `--llm provider/model` 覆盖配置在运行时真实生效并可测试。

## 范围 | Scope

### In Scope

- `packages/distill` 新增 provider 适配实现与统一错误模型。
- `LLMRouter.route()` 从单 provider 升级为多 provider 选择逻辑。
- CLI 参数覆盖逻辑增强：`--llm`、超时、fallback 策略。
- 回归测试：provider 选择、失败回退、无 key 快速失败。

### Out of Scope

- 新 distiller 类型扩展（留在 M5）。
- 外部 sink 自动发布工作流（留在 M5）。
- 向量检索与语义召回（仍为 deferred）。

## 分阶段计划 | Phased Plan

### P0：契约与兼容性基线（0.5 day）

1. 冻结 M2 对外契约，确认 `@loamlog/core` 中 distill 相关类型不做破坏性变更。
2. 明确 provider 级错误分类：认证失败、超时、限流、响应格式错误。

### P1：Provider 适配层（1 day）

1. 新增 provider 适配实现（openai/deepseek/anthropic/ollama）。
2. 统一 `complete()` 输入输出语义（messages/model/response_format/tokens）。
3. 为每个 provider 增加最小 mock 测试。

### P2：Router 策略升级（0.5~1 day）

1. `route()` 支持按 task/budget/input_tokens 选择 provider+model。
2. 支持 provider 不可用时 fallback（可配置优先级）。
3. 记录路由决策日志，便于 trace 与调优。

### P3：CLI 与配置集成（0.5 day）

1. `loam distill --llm provider/model` 覆盖配置文件默认值。
2. 增加 `--llm-timeout-ms`（如无则使用配置默认）。
3. 明确缺 key 的 fail-fast 提示。

### P4：验证与发布（0.5 day）

1. 全量 `build + typecheck + test`。
2. 回归 OpenCode 端到端运行验证（见下方手工验证清单）。
3. 走 GitFlow：`feature/* -> develop -> master`。

## OpenCode 手工验证清单 | OpenCode Manual Verification Checklist

1. 启动 OpenCode 与 Loam daemon，确认能稳定收到 `session.idle` 事件。
2. 生成一段含明显 pitfall 的会话并触发归档。
3. 运行 `loam distill --distiller @loamlog/distiller-pitfall-card --llm <provider/model>`。
4. 检查 `distill/<repo>/pending/*.json` 是否生成，且 evidence 可回溯到 `session_id + message_id`。
5. 切换第二个 provider 重复步骤 3/4，验证路由与 fallback 行为。

## 验收标准 | Acceptance Criteria

1. 同一 distiller 在至少 2 个 provider 上无需改代码即可运行。
2. provider 异常（401/429/timeout）有明确错误并不导致引擎崩溃。
3. CLI 覆盖项（`--llm`）对运行结果生效且有测试覆盖。
4. OpenCode -> capture -> archive -> distill 全链路在本地可复现。

## 分支与发布策略 | Branching & Release Strategy

- 分支：`feature/m3-llm-router-multi-provider`
- PR 目标：`develop`
- 合并策略：squash merge（保持 develop 历史清晰）
- 发布：`develop -> master` 后打版本标签

## 参考 | References

- `AIEF/context/business/roadmap.md`
- `AIEF/context/tech/contracts.md`
- `AIEF/context/tech/architecture.md`
- `CONTRIBUTING.md`
