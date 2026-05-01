import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./index.js";

describe("prd-draft distiller", () => {
  test("returns structured prd draft from mocked llm response", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_prd_1",
              captured_at: "2026-05-01T00:00:00.000Z",
              capture_trigger: "session.idle",
              loam_version: "0.1.0",
              provider: "opencode",
            },
            context: { cwd: "/tmp", worktree: "/tmp" },
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
                content: "We need to add dark mode support to the dashboard. Users complain about eye strain.",
              },
              {
                id: "msg_2",
                role: "assistant",
                timestamp: "2026-05-01T00:00:01.000Z",
                content: "I'll use CSS custom properties and a theme context. We need to audit all hardcoded colors first.",
              },
            ],
            redacted: { patterns_applied: [], redacted_count: 0 },
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
                      title: "Dark Mode Support",
                      problem: "Users experience eye strain when using the dashboard at night.",
                      user_story: "As a night-time user, I want a dark color scheme so that I can use the dashboard comfortably in low-light environments.",
                      proposed_solution: "Implement a theme system using CSS custom properties. Add a ThemeContext provider and a toggle in the user settings. Audit and replace all hardcoded color values with theme variables.",
                      technical_notes: "Use prefers-color-scheme media query for auto-detection. Persist preference in localStorage.",
                      dependencies: ["Audit all hardcoded colors in components", "Design dark color palette"],
                      acceptance_criteria: [
                        "Toggle switches between light and dark themes instantly",
                        "All text remains readable (WCAG AA contrast ratio)",
                        "Theme preference persists across page reloads",
                      ],
                      priority: "p1_high",
                      effort: "m",
                      confidence: 0.9,
                      evidence_refs: [
                        { message_id: "msg_1", excerpt: "add dark mode support" },
                        { message_id: "msg_2", excerpt: "CSS custom properties and a theme context" },
                      ],
                    },
                  ]),
                  tokens: { input: 20, output: 40 },
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
    assert.equal(outputs[0].type, "prd-draft");
    assert.equal(outputs[0].payload.title, "Dark Mode Support");
    assert.equal(outputs[0].payload.priority, "p1_high");
    assert.equal(outputs[0].payload.effort, "m");
    assert.equal(outputs[0].payload.acceptance_criteria.length, 3);
    assert.equal(outputs[0].evidence.length, 2);
    assert.equal(outputs[0].evidence[0].message_id, "msg_1");
  });

  test("normalizes unknown priority and effort values", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_prd_2",
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
                      title: "Test Feature",
                      problem: "Test problem.",
                      user_story: "As a user, I want X so that Y.",
                      proposed_solution: "Build X.",
                      priority: "critical",
                      effort: "large",
                      acceptance_criteria: ["Works"],
                      confidence: 0.5,
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
    assert.equal(outputs[0].payload.priority, "p0_critical");
    assert.equal(outputs[0].payload.effort, "l");
  });

  test("skips drafts without required fields", async () => {
    const plugin = factory();

    const outputs = await plugin.run({
      artifactStore: {
        async *getUnprocessed() {
          yield {
            schema_version: "1.0",
            meta: {
              session_id: "ses_prd_3",
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
                    { title: "Incomplete", problem: "", user_story: "", proposed_solution: "" },
                    {
                      title: "Valid",
                      problem: "Real problem.",
                      user_story: "As a user, I want X.",
                      proposed_solution: "Build X.",
                      acceptance_criteria: ["Works"],
                      priority: "p2_medium",
                      effort: "s",
                      confidence: 0.8,
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
    assert.equal(outputs[0].payload.title, "Valid");
  });
});

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
  yield* [];
}
