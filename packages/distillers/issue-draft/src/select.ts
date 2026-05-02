import type { DistillResultDraft, SessionArtifact } from "@loamlog/core";

import { buildEvidence } from "./evidence.js";
import { normalizeText } from "./parse.js";
import type { LlmIssueDraft } from "./types.js";

export function selectBestCandidates(candidates: LlmIssueDraft[], artifact: SessionArtifact): Array<{
  issue: LlmIssueDraft;
  evidence: DistillResultDraft["evidence"];
}> {
  const MIN_CONFIDENCE = 0.5;

  return candidates
    .map((issue: LlmIssueDraft) => ({ issue, evidence: buildEvidence(artifact, issue.evidence_refs) }))
    .filter((candidate) => {
      if (candidate.evidence.length === 0) return false;
      const confidence = typeof candidate.issue.confidence === "number" ? candidate.issue.confidence : 0.5;
      return confidence >= MIN_CONFIDENCE;
    })
    .sort((left, right) => {
      const confidenceDelta =
        (typeof right.issue.confidence === "number" ? right.issue.confidence : 0.5) -
        (typeof left.issue.confidence === "number" ? left.issue.confidence : 0.5);
      if (confidenceDelta !== 0) return confidenceDelta;
      const evidenceDelta = right.evidence.length - left.evidence.length;
      if (evidenceDelta !== 0) return evidenceDelta;
      return normalizeText(left.issue.title).localeCompare(normalizeText(right.issue.title));
    });
}
