# AI Completion Static Scan Gate | AI 完成后的静态扫描门禁

> **Status:** Active Plan / 活跃计划
>
> This document defines the durable target state for static code scanning after AI-assisted implementation. It is the planning entry for making every AI tool produce scan evidence, a Top N remediation plan, remediation results, and verification output.
>
> 本文档定义 AI 辅助实现完成后的静态代码扫描门禁终局。它是后续建设统一扫描证据、Top N 修复计划、处理结果和复扫验证的规划入口。

## Background | 背景

Loamlog is itself an AI collaboration asset platform. Code changes may be produced by different tools such as Codex, Claude Code, Cursor, OpenCode, or future agents. If each tool relies on memory or informal discipline, static scan behavior will drift: one tool may run typecheck only, another may run lint, and another may skip evidence recording.

Loamlog 本身是 AI 协作资产平台。代码实现可能由 Codex、Claude Code、Cursor、OpenCode 或未来 agent 完成。如果仅依赖工具记忆或口头约定，静态扫描行为会漂移：有的只跑 typecheck，有的只跑 lint，有的不会保留证据。

This work turns post-implementation quality control into an explicit cross-cutting gate. The goal is not merely to add a scanner command. The goal is to make every AI implementation leave a reproducible quality trail.

本计划将实现完成后的质量控制建模为显式切面门禁。目标不是只增加一个扫描命令，而是让每次 AI 代码实现都留下可复现的质量轨迹。

## Goals | 目标

- Every AI tool must run static scanning after code implementation. | 任何 AI 工具完成代码实现后必须主动运行静态扫描。
- Scan outputs must be preserved as raw logs and normalized structured data. | 扫描输出必须同时保留原始日志和归一化结构化数据。
- Findings must be ranked and the Top N must have explicit handling decisions. | 扫描发现必须排序，Top N 必须有明确处理决策。
- Actionable Top N findings should be fixed before final delivery when feasible. | 可处理的 Top N 问题应在最终交付前修复。
- Deferred or false-positive findings must include reasons and evidence. | 延后处理或误报必须记录原因和证据。
- The same gate should be usable locally, in AI tools, and in CI. | 同一门禁应可被本地、AI 工具和 CI 复用。
- The gate must remain orthogonal to provider, archive, distill, sink, and CLI business flows. | 门禁必须与 provider、archive、distill、sink、CLI 业务流程保持正交。

## Non-Goals | 非目标

- Do not embed scanner logic inside provider, distiller, sink, or archive business modules. | 不把扫描逻辑嵌入 provider、distiller、sink 或 archive 业务模块。
- Do not require all historical findings to be fixed in the first implementation batch. | 不要求第一批实现修复所有历史问题。
- Do not make external sinks or remote reporting mandatory. | 不强制启用外部投递或远程报告。
- Do not treat AI auto-fix as safe for every finding. High-risk fixes still need explicit defer or human review. | 不把 AI 自动修复视为适用于所有问题；高风险修复仍需显式延后或人工审阅。

## Target Capability | 目标能力

```text
AI implementation completed
  -> discover changed files and scope
  -> run configured static scan profile
  -> preserve raw scanner output
  -> normalize findings
  -> rank findings
  -> select Top N
  -> create remediation plan
  -> fix actionable Top N findings
  -> record fix/defer/false-positive decisions
  -> rerun scan
  -> write verification summary
  -> final AI response references the report
```

The final state should support three scan profiles:

终局应支持三种扫描 profile：

| Profile | Purpose | Typical Tools | Blocking |
|---|---|---|---|
| `fast` | Local AI completion loop | `tsc`, Biome lint, package audit | Yes for changed-code high severity |
| `security` | Secret and SAST checks | Gitleaks, Semgrep | Yes for critical/high security findings |
| `ci` | Full repository quality gate | Typecheck, lint, test, audit, secrets, SAST | Yes according to CI policy |

## Report Contract | 报告契约

Each run writes to:

每次运行写入：

```text
AIEF/reports/static-scan/<run-id>/
  metadata.json
  scan.raw.log
  scan.normalized.json
  topN.plan.md
  topN.results.md
  rerun.raw.log
  summary.md
```

