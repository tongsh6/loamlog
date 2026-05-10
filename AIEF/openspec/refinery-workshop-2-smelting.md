# Refinery Workshop 2: Smelting (Verifier) — 冶炼车间设计文档

> **Workshop Role:** Logical Smelting / 逻辑还原与验证
> **Goal:** 将精矿 (Asset Candidate) 还原为带证据、经确认的粗金属 (Verified Asset)，消除 AI 幻觉。

## 1. 需求定义 (Requirements)

### 1.1 业务背景
LLM 产出的资产草稿（Candidate）虽然语义正确，但往往包含“事实噪音”：
1. **路径幻觉**：提到的代码文件路径在磁盘上并不存在。
2. **逻辑误报**：宣称某个函数有 Bug，但实际该函数在最新版本中已重构或修复。
3. **证据空泛**：仅引用对话文字，缺乏真实的 Git 提交记录或代码片段支撑。

### 1.2 核心功能
- **事实对齐 (Fact Reconciliation)**：自动检查 Candidate 提到的文件、类、函数是否在当前 Repo 中真实存在。
- **证据补全 (Evidence Enrichment)**：自动拉取与信号时间点匹配的 Git Commit Hash、Diff 和代码片段。
- **静态扫描 (Static Verification)**：调用本地 `tsc`、`lint` 或 `grep` 验证 AI 的猜想。
- **可信度定级**：根据验证结果，将资产标记为 `VERIFIED`（已验证）、`UNVERIFIED`（未验证）或 `REJECTED`（已证伪）。

---

## 2. 验收场景 (Acceptance Scenarios)

| 场景 | Candidate 状态 | 预期结果 (验收点) |
| :--- | :--- | :--- |
| **文件路径正确** | 提到 `src/parser.ts` 有错 | Verifier 找到该文件，并自动提取相关代码行作为 `EvidenceSpan`。 |
| **路径幻觉** | 提到一个不存在的路径 `legacy/core.js` | Verifier 标记该资产为 `REJECTED`，原因：路径不存在。 |
| **Git 证据缺失** | 仅有文字描述，无 Hash | Verifier 根据会话时间点，自动匹配最近的 Git Commit 并挂载到资产上。 |
| **逻辑验证 (Grep)** | 宣称某处使用了 `deprecated_api()` | Verifier 运行 `grep` 确认源码中确实存在该调用。 |
| **静态门禁 (TSC)** | 宣称某处有类型错误 | Verifier 针对该文件运行 `tsc`，若发现相同错误，标记为 `VERIFIED` 并附带编译器输出。 |

---

## 3. 业务约束 (Business Constraints)

- **本地优先**：冶炼过程主要依赖本地文件系统和工具链。
- **性能阈值**：冶炼环节是异步的，但单个资产的验证不应超过 30 秒。
- **非侵入性**：Verifier 只读源码，不得修改用户代码或产生副作用（如提交代码）。
- **可扩展性**：支持通过插件方式接入不同的验证工具（如 Semgrep, SonarQube）。

---

## 4. 技术方案 (Technical Plan)

### 4.1 核心契约
```typescript
interface VerifierPlugin {
  name: string;
  /** 执行验证，将 Candidate 升级为 VerifiedAsset */
  verify(candidate: AssetCandidate, ctx: VerifierContext): Promise<VerificationReport>;
}

interface VerificationReport {
  status: "verified" | "unverified" | "rejected";
  evidence: EvidenceSpan[]; // 补全后的证据链
  reason?: string;         // 验证失败或证伪的理由
  score_modifier: number;  // 对资产信心的修正值（-1.0 到 1.0）
}
```

### 4.2 冶炼节点集成 (DAG Node)
在 `packages/pipeline` 中新增 `verifier` 节点，位于 `run_distiller` 之后。

```text
[run_distiller] ──> [process_results (Filter)] ──> [verifier (Smelting)]
```

### 4.3 预置 Verifier 实现
1. **GitVerifier**：调用本地 `git` 命令，根据会话时间戳和 Repo 信息，补全 `vcs_ref` 和 `diff`。
2. **FileVerifier**：验证文件路径是否存在，并利用 `fs.readFile` 提取代码片段作为证据。
3. **StaticVerifier**：支持运行预定义的扫描命令（如 `pnpm lint`），匹配 Candidate 描述的问题。

---

## 5. 风险与规避 (Risks)

- **风险 1：环境不一致。**
  - **规避**：Verifier 必须记录执行环境信息（Node 版本、OS、Git 分支），确保证据的可追溯性。
- **风险 2：验证工具耗时过长。**
  - **规避**：支持设置超时机制；对于重量级工具（如全量编译），仅在 `Continuous` 模式或手动触发时运行。
