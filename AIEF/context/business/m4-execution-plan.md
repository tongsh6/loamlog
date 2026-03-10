# M4 执行计划（M3 完成后） | M4 Execution Plan (Post-M3)

## 背景 | Background

M3（多模型 LLM 路由）已完成并发布，`master` 与 `develop` 已同步。下一阶段进入 M4：多源 Provider 扩展，目标是在不改 capture 层核心逻辑的前提下接入第二个 AI 工具（Claude Code），验证 `ProviderAdapter` 接口的可扩展性。
M3 (Multi-model LLM routing) is completed and released, and `master` / `develop` are synchronized. The next stage is M4: multi-source provider expansion, so the capture layer can ingest sessions from a second AI tool (Claude Code) without changing core capture logic, proving the `ProviderAdapter` interface's extensibility.

## 目标 | Goals

- 实现基于文件系统监听的 Claude Code 会话捕获，不依赖 HTTP API。
- 实现 `SessionProvider` 接口，将 Claude Code JSONL transcripts 转换为标准 `PulledSessionPayload`。
- 支持多 provider daemon 并行运行：`loam daemon --providers opencode,claude-code`。
- 验证 provider 抽象层在真实场景下的可插拔性。

## 范围 | Scope

### In Scope

- `packages/providers/claude-code/` 新增 provider 实现，监听 `~/.claude/transcripts/` 目录。
- 实现 `SessionProvider.pullSession()` 接口，解析 JSONL 格式的 transcripts。
- 检测 `~/.claude/history.jsonl` 中的 `/exit` 命令作为即时完成信号。
- 支持环境变量配置：`LOAM_CLAUDE_IDLE_MS`（默认 30_000，最小 5_000）。
- 多 provider daemon 并行运行与负载均衡。

### Out of Scope

- 实现 `ProviderAdapter.watch()` 接口（留待 M5）。
- Claude Code 实时事件推送（需要 Claude Code 插件支持）。
- 跨 provider 会话去重（留待 M5）。
- 外部 sink 自动发布工作流（留在 M5）。

## 分阶段计划 | Phased Plan

### P0：契约与兼容性基线（0.5 day）

1. 冻结 M3 对外契约，确认 `@loamlog/core` 中 `SessionProvider` 接口不做破坏性变更。
2. 明确 Claude Code 数据源结构：`~/.claude/transcripts/ses_*.jsonl` 与 `~/.claude/history.jsonl` 的映射关系。
3. 定义 Claude Code provider 的 `id` 为 `"claude-code"`。

### P1：文件系统监听器（1 day）

1. 实现 `FileWatcher` 类，监听 `~/.claude/transcripts/` 目录的创建/修改事件。
2. 支持 debounce idle 逻辑：默认 `LOAM_CLAUDE_IDLE_MS=30_000`（最小 5_000）。
3. 检测 `/exit` 命令作为即时完成信号：扫描 `~/.claude/history.jsonl` 中的 `display` 字段。
4. 为文件系统事件添加单元测试与集成测试。

### P2：SessionProvider 实现（1 day）

1. 实现 `ClaudeCodeSessionProvider`，解析 JSONL transcripts 格式。
2. 转换 Claude Code 消息结构为标准 `SessionMessage` 格式。
3. 提取上下文信息：`project` 字段作为 `cwd`，推断 `repo` 名称。
4. 处理时间范围：使用 `timestamp` 字段，回退到文件修改时间。

### P3：Daemon 集成与多 provider 支持（0.5 day）

1. 扩展 daemon 支持多 provider 并行：`--providers opencode,claude-code`。
2. 实现 provider 工厂模式：根据 `id` 动态加载 provider。
3. 添加 provider 级错误隔离：一个 provider 失败不影响其他 provider。
4. 更新 CLI 帮助文档与配置示例。

### P4：验证与发布（0.5 day）

1. 全量 `build + typecheck + test`。
2. 端到端验证：Claude Code 会话捕获 → 归档 → 蒸馏（见下方手工验证清单）。
3. 走 GitFlow：`feature/m4-claude-code-provider -> develop -> master`。

## Claude Code 手工验证清单 | Claude Code Manual Verification Checklist

1. 启动 Claude Code 并创建一段含明显 pitfall 的会话，使用 `/exit` 命令结束。
2. 运行 `loam daemon --providers claude-code`，确认能检测到新 transcript 文件。
3. 检查 `$LOAM_DUMP_DIR/repos/<repo>/sessions/` 是否生成 Claude Code 会话快照。
4. 运行 `loam distill --distiller @loamlog/distiller-pitfall-card --llm deepseek/deepseek-chat`。
5. 检查 `distill/<repo>/pending/*.json` 是否生成，且 evidence 可回溯到 `session_id + message_id`。

## 验收标准 | Acceptance Criteria

1. `loam daemon --providers claude-code` 能稳定捕获 Claude Code 会话并生成快照。
2. Claude Code 快照包含正确的 `provider: "claude-code"` 元数据。
3. 多 provider 模式：`loam daemon --providers opencode,claude-code` 能并行运行。
4. 端到端流程：Claude Code → capture → archive → distill 全链路可复现。

## 分支与发布策略 | Branching & Release Strategy

- 分支：`feature/m4-claude-code-provider`
- PR 目标：`develop`
- 合并策略：squash merge（保持 develop 历史清晰）
- 发布：`develop -> master` 后打版本标签 `v0.4.0`

## 参考 | References

- `AIEF/context/business/roadmap.md`
- `AIEF/context/tech/contracts.md`
- `AIEF/context/tech/architecture.md`
- `packages/core/src/index.ts` - `SessionProvider` 接口定义
- `packages/providers/opencode/src/index.ts` - 现有 provider 实现参考
- `~/.claude/transcripts/` - Claude Code transcripts 样本
- `~/.claude/history.jsonl` - Claude Code 历史记录