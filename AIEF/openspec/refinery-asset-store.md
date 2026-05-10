# Refinery Asset Store — 炼矿资产账本规格说明书

> **状态：** 设计中 (2026-05-11)
>
> **角色：** 定义正在加工中的资产（精矿、粗金属、纯金属）的持久化与状态追踪机制。它是炼矿中心的“中央账本”，确保工序间的异步协作与增量精炼。
>
> **关联契约：** `CP-00 (Asset Ledger Schema)`

---

## 1. 核心愿景 (Vision)

如果说 `Archive` 是存放原矿的仓库，那么 `Asset Store` 就是存放加工后半成品的**恒温库**。它的存在解决了以下问题：
- **状态追踪**：记录一个资产从 `DRAFT` 到 `REFINED` 的每一个步足迹。
- **增量加工**：只需冶炼新发现的矿，不再重复扫描全量历史。
- **跨会话记忆**：允许 `Aggregator` 在不同时间点拉取相关的历史资产进行合并。

---

## 2. CP-00: Asset Ledger Schema (资产账本契约)

### 2.1 存储模型 (Storage Model)
资产以 `AssetID` 为主键，存储在 `distill/{repo}/assets.db` (轻量级本地 DB)。

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | string (UUID) | 资产唯一内部标识符 |
| `identity_hash` | string (SHA256) | 基于 `Identity Matching` 生成的演进主键 |
| `current_status` | enum | `DRAFT`, `VERIFIED`, `REFINED`, `MERGED`, `ARCHIVED` |
| `distiller_id` | string | 负责产出该资产的萃取器 ID |
| `payload` | JSON | 当前品位的资产内容 (符合 CP-02/03/04) |
| `state_history[]` | array | 记录：`timestamp`, `workshop`, `action`, `reason` |
| `source_refs[]` | array | 关联的 `sessionId:messageId` 列表 |
| `created_at` / `updated_at` | timestamp | 物理时间戳 |

---

## 3. 资产状态机 (Asset State Machine)

资产在账本中的流转必须遵循严格的物理规则：

1.  **Ingestion**: `Distiller` 产出 Candidate -> 账本新建 `DRAFT`。
2.  **Smelting**: `Verifier` 验证通过 -> 状态晋升为 `VERIFIED`；失败 -> 降级为 `REJECTED` 或 `ARCHIVED`。
3.  **Refining**: `Aggregator` 合并多条资产 -> 被合并项标记为 `MERGED`，新生成项标记为 `REFINED`。
4.  **Delivery**: 投递至 Sink -> 状态标记为 `PUBLISHED`。

---

## 4. 关键不变量 (Invariants)

- **主键唯一性**：同一个 `identity_hash` 在同一 Repo 下只能有一个处于活跃状态（非 MERGED/ARCHIVED）的资产。
- **溯源强制性**：任何资产的更新必须在 `state_history` 中留下操作该资产的 `workshop` 名称。
- **版本幂等性**：重复运行同一工序，若输入内容一致，不应产生新的 `state_history` 条目。

---

## 5. 待决问题 (Open Questions)

- **冲突解决**：当两个 Session 在同一时间对同一资产提出了冲突的建议，账本应如何处理？
- **初判**：记录在 `payload.conflicts` 字段中，标记为 `NEEDS_MANUAL_REVIEW`。
