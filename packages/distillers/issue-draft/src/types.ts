export type IssueKind = "bug" | "feature" | "docs" | "refactor" | "chore";

export interface IssueDraftPayload {
  title: string;
  issue_kind?: IssueKind;
  labels?: string[];
}

export interface LlmEvidenceRef {
  message_id: string;
  excerpt: string;
}

export interface RawEvidenceRef {
  message_id?: unknown;
  excerpt?: unknown;
}

export interface LlmIssueDraft {
  title: string;
  summary: string;
  background: string;
  problem: string;
  proposed_solution: string;
  acceptance_criteria: string[];
  confidence?: number;
  issue_kind?: string;
  labels?: string[];
  evidence_refs?: LlmEvidenceRef[];
}
