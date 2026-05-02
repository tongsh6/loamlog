import type { DistillResultDraft, DistillerPlugin, DistillerRunInput, SessionArtifact } from "@loamlog/core";

const MAX_MESSAGE_CHARS = 1200;

/** Format overhead per message: `[message-id] (role) ` ≈ 50 chars + newline */
const MESSAGE_FORMAT_OVERHEAD = 60;

/** Prompt overhead for system prompt + session_id header + output format instructions */
const PROMPT_OVERHEAD_CHARS = 1000;

const TOKEN_ESTIMATE_RATIO = 4; // chars per token

const DEFAULT_MESSAGE_COUNT_THRESHOLD = 200;

/**
 * Estimate the number of tokens the prompt would consume for a given artifact.
 * Uses the same formatting logic as distiller buildPrompt() to produce
 * a token count comparable to what the LLM router's route() would receive.
 */
export function estimatePromptTokens(artifact: SessionArtifact): number {
  let totalChars = PROMPT_OVERHEAD_CHARS;

  for (const message of artifact.messages) {
    const text = (message.content ?? "").slice(0, MAX_MESSAGE_CHARS);
    totalChars += MESSAGE_FORMAT_OVERHEAD + text.length;
  }

  return Math.max(1, Math.ceil(totalChars / TOKEN_ESTIMATE_RATIO));
}

export interface ShouldShardOptions {
  artifact: SessionArtifact;
  /** Model context window in tokens. Falls back to message count threshold if undefined. */
  contextWindow?: number;
  /** Fraction of context window to use as the split threshold (default 0.8). */
  margin?: number;
  /** Fallback message count threshold when contextWindow is unavailable (default 200). */
  fallbackMessageCount?: number;
}

/**
 * Determine whether a session should be sharded before distillation.
 *
 * Returns true when ANY of:
 * 1. contextWindow is available AND estimated prompt tokens > contextWindow * margin, OR
 * 2. message count > fallbackMessageCount (protects against high message-count
 *    sessions that fit in token budget but cause inference timeout / O(n²) latency)
 */
export function shouldShard(options: ShouldShardOptions): boolean {
  const { artifact, contextWindow, margin = 0.8, fallbackMessageCount = DEFAULT_MESSAGE_COUNT_THRESHOLD } = options;

  // High message count always triggers sharding — even if the token budget
  // fits, 500+ messages cause LM inference timeout and attention dilution.
  if (artifact.messages.length > fallbackMessageCount) {
    return true;
  }

  if (contextWindow !== undefined && contextWindow > 0) {
    const estimatedTokens = estimatePromptTokens(artifact);
    return estimatedTokens > contextWindow * margin;
  }

  return false;
}

export interface ShardLayout {
  shardSize: number;
  overlapSize: number;
  totalShards: number;
}

const DEFAULT_OVERLAP_RATIO = 0.2;

/** Safety margin within each shard to leave room for output tokens. */
const SHARD_CONTEXT_MARGIN = 0.8;

/**
 * Compute how many messages fit in a shard given a target token budget.
 * Uses the same estimation logic as estimatePromptTokens().
 */
export function computeShardSize(
  sampleMessages: Array<{ content?: string }>,
  contextWindow: number,
  margin: number = SHARD_CONTEXT_MARGIN,
): number {
  const targetTokens = contextWindow * margin;

  // Estimate per-message tokens from evenly-spaced samples across the
  // entire session (first, middle, last). Using only the first messages
  // underestimates when conversations grow longer over time.
  const SAMPLE_COUNT = 60;
  const sample: Array<{ content?: string }> = [];
  const n = sampleMessages.length;

  if (n <= SAMPLE_COUNT) {
    // Small session: use all messages
    for (const m of sampleMessages) sample.push(m);
  } else {
    // Large session: evenly space SAMPLE_COUNT samples across [0, n)
    const step = n / SAMPLE_COUNT;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      sample.push(sampleMessages[Math.floor(i * step)]);
    }
    // Always include the last message
    if (sample[sample.length - 1] !== sampleMessages[n - 1]) {
      sample[sample.length - 1] = sampleMessages[n - 1];
    }
  }

  if (sample.length === 0) return 1;

  let sampleChars = 0;
  for (const m of sample) {
    sampleChars += MESSAGE_FORMAT_OVERHEAD + (m.content ?? "").slice(0, MAX_MESSAGE_CHARS).length;
  }
  const avgTokensPerMessage = Math.ceil(sampleChars / sample.length / TOKEN_ESTIMATE_RATIO);
  const availableTokens = targetTokens - Math.ceil(PROMPT_OVERHEAD_CHARS / TOKEN_ESTIMATE_RATIO);

  return Math.max(1, Math.floor(availableTokens / avgTokensPerMessage));
}