`run-id` uses UTC timestamp plus a short suffix when needed:

`run-id` 使用 UTC 时间戳，必要时追加短后缀：

```text
2026-05-01T04-30-00Z
2026-05-01T04-30-00Z-2
```

### `metadata.json`

```json
{
  "runId": "2026-05-01T04-30-00Z",
  "startedAt": "2026-05-01T04:30:00.000Z",
  "completedAt": "2026-05-01T04:33:10.000Z",
  "profile": "fast",
  "topN": 5,
  "git": {
    "branch": "main",
    "head": "abcdef0",
    "dirty": true
  },
  "scope": {
    "changedFiles": ["packages/example/src/index.ts"],
    "includePatterns": ["packages/**/*.ts", "plugins/**/*.ts"],
    "excludePatterns": ["**/dist/**", "**/node_modules/**"]
  },
  "tools": [
    {
      "name": "typescript",
      "command": "pnpm run typecheck",
      "exitCode": 0
    }
  ]
}
```

### `scan.normalized.json`

```json
{
  "findings": [
    {
      "id": "typescript:packages/example/src/index.ts:12:5",
      "tool": "typescript",
      "ruleId": "TS2322",
      "severity": "high",
      "category": "type-safety",
      "file": "packages/example/src/index.ts",
      "line": 12,
      "column": 5,
      "message": "Type 'string' is not assignable to type 'number'.",
      "evidence": "compiler output excerpt",
      "inChangedFile": true,
      "confidence": 0.95,
      "rankScore": 95
    }
  ]
}
```

### `topN.plan.md`

Records the ranking policy and selected findings.

记录排序策略与入选问题。

```md
# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | typescript | high | packages/example/src/index.ts | Changed file type error | fix |
```

### `topN.results.md`

Records how each selected finding was handled.

记录每个 Top N 问题的处理方式。

```md
# Top N Fix Results

| Rank | Status | Handling | Verification |
|---|---|---|---|
| 1 | fixed | Narrowed value before assignment | typecheck passed |
| 2 | deferred | Existing unrelated issue outside changed files | documented in summary |
| 3 | false_positive | Test fixture intentionally uses placeholder token | gitleaks allowlist pending |
```

## Finding Model | 扫描发现模型

The internal model should stay scanner-agnostic:

内部模型应与具体扫描器解耦：

```text
StaticScanRun
  -> StaticScannerResult[]
  -> StaticFinding[]
  -> RankedFinding[]
  -> TopNFixPlan
  -> TopNFixResult
  -> VerificationResult
```

Suggested TypeScript shape:

建议 TypeScript 形态：

```ts
export type StaticFindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export interface StaticFinding {
  id: string;
  tool: string;
  ruleId?: string;
  severity: StaticFindingSeverity;
  category: string;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  evidence?: string;
  inChangedFile: boolean;
  confidence: number;
  rankScore: number;
}

export type TopNHandlingStatus =
  | "fixed"
  | "deferred"
  | "false_positive"
  | "not_actionable"
  | "failed";
```

## Ranking Policy | Top N 排序策略

Default `TOP_N` is `5` unless the user or CI profile overrides it.

默认 `TOP_N` 为 `5`，除非用户或 CI profile 覆盖。

Ranking must be deterministic:

排序必须可复现：

```text
rankScore =
  severityWeight
  + categoryWeight
  + changedFileBonus
  + confidenceWeight
  + runtimeImpactBonus
  - falsePositivePenalty
```

Default weights:

默认权重：

| Signal | Weight |
|---|---:|
| critical severity | 1000 |
| high severity | 700 |
| medium severity | 400 |
| low severity | 100 |
| secret/security category | +300 |
| typecheck/runtime category | +250 |
| changed file | +200 |
| evidence/sink safety category | +200 |
| high confidence, `>= 0.9` | +100 |
| likely false positive | -300 |

Tie-breakers:

并列时按以下顺序打破：

```text
severity desc
rankScore desc
inChangedFile desc
tool asc
file asc
line asc
id asc
```

