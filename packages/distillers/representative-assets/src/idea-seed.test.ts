import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./idea-seed.js";

describe("idea-seed distiller", () => {
  test("returns idea seed assets with valid evidence", async () => {
    const outputs = await factory().run(
      makeRunInput([
        {
          idea: "Capture ideas before they are forgotten",
          context:
            "The user said AI sessions contain ideas that are lost while pushing current work forward.",
          next_probe: "Try extracting idea seeds from three recent sessions.",
          confidence: 0.86,
          evidence_refs: [
            { message_id: "msg_1", excerpt: "很多想法或者经验要沉淀" },
          ],
        },
      ]),
    );

    assert.equal(factory().id, "@loamlog/distiller-idea-seed");
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].type, "idea-seed");
    assert.equal(
      outputs[0].payload.idea,
      "Capture ideas before they are forgotten",
    );
    assert.equal(
      outputs[0].payload.next_probe,
      "Try extracting idea seeds from three recent sessions.",
    );
    assert.equal(outputs[0].evidence[0].message_id, "msg_1");
  });

  test("drops idea seeds without valid evidence refs", async () => {
    const outputs = await factory().run(
      makeRunInput([
        {
          idea: "Unsupported idea",
          context: "No matching evidence.",
          confidence: 0.8,
          evidence_refs: [{ message_id: "missing", excerpt: "missing" }],
        },
      ]),
    );

    assert.equal(outputs.length, 0);
  });

  test("declares Signal Gate consumption rules", () => {
    const distiller = factory();
    assert.equal(distiller.consumes_signals?.length, 2);
    assert.equal(distiller.consumes_signals?.[0].kind, "intent");
    assert.deepEqual(distiller.consumes_signals?.[0].tags, [
      "goal",
      "content_seed",
    ]);
    assert.deepEqual(distiller.consumes_signals?.[0].allowed_temporal_states, [
      "future",
      "current",
      "unknown",
    ]);
  });
});

function makeRunInput(items: unknown[]) {
  return {
    artifactStore: {
      async *getUnprocessed() {
        yield makeArtifact();
      },
      query() {
        return emptyArtifacts();
      },
    },
    llm: mockLlm(items),
    state: mockState(),
  };
}

function mockLlm(items: unknown[]) {
  return {
    route() {
      return {
        model: "fake-model",
        provider: {
          id: "mock",
          async complete() {
            return {
              content: JSON.stringify(items),
              tokens: { input: 10, output: 10 },
            };
          },
        },
      };
    },
  };
}

function mockState() {
  return {
    async get() {
      return undefined;
    },
    async set() {
      return;
    },
    async update() {
      return;
    },
    async markProcessed() {
      return;
    },
  };
}

function makeArtifact(): SessionArtifact {
  return {
    schema_version: "1.0",
    meta: {
      session_id: "ses_idea_1",
      captured_at: "2026-05-13T00:00:00.000Z",
      capture_trigger: "session.idle",
      loam_version: "0.1.0",
      provider: "opencode",
    },
    context: { cwd: "/tmp", worktree: "/tmp" },
    time_range: {
      start: "2026-05-13T00:00:00.000Z",
      end: "2026-05-13T00:00:01.000Z",
    },
    session: {},
    messages: [
      {
        id: "msg_1",
        role: "user",
        timestamp: "2026-05-13T00:00:00.000Z",
        content: "很多想法或者经验要沉淀，但是困于当前事情推进，过后就忘了。",
      },
    ],
    redacted: { patterns_applied: [], redacted_count: 0 },
  };
}

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
  yield* [];
}
