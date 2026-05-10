# Refinery Workshop 3: Refining (Aggregator) — 精炼车间设计文档

> **Workshop Role:** Temporal Refining / 跨会话聚合与纯化
> **Goal:** 将来自不同会话的碎片资产合并为完整、唯一的纯金属 (Refined Asset)，消除冗余与碎片化。

## 1. 需求定义 (Requirements)

### 1.1 业务背景
在真实开发中，同一个工程问题（如一个复杂的 Bug 或一个大特性的设计）往往分布在多个时间点、多个 AI 工具的会话中：
1. **碎片化**：Claude 里讨论了 A 部分，OpenCode 里讨论了 B 部分。
2. **冗余性**：多次询问同一个问题，产出了内容相似但 ID 不同的草稿。
3. **缺乏演进**：无法看到一个问题从“发现”到“修复验证”的完整全生命周期。

### 1.2 核心功能
- **跨会话关联 (Correlation)**：通过标识符（Repo, File, Topic）识别属于同一个工程话题的资产。
- **资产合并 (Merging)**：将多个相似资产的证据链（Evidence Spans）和描述文本进行逻辑合并。
- **指纹去重 (Deduplication)**：利用内容哈希防止相同结果被多次重复投递。
- **版本演进记录**：追踪资产从 `DRAFT` 到 `VERIFIED` 再到 `REFINED` 的变化过程。

---

## 2. 验收场景 (Acceptance Scenarios)

| 场景 | 输入状态 | 预期结果 (验收点) |
| :--- | :--- | :--- |
| **多会话讨论同一 Bug** | Session A (发现) + Session B (定位) | 生成一个聚合后的 Issue，包含 A 的现象描述和 B 的定位证据。 |
| **重复提问** | 两次完全相同的对话产出的 Candidate | 自动合并，保留置信度最高的一个，并将另一个标记为 `MERGED`。 |
| **跨工具链协作** | Claude (设计) + Cursor (实现) | 生成一个 PRD 草稿，整合两者的上下文信息。 |
| **证据累加** | 新 Session 提供了更具体的报错堆栈 | 将新证据追加到已有的 `VerifiedAsset` 中，不创建新记录。 |

---

## 3. 业务约束 (Business Constraints)

- **唯一性原则**：同一个目标（如 GitHub Repo）在同一时间段内不应收到重复的 Issue。
- **可回溯性**：合并后的资产必须保留所有原始 Session 的引用。
- **增量处理**：精炼过程应支持增量扫描，不应每次都重新处理全量历史。

---

## 4. 技术方案 (Technical Plan)

### 4.1 关联主键定义
资产关联采用 **“三段式指纹”**：
`AssetIdentity = SHA256(TargetRepo : DistillerType : SemanticTopic)`
- `SemanticTopic` 可由 LLM 提取或基于核心文件路径生成。

### 4.2 聚合策略
1. **证据链合并 (Evidence Append)**：简单地将所有 `EvidenceSpan` 数组合并并去重。
2. **描述文本合成 (Text Synthesis)**：若冲突较小，直接拼接；若冲突较大，调用一次“廉价”的 LLM（如 GPT-4o-mini）进行文本总结。
3. **状态晋升**：若其中一个资产已通过 `Smelting` 验证，则聚合后的资产继承 `VERIFIED` 状态。

### 4.3 执行位置
在 DAG 的 `aggregator` 节点运行，该节点具有跨 Session 访问权限。

```typescript
interface Aggregator {
  /** 扫描资产库，执行合并动作 */
  refine(assets: VerifiedAsset[]): Promise<RefinedAsset[]>;
}
```

---

## 5. 风险与规避 (Risks)

- **风险 1：误合并。** 将两个不同但相似的问题合并在了一起。
  - **规避**：引入“语义相似度”阈值（如 Jaccard > 0.8）；合并后的资产在 `review` 界面显示合并来源，允许人工拆分。
- **风险 2：处理大规模历史资产时的性能问题。**
  - **规避**：使用 `loam list --pending` 仅处理未审批的活跃资产。
