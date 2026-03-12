import type { SessionArtifact } from "@loamlog/core";

import { MAX_MESSAGE_CHARS } from "./constants.js";

export function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function buildPrompt(artifact: SessionArtifact): string {
  const chunks = artifact.messages.map((message: SessionArtifact["messages"][number]) => {
    const text = (message.content ?? "").slice(0, MAX_MESSAGE_CHARS);
    return `[${message.id}] (${message.role}) ${text}`;
  });

  return [
    `session_id: ${artifact.meta.session_id}`,
    "messages:",
    ...chunks,
    "",
    "Output format:",
    '[{"title":"...","summary":"...","background":"...","problem":"...","proposed_solution":"...","acceptance_criteria":["..."],"confidence":0.0,"issue_kind":"feature","labels":["triage"],"evidence_refs":[{"message_id":"...","excerpt":"..."}]}]',
  ].join("\n");
}
