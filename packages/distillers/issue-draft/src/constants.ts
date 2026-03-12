export const DISTILLER_ID = "@loamlog/distiller-issue-draft";
export const MAX_MESSAGE_CHARS = 1200;
export const SUPPORTED_ISSUE_KINDS = new Set(["bug", "feature", "docs", "refactor", "chore"]);
export const SYSTEM_PROMPT = [
  "You extract exactly one strong GitHub issue draft from an AI coding session.",
  "Return a JSON array only.",
  "Each item must include: title, summary, background, problem, proposed_solution, acceptance_criteria, confidence, evidence_refs.",
  "Optional fields: issue_kind, labels.",
  "Each evidence_refs item must include message_id and excerpt.",
  "Prefer no result over weakly supported results.",
].join("\n");
