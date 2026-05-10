# Refinery Workshop 3: Refining (Aggregator) — 精炼车间规格说明书

> **状态：** 设计中 (2026-05-11)
>
> **角色：** 定义跨会话 (Cross-session) 的资产关联、合并与纯化逻辑。这是炼矿中心的终极增值环节，旨在通过“多矿脉合并”解决碎片化和冗余问题。
>
> **关联契约：** `CP-04 (RefinedAsset Contract)`

---

## 1. 精炼目标 (Workshop Goals)

精炼车间不负责“挖掘原始信号”，其职责是**跨域聚合与去重**：

- **跨会话关联 (Cross-session Correlation)**：识别分布在不同时间、不同 AI 工具中的同话题资产。
- **价值升华 (Synthesis)**：将碎片化的证据链和描述合并为更完整的工程洞察。
- **冗余控制 (Deduplication)**：确保一个 Repo 的同一逻辑问题只产生一份主资产。

---

## 2. 资产身份指纹 (Asset Identity Fingerprint)

精炼的第一步是确定资产的“身份证号”，防止“同物不同名”：

```text
Refined_ID = SHA256(Target_Repo : Distiller_Type : Semantic_Topic_Key)
```

- **Target_Repo**：资产归属的 Repo 路径。
- **Distiller_Type**：萃取器类型（如 `issue-draft`）。
- **Semantic_Topic_Key**：由选矿阶段提取的语义主键（如 `React-Query-StaleTime-Bug`）。

---

## 3. 合并与精炼策略 (Merging Strategies)

当多个 `VerifiedAsset` 命中同一个 `Refined_ID` 时，执行以下“精炼”动作：

| 维度 | 处理策略 | 说明 |
| :--- | :--- | :--- |
| **证据链 (Evidence)** | **Set Append** | 合并所有 `EvidenceSpan`，按时间序排列，去除重复的 Hash。 |
| **描述 (Content)** | **Incremental Synthesis** | 保留最详细的一份，并以“补丁”形式增加其他会话中的独特发现。 |
| **状态 (Status)** | **Priority Inheritance** | 只要有一个输入是 `VERIFIED`，精炼后的资产即为 `VERIFIED`。 |
| **信心 (Score)** | **Cumulative Bonus** | 更多来源的证据会小幅提升最终信心分（上限 1.0）。 |

---

## 4. 验收场景 (Proof Scenarios)

| 场景 | 输入数据 | 预期精炼结果 |
| :--- | :--- | :--- |
| **跨工具协同** | Claude 发现 Bug + Cursor 提供修复思路。 | 产生一个合并后的 Issue，标题含两者摘要，描述含完整修复建议。 |
| **重复萃取** | 两次完全相同的对话。 | `is_duplicate: true`，不产生新资产，仅更新旧资产的 `updated_at`。 |
| **矿脉演进** | 第一天讨论 Bug，第二天讨论其根因。 | 自动合并，描述从“现象”演进为“现象+根因”。 |

---

## 5. 负面约束 (Forbidden Behaviors)

- **禁止强行合并低相似度资产**：若 `SemanticTopic` 差异较大，严禁合并，宁可保留两条。
- **禁止丢失原始溯源**：`RefinedAsset` 必须保留所有参与合并的 `sessionId`。
- **禁止自动覆盖已审批资产**：若用户已 Review 并批准了资产 A，精炼环节不得在未提醒的情况下直接修改 A。

---

## 6. 待决问题 (Open Questions)

- **多 Distiller 交叉精炼**：例如 `Pitfall` 和 `Issue` 是否可以合并？
- **初判**：Stage 1 仅支持同类型 Distiller 内部精炼，跨类精炼留待 M6。
- **向量检索依赖**：当资产规模 > 1000 时，是否需要引入向量检索来辅助 `Identity Matching`？
- **初判**：当前基于 `Topic_Key` 的字符串匹配足以支撑 v0.6.0。
