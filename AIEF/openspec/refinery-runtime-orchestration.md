# Refinery Runtime Orchestration — 炼矿中心运行编排规格说明书

> **状态：** 设计中 (2026-05-11)
>
> **角色：** 炼矿中心的“总装说明书”。本文定义各工序节点如何通过数据接力完成资产演进，并规定了系统的并发控制、错误门禁与运行拓扑。
>
> **关联文档：**
> - `AIEF/openspec/refinery-pipeline.md` — 基础架构
> - `AIEF/openspec/refinery-asset-store.md` — 持久化底座

---

## 1. 端到端数据旅程 (The Data Journey)

信号在炼矿中心内部的演进遵循 **“单向不可逆、带门禁接力”** 模式：

```text
[Signal Capture] ──(RawSnapshot)──▶ [Continuous Indexer]
                                         │ (Async Indexing)
                                         ▼
[Runtime Controller] ◀─────────── [Evidence Index]
     │
     ├─ Step 1: Normalizer (破碎) ──▶ NormalizedSession (In-Memory)
     │
     ├─ Step 2: Distiller (选矿)  ──▶ AssetCandidate[] ──▶ [AssetStore: DRAFT]
     │
     ├─ Step 3: Verifier (冶炼)   ──▶ VerifiedAsset[]  ──▶ [AssetStore: VERIFIED]
     │
     └─ Step 4: Aggregator (精炼) ──▶ RefinedAsset[]   ──▶ [AssetStore: REFINED]
```

---

## 2. 节点接力契约 (Interconnect Contracts)

### 2.1 上下文注入 (Context Injection)
每一道工序运行前，Controller 必须注入 `RefineryContext`：
- `store`: 指向当前 Repo 的 `AssetStore` 实例。
- `registry`: 指向 `GlobalEvidenceIndex`，用于 P1 证据织补。
- `config`: 当前工序的分级加工参数（如破碎强度）。

### 2.2 原子性提交 (Atomic Commits)
工序节点**严禁直接修改资产账本**。资产更新必须遵循“生产-汇报”模式：
1.  节点完成计算并产出 `TransformationResult`。
2.  Controller 校验结果符合 CP-XX 契约。
3.  Controller 统一调用 `AssetStore.update()` 记录加工履历。

---

## 3. 错误门禁与降级 (Error Gates & Fallbacks)

| 失败阶段 | 现象 | 处理策略 | 资产状态变迁 |
| :--- | :--- | :--- | :--- |
| **Normalizer** | 无法物理正常化 | 标记为“恶矿 (Bad Ore)”，停止后续加工。 | `RAW` -> `STALLED` |
| **Distiller** | LLM 超时或无法解析 | 指数级退避重试，记录错误日志。 | `NORMALIZED` -> `ERROR` |
| **Verifier** | Git 权限缺失 / 磁盘异常 | 保持 `DRAFT` 状态，跳过该步，标记为“未验证”。 | `DRAFT` -> `DRAFT (Unverified)` |
| **Aggregator** | 语义指纹冲突 | 生成“冲突警告”，挂起合并动作，待人工介入。 | `VERIFIED` -> `NEEDS_REVIEW` |

---

## 4. 运行拓扑 (Topology)

系统采用 **“前店后厂”** 部署模式：

### 4.1 守护进程层 (Daemon / The Factory Floor)
- **职责**：执行 `Capture`、`Indexing` 和 `Continuous Mining` (Normalizer + Distiller)。
- **特征**：轻量级、高并发、资源隔离。

### 4.2 CLI 工具层 (CLI / The Master Suite)
- **职责**：执行重型工序 `Smelting` (需访问源码) 和 `Refining` (跨会话分析)。
- **特征**：独占式运行、深度扫描、支持人工审阅。

---

## 5. 并发控制 (Concurrency)

- **行级锁**：在 `AssetStore` 更新时，基于 `identity_hash` 进行加锁，防止多 Session 并发蒸馏导致资产版本冲突。
- **资源限额**：LLM 选矿节点通过 `Bottleneck` 限制最大并发并发数，防止 Token 消耗瞬间爆炸。

---

## 6. 验收证明 (Orchestration Proofs)

1.  **闭环测试**：给定一个含 5000 行 Tool Call 的原始 Session，证明资产能自动流转至 `VERIFIED` 状态并挂载了对账结果。
2.  **断点续传证明**：在 `Verifier` 运行中途强杀进程，重启后账本应能从最后一个成功的 `state_history` 恢复，不丢失数据。
3.  **冲突一致性测试**：并发处理两个相似 Session，证明 `AssetStore` 最终只保留了一个主权资产。
