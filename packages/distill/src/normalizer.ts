import type { SessionArtifact, NormalizedSession, NormalizedMessage } from "@loamlog/core";

export interface NormalizeOptions {
  /** Maximum summary length for tool outputs. Defaults to 300. */
  maxToolSummaryChars?: number;
  /** Maximum length for reasoning text. Defaults to 500. */
  maxReasoningChars?: number;
}

/**
 * Physical transformation workshop: transforms RAW SessionArtifact into NORMALIZED NormalizedSession.
 * Performs noise reduction by compressing tool outputs and isolating AI reasoning.
 */
export function normalizeSession(artifact: SessionArtifact, options: NormalizeOptions = {}): NormalizedSession {
  const maxToolSummaryChars = options.maxToolSummaryChars ?? 300;
  const maxReasoningChars = options.maxReasoningChars ?? 500;

  let rawChars = 0;
  let normalizedChars = 0;
  let toolCalls = 0;

  const messages: NormalizedMessage[] = artifact.messages.map((msg) => {
    const textParts: string[] = [];
    const reasoningParts: string[] = [];
    const tools: NormalizedMessage["tools"] = [];

    if (msg.content) {
      textParts.push(msg.content);
      rawChars += msg.content.length;
    }

    for (const part of msg.parts ?? []) {
      switch (part.type) {
        case "text":
          textParts.push(part.text);
          rawChars += part.text.length;
          break;
        case "reasoning":
          reasoningParts.push(part.text);
          rawChars += part.text.length;
          break;
        case "tool":
          toolCalls++;
          const output = part.output ?? "";
          const error = part.error ?? "";
          rawChars += (part.input ? JSON.stringify(part.input).length : 0) + output.length + error.length;

          let summary = "";
          if (error) {
            summary = `error: ${truncate(error, maxToolSummaryChars)}`;
          } else if (output) {
            summary = `output: ${truncate(output, maxToolSummaryChars)}`;
          } else {
            summary = "called";
          }

          tools.push({
            name: part.name,
            summary,
            source_index: { raw_size: output.length + error.length }
          });
          break;
        case "file":
          rawChars += part.filename.length;
          break;
      }
    }

    const text = textParts.join("\n").trim();
    const reasoning = reasoningParts.join("\n").trim();
    const slicedReasoning = truncate(reasoning, maxReasoningChars);

    normalizedChars += text.length + slicedReasoning.length + tools.reduce((acc, t) => acc + t.summary.length, 0);

    return {
      id: msg.id,
      role: msg.role,
      timestamp: msg.timestamp,
      text,
      reasoning: slicedReasoning || undefined,
      tools: tools.length > 0 ? tools : undefined
    };
  });

  return {
    header: {
      sessionId: artifact.meta.session_id,
      repoPath: artifact.context.worktree,
      vcsContext: artifact.context.branch && artifact.context.commit ? {
        branch: artifact.context.branch,
        commitSha: artifact.context.commit
      } : undefined,
      provider: artifact.meta.provider,
      capturedAt: artifact.meta.captured_at
    },
    messages,
    stats: {
      totalMessages: messages.length,
      toolCalls,
      rawChars,
      normalizedChars
    }
  };
}

function truncate(text: string, limit: number): string {
  if (!text || text.length <= limit) return text;
  // Tiered compression logic can be added here in the future.
  // For now, simple Head + Tail sampling.
  const half = Math.floor((limit - 3) / 2);
  return `${text.slice(0, half)}...${text.slice(-half)}`;
}
