# Evaluation Harness (MVP)

最小可用评测框架，用于验证信号提取、Issue 草稿、行动建议、知识沉淀与脱敏的准确性。默认数据集位于 `datasets/mvp-samples.json`，包含 50 条人工标注样本。

## 目录
- `datasets/`: 样本+标签（rawInput、expectedSignals、expectedAction、expectedKnowledgeType、expectedRedaction）
- `reports/`: 评测输出（JSON）
- `src/`: 评测逻辑与 CLI

## 运行
```bash
# 基线（使用带噪声的内置预测器，便于本地验证）
pnpm --filter @loamlog/evaluation-harness run evaluate -- --variant baseline-mvp

# 使用自定义预测文件
pnpm --filter @loamlog/evaluation-harness run evaluate -- --predictions /path/to/predictions.json --variant candidate-x

# 指定数据集或输出路径
pnpm --filter @loamlog/evaluation-harness run evaluate -- --dataset packages/evaluation-harness/datasets/mvp-samples.json --output packages/evaluation-harness/reports/run.json
```

CLI 会在 `packages/evaluation-harness/reports/` 下生成结构化报告，包含聚合指标和逐样本明细。

## 样本格式
```json
{
  "id": "mvp-001",
  "rawInput": "plain text conversation / log",
  "intent": "bug|performance|security|...",
  "expected": {
    "primarySignal": "profile-save-500",
    "signals": [{ "key": "...", "category": "...", "severity": "high" }],
    "issue": { "shouldIssue": true, "title": "...", "type": "bug", "priority": "P0", "actionability": 0.9 },
    "actions": [{ "key": "...", "label": "...", "priority": "P1" }],
    "knowledge": { "shouldDistill": true, "kind": "checklist", "scope": "..." },
    "redaction": { "mustRedact": ["pii@example.com"], "shouldKeep": ["HTTP 500"] }
  }
}
```

预测文件形如：
```json
[
  {
    "id": "mvp-001",
    "signals": [{ "key": "profile-save-500", "confidence": 0.8 }],
    "issueDraft": { "shouldIssue": true, "title": "Fix profile save 500", "type": "bug", "actionability": 0.7 },
    "actions": [{ "key": "add-null-guard", "label": "Add null guard", "priority": "P0" }],
    "knowledge": { "shouldDistill": true, "kind": "checklist" },
    "redaction": { "redacted": ["pii@example.com"], "allowed": ["HTTP 500"] }
  }
]
```

## 评测维度与判定要点
- **Signal Extraction**: precision、recall、误报/漏报率、Top-1/Top-3 命中（按 confidence 排序）。
- **Issue Draft**: 是否应提 Issue、标题命中（Jaccard ≥ 0.6）、类型准确度、可执行性差值（预测 vs. 人工评分）。
- **Action Suggestion**: 精准率/召回率（按 action key 或 label 归一）。
- **Knowledge Distillation**: 是否应沉淀、类型（skill/template/checklist/best-practice）。
- **Sanitization**: 漏脱敏率（未覆盖 mustRedact）、过度脱敏率（误删 shouldKeep）。

## 标注提示
- signals 以「可验证的信号」为最小单元，key 尽量语义化（如 `feed-latency-spike`）。
- issue.title 面向工程执行，type 使用 `bug|feature|chore|doc|improvement`。
- actions 建议 1~3 条，priority 采用 P0-P3。
- knowledge.kind 选自 `skill|template|checklist|best-practice`，scope 说明抽象层级。
- redaction.mustRedact 必须在 rawInput 出现，shouldKeep 用于防止过度脱敏。
