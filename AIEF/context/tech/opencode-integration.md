# OpenCode 集成调研 | OpenCode Integration Research

Research date: 2026-03-02

## 结论摘要 | Key Findings

1. OpenCode 提供了成熟的插件 SDK（`@opencode-ai/plugin`）。
2. 插件可通过 `event` hook 监听会话与消息生命周期。
3. 插件上下文内置 `client`，可直接拉取 session/messages/todo/diff。
4. `opencode-convodump` 是可复用参考，但仅输出 Markdown。
5. AIC 作为独立程序是可行的，OpenCode 仅作为 Provider。

## M2 实现快照 | M2 Implementation Snapshot

当前实现优先走 OpenCode 本地 server HTTP 路径（而不是插件内直接调用 client）。
Current implementation prioritizes OpenCode local server HTTP path (instead of calling client directly inside plugin).

- `GET /session/:sessionID`
- `GET /session/:sessionID/message`
- `GET /path`
- `GET /vcs`

这些路由来自 OpenCode server（`packages/opencode/src/server/routes/session.ts` 与 `server.ts`）。
These routes come from OpenCode server (`packages/opencode/src/server/routes/session.ts` and `server.ts`).

## 插件配置 | Plugin Config

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-convodump@latest", "my-plugin@latest"]
}
```

## 插件入口 | Plugin Entry

```typescript
import { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      // handle events
    },
  }
}

export default MyPlugin
```

## 关键事件 | Key Events

### Session lifecycle
- `session.created`
- `session.updated`
- `session.deleted`
- `session.idle`
- `session.status`
- `session.compacted`
- `session.diff`

### Message lifecycle
- `message.updated`
- `message.part.updated`
- `message.removed`
- `message.part.removed`

### Other
- `todo.updated`
- `file.edited`
- `permission.updated`
- `vcs.branch.updated`

## 可用 Hook | Available Hooks

- `event`
- `chat.message`
- `chat.params`
- `tool.execute.before`
- `tool.execute.after`
- `shell.env`
- `tool.definition`
- `experimental.chat.system.transform`
- `experimental.session.compacting`

## SDK 访问能力 | SDK Client Access

```typescript
client.session.get({ path: { id: sessionID } })
client.session.messages({ path: { id: sessionID } })
client.session.todo({ path: { id: sessionID } })
client.session.diff({ path: { id: sessionID } })
client.vcs.get()
client.path.get()
```

## HTTP 访问与鉴权 | HTTP Access and Auth

默认地址：`http://127.0.0.1:4096`（可由 `OPENCODE_SERVER_URL` 覆盖）。
Default server URL: `http://127.0.0.1:4096` (overridable by `OPENCODE_SERVER_URL`).

支持认证：
Supported auth:

- Bearer token: `Authorization: Bearer <OPENCODE_SERVER_TOKEN>`
- Basic auth: `Authorization: Basic <base64(OPENCODE_SERVER_USERNAME:OPENCODE_SERVER_PASSWORD)>`

支持目录路由头：
Directory routing header:

- `x-opencode-directory: <OPENCODE_DIRECTORY>`

## M2 Provider 配置项 | M2 Provider Config Inputs

`@aicapture/provider-opencode` 当前支持以下输入（代码参数与环境变量二选一，参数优先）：
`@aicapture/provider-opencode` currently supports these inputs (code option overrides env):

- `baseUrl` / `OPENCODE_SERVER_URL`
- `token` / `OPENCODE_SERVER_TOKEN`
- `username` + `password` / `OPENCODE_SERVER_USERNAME` + `OPENCODE_SERVER_PASSWORD`
- `directory` / `OPENCODE_DIRECTORY`

## convodump 参考价值 | convodump as Reference

**可复用 / Reusable**:
- queue + schedule 串行写入
- fingerprint 跳过未变化数据
- 原子写入（tmp + rename）

**缺口 / Gaps**:
- 写入 repo 内目录，易误提交
- 仅 Markdown，无结构化 JSON
- 缺少统一脱敏与多 sink 萃取流程

## 本机路径参考 | Local Paths (This Machine)

- Config: `C:/Users/tongs/.config/opencode/opencode.json`
- SDK: `C:/Users/tongs/.config/opencode/node_modules/@opencode-ai/plugin/`
- Source: `C:/Users/tongs/AppData/Local/Temp/opencode/`
