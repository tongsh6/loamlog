import assert from "node:assert/strict";
import { describe, test } from "node:test";
import factory from "./index.js";

function emptyQuery() {
  return (async function* () {})();
}

describe("issue-draft distiller", () => {
  test("returns one structured issue draft with markdown render", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_issue_1",
              captured_at: "2026-03-10T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.2.1",
              provider: "opencode",
            },
            context: {
              cwd: "/tmp",
              worktree: "/tmp",
            },
            time_range: {
              start: "2026-03-10T00:00:00.000Z",
              end: "2026-03-10T00:00:01.000Z",
            },
            session: {},
            messages: [
              {
                id: "msg_1",
                role: "user",
                timestamp: "2026-03-10T00:00:00.000Z",
                content: "We should generate a GitHub issue draft from this session.",
              },
              {
                id: "msg_2",
                role: "assistant",
                timestamp: "2026-03-10T00:00:01.000Z",
                content: "The first MVP should stay local-first and output markdown.",
              },
            ],
            redacted: {
              patterns_applied: [],
              redacted_count: 0,
            },
          };
        },
        query() {
          return emptyQuery();
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
                      title: "feat: generate local issue drafts from sessions",
                      summary: "Turn a single AI session into a reusable local issue draft.",
                      background: "Loamlog already archives sessions and can distill local assets.",
                      problem: "There is no built-in issue draft distiller yet.",
                      proposed_solution: "Add an issue-draft distiller that emits evidence-backed markdown.",
                      acceptance_criteria: [
                        "Generate one issue draft from a single session",
                        "Include evidence backlinks",
                      ],
                      confidence: 0.92,
                      issue_kind: "feature",
                      labels: ["triage", "distill"],
                      evidence_refs: [{ message_id: "msg_1", excerpt: "generate a GitHub issue draft" }],
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
    assert.equal(outputs[0].type, "issue-draft");
    assert.equal(outputs[0].payload.title, "feat: generate local issue drafts from sessions");
    assert.equal(outputs[0].payload.issue_kind, "feature");
    assert.deepEqual(outputs[0].payload.labels, ["triage", "distill"]);
    assert.equal(outputs[0].evidence[0].message_id, "msg_1");
    assert.match(outputs[0].render?.markdown ?? "", /## Background/);
    assert.match(outputs[0].render?.markdown ?? "", /## Evidence/);
  });

  test("skips drafts without valid evidence references", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_issue_2",
              captured_at: "2026-03-10T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.2.1",
              provider: "opencode",
            },
            context: {
              cwd: "/tmp",
              worktree: "/tmp",
            },
            time_range: {
              start: "2026-03-10T00:00:00.000Z",
              end: "2026-03-10T00:00:01.000Z",
            },
            session: {},
            messages: [
              {
                id: "msg_known",
                role: "user",
                timestamp: "2026-03-10T00:00:00.000Z",
                content: "We need stronger evidence handling.",
              },
            ],
            redacted: {
              patterns_applied: [],
              redacted_count: 0,
            },
          };
        },
        query() {
          return emptyQuery();
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
                      title: "fix: weak issue draft",
                      summary: "Do not output weak drafts.",
                      background: "Weak drafts are noisy.",
                      problem: "There is no valid evidence.",
                      proposed_solution: "Skip the draft.",
                      acceptance_criteria: ["Produce nothing without valid evidence"],
                      confidence: 0.8,
                      evidence_refs: [{ message_id: "msg_missing", excerpt: "missing evidence" }],
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

    assert.equal(outputs.length, 0);
  });

  test("keeps only the strongest valid draft per session", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_issue_3",
              captured_at: "2026-03-10T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.2.1",
              provider: "opencode",
            },
            context: {
              cwd: "/tmp",
              worktree: "/tmp",
            },
            time_range: {
              start: "2026-03-10T00:00:00.000Z",
              end: "2026-03-10T00:00:01.000Z",
            },
            session: {},
            messages: [
              {
                id: "msg_a",
                role: "user",
                timestamp: "2026-03-10T00:00:00.000Z",
                content: "First candidate evidence.",
              },
              {
                id: "msg_b",
                role: "assistant",
                timestamp: "2026-03-10T00:00:01.000Z",
                content: "Second candidate evidence.",
              },
            ],
            redacted: {
              patterns_applied: [],
              redacted_count: 0,
            },
          };
        },
        query() {
          return emptyQuery();
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
                      title: "docs: weaker draft",
                      summary: "Weaker summary.",
                      background: "A weaker draft exists.",
                      problem: "This one should lose.",
                      proposed_solution: "Do not keep it.",
                      acceptance_criteria: ["Should not be selected"],
                      confidence: 0.4,
                      evidence_refs: [{ message_id: "msg_a", excerpt: "First candidate evidence" }],
                    },
                    {
                      title: "feat: stronger draft",
                      summary: "Stronger summary.",
                      background: "A stronger draft exists.",
                      problem: "This one should win.",
                      proposed_solution: "Keep the highest-confidence valid draft.",
                      acceptance_criteria: ["Only one draft remains"],
                      confidence: 0.9,
                      evidence_refs: [{ message_id: "msg_b", excerpt: "Second candidate evidence" }],
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
    assert.equal(outputs[0].title, "feat: stronger draft");
    assert.equal(outputs[0].evidence[0].message_id, "msg_b");
  });

  test("skips drafts with blank titles even if evidence exists", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_issue_4",
              captured_at: "2026-03-10T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.2.1",
              provider: "opencode",
            },
            context: {
              cwd: "/tmp",
              worktree: "/tmp",
            },
            time_range: {
              start: "2026-03-10T00:00:00.000Z",
              end: "2026-03-10T00:00:01.000Z",
            },
            session: {},
            messages: [
              {
                id: "msg_title",
                role: "user",
                timestamp: "2026-03-10T00:00:00.000Z",
                content: "Evidence exists, but the title is blank.",
              },
            ],
            redacted: {
              patterns_applied: [],
              redacted_count: 0,
            },
          };
        },
        query() {
          return emptyQuery();
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
                      title: "   ",
                      summary: "Still not valid.",
                      background: "Blank title should be rejected.",
                      problem: "An empty title is unusable.",
                      proposed_solution: "Skip it entirely.",
                      acceptance_criteria: ["Do not emit blank titles"],
                      confidence: 0.95,
                      evidence_refs: [{ message_id: "msg_title", excerpt: "title is blank" }],
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

    assert.equal(outputs.length, 0);
  });

  test("uses deterministic tie-breaks for equal confidence candidates", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_issue_5",
              captured_at: "2026-03-10T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.2.1",
              provider: "opencode",
            },
            context: {
              cwd: "/tmp",
              worktree: "/tmp",
            },
            time_range: {
              start: "2026-03-10T00:00:00.000Z",
              end: "2026-03-10T00:00:01.000Z",
            },
            session: {},
            messages: [
              {
                id: "msg_1",
                role: "user",
                timestamp: "2026-03-10T00:00:00.000Z",
                content: "alpha evidence",
              },
              {
                id: "msg_2",
                role: "assistant",
                timestamp: "2026-03-10T00:00:01.000Z",
                content: "beta evidence",
              },
            ],
            redacted: {
              patterns_applied: [],
              redacted_count: 0,
            },
          };
        },
        query() {
          return emptyQuery();
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
                      title: "zeta candidate",
                      summary: "Later alphabetically.",
                      background: "Only one evidence ref.",
                      problem: "Needs deterministic ordering.",
                      proposed_solution: "Prefer more evidence first.",
                      acceptance_criteria: ["Tie-break is stable"],
                      confidence: 0.8,
                      evidence_refs: [{ message_id: "msg_1", excerpt: "alpha evidence" }],
                    },
                    {
                      title: "alpha candidate",
                      summary: "Should win via evidence count.",
                      background: "Two evidence refs.",
                      problem: "Ties should not be random.",
                      proposed_solution: "Use stable sorting.",
                      acceptance_criteria: ["Tie-break is stable"],
                      confidence: 0.8,
                      evidence_refs: [
                        { message_id: "msg_1", excerpt: "alpha evidence" },
                        { message_id: "msg_2", excerpt: "beta evidence" },
                      ],
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
    assert.equal(outputs[0].title, "alpha candidate");
    assert.equal(outputs[0].evidence.length, 2);
  });
});
