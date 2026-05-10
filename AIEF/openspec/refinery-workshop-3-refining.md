# Refinery Workshop 3: Refining (Aggregator) — 精炼车间规格说明书 (多源价值合并版)

> **Workshop Role:** Temporal & Cross-Mining Refining
> **Goal:** 将来自不同工具、不同会话、甚至不同工序（冶炼出的缺口 vs 织补出的证据）进行最终聚合。

---

## 1. 精炼目标 (Workshop Goals)

精炼车间不再仅仅是去重，它的核心任务是**“合并价值缺口”**：

- **缺口聚合 (Gap Aggregation)**：如果两个 Session 都提到了同一个未实现的建议，将其合并为一个高优先级的 Issue。
- **证据链升华 (Evidence Synthesis)**：将 P0 发现的“代码缺口”与 P1 发现的“报错日志”熔炼成一个具备完整因果关系的资产。

---

## 2. 精炼逻辑：三段式指纹升级

```text
AssetIdentity = SHA256(Target_Repo : Distiller_Type : Gap_Context)
```

- **Gap_Context**：不再仅仅是语义主题，而是包含受影响的物理实体（如 `ClassName:MethodName`）。这确保了不同 AI 针对同一行代码给出的不同建议能被关联在一起。

---

## 3. 验收场景 (Acceptance Scenarios)

| 场景 | 输入数据 | 预期结果 (验收点) |
| :--- | :--- | :--- |
| **跨工具缺口合并** | Claude 说改 A，Cursor 也说改 A | 产出一个唯一 Issue，标注“多方建议修改，且当前均未实现”。 |
| **证据补全** | Session A 发现缺口 + Session B 提供了报错证据 | 产出一个 `VerifiedAsset`，证据链横跨两个会话。 |

---

## 4. 业务约束 (Business Constraints)

- **保留执行上下文**：精炼后的资产必须能清晰区分出哪些是“建议内容”，哪些是“物理验证发现”。
- **增量精炼**：优先处理最近 7 天内的活跃缺口。