## Complete DAG | 完整 DAG

This is a cross-cutting quality gate and must be split as a DAG before implementation.

这是跨模块质量门禁，必须先按 DAG 拆分再实现。

```text
A_scan_config
  -> B_scope_detection
  -> C_scanner_execution
  -> D_raw_evidence_persistence
  -> E_finding_normalization
  -> F_finding_ranking
  -> G_topN_plan
  -> H_topN_remediation
  -> I_rerun_verification
  -> J_report_summary
  -> K_ai_final_response_contract

A_scan_config -> L_ci_integration
J_report_summary -> L_ci_integration

A_scan_config -> M_ai_tool_rule_distribution
J_report_summary -> M_ai_tool_rule_distribution
```

### A. Scan Config | 扫描配置

- Input: repository policy, package manager, available tools. | 输入：仓库策略、包管理器、可用工具。
- Output: scan profiles, tool commands, include/exclude patterns, Top N default. | 输出：扫描 profile、工具命令、包含/排除规则、Top N 默认值。
- Dependencies: none. | 依赖：无。
- Failure impact: no deterministic gate can run. | 失败影响：无法运行确定性的门禁。
- Acceptance: config file and root scripts exist; missing optional tools are reported, not silently ignored. | 验收：存在配置文件和根脚本；可选工具缺失会被报告而不是静默忽略。

### B. Scope Detection | 范围识别

- Input: git status/diff, include/exclude patterns. | 输入：git 状态/diff、包含/排除规则。
- Output: changed files, scan scope, dirty state. | 输出：变更文件、扫描范围、dirty 状态。
- Dependencies: A. | 依赖：A。
- Failure impact: scanner falls back to full-repo scope with a warning. | 失败影响：扫描器带 warning 回退到全仓范围。
- Acceptance: generated report records changed files and scope. | 验收：报告记录变更文件与扫描范围。

### C. Scanner Execution | 扫描执行

- Input: scan profile and scope. | 输入：扫描 profile 与范围。
- Output: raw command outputs with exit codes. | 输出：带退出码的原始命令输出。
- Dependencies: A, B. | 依赖：A、B。
- Failure impact: failed required scanner marks the run as failed; optional scanner marks warning. | 失败影响：必需扫描器失败则运行失败；可选扫描器失败则记录 warning。
- Acceptance: typecheck and lint can run through one command; audit/security scanners can be added without rewriting the executor. | 验收：typecheck 和 lint 可通过统一命令运行；audit/security 扫描器可扩展接入。

### D. Raw Evidence Persistence | 原始证据保存

- Input: scanner stdout/stderr/exit codes. | 输入：扫描器 stdout/stderr/退出码。
- Output: `scan.raw.log`, tool metadata. | 输出：`scan.raw.log` 与工具元数据。
- Dependencies: C. | 依赖：C。
- Failure impact: run must fail closed because evidence is mandatory. | 失败影响：由于证据必填，运行必须失败关闭。
- Acceptance: raw output is written even when scanners fail. | 验收：即使扫描失败，也写入原始输出。

### E. Finding Normalization | 问题归一化

- Input: raw outputs and scanner-specific parsers. | 输入：原始输出与扫描器解析器。
- Output: `scan.normalized.json`. | 输出：`scan.normalized.json`。
- Dependencies: D. | 依赖：D。
- Failure impact: run may continue with unparsed tool-level failure finding. | 失败影响：可继续运行，但生成工具级未解析失败 finding。
- Acceptance: TypeScript, Biome, audit, Gitleaks, and Semgrep each have a parser or documented fallback. | 验收：TypeScript、Biome、audit、Gitleaks、Semgrep 均有 parser 或已记录 fallback。

### F. Finding Ranking | 问题排序

- Input: normalized findings and ranking policy. | 输入：归一化问题与排序策略。
- Output: deterministic ranked findings. | 输出：确定性排序后的问题。
- Dependencies: E. | 依赖：E。
- Failure impact: Top N selection is not trustworthy. | 失败影响：Top N 选择不可信。
- Acceptance: same inputs produce same ranking order. | 验收：相同输入产生相同排序。

