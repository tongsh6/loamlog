import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { Logger, Signal, VerifiedAsset } from "@loamlog/core";
import { LocalAssetStore } from "./store.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (!tempDir) return;
  const target = tempDir;
  tempDir = undefined;
  await rm(target, { recursive: true, force: true });
});

const logger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const machine_classification = {
    kind: "task_delta" as const,
    tags: ["created" as const],
    actor: "user" as const,
    temporal_state: "future" as const,
    confidence: 0.82,
  };

  return {
    id: "sig-1",
    scope: "message",
    kind: machine_classification.kind,
    tags: machine_classification.tags,
    actor: machine_classification.actor,
    temporal_state: machine_classification.temporal_state,
    confidence: machine_classification.confidence,
    spans: [
      {
        session_id: "ses-1",
        message_id: "msg-1",
        excerpt: "Create a signal review command next.",
      },
    ],
    review_status: "accepted",
    machine_classification,
    promotion_hints: [
      {
        target_distiller: "@loamlog/distiller-follow-up-work-item",
        eligibility: "eligible",
        reason: "future user task",
      },
    ],
    classifier: {
      id: "signal-gate",
      version: "0.1.0",
      model: "deterministic-test",
      prompt_version: "none",
    },
    created_at: "2026-05-15T00:00:00.000Z",
    updated_at: "2026-05-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeAsset(id: string): VerifiedAsset {
  return {
    id,
    fingerprint: `${id}:fingerprint`,
    candidate_type: "follow-up-work-item",
    title: "Create signal CLI",
    summary: "Add list/show/review commands for stored signals.",
    confidence: 0.84,
    tags: ["follow-up"],
    distiller_id: "@loamlog/distiller-follow-up-work-item",
    signals: [makeSignal()],
    evidence: [
      {
        session_id: "ses-1",
        message_id: "msg-1",
        excerpt: "Create a signal review command next.",
      },
    ],
    payload: {},
    verification: {
      status: "unverified",
      mining_score: 0.5,
      evidence: { dialogue_ref: "ses-1/msg-1" },
      verified_at: "2026-05-15T00:00:00.000Z",
    },
  };
}

describe("LocalAssetStore signals", () => {
  test("stores, filters, and sorts signals for review", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-store-signals-"));
    const store = new LocalAssetStore(tempDir, "/repo/demo", logger);

    await store.putSignal(
      makeSignal({
        id: "sig-accepted",
        review_status: "accepted",
        created_at: "2026-05-15T00:00:00.000Z",
      }),
    );
    await store.putSignal(
      makeSignal({
        id: "sig-pending",
        review_status: "pending",
        machine_classification: {
          kind: "insight",
          tags: ["reason"],
          actor: "assistant",
          temporal_state: "current",
          confidence: 0.7,
        },
        created_at: "2026-05-15T01:00:00.000Z",
      }),
    );

    const all = await store.listSignals();
    assert.deepEqual(
      all.map((signal) => signal.id),
      ["sig-pending", "sig-accepted"],
    );

    const promotable = await store.listSignals({
      promotable: true,
      distiller_id: "@loamlog/distiller-follow-up-work-item",
    });
    assert.equal(promotable.length, 2);

    const insights = await store.listSignals({ kind: ["insight"] });
    assert.deepEqual(
      insights.map((signal) => signal.id),
      ["sig-pending"],
    );
  });

  test("preserves manual review when classifier reruns the same signal", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-store-review-"));
    const store = new LocalAssetStore(tempDir, "/repo/demo", logger);

    await store.putSignal(makeSignal({ id: "sig-reviewed" }));
    await store.reviewSignal("sig-reviewed", {
      review_status: "rejected",
      reviewer: "human",
      reviewed_at: "2026-05-15T02:00:00.000Z",
      note: "assistant process log, not a user task",
      classification: {
        kind: "noise",
        tags: ["process_log"],
        actor: "assistant",
        temporal_state: "unknown",
        confidence: 0.95,
      },
    });

    await store.putSignal(
      makeSignal({
        id: "sig-reviewed",
        machine_classification: {
          kind: "task_delta",
          tags: ["created"],
          actor: "user",
          temporal_state: "future",
          confidence: 0.92,
        },
        review_status: "accepted",
      }),
    );

    const signal = await store.getSignal("sig-reviewed");
    assert.equal(signal?.review_status, "rejected");
    assert.equal(signal?.kind, "noise");
    assert.deepEqual(signal?.tags, ["process_log"]);
    assert.equal(signal?.reviewed_classification?.reviewer, "human");
  });

  test("records signal consumption and lineage", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-store-lineage-"));
    const store = new LocalAssetStore(tempDir, "/repo/demo", logger);

    await store.putSignal(makeSignal({ id: "sig-lineage" }));
    await store.update("asset-1", makeAsset("asset-1"));
    await store.recordSignalConsumption({
      signal_id: "sig-lineage",
      distiller_id: "@loamlog/distiller-follow-up-work-item",
      distiller_version: "0.1.0",
      result: "produced",
      asset_id: "asset-1",
      created_at: "2026-05-15T03:00:00.000Z",
    });

    const consumptions = await store.listSignalConsumptions("sig-lineage");
    assert.equal(consumptions.length, 1);
    assert.equal(consumptions[0].asset_id, "asset-1");

    const lineage = await store.getLineage("sig-lineage");
    assert.equal(lineage.signal?.id, "sig-lineage");
    assert.equal(lineage.signal_consumptions.length, 1);
    assert.deepEqual(
      lineage.produced_assets.map((asset) => asset.id),
      ["asset-1"],
    );
  });
});
