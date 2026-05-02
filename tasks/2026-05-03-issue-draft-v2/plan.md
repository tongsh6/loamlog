# Plan — Issue Draft Distiller V2

## 目标 | Goal

重构 issue-draft 萃取器：注入 session 上下文、支持多产出、纳入 parts 数据、支持跨项目 Issue 归属。

## 设计文档 | Design Doc

`AIEF/openspec/issue-draft-v2.md`

## 执行步骤 | Execution Steps

### Step 1: distiller-sdk 新增 buildSessionContext()（节点 A）

- `buildSessionContext(artifact)` 返回 session 上下文 header（repo/branch/provider）
- 放在 SDK 中供所有萃取器共用
- **验收**: 输出包含 repo/branch/provider 信息

### Step 2: 4 个萃取器 buildPrompt 注入上下文（节点 B）

- issue-draft/prd-draft/knowledge-card/pitfall-card 的 `buildPrompt` 调用 `buildSessionContext`
- 上下文放在消息列表前面
- **验收**: 4 个萃取器 prompt 开头都有 `## Session Context`

### Step 3: issue-draft prompt 包含 parts 数据（节点 C）

- `buildPrompt` 不再只用 `message.content`，同时纳入 `parts`：
  - `reasoning` → `(assistant/reasoning) {text}`
  - `tool` → `(assistant/tool:name) output/error: {截断}`
  - `file` → `(assistant/file) {filename}`
- **验收**: 含 tool call 的 session prompt 能看到工具名和输出

### Step 4: issue-draft system prompt + 多产出（节点 D）

- 改 system prompt："exactly one" → "extract all strong drafts"
- `selectBestCandidate` → 阈值过滤（confidence >= 0.5 保留）
- **验收**: 多 issue 的测试 session 能产出 >1 条结果

### Step 5: target_repo 字段（节点 F）

- `LlmIssueDraft` 增加 `target_repo?` 字段
- 默认等于 `context.repo`，LLM 可覆盖
- **验收**: LLM 返回 target_repo 时被正确解析

### Step 6: 更新测试

- 更新现有测试的断言（system prompt 变更）
- 新增多产出测试
- **验收**: 185+ 测试全绿
