import type { DistillResultDraft, SessionArtifact } from "@loamlog/core";

import { buildEvidence } from "./evidence.js";
import { normalizeText } from "./parse.js";
import type { LlmIssueDraft } from "./types.js";

export function selectBestCandidate(candidates: LlmIssueDraft[], artifact: SessionArtifact): {
  issue: LlmIssueDraft;
  evidence: DistillResultDraft["evidence"];
} | null {
  const scored = candidates
    .map((issue: LlmIssueDraft) => ({ issue, evidence: buildEvidence(artifact, issue.evidence_refs) }))
    .filter((candidate) => candidate.evidence.length > 0)
    .sort((left, right) => {
      const confidenceDelta =
        (typeof right.issue.confidence === "number" ? right.issue.confidence : 0.5) -
        (typeof left.issue.confidence === "number" ? left.issue.confidence : 0.5);
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      const evidenceDelta = right.evidence.length - left.evidence.length;
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }

      return normalizeText(left.issue.title).localeCompare(normalizeText(right.issue.title));
    });

  return scored[0] ?? null;
}
