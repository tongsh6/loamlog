# 架构决策记录 | Architecture Decision Records

## ADR-001: 独立程序而非 OpenCode 插件 | Standalone Program, Not OpenCode Plugin

**Date**: 2026-03-02  
**Status**: Confirmed

**Context / 背景**: 项目目标是多工具接入（OpenCode/Claude Code/Cursor/...）与多模型萃取，单一插件形态会限制扩展。

**Decision / 决策**: Loamlog 作为独立程序运行。OpenCode 仅作为 Provider；必要时通过薄桥接插件转发事件。

**Consequences / 影响**:
- (+) Provider 可扩展，长期架构稳定
- (+) Distill 引擎独立，不受宿主工具约束
- (-) 需要桥接通信机制（file signal/local HTTP）

---

## ADR-002: 统一归档目录 + repo 分桶 | Unified Dump Directory + Repo Bucketing

**Date**: 2026-03-02  
**Status**: Confirmed

**Context / 背景**: 直接写到 repo 内（如 `convos/`）有误提交风险，且跨项目检索困难。

**Decision / 决策**:
- 使用 `LOAM_DUMP_DIR` 作为统一归档目录（未配置则禁用写入）
- 默认开启 repo 分桶
- 推荐目录：`D:\AI\loamlog-archive\`

**Layout / 目录示例**:
```
{LOAM_DUMP_DIR}/repos/{repo-name}/sessions/{timestamp}-{session_id}.{json|md}
{LOAM_DUMP_DIR}/_global/sessions/...   # 无 repo 上下文
```

---

## ADR-003: JSON 必选 + Markdown 建议 | JSON Required + Markdown Recommended

**Date**: 2026-03-02  
**Status**: Confirmed

**Decision / 决策**:
- JSON snapshot 为萃取层标准输入（必须）
- Markdown transcript 用于人工浏览（建议默认开启）

**Snapshot minimum / 最小结构**:
```typescript
interface SessionSnapshot {
  meta: { session_id, captured_at, capture_trigger, loam_version }
  context: { cwd, worktree, repo?, branch?, commit?, dirty? }
  session: Session
  messages: MessageWithParts[]
  todos?: Todo[]
  diff?: FileDiff[]
  redacted: { patterns_applied, redacted_count }
}
```

---

## ADR-004: LLM Router 可插拔路由 | Pluggable LLM Router

**Date**: 2026-03-02  
**Status**: Confirmed

**Decision / 决策**: Distiller 不直接依赖具体模型 SDK，统一通过 LLMRouter 路由 provider + model。

**Planned providers / 规划模型源**:
- OpenAI
- Anthropic
- Deepseek
- Ollama (local)

---

## ADR-005: 默认强制脱敏 | Redaction On by Default

**Date**: 2026-03-02  
**Status**: Confirmed

**Decision / 决策**:
- 默认匹配并替换常见凭据模式（`sk-*`、`ghp_*`、`AKIA*`、`Bearer *` 等）
- 敏感路径段默认过滤（如 `auth/`、`credentials/`、`.env`）
- 脱敏位置写入标记，供 distiller 跳过敏感片段

---

## ADR-008: Distiller 插件加载机制 | Distiller Plugin Loading Mechanism

**Date**: 2026-03-02  
**Status**: Confirmed

**Context / 背景**:
萃取层需要支持内置、第三方 npm 包、本地目录三种来源的 distiller，同时不引入运行时依赖或注册全局对象。

**Decision / 决策**:
- 每个 distiller 包以 `DistillerFactory` 为默认导出：`export default (config?) => DistillerPlugin`
- `loam.config.ts` 中声明 `distillers` 数组，元素为包名字符串或 `{ plugin, config }` 对象
- `DistillEngine.loadFromConfig` 启动时按序动态 `import(specifier)` 并调用工厂函数
- `DistillerRegistry` 统一管理已加载实例，支持按 id 查询
- 插件具有独立生命周期：`initialize(ctx)` → `run(input)` → `teardown()`
- 单插件失败不影响其他插件（引擎捕获错误并写入 `DistillReport.errors`）

**Consequences / 影响**:
- (+) 第三方可独立发布 npm 包，无需修改主仓
- (+) 本地路径支持就地调试自定义 distiller
- (+) `configSchema` 字段允许引擎在加载时验证配置，快速失败暴露错误
- (-) 动态 import 在 Bun 下需验证相对路径解析行为（相对于 `process.cwd()`）

---

## ADR-006: IPC 机制选型——Local HTTP | IPC Mechanism: Local HTTP

**Date**: 2026-03-02  
**Status**: Confirmed

**Context / 背景**:
AIC 作为独立进程运行，需要与 OpenCode 薄插件通信。候选机制有：
- File signal：简单但无法传递结构化数据，跟踪调试困难
- Local HTTP：RESTful，错误可观测，易于扩展到多 Provider
- stdio：可行但要求插件能打开子进程，与薄插件设计冲突

**Decision / 决策**:
- AIC daemon 监听 `localhost:37468`（默认端口，可通过 `LOAM_PORT` 配置）
- 薄插件在 `session.idle` 事件触发后，向 `POST /capture` 发送 `{ session_id, trigger }`
- AIC 主动拉取完整 session 数据（通过 OpenCode SDK HTTP client）

**Consequences / 影响**:
- (+) 过程错误可观测，插件失败不崩溃宿主
- (+) 局域网内对其他 Provider 同样适用
- (-) 需确保 daemon 在捕获期间运行

---

## ADR-007: Distill 幂等状态设计 | Distill Idempotency Design

**Date**: 2026-03-02  
**Status**: Confirmed

**Context / 背景**:
多次运行 `loam distill` 会重复处理已萸取过的 Session，浪费 LLM Token 并产生重复结果。

**Decision / 决策**:
- 引入 `DistillerStateKV`，持久化存储 distiller 运行状态（水位线 + 已处理 session 集合）
- 引入 `ArtifactQueryClient.getUnprocessed`，默认只返回未处理 artifacts
- `DistillResult.fingerprint`（SHA-256 of `distiller_id + session_id + content hash`）用于第二重去重层
- 结果写入 `pending/` 前检查 fingerprint，已存在则跳过

**Storage / 存储**:
```
{LOAM_DUMP_DIR}/_global/distill_state.db  # watermark per (distiller_id, repo)
# 表结构：{ distiller_id, session_id, processed_at, fingerprints[] }
```

**Consequences / 影响**:
- (+) 是否重运均安全， Token 用量可预测
- (+) `fingerprint` 层层局空消费可用于反向调优
- (-) 引入状态存储，需处理并发写入互斥

---

## ADR-009: Distiller SDK 与第三方开发体验 | Distiller SDK & Third-party DX

**Date**: 2026-03-02  
**Status**: Confirmed

**Context / 背景**:
架构审核（Oracle）评分 6.5/10，核心问题：直接实现原始接口的成本过高——第三方需自行生成 UUID、计算 fingerprint、妆入 distiller_id/version。

**Decisions / 决策**:

1. **`DistillResultDraft` 设计倒置**：`run()` 返回 `DistillResultDraft[]`，引擎自动注入 `id`、`fingerprint`、`distiller_id`、`distiller_version`。第三方永远不需要手动研究这些字段。

2. **`DistillerStateKV` 命名空间隐性隔离**：引擎在传递 `state` 前自动添加 `{distiller_id}:` 前缀，第三方直接使用普通 key 即可。

3. **`payloadSchema` 字段**：`DistillerPlugin` 新增 `payloadSchema?: Record<string, JSONSchema7>`，按 type 映射。引擎在流转给 Sink 前进行运行时校验。

4. **`@loamlog/distiller-sdk` 包**：提供：
   - `defineDistiller(spec)` — 高阶函数，隐藏全部样板代码
   - `createEvidence(artifact, message, excerpt)` — 自动提取 session_id/message_id
   - `loam distill --test-session` CLI 模拟运行（无需启动完整 daemon）

**Consequences / 影响**:
- (+) 最小可用 distiller 减少到只需实现 `id`、`supported_types`、`run` 三个字段
- (+) 第三方可不依赖 LLM 做纯规则萃取，接口不强制
- (+) `defineDistiller` 为未来的 `npm create @loamlog/distiller` 脚手架工具奠定基础
- (-) SDK 包需独立发布并跟踪版本

---

## ADR-010: OpenCode Provider 拉取策略与脱敏接入 | OpenCode Provider Pull Strategy and Redaction Integration

**Date**: 2026-03-02  
**Status**: Confirmed

**Context / 背景**:
采集链路需要在 daemon 侧独立拉取 OpenCode 会话，并满足“默认脱敏 + 未配置 `LOAM_DUMP_DIR` 不写入”的硬约束。

**Decision / 决策**:

1. **Provider 拉取路径**：`@loamlog/provider-opencode` 默认通过本地 HTTP server 拉取：
   - `GET /session/:sessionID`
   - `GET /session/:sessionID/message`
   - `GET /path`
   - `GET /vcs`

2. **认证与上下文传递**：
   - 支持 Bearer token（`OPENCODE_SERVER_TOKEN`）
   - 支持 Basic auth（`OPENCODE_SERVER_USERNAME` + `OPENCODE_SERVER_PASSWORD`）
   - 支持目录路由头（`x-opencode-directory` / `OPENCODE_DIRECTORY`）

3. **脱敏接入点**：在 daemon 中采用固定顺序：
   `pullSession -> buildSessionSnapshot -> applySnapshotRedaction -> writeSessionSnapshot`

4. **默认脱敏规则**：
   - token/key: `sk-*`, `ghp_*`, `AKIA*`, `Bearer *`
   - sensitive path segment: `auth/`, `credentials/`, `.env`
   - 统一替换格式：`[REDACTED:type]`

5. **误杀排除**：`LOAM_REDACT_IGNORE` 作为 regex 列表输入（分号或换行分隔）。

**Consequences / 影响**:
- (+) daemon 独立完成拉取与归档，不依赖插件上下文中的 SDK client
- (+) 默认安全基线满足项目硬约束，且保留误杀兜底手段
- (+) 采集链路具备可测试性（provider mapping + redaction + e2e）
- (-) 目前优先 HTTP 路径；SDK fallback 属于后续增强项

---

## ADR-012: OpenCode 插件本地文件缓冲策略 | Local File Buffering Strategy for OpenCode Plugin

**Date**: 2026-03-05  
**Status**: Confirmed

**Context / 背景**: 
当 Loamlog Daemon 未启动或由于网络原因不可达时，OpenCode 插件上报的 `session.idle` 事件会丢失。为了提高健壮性，插件需要一种临时的离线存储机制。

**Decision / 决策**:
1. **存储路径**: 使用用户家目录下的隐藏目录 `~/.loamlog/buffer/`，确保跨平台持久化。
2. **缓冲机制**: 请求失败（连接拒绝、超时、5xx 错误）时，将 payload 序列化为 JSON 文件。
3. **淘汰策略 (FIFO)**: 目录上限设为 **50 个文件**。写入新文件前，若超限则按修改时间删除最旧的文件，防止磁盘占用过大。
4. **延迟同步 (Late-start Sync)**: 插件在成功发送任一当前事件后，异步触发 `flush` 逻辑，按时间顺序重发缓冲区内的旧文件。
5. **异常处理**: 同步过程中若再次失败，立即停止 flush 流程以保持顺序；损坏的 JSON 文件将被直接删除。

**Consequences / 影响**:
- (+) 显著提升数据采集率，允许 Daemon "无序启动"
- (+) 磁盘占用受控，不会因长时间断连撑爆用户磁盘
- (-) 引入了简单的文件 I/O，需注意多实例下的文件竞争（已通过随机文件名缓解）
- (-) 仅在下一次事件触发时同步，若长期无新会话，旧数据将一直滞留在缓冲区

---

## ADR-011: Claude Code Provider 采集机制 | Claude Code Provider Capture Mechanism

**Date**: 2026-03-10  
**Status**: Proposed

**Context / 背景**:
填补 ADR-010（OpenCode Provider 拉取策略）与 ADR-012（OpenCode 插件缓冲策略）之间的编号缺口。Claude Code 作为第二个 Provider 家族，需要定义其采集机制，以验证 Provider 抽象在多源场景下的可行性。

**Decision / 决策**:
1. **采集路径**: 通过 Claude Code 的本地 HTTP API（默认端口 3000）拉取会话数据
2. **数据结构映射**: 将 Claude Code 的会话结构映射为 Loamlog 标准 `SessionSnapshot`
3. **认证机制**: 支持 Bearer token（`CLAUDE_CODE_TOKEN`）或 Basic auth
4. **上下文提取**: 从 Claude Code 的 workspace 信息中提取 repo、branch、commit 等上下文

**Consequences / 影响**:
- (+) 验证 Provider 抽象在多源场景下的可行性
- (+) 为后续 Cursor、GitHub Copilot 等 Provider 提供参考实现
- (-) 需要处理 Claude Code 特有的数据结构差异
- (-) 需确保与现有 OpenCode Provider 的接口兼容性

---

## ADR-013: `loam list` 命令接口设计 | `loam list` Command Interface Design

**Date**: 2026-03-10  
**Status**: Proposed

**Context / 背景**:
用户需要浏览已归档的会话快照，但当前 CLI 仅支持 `daemon` 和 `distill` 命令。需要设计一个直观的列表命令，支持按 repo、时间范围、Provider 等维度过滤。

**Decision / 决策**:
1. **命令格式**: `loam list [--repo <name>] [--last <7d|30d|all>] [--since <ISO>] [--until <ISO>] [--provider <opencode|claude-code>] [--format <table|json>]`
2. **输出内容**: 显示 session_id、captured_at、repo、provider、message_count 等关键信息
3. **分页支持**: 默认显示最近 20 条，支持 `--limit` 和 `--offset` 参数
4. **详细模式**: `--verbose` 显示更多元数据，如 capture_trigger、redacted_count 等

**Consequences / 影响**:
- (+) 提供用户友好的归档浏览界面
- (+) 支持多维度过滤，便于查找特定会话
- (-) 需要实现新的 CLI 子命令和参数解析逻辑
- (-) 需考虑性能优化，避免扫描大量文件时的延迟

---

## ADR-014: 多 Provider Daemon 设计 | Multi-Provider Daemon Design

**Date**: 2026-03-10  
**Status**: Proposed

**Context / 背景**:
当前 daemon 硬编码了 OpenCode Provider（`createOpencodeSessionProvider()`），无法同时监听多个 Provider。随着 Claude Code 等新 Provider 的加入，需要设计支持多 Provider 的 daemon 架构。

**Decision / 决策**:
1. **Provider 注册表**: daemon 启动时根据 `--providers` 参数动态加载注册的 Provider
2. **统一捕获端点**: 所有 Provider 共享 `/capture` 端点，通过 `payload.provider` 字段区分来源
3. **并发处理**: daemon 支持同时处理来自不同 Provider 的捕获请求
4. **配置驱动**: 通过 `loam.config.ts` 或环境变量配置 Provider 列表和各自参数

**Consequences / 影响**:
- (+) 支持同时采集多个 AI 工具的会话数据
- (+) 架构扩展性强，新增 Provider 无需修改 daemon 核心逻辑
- (-) 需要重构 daemon 初始化逻辑，支持动态 Provider 加载
- (-) 需处理不同 Provider 的认证和配置隔离

---

## ADR-015: `aic_version` 与 `loam_version` 字段命名拆分 | `aic_version` and `loam_version` Field Naming Split

**Date**: 2026-03-10  
**Status**: Confirmed

**Context / 背景**:
在代码审查中发现 `SessionSnapshot.meta.aic_version`（磁盘存储字段）与 `SessionArtifact.meta.loam_version`（内存处理字段）使用不同命名。这是有意设计：`aic_version` 反映采集时的 AIC 版本，`loam_version` 反映处理时的 Loamlog 版本。

**Decision / 决策**:
1. **字段语义**:
   - `SessionSnapshot.meta.aic_version`: 采集工具版本（写入磁盘时）
   - `SessionArtifact.meta.loam_version`: 处理引擎版本（内存转换时）
2. **映射关系**: `distill/src/query.ts` 中的 `snapshotToArtifact()` 函数完成映射：`loam_version: snapshot.meta.aic_version`
3. **向后兼容**: 保持现有字段不变，不触发代码迁移
4. **文档说明**: 明确两个字段的语义差异和映射关系

**Consequences / 影响**:
- (+) 清晰区分采集版本和处理版本的概念
- (+) 保持向后兼容，现有快照无需修改
- (+) 为未来版本迁移提供语义基础
- (-) 需要开发人员理解两个字段的语义差异

*注：此为回顾性文档，记录已有设计决策，不触发代码迁移。*
