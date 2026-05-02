import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeShardLayout, computeShardSize, estimatePromptTokens, reduceResults, shardSession, shouldShard } from "./shard.js";
import type { SessionArtifact } from "@loamlog/core";

function makeArtifact(messageCount: number, charsPerMessage: number): SessionArtifact {
  const messages: SessionArtifact["messages"] = [];
  for (let i = 0; i < messageCount; i++) {
    messages.push({
      id: `msg-${i}-${"x".repeat(32)}`,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      timestamp: new Date().toISOString(),
      content: "x".repeat(charsPerMessage),
    });
  }
  return {
    schema_version: "1.0",
    meta: {
      session_id: "test-session",
      captured_at: new Date().toISOString(),
      capture_trigger: "test",
      loam_version: "0.1.0",
      provider: "test",
    },
    context: { cwd: "/test", worktree: "/test" },
    time_range: { start: new Date().toISOString(), end: new Date().toISOString() },
    session: {},
    messages,
    tools: [],
    redacted: { patterns_applied: [], redacted_count: 0 },
  };
}

describe("estimatePromptTokens", () => {
  it("returns at least 1 for empty session", () => {
    const a = makeArtifact(0, 0);
    assert.ok(estimatePromptTokens(a) >= 1);
  });

  it("scales linearly with message count", () => {
    const small = estimatePromptTokens(makeArtifact(10, 100));
    const large = estimatePromptTokens(makeArtifact(100, 100));
    assert.ok(large > small * 5, `large=${large} should be > small*5=${small * 5}`);
  });

  it("caps per-message content at 1200 chars", () => {
    const a = makeArtifact(1, 5000); // one very long message
    const tokens = estimatePromptTokens(a);
    // overhead(1000) + format(60) + content(1200) = 2260 chars / 4 ≈ 565 tokens
    assert.ok(tokens < 600, `tokens=${tokens} should be < 600`);
  });
});

describe("shouldShard", () => {
  it("returns false for small session with contextWindow", () => {
    const a = makeArtifact(10, 100);
    assert.equal(shouldShard({ artifact: a, contextWindow: 128000 }), false);
  });

  it("returns true when estimated tokens exceed threshold", () => {
    // 2000 messages × (60 + 1200) chars ≈ 2.5M chars / 4 = 630K tokens > 128K * 0.8
    const a = makeArtifact(2000, 1200);
    assert.equal(shouldShard({ artifact: a, contextWindow: 128000 }), true);
  });

  it("returns true when estimated tokens exceed threshold with smaller window", () => {
    // 500 messages × (60 + 200) chars ≈ 130K chars / 4 ≈ 32K tokens > 8K * 0.8 = 6.4K
    const a = makeArtifact(500, 200);
    assert.equal(shouldShard({ artifact: a, contextWindow: 8192 }), true);
  });

  it("falls back to message count when contextWindow is undefined", () => {
    const a = makeArtifact(201, 10); // short messages but many of them
    assert.equal(shouldShard({ artifact: a }), true);
  });

  it("does not shard when under fallback message count without contextWindow", () => {
    const a = makeArtifact(150, 10);
    assert.equal(shouldShard({ artifact: a }), false);
  });

  it("uses custom fallback message count", () => {
    const a = makeArtifact(50, 10);
    assert.equal(shouldShard({ artifact: a, fallbackMessageCount: 30 }), true);
    assert.equal(shouldShard({ artifact: a, fallbackMessageCount: 100 }), false);
  });

  it("uses custom margin", () => {
    // 500 messages × (60+1200) ≈ 630K chars / 4 ≈ 157K tokens
    // 128K * 0.95 = 121.6K → should shard
    // 128K * 0.8 = 102.4K → should shard too (but margin=0.5 → 64K, definitely shard)
    const a = makeArtifact(500, 1200);
    assert.equal(shouldShard({ artifact: a, contextWindow: 128000, margin: 0.5 }), true);
  });
});

describe("computeShardLayout", () => {
  it("returns single shard for small session", () => {
    const layout = computeShardLayout(30, 50, 0.2);
    assert.equal(layout.totalShards, 1);
    assert.equal(layout.shardSize, 30);
  });

  it("computes layout for 999 messages", () => {
    const layout = computeShardLayout(999, 50, 0.2);
    assert.ok(layout.totalShards > 20, `got ${layout.totalShards} shards, expected >20`);
    assert.equal(layout.overlapSize, 10);
  });

  it("handles edge case: shardSize > messageCount", () => {
    const layout = computeShardLayout(5, 50, 0.2);
    assert.equal(layout.totalShards, 1);
  });

  it("handles edge case: empty session", () => {
    const layout = computeShardLayout(0, 50, 0.2);
    assert.equal(layout.totalShards, 1);
  });
});

