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
  test("replaces common secrets with semantic placeholders and summary", () => {
    const snapshot = buildSnapshot(
      [
        "sk-abcdefghijklmnopqrstuvwxyz",
        "Authorization: Bearer abc.def.123",
        "Contact user@example.com",
        "password=abc123",
        "curl https://api.demo?token=abcd1234&email=test@example.com",
        "Cookie: sessionid=abc; other=123",
      ].join("\n"),
    );
    const result = applySnapshotRedaction(snapshot);

    const sanitizedContent = result.snapshot.messages[0]?.content ?? "";
    assert.equal(sanitizedContent.includes("[API_KEY:OPENAI]"), true);
    assert.equal(sanitizedContent.includes("Authorization: [AUTH_HEADER:BEARER]"), true);
    assert.equal(sanitizedContent.includes("[EMAIL]"), true);
    assert.equal(sanitizedContent.includes("password=[PASSWORD]"), true);
    assert.equal(sanitizedContent.includes("token=[TOKEN]"), true);
    assert.equal(sanitizedContent.includes("sessionid=[COOKIE:SESSIONID]"), true);

    assert.equal(result.redacted_count >= 10, true);
    assert.equal((result.summary.by_type.password ?? 0) > 0, true);
    assert.equal((result.summary.by_type.email ?? 0) >= 3, true);
    assert.equal(result.summary.risk_level, "high");
  });

  test("supports AIC_REDACT_IGNORE style patterns", () => {
    const snapshot = buildSnapshot("token sk-abcdefghijklmnopqrstuvwxyz");
    const ignore = parseRedactIgnore("sk-[A-Za-z0-9_-]{20,}");
    const result = applySnapshotRedaction(snapshot, ignore);

    assert.equal(result.redacted_count, 0);
    assert.equal(result.snapshot.messages[0]?.content, "token sk-abcdefghijklmnopqrstuvwxyz");
  });

  test("sanitizes structured key/value content", () => {
    const snapshot = buildSnapshot(
      [
        "OPENAI_API_KEY=sk-12345678901234567890",
        "api_key: another-secret",
        "session: { \"token\": \"abcd\", \"password\": \"p@ss\" }",
      ].join("\n"),
    );

    const result = applySnapshotRedaction(snapshot);
    const content = result.snapshot.messages[0]?.content ?? "";

    assert.equal(content.includes("OPENAI_API_KEY=[API_KEY:OPENAI]"), true);
    assert.equal(content.includes("api_key=[API_KEY]") || content.includes("api_key: [API_KEY]"), true);
    assert.equal(content.includes("session=[SESSION_ID]"), true);
    assert.equal((result.summary.by_type.api_key ?? 0) >= 2, true);
    assert.equal((result.summary.by_type.token ?? 0) >= 2, true);
    assert.equal((result.summary.by_type.password ?? 0) >= 2, true);
  });
});
