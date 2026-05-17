import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  DistillerFactory,
  DistillerRunInput,
  SessionArtifact,
} from "@loamlog/core";
import decisionRationaleFactory from "./decision-rationale.js";
import followUpWorkItemFactory from "./follow-up-work-item.js";
import ideaSeedFactory from "./idea-seed.js";
import practicePitfallFactory from "./practice-pitfall.js";
import { REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS } from "./shared.js";
import skillCandidateFactory from "./skill-candidate.js";

describe("representative asset prompt guardrails", () => {
  const cases: Array<{
    name: string;
    factory: DistillerFactory;
    expected: string[];
  }> = [
    {
      name: "idea-seed",
      factory: ideaSeedFactory,
      expected: ["Reject ordinary summaries", "old roadmap items"],
    },
    {
      name: "follow-up-work-item",
      factory: followUpWorkItemFactory,
      expected: ["future or still-open work", "concrete acceptance criteria"],
    },
    {
      name: "decision-rationale",
      factory: decisionRationaleFactory,
      expected: ["explicit decisions", "fallback was used for troubleshooting"],
    },
    {
      name: "practice-pitfall",
      factory: practicePitfallFactory,
      expected: ["symptom, root cause, and fix", "raw error messages"],
    },
    {
      name: "skill-candidate",
      factory: skillCandidateFactory,
      expected: ["cross-project, repeatable", "single command"],
    },
  ];

  for (const item of cases) {
    test(`${item.name} includes shared and type-specific guardrails`, async () => {
      const captured: string[] = [];
      await item.factory().run(makeRunInput(captured));

      assert.equal(captured.length, 1);
      const systemPrompt = captured[0] ?? "";
      for (const guardrail of REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS) {
        assert.match(systemPrompt, new RegExp(escapeRegExp(guardrail)));
      }
      for (const expected of item.expected) {
        assert.match(systemPrompt, new RegExp(escapeRegExp(expected)));
      }
    });
  }
});

function makeRunInput(capturedSystemPrompts: string[]): DistillerRunInput {
  return {
    artifactStore: {
      async *getUnprocessed() {
        yield makeArtifact();
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
            async complete(input) {
              capturedSystemPrompts.push(input.messages[0]?.content ?? "");
              return {
                content: "[]",
                tokens: { input: 10, output: 1 },
              };
            },
          },
        };
      },
      getDefaultContextWindow() {
        return undefined;
      },
    },
    state: {
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
    },
  } as DistillerRunInput;
}

function makeArtifact(): SessionArtifact {
  return {
    schema_version: "1.0",
    meta: {
      session_id: "ses_prompt_1",
      captured_at: "2026-05-17T00:00:00.000Z",
      capture_trigger: "session.idle",
      loam_version: "0.1.0",
      provider: "opencode",
    },
    context: { cwd: "/tmp", worktree: "/tmp" },
    time_range: {
      start: "2026-05-17T00:00:00.000Z",
      end: "2026-05-17T00:00:01.000Z",
    },
    session: {},
    messages: [
      {
        id: "msg_1",
        role: "user",
        timestamp: "2026-05-17T00:00:00.000Z",
        content: "We need stricter representative asset prompts.",
      },
    ],
    redacted: { patterns_applied: [], redacted_count: 0 },
  };
}

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
  yield* [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
