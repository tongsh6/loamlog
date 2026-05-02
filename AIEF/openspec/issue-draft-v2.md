# Issue Draft Distiller V2 — 多产出 + 上下文 + Parts 数据

> **Status:** Design | 设计中
>
> 基于狗粮验证和用户场景讨论，重构 issue-draft 萃取器的 prompt 设计，使其支持：session 上下文自动注入、一个 session 产出多条 Issue、工具调用数据纳入 prompt、跨项目 Issue 归属。

## 要解决什么问题 | Problem to Solve

### 现状缺陷

| # | 问题 | 影响 |
|---|------|------|
| 1 | Session 上下文缺失 | LLM 不知道对话属于哪个 repo/branch，无法判断 Issue 归属 |
| 2 | 单产出限制 | 一个 session 不管讨论了多少个独立问题，只产出 1 条 Issue |
| 3 | Parts 数据丢弃 | prompt 只用 `message.content`，tool call 输出（错误堆栈、代码变更）完全不可见 |
| 4 | 跨项目发现不支持 | `repo` 被视为唯一归属地，无法处理"开发项目 A 时发现项目 B 的 bug" |

### 用户场景

| 场景 | 描述 | 源项目 | Issue 目标 |
|------|------|--------|-----------|
| 同项目改进 | 开发中发现的自身功能/架构问题 | A | A |
| 依赖工具缺陷 | 使用了开源库，发现 bug/功能缺失 | A | B（依赖）|
| 基础设施反馈 | CI/CD 平台、部署平台的问题 | A | 外部 |
| 跨项目协作 | 调用团队另一个服务，发现接口问题 | A | B（同事项目）|
| AI 工具反馈 | 对 AI 编程工具本身的改进建议 | A | provider |

### 根因

当前 issue-draft 设计和 trigger 设计有同样的哲学问题——"只取最好的一个"，而不是"把有价值的都挖出来"。prompt 的保守指令 (`exactly one`) 和 `selectBestCandidate` 的单条选取叠加，导致大量有效信息被丢弃。

## 目标状态 | Target State

### 用户故事

> 小北同时在开发 4 个项目，日常使用 AI 工具。每当他讨论到"这个以后应该做"、"这个有 bug"、"这个开源库好像有问题"，不需要手动提 Issue。几天后打开 `loam list --distill`，发现系统自动为每个有价值的讨论点生成了一条 Issue 草稿，归属到了正确的项目 repo。他只需要审阅和批准。

### Prompt 改造

```
变更前：
  session_id: xxx
  messages:
  [msg-1] (user) 这里有个bug...

变更后：
  ## Session Context
  repo: ai-novel-studio
  branch: develop
  provider: claude-code

  --- messages ---
  [msg-1] (user) 这里有个bug...
  [msg-2] (assistant/tool: execute_command) npm test failed: TypeError: ...
  [msg-3] (assistant/reasoning) 看起来是 React 19 的 createRoot API 变更导致...
```

关键变化：
1. **Session 上下文块**：repo、branch、provider 信息放在消息前面
2. **Parts 数据包含**：每条消息的 role 中注明 `tool:xxx` 或 `reasoning`，输出截断到合理长度
3. **多产出指令**：system prompt 从 "exactly one" 改为 "all strong drafts"
4. **跨项目归属**：Output schema 增加 `target_repo` 字段，默认等于 context.repo

### System Prompt 变更

```
变更前：
  "You extract exactly one strong GitHub issue draft..."

变更后：
  "You extract all strong GitHub issue drafts from this AI coding session.
   Return a JSON array. If the session contains no meaningful issues,
   return an empty array.
   
   For each issue, determine which repo it belongs to (target_repo).
   Usually this is the session's repo, but if the discussion is about
   a dependency, external tool, or another project, set target_repo
   accordingly."
```

### `selectBestCandidate` → 阈值过滤