describe("shardSession", () => {
  it("returns single shard for session under shard size", () => {
    const a = makeArtifact(30, 100);
    const shards = shardSession(a, { maxMessagesPerShard: 50, overlapRatio: 0.2 });
    assert.equal(shards.length, 1);
    assert.equal(shards[0].messages.length, 30);
  });

  it("splits large session into overlapping shards", () => {
    const a = makeArtifact(150, 100);
    const shards = shardSession(a, { maxMessagesPerShard: 50, overlapRatio: 0.2 });
    assert.ok(shards.length >= 3, `got ${shards.length} shards, expected >= 3`);

    // Verify overlap: last message of shard[0] should appear in shard[1]
    const lastOfFirst = shards[0].messages[shards[0].messages.length - 1].id;
    assert.ok(
      shards[1].messages.some((m) => m.id === lastOfFirst),
      "overlap: last message of shard 0 must appear in shard 1",
    );
  });

  it("covers all messages across shards", () => {
    const a = makeArtifact(100, 100);
    const shards = shardSession(a, { maxMessagesPerShard: 40, overlapRatio: 0.25 });

    // Every message should appear in at least one shard
    const covered = new Set<string>();
    for (const shard of shards) {
      for (const m of shard.messages) {
        covered.add(m.id);
      }
    }
    assert.equal(covered.size, 100);
  });

  it("returns single shard for empty session", () => {
    const a = makeArtifact(0, 0);
    const shards = shardSession(a, { maxMessagesPerShard: 50, overlapRatio: 0.2 });
    assert.equal(shards.length, 1);
    assert.equal(shards[0].messages.length, 0);
  });
});

describe("computeShardSize", () => {
  it("returns fewer messages for smaller context windows", () => {
    const msgs = Array.from({ length: 100 }, () => ({ content: "x".repeat(200) }));
    const sizeLarge = computeShardSize(msgs, 128000);
    const sizeSmall = computeShardSize(msgs, 8192);
    assert.ok(sizeLarge > sizeSmall, `large=${sizeLarge} should be > small=${sizeSmall}`);
  });

  it("returns at least 1", () => {
    assert.ok(computeShardSize([], 128000) >= 1);
  });
});

function makeDraft(title: string, confidence: number, messageIds: string[]): import("@loamlog/core").DistillResultDraft {
  return {
    type: "issue-draft",
    title,
    summary: title,
    confidence,
    tags: [],
    payload: { title },
    evidence: messageIds.map((id) => ({
      session_id: "test",
      message_id: id,
      excerpt: "...",
      source_text: "...",
      role: "user" as const,
    })),
    render: { markdown: title },
  };
}

describe("reduceResults", () => {
  it("returns empty for empty input", () => {
    assert.deepEqual(reduceResults([]), []);
  });

  it("returns single shard results unchanged", () => {
    const drafts = [makeDraft("Fix CI", 0.8, ["m1"])];
    const result = reduceResults([drafts]);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "Fix CI");
  });

  it("deduplicates by evidence message_id", () => {
    const shard1 = [makeDraft("Fix CI timeout", 0.8, ["m1"])];
    const shard2 = [makeDraft("CI issue", 0.6, ["m1"])]; // same evidence
    const result = reduceResults([shard1, shard2]);
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, 0.9); // 0.8 + 0.1 cross-validation boost
  });

  it("deduplicates by similar title", () => {
    // "Fix CI pipeline timeout" vs "Fix CI timeout" → 3/4 overlap = 0.75
    const shard1 = [makeDraft("Fix CI pipeline timeout", 0.7, ["m1"])];
    const shard2 = [makeDraft("Fix CI timeout", 0.5, ["m2"])];
    const result = reduceResults([shard1, shard2]);
    assert.equal(result.length, 1);
    // Keeps higher confidence, then boosted for cross-shard
    assert.equal(result[0].confidence, 0.8); // 0.7 + 0.1
  });

  it("drops single-shard low confidence results", () => {
    const shard1 = [makeDraft("Weak signal", 0.3, ["m1"])];
    const result = reduceResults([shard1]);
    assert.equal(result.length, 0);
  });
});
