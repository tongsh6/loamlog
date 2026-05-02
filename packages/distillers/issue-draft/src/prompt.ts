import type { SessionArtifact } from "@loamlog/core";

import { MAX_MESSAGE_CHARS } from "./constants.js";

export function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function formatParts(parts?: SessionArtifact["messages"][number]["parts"]): string {
  if (!parts || parts.length === 0) return "";

  const formatted: string[] = [];
  for (const part of parts) {
    if (part.type === "reasoning" && typeof part.text === "string") {
      formatted.push(`  reasoning: ${part.text.slice(0, 500)}`);
    } else if (part.type === "tool" && typeof part.name === "string") {
      const label = typeof part.error === "string" ? `error: ${part.error.slice(0, 300)}`
        : typeof part.output === "string" ? `output: ${part.output.slice(0, 300)}`
        : "";
      formatted.push(`  tool:${part.name} ${label}`);
    } else if (part.type === "file" && typeof part.filename === "string") {
      formatted.push(`  file: ${part.filename}`);
    }
  }
  return formatted.length > 0 ? `\n${formatted.join("\n")}` : "";
}

export function buildPrompt(artifact: SessionArtifact): string {
  const chunks = artifact.messages.map((message: SessionArtifact["messages"][number]) => {
    const text = (message.content ?? "").slice(0, MAX_MESSAGE_CHARS);
    const partsText = formatParts(message.parts);
    return `[${message.id}] (${message.role}) ${text}${partsText}`;
  });

  return [
    `session_id: ${artifact.meta.session_id}`,
    "messages:",
    ...chunks,
    "",
    "Output format:",
    '[{"title":"...","summary":"...","background":"...","problem":"...","proposed_solution":"...","acceptance_criteria":["..."],"confidence":0.0,"issue_kind":"feature","labels":["triage"],"target_repo":"...","evidence_refs":[{"message_id":"...","excerpt":"..."}]}]',
  ].join("\n");
}
