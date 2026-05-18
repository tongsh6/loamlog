import { describe, it } from "node:test";
import assert from "node:assert";
import type { VerifiedAsset, AggregatorContext } from "@loamlog/core";
import { TopicAggregator } from "./aggregator.js";

describe("TopicAggregator", () => {
  const mockCtx: AggregatorContext = {
    repo_path: "/work/repo",
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };

  const asset1: VerifiedAsset = {
    id: "a1",
    fingerprint: "fp1",
    candidate_type: "issue-draft",
    title: "Fix Typo in API",
    summary: "...",
    confidence: 0.8,
    tags: ["typo"],
    distiller_id: "dist_1",
    signals: [],
    evidence: [{ session_id: "ses_1", message_id: "m1", excerpt: "typo here" }],
    payload: {},
    verification: {
      status: "verified",
      mining_score: 0.9,
      evidence: { dialogue_ref: "m1" },
      verified_at: "...",
    },
  };

  const asset2: VerifiedAsset = {
    id: "a2",
    fingerprint: "fp2",
    candidate_type: "issue-draft",
    title: "FIX TYPO IN API", // Same topic, different casing
    summary: "...",
    confidence: 0.7,
    tags: ["typo"],
    distiller_id: "dist_1",
    signals: [],
    evidence: [{ session_id: "ses_2", message_id: "m2", excerpt: "another typo" }],
    payload: {},
    verification: {
      status: "unverified",
      mining_score: 0.5,
      evidence: { dialogue_ref: "m2" },
      verified_at: "...",
    },
  };

  it("merges assets with same semantic identity", async () => {
    const aggregator = new TopicAggregator();
    const refined = await aggregator.refine([asset1, asset2], mockCtx);

    assert.strictEqual(refined.length, 1);
    const r = refined[0];
    assert.strictEqual(r.is_merged, true);
    assert.strictEqual(r.contributing_sessions.length, 2);
    assert.strictEqual(r.evidence.length, 2);
    // Confidence boost: 0.8 + 0.1 = 0.9
    assert.strictEqual(r.confidence, 0.9);
    // Status inheritance: Verified wins
    assert.strictEqual(r.verification.status, "verified");
  });

  it("assigns unique identity hashes", async () => {
    const aggregator = new TopicAggregator();
    const refined = await aggregator.refine([asset1, asset2], mockCtx);
    assert.ok(refined[0].identity_hash);
    assert.strictEqual(refined[0].identity_hash.length, 64); // SHA256 hex
  });

  it("separates different topics", async () => {
    const asset3 = { ...asset1, id: "a3", title: "Something Else" };
    const aggregator = new TopicAggregator();
    const refined = await aggregator.refine([asset1, asset3], mockCtx);
    assert.strictEqual(refined.length, 2);
  });

  it("does not merge same-title assets from different candidate types", async () => {
    const decision = {
      ...asset1,
      id: "decision",
      candidate_type: "decision-rationale",
      title: "Dogfooding validation loop",
      distiller_id: "dist_1",
    };
    const followUp = {
      ...asset2,
      id: "follow-up",
      candidate_type: "follow-up-work-item",
      title: "Dogfooding validation loop",
      distiller_id: "dist_1",
    };

    const aggregator = new TopicAggregator();
    const refined = await aggregator.refine([decision, followUp], mockCtx);

    assert.strictEqual(refined.length, 2);
    assert.deepStrictEqual(
      refined.map((asset) => asset.candidate_type).sort(),
      ["decision-rationale", "follow-up-work-item"],
    );
  });

  it("does not merge same-title assets from different distillers", async () => {
    const first = {
      ...asset1,
      id: "first",
      title: "Static scan report asset chain",
      distiller_id: "dist_1",
    };
    const second = {
      ...asset2,
      id: "second",
      title: "Static scan report asset chain",
      distiller_id: "dist_2",
    };

    const aggregator = new TopicAggregator();
    const refined = await aggregator.refine([first, second], mockCtx);

    assert.strictEqual(refined.length, 2);
    assert.deepStrictEqual(
      refined.map((asset) => asset.distiller_id).sort(),
      ["dist_1", "dist_2"],
    );
  });
});
