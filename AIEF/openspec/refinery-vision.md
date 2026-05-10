# Refinery Pipeline: 愿景与工程路线 (Vision & Engineering Roadmap)

> **状态：** 愿景草案 (2026-05-11)
>
> **角色：** 炼矿中心 (Refinery) 设计体系的入口文档。本文定义为什么我们需要从“线性管道”转向“工业化炼矿中心”，以及如何分阶段、带契约、带门禁地推进这一架构转型。
>
> **关联文档：**
> - `AIEF/openspec/refinery-pipeline.md` — 基础架构定义
> - `AIEF/openspec/refinery-contracts-atlas.md` — 资产演进契约索引

---

## 1. 为什么需要 Refinery

Loamlog 的 v0.6.0 验证了一个基本命题：**AI 编程工具的对话可以被自动化采集、脱敏并转化为 Issue 草稿。**

但目前的“线性管道”架构（Capture → Archive → Distill → Sink）遇到了严重的结构性天花板：

| 现状问题 | 根本原因 | 风险 |
| :--- | :--- | :--- |
| **信噪比极低** | LLM 面对的是“未经破碎的原矿”，包含 60% 以上的工具噪音。 | Token 浪费、萃取准确率波动。 |
| **幻觉不可控** | 萃取出的 Asset 只是语义猜想，没有与磁盘事实、Git 历史进行物理校验。 | 产出物不可信，用户审批成本高。 |
| **碎片化严重** | 一个工程问题分布在多个 Session 中，系统无法进行跨会话的价值聚合。 | 产出大量重复、残缺的草稿，制造信息噪声。 |
| **架构耦合** | 萃取逻辑（Distiller）与 Prompt 工程（Normalization）混在一起。 | 难以维护，无法通过统一的门禁提升资产“品位”。 |

**核心判断：**
> 我们不缺“油井”（Capture），也不缺“货车”（Sink），我们缺的是一座能对原矿进行物理降噪、化学萃取、逻辑冶炼和多矿脉精炼的**工业化选矿厂 (Refinery Plant)**。

---

## 2. 炼矿中心愿景 (Refinery Vision)

Refinery 的目标不是“让 Prompt 写得更好”，而是建立一套**以资产演进为核心**的工业化提炼体系。

| 维度 | 目标状态 |
| :--- | :--- |
| **交互模型** | 从“单次触发”转向“持续挖矿 (Continuous Mining)”。 |
| **数据处理** | 从“字符串拼接”转向“结构化正常化 (Normalized Session)”。 |
| **质量控制** | 从“语义直觉”转向“事实冶炼 (Smelting/Verification)”。 |
| **价值聚合** | 从“会话孤岛”转向“跨会话精炼 (Aggregator/Refining)”。 |
| **契约精神** | **Contract-first**：工序之间通过严密的 Schema 进行交付，不靠口头约定。 |

---

## 3. 资产演进路径 (Asset Lifecycle)

我们定义的不是数据流，而是**价值升华链**：

1.  **RAW (原矿)**：全量现场快照（含噪音）。
2.  **NORMALIZED (粗矿)**：物理截断、元数据对齐、结构化降噪。
3.  **CANDIDATE (精矿)**：语义提取出的资产雏形（含幻觉风险）。
4.  **VERIFIED (粗金属)**：通过 Git/磁盘/静态工具验证后的确凿事实。
5.  **REFINED (纯金属)**：跨会话合并、去重后的高质量唯一资产。

---

## 4. 工程推进阶段 (Stages)

Refinery 按 5 个阶段推进，严禁在没有 Contract 的情况下进入实现。

### 3.1 Stage 1：Architecture & Contracts (当前)
**目标**：确定四道工序的边界和交付契约。
- **产物**：`Refinery Vision`、`Contracts Atlas`、`Workshop Designs`。
- **门禁**：新人能 5 分钟内讲清“冶炼”和“选矿”的区别。

### 3.2 Stage 2：Refinery Base Slice (VS-01)
**目标**：在 `distill` 引擎中强插 `Normalizer` 接口，证明降噪价值。
- **不变量**：LLM 只能看到降噪后的 `NormalizedSession`，不得读 RAW。
- **证明**：Token 消耗下降 ≥30%，测试集产出质量不下降。

### 3.3 Stage 3：Verification Smelting (VS-02)
**目标**：接入 Git/File 系统验证逻辑，证明消除幻觉的能力。
- **证明**：生成一个包含真实 Git Hash 和经过 `fs` 校验路径的 Issue。

### 3.4 Stage 4：Aggregation Refining (VS-03)
**目标**：证明跨 Session 合并 2 个相关对话为一个 Issue 的能力。
- **证明**：对两个讨论同一 Bug 的对话，系统只产出一个聚合后的结果。

---

## 5. 核心反模式 (Anti-patterns)

1.  **Skip Normalization**：为了省事直接把 Raw 丢给 LLM。
2.  **Semantic Smelting**：用 LLM 去“验证”另一个 LLM 的猜想，而不是去查磁盘。
3.  **Ghost Assets**：允许没有证据链（Evidence Span）的资产进入 `VERIFIED` 状态。
4.  **Prompt Mixing**：在 Distiller 里写 Normalization 的截断逻辑。
5.  **Implementation-first**：没有工序设计和契约表格就去写 TS 代码。

---

## 6. 下一步

1.  完成 `AIEF/openspec/refinery-contracts-atlas.md`，定义各阶段 Schema。
2.  细化各 Workshop 的“契约包 (Contract Packs)”。
