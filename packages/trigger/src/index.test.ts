import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionSnapshot } from "@loamlog/core";
import { createTriggeredIntelligencePipeline } from "./index.js";

function buildSnapshot(sessionId: string, content: string): SessionSnapshot {
  return {
    schema_version: "1.0",
    meta: {
      session_id: sessionId,
      captured_at: "2026-03-10T00:00:00.000Z",
      capture_trigger: "session.idle",
      aic_version: "0.1.0",
      provider: "opencode",
    },
    context: {
      cwd: "/repo",
      worktree: "/repo",
    },
    time_range: {
      start: "2026-03-10T00:00:00.000Z",
      end: "2026-03-10T00:00:01.000Z",
    },
    session: {},
    messages: [
      {
        id: "msg-1",
        role: "assistant",
        timestamp: "2026-03-10T00:00:00.000Z",
        content,
      },
    ],
    redacted: {
      patterns_applied: [],
      redacted_count: 0,
    },
  };
}

describe("triggered intelligence pipeline", () => {
  test("triggers immediately on severity keyword and batches by signature", async () => {
    const batches: string[] = [];
    const runCalls: string[] = [];
    const pipeline = createTriggeredIntelligencePipeline({
      config: {
        batch: { max_wait_ms: 0 },
      },
      onBatch(batch) {
        batches.push(batch.batchId);
      },
      runDistill: async (batch) => {
        runCalls.push(batch.batchId);
      },
    });

    pipeline.enqueue({
      capture: {
        session_id: "ses-critical",
        trigger: "session.idle",
        captured_at: "2026-03-10T00:00:00.000Z",
        provider: "opencode",
      },
      snapshot: buildSnapshot("ses-critical", "fatal rollback when applying migration"),
    });

    await pipeline.flush();
    assert.equal(batches.length, 1);
    assert.equal(runCalls.length, 1);
  });

  test("fires frequency threshold after repeated signals", async () => {
    const batchSizes: number[] = [];
    const pipeline = createTriggeredIntelligencePipeline({
      config: {
        thresholds: {
          frequency: { threshold: 3, window_ms: 5 * 60 * 1000 },
          severity_keywords: [],
          semantic_keywords: [],
          manual_triggers: [],
        },
        batch: { max_wait_ms: 0 },
      },
      onBatch(batch) {
        batchSizes.push(batch.size);
      },
      runDistill: async () => {
        return;
      },
    });

    for (let i = 0; i < 2; i += 1) {
      pipeline.enqueue({
        capture: {
          session_id: `ses-freq-${i}`,
          trigger: "session.idle",
          captured_at: "2026-03-10T00:00:00.000Z",
          provider: "opencode",
        },
        snapshot: buildSnapshot(`ses-freq-${i}`, "minor retryable error"),
      });
    }
    await pipeline.flush();
    assert.equal(batchSizes.length, 0);

    pipeline.enqueue({
      capture: {
        session_id: "ses-freq-3",
        trigger: "session.idle",
        captured_at: "2026-03-10T00:00:05.000Z",
        provider: "opencode",
      },
      snapshot: buildSnapshot("ses-freq-3", "minor retryable error"),
    });

    await pipeline.flush();
    assert.equal(batchSizes.length, 1);
    assert.equal(batchSizes[0], 3);
  });

  test("degrades to summary-only when pending queue exceeds limit", async () => {
    const modes: string[] = [];
    const pipeline = createTriggeredIntelligencePipeline({
      config: {
        rate_limit: { max_pending: 1 },
        batch: { max_wait_ms: 0 },
      },
      onBatch(batch) {
        modes.push(batch.processingMode);
      },
      runDistill: async () => {
        return;
      },
    });

    pipeline.enqueue({
      capture: {
        session_id: "ses-overload-1",
        trigger: "session.idle",
        captured_at: "2026-03-10T00:00:00.000Z",
        provider: "opencode",
      },
      snapshot: buildSnapshot("ses-overload-1", "fatal error"),
    });
    pipeline.enqueue({
      capture: {
        session_id: "ses-overload-2",
        trigger: "session.idle",
        captured_at: "2026-03-10T00:00:01.000Z",
        provider: "opencode",
      },
      snapshot: buildSnapshot("ses-overload-2", "fatal error"),
    });

    await pipeline.flush();
    assert.equal(modes.includes("summary-only"), true);
  });
});
