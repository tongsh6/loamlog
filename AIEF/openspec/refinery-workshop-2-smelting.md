# Refinery Workshop 2: Smelting (Verifier) — 冶炼车间规格说明书

> **状态：** 设计中 (2026-05-11)
>
> **角色：** 定义精矿 (Asset Candidate) 到粗金属 (Verified Asset) 的逻辑还原与物理验证流程。这是炼矿中心的核心增值环节，旨在通过“事实还原”消除 LLM 幻觉。
>
> **关联契约：** `CP-03 (VerifiedAsset Contract)`

---

## 1. 冶炼目标 (Workshop Goals)

冶炼车间不负责“挖掘新想法”，其职责是**事实核查与证据固化**：

- **事实回归 (Fact Grounding)**：验证 Candidate 提到的所有路径、代码、符号在磁盘上是否真实存在。
- **证据冷冻 (Evidence Freezing)**：拉取当前时间点的 Git Hash，确保存量资产不因代码演进而失效。
- **逻辑证伪 (Falsification)**：通过静态工具证明 Candidate 的猜想是否在逻辑上成立。

---

## 2. 冶炼等级 (Verification Tiers)

并不是所有资产都需要全量冶炼，系统支持三级验证深度：

| 等级 | 名称 | 动作 | 产物 |
| :--- | :--- | :--- | :--- |
| **L1** | **路径验证 (Existence)** | `fs.exists` 检查提到的文件路径。 | `VerifiedPath` |
| **L2** | **内容还原 (Content)** | 读取文件指定行，提取真实 `snippet`。 | `VerifiedSnippet` |
| **L3** | **静态扫描 (Static)** | 运行 `tsc` / `lint` / `grep` 验证逻辑。 | `StaticVerifiedAsset` |
| **L4** | **Git 固化 (Git Anchoring)** | 绑定 `commit_sha` 和 `diff`。 | `AnchoredAsset` |

---

## 3. 冶炼逻辑：事实核查清单 (Fact-check List)

每一个 `verifier` 插件必须执行以下核查：

1.  **路径有效性**：`candidate.evidence_guesses.path` 必须在 `repo_path` 下可寻址。
2.  **符号检测**：若提到函数 `foo()`，在相应文件中 `grep` 是否存在该字符。
3.  **时空一致性**：确保验证时使用的代码版本与 Session 捕获时尽量接近（通过 `vcs_context` 对齐）。

---

## 4. 冶炼报告与信心修正式

冶炼结果将生成一个 `VerificationReport`，并直接影响资产的“品位”（品位 = 品质分数）：

```text
Final_Score = Candidate_Confidence * (1.0 + Score_Modifier)
```

- **Status: VERIFIED** -> `Score_Modifier: +0.2` (事实确凿)
- **Status: UNVERIFIED** -> `Score_Modifier: 0` (无法验证，保持原样)
- **Status: REJECTED** -> `Score_Modifier: -0.8` (路径不存在或已被证伪)

---

## 5. 验收场景 (Proof Scenarios)

| 场景 | 验证动作 | 预期报告 |
| :--- | :--- | :--- |
| **正确引用** | AI 提到 `src/index.ts` 第 12 行有错，且文件确实存在。 | `status: verified`, 自动附带第 12 行代码片段。 |
| **路径幻觉** | AI 提到 `src/non-existent.ts`。 | `status: rejected`, `reason: path not found`. |
| **Git 自动关联** | Session 无 Hash，但 Repo 处于 Git 仓库。 | `status: verified`, 自动补全最近一次提交的 `sha1`. |

---

## 6. 待决问题 (Open Questions)

- **性能隔离**：L3 级的 `tsc` 运行太慢，是否应该仅在 `Continuous` 模式下异步运行？
- **环境隔离**：是否需要支持在 Docker 或临时容器中运行验证以防副作用？
- **初判**：第一阶段仅支持本地 `ReadOnly` 验证（L1-L2），L3/L4 放在集成阶段。
