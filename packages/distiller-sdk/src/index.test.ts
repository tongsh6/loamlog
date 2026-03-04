import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import { createEvidence, defineDistiller } from "./index.js";

describe("distiller-sdk", () => {
  test("defineDistiller wraps plugin shape", async () => {
    const plugin = defineDistiller({
      id: "@test/sdk-distiller",
      name: "SDK Distiller",
      version: "0.1.0",
      supported_types: ["test"],
      async run() {
        return [];
      },
    });

    assert.equal(plugin.id, "@test/sdk-distiller");
    const output = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          return;
        },
        async *query() {
          return;
        },
      },
      llm: {
        route() {
          throw new Error("unused");
        },
      },
      state: {
        async get() {
          return undefined;
        },
        async set() {
          return;
        },
        async markProcessed() {
          return;
        },
      },
    });

    assert.deepEqual(output, []);
  });

  test("createEvidence extracts session and message ids", () => {
    const artifact: SessionArtifact = {
      schema_version: "1.0",
      meta: {
        session_id: "ses_sdk_1",
        captured_at: "2026-03-04T00:00:00.000Z",
        capture_trigger: "session.idle",
        loam_version: "0.1.0",
        provider: "opencode",
      },
      context: {
        cwd: "/tmp",
        worktree: "/tmp",
      },
      time_range: {
        start: "2026-03-04T00:00:00.000Z",
        end: "2026-03-04T00:00:01.000Z",
      },
      session: {},
      messages: [
        {
          id: "msg_sdk_1",
          role: "user",
          timestamp: "2026-03-04T00:00:00.000Z",
          content: "hello",
        },
      ],
      redacted: {
        patterns_applied: [],
        redacted_count: 0,
      },
    };

    const evidence = createEvidence(artifact, artifact.messages[0], "hello");
    assert.equal(evidence.session_id, "ses_sdk_1");
    assert.equal(evidence.message_id, "msg_sdk_1");
  });
});
