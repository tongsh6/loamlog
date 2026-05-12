import { DEFAULT_MAX_MESSAGE_CHARS, type DistillResultDraft, type DistillerPlugin, type DistillerRunInput, type SessionArtifact } from "@loamlog/core";
import { createSingleArtifactStore } from "./query.js";
import { normalizeSession } from "./normalizer.js";

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
    const text = (message.content ?? "").slice(0, DEFAULT_MAX_MESSAGE_CHARS);
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
    sampleChars += MESSAGE_FORMAT_OVERHEAD + (m.content ?? "").slice(0, DEFAULT_MAX_MESSAGE_CHARS).length;
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
          return await distiller.run({
            artifactStore: createSingleArtifactStore(shard),
            llm: distillerRunInput.llm,
            state: distillerRunInput.state,
            config: distillerRunInput.config,
            distiller_id: distillerRunInput.distiller_id,
            distiller_version: distillerRunInput.distiller_version,
            normalized: normalizeSession(shard),
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
  const wordsA = new Set(titleTokens(a));
  const wordsB = new Set(titleTokens(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function titleTokens(title: string): string[] {
  const normalized = title.toLowerCase().trim();
  const latin = normalized.match(/[a-z0-9]+/g) ?? [];
  const cjkChars = Array.from(normalized.matchAll(/[\p{Script=Han}]/gu), (m) => m[0]);
  const cjkBigrams: string[] = [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    cjkBigrams.push(`${cjkChars[i]}${cjkChars[i + 1]}`);
  }
  return [...latin, ...cjkChars, ...cjkBigrams];
}

/**
 * Merge distill results from multiple shards of the same session.
 */
export function reduceResults(
  shardResults: import("@loamlog/core").DistillResultDraft[][],
): import("@loamlog/core").DistillResultDraft[] {
  const allDrafts = shardResults.flat();
  if (allDrafts.length === 0) return [];

  const groups: import("@loamlog/core").DistillResultDraft[][] = [];

  for (const draft of allDrafts) {
    const existing = groups.find((group) => sameShardTopic(group[0], draft));
    if (existing) {
      existing.push(draft);
    } else {
      groups.push([draft]);
    }
  }

  const reduced: import("@loamlog/core").DistillResultDraft[] = [];
  for (const group of groups) {
    const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
    const primary = sorted[0];

    if (group.length === 1 && primary.confidence < 0.5) {
      continue;
    }

    const evidence = mergeEvidence(group);
    const tags = Array.from(new Set(group.flatMap((d) => d.tags)));
    const confidence = group.length > 1
      ? Math.min(1, Math.round((primary.confidence + 0.1) * 10) / 10)
      : primary.confidence;

    reduced.push({
      ...primary,
      confidence,
      tags,
      evidence,
    });
  }

  return reduced;
}

function sameShardTopic(
  a: import("@loamlog/core").DistillResultDraft,
  b: import("@loamlog/core").DistillResultDraft,
): boolean {
  const aMessageIds = new Set(a.evidence.map((e) => e.message_id));
  if (b.evidence.some((e) => aMessageIds.has(e.message_id))) {
    return true;
  }
  return titleSimilarity(a.title, b.title) >= TITLE_SIMILARITY_THRESHOLD;
}

function mergeEvidence(
  group: import("@loamlog/core").DistillResultDraft[],
): import("@loamlog/core").DistillEvidenceDraft[] {
  const seen = new Set<string>();
  const merged: import("@loamlog/core").DistillEvidenceDraft[] = [];

  for (const draft of group) {
    for (const evidence of draft.evidence) {
      const key = `${evidence.session_id}:${evidence.message_id}:${evidence.excerpt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(evidence);
    }
  }

  return merged;
}
