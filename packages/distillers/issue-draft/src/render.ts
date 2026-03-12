import type { DistillResultDraft } from "@loamlog/core";

import { normalizeIssueKind, normalizeLabels } from "./parse.js";
import type { LlmIssueDraft } from "./types.js";

export function renderMarkdown(issue: LlmIssueDraft, evidence: DistillResultDraft["evidence"]): string {
  const acceptanceCriteria = issue.acceptance_criteria.map((item: string) => `- ${item}`).join("\n");
  const evidenceLines = evidence
    .map((item: DistillResultDraft["evidence"][number]) => `- \`${item.message_id}\`: ${item.excerpt}`)
    .join("\n");
  const labelLine = normalizeLabels(issue.labels);
  const issueKind = normalizeIssueKind(issue.issue_kind);

  return [
    issueKind ? `Type: ${issueKind}` : undefined,
    labelLine ? `Labels: ${labelLine.join(", ")}` : undefined,
    "## Background",
    issue.background,
    "",
    "## Problem",
    issue.problem,
    "",
    "## Proposed Solution",
    issue.proposed_solution,
    "",
    "## Acceptance Criteria",
    acceptanceCriteria,
    "",
    "## Evidence",
    evidenceLines,
  ]
    .filter((line: string | undefined): line is string => line !== undefined)
    .join("\n");
}

export function toTags(issue: LlmIssueDraft): string[] {
  const tags = ["issue-draft"];
  const issueKind = normalizeIssueKind(issue.issue_kind);
  if (issueKind) {
    tags.push(issueKind);
  }

  const labels = normalizeLabels(issue.labels);
  if (labels) {
    tags.push(...labels);
  }

  return Array.from(new Set(tags));
}