/**
 * Compute how to split the session's messages into overlapping shards.
 *
 * shardSize is clamped to [1, messageCount] so a single-shard session
 * (messageCount ≤ shardSize) produces exactly one shard with all messages.
 */
export function computeShardLayout(
  messageCount: number,
  maxMessagesPerShard: number,
  overlapRatio: number = DEFAULT_OVERLAP_RATIO,
): ShardLayout {
  const shardSize = Math.max(1, Math.min(maxMessagesPerShard, messageCount));
  const overlapSize = Math.max(0, Math.floor(shardSize * overlapRatio));

  if (shardSize <= overlapSize) {
    return { shardSize: messageCount, overlapSize: 0, totalShards: 1 };
  }

  if (messageCount <= shardSize) {
    return { shardSize: messageCount, overlapSize: 0, totalShards: 1 };
  }

  const stride = shardSize - overlapSize;
  const totalShards = Math.ceil((messageCount - overlapSize) / stride);

  return { shardSize, overlapSize, totalShards };
}

/**
 * Split a session's messages into overlapping shards.
 *
 * Each shard is a shallow copy of the original artifact with a different
 * messages slice. The meta, context, session, tools, and redacted fields
 * are shared (not cloned) since shards are read-only during distillation.
 *
 * Adjacent shards overlap by `overlapRatio * shardSize` messages to prevent
 * cross-boundary discussion from being lost.
 */
export function shardSession(
  artifact: SessionArtifact,
  options: { maxMessagesPerShard?: number; contextWindow?: number; overlapRatio?: number } = {},
): SessionArtifact[] {
  const { messages } = artifact;
  if (messages.length === 0) {
    return [artifact];
  }

  const overlapRatio = options.overlapRatio ?? DEFAULT_OVERLAP_RATIO;

  // Use context window to adaptively compute shard size when available
  const maxMessagesPerShard =
    options.maxMessagesPerShard ??
    (options.contextWindow
      ? computeShardSize(messages, options.contextWindow)
      : 50);

  const layout = computeShardLayout(messages.length, maxMessagesPerShard, overlapRatio);
  if (layout.totalShards <= 1) {
    return [artifact];
  }

  const { shardSize, overlapSize } = layout;
  const stride = shardSize - overlapSize;
  const shards: SessionArtifact[] = [];

  for (let start = 0; start < messages.length; start += stride) {
    const end = Math.min(start + shardSize, messages.length);
    shards.push({
      ...artifact,
      messages: messages.slice(start, end),
    });
    if (end >= messages.length) break;
  }

  return shards;
}

/**
 * Run a distiller on multiple shard artifacts in parallel.
 *
 * Each shard is processed independently via distiller.run(). Failures in
 * individual shards are caught so one bad shard doesn't kill the whole batch.
 */
