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
