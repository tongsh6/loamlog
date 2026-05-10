# Refinery Workshop 2: Smelting (Verifier) — 冶炼车间规格说明书 (意图与事实对账版)

> **Workshop Role:** Implementation Gap Analysis & Evidence Weaving
> **Goal:** 识别“对话意图”与“工程现实”之间的缺口，织补多源证据，将 AI 猜想炼成确凿资产。

---

## 1. 核心冶炼策略 (Mining-aligned Strategies)

### 1.1 [P0] 实现状态对账 (Implementation Gap Analysis)
**任务**：判定 AI 在对话中提出的修改建议是否已在物理世界落地。
- **对账逻辑**：
    - 扫描 Candidate 涉及的 `file_path`。
    - 对比对话发生的时间点 (captured_at) 与该文件的最后 Git 提交时间或本地修改时间。
    - **判定 1 (Gap)**：若对话建议修改，但之后代码无相关变更 -> **产出高价值 Issue 草稿**。
    - **判定 2 (Matched)**：若代码已变更且逻辑契合 -> **标记为“已完成任务”或“Changelog”**。

### 1.2 [P1] 跨工具证据织补 (Cross-Tool Evidence Weaving)
**任务**：利用 Loamlog 的多源采集能力，为孤立的 AI 对话寻找物理日志支撑。
- **织补逻辑**：
    - **时间线锚定**：以对话中提到 Bug 的时间点为中心，前后检索 OpenCode 捕获的终端日志。
    - **语义关联**：若对话提到 `TypeError`，Verifier 自动去 Archive 搜索匹配的错误堆栈。
    - **证据熔炼**：将搜寻到的“物理证据”直接挂载到资产的 `EvidenceSpan` 中。

---

## 2. 需求定义 (Requirements)

### 2.1 业务场景
- **场景 A (遗忘捕捉)**：对话中讨论了重构逻辑，但开发者随后去写了其他功能。冶炼环节应识别出这一“执行中断”，并生成提醒。
- **场景 B (多维定罪)**：Claude 里的 AI 说“这个 API 返回了 404”，冶炼环节应从 `provider-codex` 捕获的 HTTP 流量或 `provider-opencode` 捕获的终端输出中找到那个 404 记录。

---

## 3. 验收场景 (Acceptance Scenarios)

| 场景 | 输入 Candidate | 冶炼动作 | 预期结果 (验收点) |
| :--- | :--- | :--- | :--- |
| **执行缺口** | 建议修复 `Auth.ts` | 检查 Git 指向该文件且无新 commit | 资产状态: `VERIFIED`, 理由: `Implementation Gap Found` |
| **已被修复** | 建议修改 `CSS` | 发现对话后已有相关 commit | 资产状态: `ARCHIVED`, 理由: `Already Implemented` |
| **证据缺失补全** | 提到 `npm test` 失败 | 检索同一时间的终端日志快照 | 资产状态: `VERIFIED`, 证据链包含真实的终端报错文本 |

---

## 4. 技术方案 (Technical Plan)

### 4.1 核心 Verifier 插件
1.  **GitGapVerifier (P0)**：
    - 利用 `git log --since=<captured_at> -- <file_path>`。
    - 结合本地 `fs.stat` 检查未提交的变更。
2.  **LogWeaveVerifier (P1)**：
    - 查询 `ArchiveIndex` 寻找同一时间窗口 (`captured_at` ± 5min) 的非对话类 Snapshot。
    - 对 Snapshot 内容执行关键词匹配。

### 4.2 冶炼报告 (Verification Report)
```typescript
{
  status: "verified" | "archived" | "unverified";
  mining_score: number; // 挖掘价值分：缺口越大、证据越硬，分值越高
  evidence: {
    dialogue_ref: string;   // 意图来源
    physical_log_ref?: string; // 织补得到的物理证据
    git_gap_status: string;    // 对账状态
  }
}
```

---

## 5. 待决问题 (Open Questions)

- **模糊对账**：如果用户改了代码，但改得不全，P0 如何识别“部分缺口”？
- **初判**：Stage 1 采用简单时间戳对账，Stage 2 引入 `git diff` 语义对比。
