import assert from "node:assert/strict";
import { describe, test } from "node:test";
import factory from "./index.js";

describe("pitfall-card distiller", () => {
  test("returns structured result from mocked llm response", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_pitfall_1",
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
                id: "msg_1",
                role: "user",
                timestamp: "2026-03-04T00:00:00.000Z",
                content: "I used wrong API and got error",
              },
            ],
            redacted: {
              patterns_applied: [],
              redacted_count: 0,
            },
          };
        },
        async *query() {
          return;
        },
      },
      llm: {
        route() {
          return {
            model: "fake-model",
            provider: {
              id: "mock",
              async complete() {
                return {
                  content:
                    '[{"problem":"Wrong API usage","root_cause":"Used deprecated API","solution":"Use the new endpoint","prevention":"Check docs first","category":"api","confidence":0.9,"evidence_refs":[{"message_id":"msg_1","excerpt":"wrong API"}]}]',
                  tokens: { input: 10, output: 10 },
                };
              },
            },
          };
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

    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].type, "pitfall-card");
    assert.equal(outputs[0].evidence[0].message_id, "msg_1");
  });
});
