# Refinery Workshop 1: Crushing (Normalizer) — 破碎车间规格说明书

> **状态：** 设计中 (2026-05-11)
>
> **角色：** 定义原矿 (Raw Session) 到粗矿 (Normalized Session) 的物理加工逻辑。这是炼矿中心的第一道工序，旨在通过降噪和规约提升 LLM 的处理效率。
>
> **关联契约：** `CP-01 (NormalizedSession Contract)`

---

## 1. 破碎目标 (Workshop Goals)

破碎车间不处理任何“语义萃取”，其职责纯粹是**物理降噪与标准化**：

- **降噪 (Noise Reduction)**：消除占位大但信号低的“废石”（长工具输出、推理日志）。
- **规约 (Normalization)**：将不同来源（Claude, Gemini, OpenCode）的数据映射为统一的内部格式。
- **保护 (Preservation)**：确保核心上下文（Repo, Branch, File Path）不被丢失。

---

## 2. 输入/输出 映射规则 (Mapping Rules)

### 2.1 物理破碎：消息体降噪
对于单条消息，按以下规则进行“物理破碎”：

| 原始 Part 类型 | 加工动作 | 破碎参数 |
| :--- | :--- | :--- |
| `text` | **保留并合并** | 合并为一个 `text` 字段，去除多余空白。 |
| `reasoning` | **剥离并截断** | 移动到 `reasoning` 字段，默认截断至 500 字符。 |
| `tool` | **摘要压缩** | 若输出 > 300 字符，执行 `head(150) + [...] + tail(150)` 采样。 |
| `file` | **引用转换** | 仅保留文件名和相对路径，不读取大文件全量内容。 |

### 2.2 元数据对齐：上下文注入
从 `CaptureRequest` 和 `SessionSnapshot` 中提取并标准化以下字段：

- `header.repo_path`: 绝对路径。
- `header.provider`: `claude-code`, `opencode` 等。
- `header.vcs_context`: 必须包含 `branch` 和 `commit`。

---

## 3. 负面约束 (Forbidden Behaviors)

为了防止过度破碎造成不可逆的信息损失，破碎车间禁止以下行为：
- **禁止丢弃原始 ID**：必须保留 `session_id` 和 `message_id` 以便溯源。
- **禁止合并不同 Role 的消息**：必须严格保持 User/Assistant 的对话流向。
- **禁止在没有 Error 标记的情况下删除工具调用**：即使输出很长，如果有 `exit_code != 0`，必须优先保留错误堆栈末尾。

---

## 4. 破碎质量指标 (Acceptance Proofs)

实现阶段必须通过以下测试证明“破碎机”合格：

| 指标 | 证明方式 | 期望结果 |
| :--- | :--- | :--- |
| **信噪比提升** | 对比同一会话破碎前后的字符数 | 典型开发会话的总字符数下降 ≥ 30%。 |
| **上下文完整性** | 检查输出的 `header` | 包含正确的 `repo_path` 和 `vcs_context`。 |
| **可追溯性** | 通过 `NormalizedSession` 反查 `RAW` | 每一条消息都能通过 `id` 回溯到原始数据。 |
| **性能响应** | 处理 100 条消息的 Session | 耗时 < 50ms。 |

---

## 5. 最小技术方案 (Implementation Slice)

### 5.1 核心类：`NormalizerEngine`
- 负责执行上述映射规则。
- 采用流水线模式：`TextAggregator` -> `ToolCompressor` -> `MetadataInjector`。

### 5.2 引擎集成
在 `packages/distill/src/dag-runner.ts` 中，`run_distiller` 节点在启动前必须先调用 `NormalizerEngine`。

```typescript
// VS-01 Implementation Point
const raw = await store.getRaw(id);
const crushed = normalizer.crush(raw);
await distiller.run(crushed);
```

---

## 6. 待决问题 (Open Questions)

- 是否需要根据不同的 Distiller 类型（如 Issue vs PRD）采用不同的破碎强度？
- **初判**：Stage 1 采用统一强度，Stage 2 允许 Distiller 覆盖 `maxToolSummaryChars`。