```
变更前：只取最高分 1 条
变更后：置信度 >= 0.5 的全部保留，只过滤 < 0.5 的
```

## 边界 | Boundary

### 做什么

| 项 | 说明 |
|----|------|
| `buildSessionContext()` 共享工具 | 在 distiller-sdk 中实现，所有萃取器共用 |
| 更新 4 个萃取器的 `buildPrompt` | 注入 session 上下文 |
| 更新 issue-draft system prompt | "exactly one" → "all strong drafts" |
| 更新 issue-draft select 逻辑 | 阈值过滤替代单条选取 |
| 更新 issue-draft output schema | 增加 `target_repo` 字段 |
| issue-draft prompt 包含 parts | tool call name + error/output 截断 |
| 其他 3 个萃取器同步检查 | 是否也有单产出/无上下文问题 |

### 不做什么

| 项 | 原因 |
|----|------|
| 不改变 DistillerPlugin 接口 | 上下文注入在 prompt 层 |
| 不在 engine 层自动注入上下文 | 先在 SDK 层做共享工具，不在 engine 强行注入 |
| 不分拆 session（单 session → 多个 LLM 调用） | 那是 shard-map-reduce 的职责 |
| 不引入 Issue 模板/标签规则 | V3 范围 |

## Parts 数据策略

| part 类型 | 包含方式 | token 预估 |
|-----------|---------|-----------|
| `text` | 已通过 `message.content` 包含 | — |
| `reasoning` | `[msg-id] (assistant/reasoning) {text.slice(0, 500)}` | +500 chars |
| `tool(name, output)` | `[msg-id] (assistant/tool:name) output: {output.slice(0, 300)}` | +350 chars |
| `tool(name, error)` | `[msg-id] (assistant/tool:name) error: {error.slice(0, 300)}` | +350 chars |
| `file` | `[msg-id] (assistant/file) {filename}` | +50 chars |

tool 的 `input` 通常太长（可含完整代码），不纳入。只取 name + output/error 截断。

## 与现有架构的关系

### 修改

| 模块 | 改动 |
|------|------|
| `distiller-sdk/src/index.ts` | 新增 `buildSessionContext()` |
| `distillers/issue-draft/src/prompt.ts` | 注入上下文 + parts 数据 |
| `distillers/issue-draft/src/constants.ts` | system prompt 变更 |
| `distillers/issue-draft/src/select.ts` | 阈值过滤替代单条选取 |
| `distillers/issue-draft/src/types.ts` | 增加 `target_repo` |
| `distillers/prd-draft/src/index.ts` | buildPrompt 注入上下文 |
| `distillers/knowledge-card/src/index.ts` | buildPrompt 注入上下文 |
| `distillers/pitfall-card/src/index.ts` | buildPrompt 注入上下文 |

### 不影响

| 模块 | 原因 |
|------|------|
| DAG runner / engine | prompt 构造是萃取器内部行为 |
| LLM Router | 不涉及路由变更 |
| sink | 投递链路不变 |
| trigger / daemon | 调度链路不变 |

## DAG 拆分

```
A: distiller-sdk 新增 buildSessionContext()
   -> B: 4 个萃取器 buildPrompt 注入上下文
A
   -> C: issue-draft prompt 包含 parts 数据
   -> D: issue-draft system prompt 变更 + 多产出
B + C + D
   -> E: 更新 select 逻辑（阈值过滤）
   -> F: 新增 target_repo 字段
```

## 验收

1. `buildSessionContext()` 输出包含 repo/branch/provider 信息
2. 4 个萃取器的 prompt 都包含 session 上下文
3. issue-draft 的 prompt 包含 tool call name + error/output
4. issue-draft system prompt 不再有 "exactly one"
5. 一个 session 可产出多条 Issue（通过测试验证）
6. target_repo 字段默认等于 context.repo，LLM 可覆盖
7. 现有测试不破（可能需要更新断言）