### G. Top N Plan | Top N 计划

- Input: ranked findings, `TOP_N`, changed file policy. | 输入：排序结果、`TOP_N`、变更文件策略。
- Output: `topN.plan.md`. | 输出：`topN.plan.md`。
- Dependencies: F. | 依赖：F。
- Failure impact: AI cannot justify selected fixes. | 失败影响：AI 无法说明入选修复项。
- Acceptance: plan records selected findings, reasons, and intended handling. | 验收：计划记录入选问题、理由与预计处理方式。

### H. Top N Remediation | Top N 修复

- Input: `topN.plan.md`, source files. | 输入：`topN.plan.md` 与源码文件。
- Output: code changes plus `topN.results.md`. | 输出：代码变更与 `topN.results.md`。
- Dependencies: G. | 依赖：G。
- Failure impact: unresolved findings must be deferred with evidence. | 失败影响：未解决问题必须带证据延后。
- Acceptance: every selected finding has status `fixed`, `deferred`, `false_positive`, `not_actionable`, or `failed`. | 验收：每个入选问题都有明确状态。

### I. Rerun Verification | 复扫验证

- Input: modified repository and same scan profile. | 输入：修改后的仓库与同一扫描 profile。
- Output: `rerun.raw.log`, verification result. | 输出：`rerun.raw.log` 与验证结果。
- Dependencies: H. | 依赖：H。
- Failure impact: final delivery must mention remaining failure. | 失败影响：最终交付必须说明残留失败。
- Acceptance: fixed findings no longer appear or are explicitly explained. | 验收：已修复问题不再出现，或有明确解释。

### J. Report Summary | 报告摘要

- Input: metadata, normalized findings, plan, results, rerun. | 输入：metadata、归一化结果、计划、处理结果、复扫。
- Output: `summary.md`. | 输出：`summary.md`。
- Dependencies: I. | 依赖：I。
- Failure impact: final response lacks durable evidence. | 失败影响：最终响应缺少可持久化证据。
- Acceptance: summary can be read without opening raw logs. | 验收：无需打开原始日志即可理解本次扫描。

### K. AI Final Response Contract | AI 最终响应契约

- Input: `summary.md` and user-facing work summary. | 输入：`summary.md` 与面向用户的工作摘要。
- Output: final assistant response references commands, Top N handling, and rerun status. | 输出：最终回复引用命令、Top N 处理和复扫状态。
- Dependencies: J. | 依赖：J。
- Failure impact: user cannot verify quality gate execution. | 失败影响：用户无法验证质量门禁已执行。
- Acceptance: every implementation final response includes scan report path or explicit reason it could not run. | 验收：每次实现类最终响应都包含扫描报告路径，或说明无法运行原因。

### L. CI Integration | CI 集成

- Input: scan config and summary contract. | 输入：扫描配置与摘要契约。
- Output: GitHub Actions or equivalent CI job. | 输出：GitHub Actions 或等价 CI job。
- Dependencies: A, J. | 依赖：A、J。
- Failure impact: local/AI and CI policy drift. | 失败影响：本地/AI 与 CI 策略漂移。
- Acceptance: CI invokes the same scan entrypoint as AI tools. | 验收：CI 调用与 AI 工具相同的扫描入口。

### M. AI Tool Rule Distribution | AI 工具规则分发

- Input: final policy and report contract. | 输入：最终策略与报告契约。
- Output: project-level AI instructions and optional tool-specific rule files. | 输出：项目级 AI 指令与可选工具专属规则文件。
- Dependencies: A, J. | 依赖：A、J。
- Failure impact: only some tools follow the gate. | 失败影响：只有部分工具遵守门禁。
- Acceptance: `AGENTS.md` or equivalent project entry states the mandatory gate; tool-specific files mirror it when present. | 验收：`AGENTS.md` 或等价项目入口声明强制门禁；存在工具专属规则时保持同步。

## Implementation Phases | 实施阶段

