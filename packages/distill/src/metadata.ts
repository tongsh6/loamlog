import { createHash, randomUUID } from "node:crypto";
import type { DistillResult, DistillResultDraft, DistillerPlugin } from "@loamlog/core";

function createFingerprint(distillerId: string, sessionId: string, payload: unknown): string {
  return createHash("sha256").update(`${distillerId}:${sessionId}:${JSON.stringify(payload)}`).digest("hex");
}

export function injectMetadata(
  draft: DistillResultDraft,
  distiller: DistillerPlugin,
  sessionId: string,
): DistillResult {
  return {
    id: randomUUID(),
    fingerprint: createFingerprint(distiller.id, sessionId, draft.payload),
    distiller_id: distiller.id,
    distiller_version: distiller.version,
    type: draft.type,
    title: draft.title,
    summary: draft.summary,
    confidence: draft.confidence,
    tags: draft.tags,
    payload: draft.payload,
    evidence: draft.evidence.map((item) => ({
      ...item,
      trace_command: `loam trace --session ${item.session_id} --message ${item.message_id}`,
    })),
    actions: draft.actions,
    render: draft.render,
  };
}
