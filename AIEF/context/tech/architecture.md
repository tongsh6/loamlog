# 技术架构 | Architecture

## 系统总览 | System Overview

```
Providers        ->  Archive           ->  Distill Engine   ->  Sinks
  opencode            JSON snapshot         LLM Router           file
  claude-code         + Markdown            multi-model          github (*)
  cursor (*)          redact + trace        multi-distiller      notion (*)

(*) = planned
```

## 模块划分 | Package Layout

```
loamlog/
├── packages/
│   ├── core/              # Types + contracts (DistillerPlugin, DistillResultDraft...)
│   ├── archive/           # Store + redact + fingerprint
│   ├── providers/
│   │   ├── opencode/      # OpenCode provider
│   │   └── claude-code/   # Claude Code transcript provider
│   ├── distill/           # Engine + LLM router + registry + metadata injector
│   ├── distiller-sdk/     # @loamlog/distiller-sdk: defineDistiller, createEvidence, testRunner
│   ├── distillers/        # Built-in distillers (reference implementations)
│   ├── sinks/             # Output adapters
│   └── cli/               # CLI entry (loam distill --test-session support)
├── plugins/
│   └── opencode/          # Thin bridge plugin (event forwarding)
└── config/
```

## 数据流 | Data Flow

### 采集链路 | Capture Flow

1. Provider 接收会话完成/idle 信号。
2. 拉取 session/messages/tools 与 path/vcs 上下文。
3. 采集 git 上下文（repo/branch/commit/dirty）。
4. 默认执行脱敏（token/key/path），写入 `redacted.patterns_applied/redacted_count`。
5. 原子写入 JSON snapshot（Markdown transcript 为后续阶段）。

### 萃取链路 | Distill Flow

1. Engine 从 `AICConfig.distillers` 动态 import 并注册插件。
2. 每个 distiller 通过 `ArtifactQueryClient.getUnprocessed` 获取待处理 artifacts。
3. 通过 LLM Router 选择模型并执行萃取。
4. 结果去重（fingerprint 校验）、排序后写入 `pending/`。
5. 通过 sink 输出（默认本地文件）。

## 进程通信 | Bridge Communication

OpenCode 薄插件只做事件转发，主逻辑在 AIC 进程。
The OpenCode bridge plugin only forwards events; business logic runs in the AIC process.

**确定机制: Local HTTP（ADR-006）**

- AIC daemon 监听 `localhost:37468`（默认端口可配置）
- 薄插件在事件触发后向该地址 POST `{ session_id, trigger, captured_at, provider }`
- 接收失败时插件默默失败（不崩溃宿主），写入错误日志
- Receiving failures: plugin silently drops (MUST NOT crash host); writes to error log

```
OpenCode Plugin               AIC Daemon (localhost:37468)
   |  session.idle event        |
   |  POST /capture ----------->|
   |  { session_id, ... }       |  pull full session via OpenCode HTTP API
   |                            |  -> redact -> archive -> distill
   |<-- 202 Accepted -----------|
```

## OpenCode 拉取序列（M2） | OpenCode Pull Sequence (M2)

当前 `@loamlog/provider-opencode` 通过本地 OpenCode server HTTP 拉取会话数据。
Current `@loamlog/provider-opencode` pulls session data from local OpenCode server via HTTP.

```text
GET /session/:sessionID
GET /session/:sessionID/message
GET /path
GET /vcs
```

支持认证与路由上下文头：
Supports auth and routing context headers:

- `Authorization: Bearer <token>` 或 `Authorization: Basic <base64(user:pass)>`
- `x-opencode-directory: <path>`

## 萃取层插件加载流程 | Distill Plugin Load Flow

```
loam.config.ts
  distillers: [
    '@loamlog/distiller-pitfall',
    { plugin: './my-distiller', config: { ... } }
  ]
        |
        v
  DistillEngine.loadFromConfig(config)
        |
        |-- dynamic import('@loamlog/distiller-pitfall')
        |       └── default export: DistillerFactory
        |               └── factory(config?) -> DistillerPlugin
        |
        |-- dynamic import('./my-distiller')
        |       └── same pattern
        |
        v
  DistillerRegistry.register(plugin)
        |
        v
  DistillEngine.run()
        |-- plugin.initialize(ctx)    // lifecycle: startup
        |-- plugin.run(input)         // core logic
        └── plugin.teardown()         // lifecycle: shutdown
```

每个 distiller 通过统一的 `DistillerFactory` 工厂函数暴露，引擎负责调用并注入依赖（`artifactStore`、`llm`、`state`）。
Each distiller exposes a `DistillerFactory`; the engine calls it and injects dependencies.

## 萃取层设计原则 | Distill Layer Design Principles

1. **幂等性 Idempotency**：Distiller 通过 `ArtifactQueryClient.getUnprocessed` 获取未处理 artifacts，降低重复 Token 消耗。
2. **流式加载 Streaming Load**：Distiller 通过 `ArtifactQueryClient` 按需流式读取，避免全量内存加载。
3. **Payload 结构化 Structured Payload**：`DistillResult.payload<T>` 提供类型化数据，供 Sink 直接映射到 GitHub Issue / Notion 字段。
4. **去重 Deduplication**：`fingerprint` 字段防止多次运行产生重复结果。
5. **可追溯证据 Traceable Evidence**：每个证据条目带 `trace_command`，外部可直接定位原始会话消息。
6. **生命周期隔离 Lifecycle Isolation**：每个插件有独立的 `initialize / run / teardown`，引擎保证单插件错误不影响其他插件。

## 存储布局 | Storage Layout

```
{LOAM_DUMP_DIR}/
├── repos/
│   └── {repo-name}/
│       └── sessions/
│           ├── {timestamp}-{session_id}.json
│           └── {timestamp}-{session_id}.md   # planned in next phase
├── _global/
│   └── sessions/                         # 无 repo 上下文的会话 | Sessions without repo context
├── distill/
│   └── {repo-name}/
│       ├── pending/                       # 等待审批 | Awaiting approval
│       ├── approved/                      # 已确认资产 | Confirmed assets
│       └── rejected/                      # 已否决（反向调优数据）| Rejected (anti-tuning data)
 └── _global/
    └── distill_state.db                   # 水位线 + 去重指纹 | Watermark + dedup fingerprints
```

## 触发式智能管线 | Triggered Intelligence Pipeline

- **Collector**：capture 入口追加轻量信号收集，不阻塞写盘。  
- **Pre-filter**：本地检测严重度关键词（fatal/timeout/denied/rollback）、语义高价值模式、人工 trigger。  
- **Trigger Engine**：频率阈值（默认 5min/3 次）+ 严重度 + 人工触发组合打分，生成 `triggerReason/triggerScore/processingMode/batchId` 元数据。  
- **Async Worker**：按 batchKey 聚合后异步调度 distill，引擎运行时可通过 `session_ids` 精确限定处理范围。  
- **Degrade**：队列超限或显式关闭时切换为 `summary-only`，仅记录触发信息不执行深度 LLM 调用；失败不会反向阻塞 capture。

## M2 状态 | M2 Status

- 已实现：OpenCode HTTP 拉取、默认脱敏、原子 JSON 落盘、端到端自动化测试。
- Implemented: OpenCode HTTP pull, default redaction, atomic JSON snapshot write, end-to-end automated tests.
- 待实现：SDK fallback（HTTP 不可用时）、Markdown transcript 产出、更细粒度 redaction rule 配置文件。
- Planned: SDK fallback when HTTP is unavailable, Markdown transcript output, finer redaction rule file configuration.