export async function mapDistiller(
  distiller: DistillerPlugin,
  distillerRunInput: Omit<DistillerRunInput, "artifactStore">,
  shards: SessionArtifact[],
  concurrency: number = 3,
): Promise<DistillResultDraft[][]> {
  const results: DistillResultDraft[][] = [];

  // Process shards in batches of `concurrency`
  for (let i = 0; i < shards.length; i += concurrency) {
    const batch = shards.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (shard) => {
        try {
          const store = {
            async *getUnprocessed(_targetId: string, _limit?: number) {
              yield shard;
            },
            query: async function* () {
              yield shard;
            },
          };

          return await distiller.run({
            artifactStore: store,
            llm: distillerRunInput.llm,
            state: distillerRunInput.state,
            config: distillerRunInput.config,
            distiller_id: distillerRunInput.distiller_id,
            distiller_version: distillerRunInput.distiller_version,
          });
        } catch (error) {
          console.error(
            `[shard:map] session ${shard.meta.session_id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return [];
        }
      }),
    );
    for (const r of batchResults) {
      results.push(r);
    }
  }

  return results;
}

const TITLE_SIMILARITY_THRESHOLD = 0.7;

/** Simple word-overlap similarity for title dedup. */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Merge distill results from multiple shards of the same session.
 *
 * Structural merge (code-based, no LLM call):
 * 1. Exact title match → dedup, keep highest confidence
 * 2. High title similarity (>0.7) → merge, keep highest confidence
 * 3. Same evidence message_id → dedup, keep highest confidence
 * 4. Same issue found in ≥2 shards → confidence boost (+0.1, max 1.0)
 * 5. Single-shard findings with confidence <0.5 → drop
 */
export function reduceResults(
  shardResults: import("@loamlog/core").DistillResultDraft[][],
): import("@loamlog/core").DistillResultDraft[] {
  // Flatten and track which shard each result came from
  const allResults: Array<{ result: import("@loamlog/core").DistillResultDraft; shardIndex: number }> = [];
  for (let i = 0; i < shardResults.length; i++) {
    for (const r of shardResults[i]) {
      allResults.push({ result: r, shardIndex: i });
    }
  }

  if (allResults.length === 0) {
    return [];
  }

  // Build adjacency graph by evidence overlap and title similarity,
  // then resolve transitive closure via multi-pass merging
  const merges: number[][] = []; // each group = array of indices
  const used = new Set<number>();

  for (let i = 0; i < allResults.length; i++) {
    if (used.has(i)) continue;

    const group = new Set<number>([i]);
    let changed = true;

    // Multi-pass: keep absorbing until no new members join the group
    while (changed) {
      changed = false;
      for (let j = 0; j < allResults.length; j++) {
        if (used.has(j) || group.has(j)) continue;

        // Check if j matches ANY member of the group (transitive)
        for (const gi of group) {
          const sameEvidence = allResults[gi].result.evidence.some((e) =>
            allResults[j].result.evidence.some((oe) => oe.message_id === e.message_id),
          );
          const similarTitle =
            titleSimilarity(allResults[gi].result.title, allResults[j].result.title) >=
            TITLE_SIMILARITY_THRESHOLD;

          if (sameEvidence || similarTitle) {
            group.add(j);
            used.add(j);
            changed = true;
            break;
          }
        }
      }
    }

    used.add(i);
    merges.push([...group]);
  }

  const merged: import("@loamlog/core").DistillResultDraft[] = [];
  const mergedContributors: Array<Set<number>> = [];

  for (const group of merges) {
    // Select best from the group (highest confidence)
    let best = allResults[group[0]].result;
    for (const idx of group) {
      if (allResults[idx].result.confidence > best.confidence) {
        best = allResults[idx].result;
      }
    }

    // Cross-validation boost
    const distinctShards = new Set<number>();
    for (const idx of group) {
      distinctShards.add(allResults[idx].shardIndex);
    }
    if (distinctShards.size >= 2) {
      best = {
        ...best,
        confidence: Math.min(1.0, Math.round((best.confidence + 0.1) * 10) / 10),
      };
    }

    merged.push(best);
    mergedContributors.push(new Set(group));
  }

  // Filter single-shard low confidence using explicit contributor tracking
  return merged.filter((_r, idx) => {
    const contributors = mergedContributors[idx];
    const distinctShards = new Set<number>();
    for (const ci of contributors) {
      distinctShards.add(allResults[ci].shardIndex);
    }
    if (distinctShards.size < 2 && _r.confidence < 0.5) {
      return false;
    }
    return true;
  });
}
