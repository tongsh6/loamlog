# Refinery Pipeline Specification — 炼矿中心管道规格说明书

> **Status:** Draft / 草案 (Strategic Pivot)
>
> 本文档定义 Loamlog 从“线性采集-蒸馏”架构向“工业化炼矿中心”架构的战略转型。将原有的 distill 引擎拆解为具备物理、化学和逻辑加工能力的四道标准工序。

## 1. 核心模型：资产演进链 (Asset Evolution Chain)

在炼矿中心架构下，数据不再是简单的“流”，而是不断提升“品位”的**资产演进**：

| 状态 | 名称 | 形态 | 目标 |
| :--- | :--- | :--- | :--- |
| **RAW** | **原矿 (Raw Ore)** | Provider 采集的原始消息、工具调用、文件快照 | 完整保存现场 |
| **NORMALIZED** | **粗矿 (Crushed Ore)** | 经过降噪、截断、格式规约后的结构化数据 | 提升信息密度，降低 LLM 成本 |
| **CANDIDATE** | **精矿 (Concentrate)** | LLM 萃取出的 AssetCandidate 草稿 | 识别潜在价值信号 |
| **VERIFIED** | **粗金属 (Crude Metal)** | 挂载了真实 Git 证据、通过静态扫描验证后的资产 | 消除幻觉，固化事实 |
| **REFINED** | **纯金属 (Refined Metal)** | 跨 Session 合并、去重、语境增强后的最终资产 | 保证完整性与唯一性 |
| **DELIVERY** | **成品零件 (Product)** | 符合 GitHub/Notion 模板要求的交付物 | 即可投递/即插即用 |

---

## 2. 四大核心工序 (The Four Workshops)

### 2.1 破碎车间 (Crushing): `Session Normalizer`
*   **输入**：`SessionArtifact (RAW)`
*   **输出**：`NormalizedSession (NORMALIZED)`
*   **处理规则**：
    *   **噪声剥离**：将冗余的 Tool Call Output（如长堆栈、大数据块）压缩为摘要。
    *   **上下文注入**：自动填充 `repo`、`branch`、`env` 等元数据。
    *   **推理隔离**：将 AI 的 `reasoning` 片段从主文本流中分离，作为辅助参考。

### 2.2 选矿车间 (Beneficiation): `Signal Distiller`
*   **输入**：`NormalizedSession`
*   **输出**：`AssetCandidate[] (CANDIDATE)`
*   **处理规则**：
    *   **语义识别**：利用 LLM 识别 Issue、Knowledge、Pitfall 等信号。
    *   **初次评分**：给出置信度（Confidence）和重要度（Severity）。
    *   **信号提取**：提取初步的证据引用（LLM 视角的消息引用）。

### 2.3 冶炼车间 (Smelting): `Evidence Verifier` (关键补齐)
*   **输入**：`AssetCandidate`
*   **输出**：`VerifiedAsset (VERIFIED)`
*   **处理规则**：
    *   **事实还原**：根据 Candidate 提到的代码路径，去磁盘/Git 捞取真实的 `EvidenceSpan`。
    *   **逻辑校验**：运行静态分析工具（`tsc`, `lint`）或执行测试，验证 Candidate 描述的 Bug 是否真实存在。
    *   **证据固化**：将模糊的文字引用升级为含 `vcs_hash`、`file_path`、`line_range` 的确定性证据。

### 2.4 精炼车间 (Refining): `Cross-Session Aggregator` (关键补齐)
*   **输入**：`VerifiedAsset[]`
*   **输出**：`RefinedAsset (REFINED)`
*   **处理规则**：
    *   **跨矿脉关联**：利用 Repo、文件指纹、语义向量识别不同 Session 产出的同类资产。
    *   **合并升华**：将多个碎片化的资产合并为一个完整的深度洞察。
    *   **去重**：利用资产指纹，确保相同问题不会重复投递。

---

## 3. 管道拓扑 (Pipeline Topology)

炼矿中心的执行流由 `packages/pipeline` 的 DAG 引擎驱动，节点定义如下：

```text
[CAPTURE] 
    │
    ▼
[NORMALIZER] (Physical Prep)
    │
    ▼
[DISTILLER]  (Chemical Extraction / LLM)
    │
    ▼
[VERIFIER]   (Logical Smelting / Tools) <─── 冶炼环节
    │
    ▼
[AGGREGATOR] (Temporal Refining / Multi-session) <─── 精炼环节
    │
    ▼
[DELIVERY]   (Sink / Approval)
```

---

## 4. 跨会话 (Cross-Session) 处理要求

精炼环节必须满足以下逻辑契约：
1.  **标识符对齐 (Identity Matching)**：使用 `repo:branch:feature_path` 作为资产的关联主键。
2.  **时间窗合并 (Temporal Merging)**：对一定时间窗口（如 24h）内的相关资产进行“熔合”。
3.  **增量更新 (Incremental Updates)**：如果检测到已有相同资产，新的证据应“挂载”到旧资产上，而不是新建。

---

## 5. 实施路线图 (Implementation Roadmap)

### Phase 1: 破碎与选矿 (基线巩固)
- 实现 `Session Normalizer` 接口。
- 迁移现有 `issue-draft` 到 `NormalizedSession` 契约。

### Phase 2: 冶炼与验证 (质量飞跃)
- 引入 `Evidence Verifier` 节点。
- 实现 `GitProvider`（拉取真实 diff/log）和 `StaticScanProvider`（调用本地工具）。

### Phase 3: 精炼与跨会话 (价值规模化)
- 实现 `Cross-Session Aggregator`。
- 支持基于 `loamlist` 状态的增量萃取。

---

## 6. 验证标准 (Acceptance)

1.  **脱盐效果**：LLM 处理的平均 Token 长度下降 ≥30%，且信息捕获不丢失。
2.  **冶炼纯度**：生成的 Issue 必须包含至少一个已验证的磁盘文件路径和代码片段。
3.  **精炼去重**：对同一问题的多次对话，最终 Sink 只产生一个聚合后的 Issue。
