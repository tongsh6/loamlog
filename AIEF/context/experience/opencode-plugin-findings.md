# OpenCode 插件调研经验 | OpenCode Plugin Findings

Research date: 2026-03-02

## 关键发现 | Key Insights

1. **OpenCode 并非 Go 项目**，而是 Bun/TypeScript 体系。
   OpenCode is not Go-based; it is Bun/TypeScript based.

2. `@opencode-ai/plugin` SDK 成熟，具备事件监听、hook 扩展和 SDK 客户端访问能力。
   The plugin SDK is mature with event hooks and direct SDK client access.

3. `opencode-convodump` 是有效参考实现，验证了 `session.idle` 触发与 queue/fingerprint 机制。
   convodump validates `session.idle` trigger plus queue/fingerprint patterns.

4. 现有导出方案的短板是：仅 Markdown、写入 repo 内、无统一脱敏、无萃取层。
   Existing export solutions are markdown-only, repo-local, no unified redaction, no distill pipeline.

5. 插件内 `client` 本质是对本地服务的 API 客户端，说明独立进程 + 薄桥接可行。
   The plugin `client` is an API client to local OpenCode server, validating standalone process + thin bridge.

## 可复用模式 | Reusable Patterns

- Session 级串行队列，避免并发写入冲突
- 指纹判重，避免重复落盘
- 原子写入（临时文件 + rename）
- busy 期间预拉取，idle 时快速落盘

## 需要规避的问题 | Pitfalls to Avoid

- 每次 `message.part.updated` 都写文件（会放大 IO 压力）
- 直接写入 repo 导致误提交
- 无证据直接外发 distill 结果
- 关闭默认脱敏

## 本机参考路径 | Local Reference Paths

```
Config dir:  C:/Users/tongs/.config/opencode/
Config file: C:/Users/tongs/.config/opencode/opencode.json
Plugin SDK:  C:/Users/tongs/.config/opencode/node_modules/@opencode-ai/plugin/
Source repo: C:/Users/tongs/AppData/Local/Temp/opencode/
```