| Phase | Status | Deliverable | 验收 |
|---|---|---|---|
| Phase 0: Policy Blueprint | ✅ Completed | This plan, context index entry, AGENTS.md rules | 后续 AI 能从索引找到完整终局 |
| Phase 1: Local Gate Foundation | ✅ Completed | Root scripts, scan config, report directory contract | `pnpm run ai:complete` generates complete reports |
| Phase 2: Scanner Coverage | ✅ Completed | TypeScript, Biome, pnpm audit, Gitleaks, Semgrep parsers | All 5 scanner findings normalized |
| Phase 3: Top N Remediation Workflow | ✅ Completed | Deterministic ranking, plan/results templates, rerun comparison | Every Top N has handling status; rerun verify working |
| Phase 4: AI Rule Distribution | ✅ Completed | `AGENTS.md` + `.cursor/rules/` + `.github/copilot-instructions.md` + `CODEX.md` | Multi-tool compliance |
| Phase 5: CI Gate | ✅ Completed | CI workflow uses same `ai:complete` entrypoint, uploads scan artifacts | 本地、AI、CI 门禁一致 |
| Phase 6: Loamlog Asset Integration | Active | `loam list --scan` makes reports queryable; full asset lifecycle pending | 扫描报告可通过 loam list 查询；完整资产生命链条待实现 |

### Phase 1 Scope | 第一阶段范围

Implement the local command and report skeleton without blocking on every scanner parser.

先实现本地命令与报告骨架，不等待所有扫描器 parser 完整。

Required:

必需：

- Add root `scan` and `ai:complete` scripts. | 增加根 `scan` 与 `ai:complete` 脚本。
- Add or select a linter configuration. | 增加或选择 lint 配置。
- Generate `AIEF/reports/static-scan/<run-id>/`. | 生成扫描报告目录。
- Preserve raw output for all executed commands. | 保留所有已执行命令的原始输出。
- Write `metadata.json`, `topN.plan.md`, `topN.results.md`, and `summary.md`. | 写入核心报告文件。

Deferred:

延后：

- Full parser coverage for every scanner. | 所有扫描器的完整 parser 覆盖。
- CI enforcement. | CI 强制门禁。
- Automatic complex remediation. | 复杂问题自动修复。

### Phase 2 Scope | 第二阶段范围

Add structured parsers and scanner adapters.

增加结构化 parser 与扫描器 adapter。

Required:

必需：

- TypeScript parser or diagnostic JSON mode fallback. | TypeScript parser 或诊断 JSON fallback。
- Biome JSON parser. | Biome JSON parser。
- pnpm audit JSON parser. | pnpm audit JSON parser。
- Optional scanner wrapper for missing tools. | 可选工具缺失时的 wrapper。

### Phase 3 Scope | 第三阶段范围

Make Top N remediation auditable.

让 Top N 修复可审计。

Required:

必需：

- Deterministic ranking implementation. | 确定性排序实现。
- Plan/result templates. | 计划/结果模板。
- Rerun comparison. | 复扫对比。
- Final response checklist. | 最终回复检查清单。

### Phase 4 Scope | 第四阶段范围

Distribute the policy to all AI tools.

把规则分发给所有 AI 工具。

Required:

必需：

- Project-level instruction in `AGENTS.md` or equivalent. | 项目级入口规则。
- Optional tool-specific mirrors for Cursor, Claude Code, OpenCode, Codex, when those files exist or are introduced. | 在存在或需要时增加工具专属镜像规则。
- Explicit rule that implementation is not complete until scan evidence is saved. | 明确“没有扫描证据就不算完成实现”。

### Phase 5 Scope | 第五阶段范围

Make CI call the same gate.

让 CI 调用同一门禁。

Required:

必需：

- GitHub Actions job or equivalent workflow. | GitHub Actions 或等价 workflow。
- Artifact upload for scan reports. | 上传扫描报告 artifact。
- Severity policy for blocking. | 阻断级别策略。

### Phase 6 Scope | 第六阶段范围

Feed scan evidence back into Loamlog as reusable collaboration assets.

将扫描证据回流为 Loamlog 可复用协作资产。

Possible asset chain:

