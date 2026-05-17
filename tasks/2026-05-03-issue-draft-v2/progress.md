# Progress — Issue Draft Distiller V2

## 2026-05-03

- 设计文档完成 (`AIEF/openspec/issue-draft-v2.md`)
- Task 目录创建

## 2026-05-17

- ✅ Step 1: Session 上下文注入已落地。`buildPrompt` 支持 `NormalizedSession` header 中的 session / repo / branch / commit 信息；原始 `SessionArtifact` 仍保留 session id 和消息上下文。
- ✅ Step 2: issue-draft prompt 已纳入 parts 数据。`reasoning`、`tool` output/error、`file` filename 会进入 prompt，并按既定长度截断。
- ✅ Step 3: system prompt 已从单产出改为多产出；`selectBestCandidates` 保留所有 `confidence >= 0.5` 且 evidence 有效的候选，并稳定排序。
- ✅ Step 4: `target_repo` 字段已接入 `LlmIssueDraft` 与 `IssueDraftPayload`，LLM 返回值会进入结果 payload。
- ✅ Step 5: issue-draft 测试已覆盖有效 evidence、无效 evidence、低置信过滤、多候选稳定排序、空标题过滤、畸形 evidence refs 容错。

验证证据：

- 实现 commit：`542109f feat: issue-draft v2 — parts data, multi-output, target_repo`
- Focused test：`node --import tsx --test packages/distillers/issue-draft/src/*.test.ts`
- 全量测试最近记录：`docs/project-ledger.md` 当前门禁，2026-05-17 `pnpm run test` 253 pass / 0 fail

当前状态：本 task 已完成；本次仅同步进度记录，未改变运行时代码。
