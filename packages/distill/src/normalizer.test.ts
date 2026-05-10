import { describe, it } from "node:test";
import assert from "node:assert";
import type { SessionArtifact } from "@loamlog/core";
import { normalizeSession } from "./normalizer.js";

describe("normalizer", () => {
  const mockArtifact: SessionArtifact = {
    schema_version: "1.0",
    meta: {
      session_id: "ses_123",
      captured_at: "2026-05-11T10:00:00Z",
      capture_trigger: "manual",
      loam_version: "0.6.0",
      provider: "test-provider",
    },
    context: {
      cwd: "/work/loamlog",
      worktree: "/work/loamlog",
      branch: "develop",
      commit: "abc1234",
    },
    time_range: { start: "...", end: "..." },
    session: {},
    messages: [
      {
        id: "msg_1",
        role: "user",
        timestamp: "...",
        content: "Hello, can you check src/index.ts?",
      },
      {
        id: "msg_2",
        role: "assistant",
        timestamp: "...",
        parts: [
          { type: "reasoning", text: "Thinking about life..." },
          { type: "text", text: "Hi there!" },
          {
            type: "tool",
            name: "test_cmd",
            input: { foo: "bar" },
            output: "X".repeat(1000), // Long output
          },
        ],
      },
    ],
    redacted: { patterns_applied: [], redacted_count: 0 },
  };

  it("merges text parts and isolates reasoning", () => {
    const normalized = normalizeSession(mockArtifact);
    const msg2 = normalized.messages[1];
    assert.strictEqual(msg2.text, "Hi there!");
    assert.strictEqual(msg2.reasoning, "Thinking about life...");
  });

  it("compresses long tool outputs", () => {
    const normalized = normalizeSession(mockArtifact, { maxToolSummaryChars: 100 });
    const msg2 = normalized.messages[1];
    assert.ok(msg2.tools);
    assert.strictEqual(msg2.tools.length, 1);
    assert.strictEqual(msg2.tools[0].name, "test_cmd");
    assert.ok(msg2.tools[0].summary.includes("..."));
    assert.ok(msg2.tools[0].summary.length <= 110); // 100 + "output: " prefix length
    assert.strictEqual(msg2.tools[0].source_index?.raw_size, 1000);
  });

  it("preserves meta and stats", () => {
    const normalized = normalizeSession(mockArtifact);
    assert.strictEqual(normalized.header.session_id, "ses_123");
    assert.strictEqual(normalized.header.repo_path, "/work/loamlog");
    assert.strictEqual(normalized.header.vcs_context?.branch, "develop");
    assert.strictEqual(normalized.stats.total_messages, 2);
    assert.strictEqual(normalized.stats.tool_calls, 1);
    assert.ok(normalized.stats.raw_chars > normalized.stats.normalized_chars);
    assert.ok(normalized.header.topic_fingerprint);
  });
});
