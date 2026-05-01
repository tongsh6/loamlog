import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./index.js";

describe("knowledge-card distiller", () => {
  test("returns structured knowledge cards from mocked llm response", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_kc_1",
              captured_at: "2026-05-01T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.1.0",
              provider: "opencode",
            },
            context: {
              cwd: "/tmp",
              worktree: "/tmp",
            },
            time_range: {
              start: "2026-05-01T00:00:00.000Z",
              end: "2026-05-01T00:00:01.000Z",
            },
            session: {},
            messages: [
              {
                id: "msg_1",
                role: "user",
                timestamp: "2026-05-01T00:00:00.000Z",
                content: "How do I configure Biome for a monorepo?",
              },
              {
                id: "msg_2",
                role: "assistant",
                timestamp: "2026-05-01T00:00:01.000Z",
                content: "Use biome.json at root and extend per package. Set vcs.enabled=true for git-aware linting.",
              },
            ],
            redacted: {
              patterns_applied: [],
              redacted_count: 0,
            },
          };
        },
        query() {
          return emptyArtifacts();
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
                  content: JSON.stringify([
                    {
                      title: "Biome Monorepo Configuration",
                      category: "configuration",
                      summary: "Use root biome.json with vcs integration for git-aware linting across packages.",
                      detail: "Place a single biome.json at the monorepo root. Enable vcs.enabled and useIgnoreFile so Biome respects .gitignore. Each package can extend with its own biome.json for overrides.",
                      tags: ["biome", "monorepo", "linting"],
                      confidence: 0.85,
                      evidence_refs: [
                        { message_id: "msg_2", excerpt: "Use biome.json at root and extend per package" },
                      ],
                    },
                  ]),
                  tokens: { input: 20, output: 30 },
                };
              },
            },
          };
        },
      },
      state: {
        async get() { return undefined; },
        async set() { return; },
        async update() { return; },
        async markProcessed() { return; },
      },
    });

    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].type, "knowledge-card");
    assert.equal(outputs[0].payload.category, "configuration");
    assert.deepEqual(outputs[0].payload.tags, ["biome", "monorepo", "linting"]);
    assert.equal(outputs[0].evidence[0].message_id, "msg_2");
  });

  test("deduplicates cards with same title", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_kc_2",
              captured_at: "2026-05-01T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.1.0",
              provider: "opencode",
            },
            context: { cwd: "/tmp", worktree: "/tmp" },
            time_range: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-01T00:00:01.000Z" },
            session: {},
            messages: [
              {
                id: "msg_1",
                role: "user",
                timestamp: "2026-05-01T00:00:00.000Z",
                content: "test",
              },
            ],
            redacted: { patterns_applied: [], redacted_count: 0 },
          };
        },
        query() { return emptyArtifacts(); },
      },
      llm: {
        route() {
          return {
            model: "fake-model",
            provider: {
              id: "mock",
              async complete() {
                return {
                  content: JSON.stringify([
                    {
                      title: "Same Title",
                      category: "pattern",
                      summary: "First occurrence.",
                      detail: "First occurrence detail.",
                      tags: ["test"],
                      confidence: 0.8,
                      evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
                    },
                    {
                      title: "Same Title",
                      category: "insight",
                      summary: "Duplicate.",
                      detail: "Duplicate detail.",
                      tags: ["dup"],
                      confidence: 0.6,
                      evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
                    },
                  ]),
                  tokens: { input: 10, output: 10 },
                };
              },
            },
          };
        },
      },
      state: {
        async get() { return undefined; },
        async set() { return; },
        async update() { return; },
        async markProcessed() { return; },
      },
    });

    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].title, "Same Title");
  });

  test("normalizes unknown categories to insight", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_kc_3",
              captured_at: "2026-05-01T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.1.0",
              provider: "opencode",
            },
            context: { cwd: "/tmp", worktree: "/tmp" },
            time_range: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-01T00:00:01.000Z" },
            session: {},
            messages: [
              {
                id: "msg_1",
                role: "user",
                timestamp: "2026-05-01T00:00:00.000Z",
                content: "test",
              },
            ],
            redacted: { patterns_applied: [], redacted_count: 0 },
          };
        },
        query() { return emptyArtifacts(); },
      },
      llm: {
        route() {
          return {
            model: "fake-model",
            provider: {
              id: "mock",
              async complete() {
                return {
                  content: JSON.stringify([
                    {
                      title: "Something unusual",
                      category: "random-blah",
                      summary: "Test category normalization.",
                      detail: "Should become insight.",
                      tags: ["misc"],
                      confidence: 0.7,
                      evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
                    },
                  ]),
                  tokens: { input: 10, output: 10 },
                };
              },
            },
          };
        },
      },
      state: {
        async get() { return undefined; },
        async set() { return; },
        async update() { return; },
        async markProcessed() { return; },
      },
    });

    assert.equal(outputs.length, 1);
    assert.equal(outputs[0].payload.category, "insight");
  });
});

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
  yield* [];
}
