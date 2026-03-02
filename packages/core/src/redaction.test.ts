import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applySnapshotRedaction, parseRedactIgnore, type SessionSnapshot } from "./index.js";

function buildSnapshot(content: string): SessionSnapshot {
  return {
    schema_version: "1.0",
    meta: {
      session_id: "ses_redact_001",
      captured_at: "2026-03-02T00:00:00.000Z",
      capture_trigger: "session.idle",
      aic_version: "0.1.0",
      provider: "opencode",
    },
    context: {
      cwd: "D:/demo",
      worktree: "D:/demo",
    },
    time_range: {
      start: "2026-03-02T00:00:00.000Z",
      end: "2026-03-02T00:00:01.000Z",
    },
    session: {
      info: content,
    },
    messages: [
      {
        id: "msg-1",
        role: "user",
        timestamp: "2026-03-02T00:00:00.000Z",
        content,
      },
    ],
    redacted: {
      patterns_applied: [],
      redacted_count: 0,
    },
  };
}

describe("applySnapshotRedaction", () => {
  test("redacts tokens by default", () => {
    const snapshot = buildSnapshot("sk-abcdefghijklmnopqrstuvwxyz and Bearer abc.def.123");
    const result = applySnapshotRedaction(snapshot);

    assert.equal(result.redacted_count >= 2, true);
    assert.equal(result.patterns_applied.includes("openai-token"), true);
    assert.equal(result.patterns_applied.includes("bearer-token"), true);
    assert.equal(result.snapshot.messages[0]?.content?.includes("[REDACTED:openai-token]"), true);
  });

  test("supports AIC_REDACT_IGNORE style patterns", () => {
    const snapshot = buildSnapshot("token sk-abcdefghijklmnopqrstuvwxyz");
    const ignore = parseRedactIgnore("sk-[A-Za-z0-9_-]{20,}");
    const result = applySnapshotRedaction(snapshot, ignore);

    assert.equal(result.redacted_count, 0);
    assert.equal(result.snapshot.messages[0]?.content, "token sk-abcdefghijklmnopqrstuvwxyz");
  });
});
