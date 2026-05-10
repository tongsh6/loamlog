# Refinery Global Evidence Index — 全局证据索引规格说明书

> **状态：** 设计中 (2026-05-11)
>
> **角色：** 定义跨 Provider、跨 Session 的多维证据检索机制。它是冶炼环节 P1 策略（跨工具织补）的物理支柱。

---

## 1. 核心愿景 (Vision)

为了实现“孤证不立”，Loamlog 必须能够瞬间定位“Session A 提到的现象”在“Session B（终端日志）”中的真实投影。全局索引是将分散的 Snapshot 转化为**“可搜索事实网”**的关键。

---

## 2. 索引策略 (Indexing Strategy)

索引不仅记录“在哪里”，还记录“发生了什么”。

### 2.1 时间轴索引 (Temporal Index)
- **Key**: `Timestamp (precision: seconds)`
- **Value**: `[ { sessionId, offset, providerType } ]`
- **用途**：支撑 `captured_at ± N min` 的快速织补。

### 2.2 实体索引 (Entity Index)
- **Key**: `NormalizedEntity` (e.g., `file_path`, `className`, `functionName`)
- **Value**: `[ { sessionId, messageId, context_type: "discussion" | "log" | "diff" } ]`
- **用途**：支撑 P0 对账中对具体代码实体的全生命周期追踪。

---

## 3. 证据提供者契约 (Evidence Provider Contract)

为了让索引保持轻量，各 Provider 必须实现 `Indexable` 接口：

```typescript
interface IndexableProvider {
  /** 提取该 Snapshot 中的可索引实体与时间锚点 */
  getIndices(snapshot: SessionSnapshot): IndexEntry[];
}
```

---

## 4. 织补查询接口 (Weaving Query API)

Verifier 在冶炼阶段通过以下 API 索取证据：

```typescript
interface GlobalRegistry {
  /** 寻找在指定时间内，包含特定关键词或实体的非对话日志 */
  findPhysicalEvidence(query: {
    time_window: [number, number],
    entities: string[],
    keywords: string[]
  }): Promise<EvidenceSpan[]>;
}
```

---

## 5. 性能约束 (Performance)

- **索引构建**：应在 `Capture` 阶段异步完成，不得阻塞写入。
- **查询延迟**：跨 10,000 个 Session 的检索延迟应控制在 **200ms** 以内（利用内存索引或 SQLite FTS5）。

---

## 6. 后续任务

- [ ] 在 `packages/archive` 中引入 SQLite FTS 插件。
- [ ] 为 `opencode` provider 实现第一个实体提取逻辑。
