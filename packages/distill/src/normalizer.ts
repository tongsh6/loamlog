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
          // L1-L2 Tiered Crushing: 
          // If it's an error, allow much larger context (up to 5000 chars).
          const isError = !!error || /error|failed|exception/i.test(output);
          const limit = isError ? 5000 : maxToolSummaryChars;

          if (error) {
            summary = `error: ${truncate(error, limit)}`;
          } else if (output) {
            summary = `output: ${truncate(output, limit)}`;
          } else {
            summary = "called";
          }

          tools.push({
            name: part.name,
            summary,
            source_index: { raw_size: output.length + error.length }
          });
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

  // Basic Topic Fingerprinting: use repo and the first few unique file paths mentioned
  const entities = new Set<string>();
  // Refined regex: strictly match standard file paths with common extensions, 
  // preventing greedy matching that causes ReDoS.
  const pathRegex = /(?:^|\s)([\w\-\.\/]+\.(?:ts|js|py|go|rs|md|json|tsx|jsx|html|css))(?:\s|$)/g;
  
  for (const m of messages) {
    let match: RegExpExecArray | null;
    // Reset index for global regex
    pathRegex.lastIndex = 0;
    while ((match = pathRegex.exec(m.text)) !== null) {
      if (match[1]) entities.add(match[1]);
      if (entities.size > 10) break; // Optimization: stop after 10 entities
    }
  }
  const fingerprint = Array.from(entities).slice(0, 3).sort().join("|");

  return {
    header: {
      session_id: artifact.meta.session_id,
      repo_path: artifact.context.worktree,
      vcs_context: artifact.context.branch && artifact.context.commit ? {
        branch: artifact.context.branch,
        commit_sha: artifact.context.commit
      } : undefined,
      provider: artifact.meta.provider,
      captured_at: artifact.meta.captured_at,
      topic_fingerprint: fingerprint || undefined,
      session_continuity: artifact.messages.length > 50 ? "continuation" : "new"
    },
    messages,
    stats: {
      total_messages: messages.length,
      tool_calls: toolCalls,
      raw_chars: rawChars,
      normalized_chars: normalizedChars
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
