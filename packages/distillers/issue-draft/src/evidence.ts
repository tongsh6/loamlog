import type { DistillResultDraft, SessionArtifact } from "@loamlog/core";
import { createEvidence } from "@loamlog/distiller-sdk";

import type { LlmEvidenceRef, RawEvidenceRef } from "./types.js";

function findMessage(artifact: SessionArtifact, messageId: string): SessionArtifact["messages"][number] | undefined {
  return artifact.messages.find((message: SessionArtifact["messages"][number]) => message.id === messageId);
}

export function buildEvidence(artifact: SessionArtifact, refs: LlmEvidenceRef[] | undefined) {
  const seen = new Set<string>();
  const evidence: DistillResultDraft["evidence"] = [];

  for (const rawRef of refs ?? []) {
    if (!rawRef || typeof rawRef !== "object") {
      continue;
    }

    const ref = rawRef as RawEvidenceRef;
    if (typeof ref.message_id !== "string" || typeof ref.excerpt !== "string") {
      continue;
    }

    const messageId = ref.message_id.trim();
    const excerpt = ref.excerpt.trim();
    if (messageId.length === 0 || excerpt.length === 0) {
      continue;
    }

    const message = findMessage(artifact, messageId);
    if (!message) {
      continue;
    }

    const key = `${messageId}:${excerpt}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    evidence.push(createEvidence(artifact, message, excerpt));
  }

  return evidence;
}