可能的资产链路：

```text
StaticScanRun
  -> EvidenceSpan
  -> QualitySignal
  -> QualityFixCandidate
  -> Decision
  -> Delivery
  -> Feedback
```

## Tool Choices | 工具选择

Initial recommended tools:

初始推荐工具：

| Tool | Role | Required in Phase 1 |
|---|---|---|
| TypeScript / `tsc` | Type and build diagnostics | Yes |
| Biome | TypeScript lint/format with low config cost | Yes |
| `pnpm audit` | Dependency vulnerability baseline | Yes |
| Gitleaks | Secret scanning | No, Phase 2/3 |
| Semgrep | SAST rules | No, Phase 2/3 |
| Knip | Dead code and unused dependency detection | No, later |

Rationale:

理由：

- TypeScript already exists in the repo and should remain the first signal. | TypeScript 已存在，应作为第一信号。
- Biome keeps lint setup small for a TypeScript monorepo. | Biome 对 TypeScript monorepo 的配置成本低。
- Security scanners should be added through adapters so missing local binaries do not break basic development unexpectedly. | 安全扫描器应通过 adapter 接入，避免本地缺少二进制时意外阻断基础开发。

## Blocking Policy | 阻断策略

Default local AI completion:

默认本地 AI 完成门禁：

- Block final completion on typecheck failure introduced by changed files. | 阻断由变更文件引入的 typecheck 失败。
- Block final completion on critical/high secret or security findings in changed files. | 阻断变更文件中的 critical/high secret 或安全发现。
- Allow existing unrelated findings only when they are documented as deferred. | 仅当记录为 deferred 时允许已有无关问题存在。
- Always mention remaining failures in the final response. | 最终回复必须说明残留失败。

CI policy may be stricter once historical baseline is clean.

历史基线清理后，CI 策略可以更严格。

## Documentation Updates | 文档更新

This plan requires the following documentation changes:

本计划要求以下文档变更：

- Add this file to `AIEF/context/INDEX.md`. | 将本文档加入 `AIEF/context/INDEX.md`。
- Add mandatory AI completion gate to project AI instructions. | 将强制 AI 完成门禁加入项目 AI 指令。
- Update `AIEF/context/tech/engineering-principles.md` only if the gate becomes a general long-term principle beyond this project. | 仅当门禁上升为长期通用工程原则时，才更新工程原则文档。
- Add scan report examples once the first run exists. | 首次运行存在后补充扫描报告示例。

## Acceptance Criteria | 验收标准

The full initiative is complete when:

完整事项完成的标准：

1. `pnpm run ai:complete` runs the configured gate and writes a report. | `pnpm run ai:complete` 可运行门禁并写入报告。
2. Reports include raw output, normalized findings, Top N plan, Top N results, rerun logs, and summary. | 报告包含原始输出、归一化问题、Top N 计划、Top N 结果、复扫日志和摘要。
3. Top N selection is deterministic and documented. | Top N 选择确定且有记录。
4. Every selected finding has an explicit handling status. | 每个入选问题都有明确处理状态。
5. AI final responses after implementation reference the scan report or explain why the gate could not run. | AI 实现后的最终回复引用扫描报告，或说明无法运行原因。
6. CI invokes the same command or same underlying scan runner. | CI 调用同一命令或同一底层扫描 runner。
7. The design remains outside business modules and does not couple to provider/distiller/sink internals. | 设计保持在业务模块之外，不耦合 provider/distiller/sink 内部。

## Open Questions | 待决问题

- Should the default `TOP_N` remain `5`, or should it vary by profile? | 默认 `TOP_N` 是否保持 `5`，还是按 profile 调整？
- Should security scanners be mandatory locally, or mandatory only in CI? | 安全扫描器应本地强制，还是只在 CI 强制？
- Should scan reports be committed by default, or ignored and uploaded as CI artifacts? | 扫描报告默认提交，还是忽略并作为 CI artifact 上传？
- Should Loamlog eventually ingest its own scan reports as first-class assets? | Loamlog 是否应最终把自己的扫描报告作为一等资产采集？
