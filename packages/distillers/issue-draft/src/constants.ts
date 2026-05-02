export const DISTILLER_ID = "@loamlog/distiller-issue-draft";
export const MAX_MESSAGE_CHARS = 1200;
export const SUPPORTED_ISSUE_KINDS = new Set(["bug", "feature", "docs", "refactor", "chore"]);
export const SYSTEM_PROMPT = [
  "You extract all strong GitHub issue drafts from an AI coding session.",
  "Return a JSON array. If no meaningful issues exist, return an empty array.",
  "Each item must include: title, summary, background, problem, proposed_solution, acceptance_criteria, confidence, evidence_refs.",
  "Optional fields: issue_kind, labels, target_repo.",
  "Set target_repo to the repo the issue belongs to. Usually this matches the session repo, but if the issue is about an external dependency or tool, set target_repo to that project's repo.",
  "Each evidence_refs item must include message_id and excerpt.",
  "Do NOT limit to one issue. Extract every clearly-discussed, actionable issue with confidence >= 0.5.",
].join("\n");
