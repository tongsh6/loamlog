import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { DistillerPlugin, Signal, SessionArtifact } from "@loamlog/core";
import {
  scopeArtifactToSignals,
  selectSignalsForEvidence,
  selectSignalsForDistiller,
} from "./signal-routing.js";

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const machine_classification = {
    kind: "task_delta" as const,
    tags: ["created" as const],
    actor: "user" as const,
    temporal_state: "future" as const,
    confidence: 0.84,
  };
  return {
    id: "sig-1",
    scope: "message",
    kind: machine_classification.kind,
    tags: machine_classification.tags,
    actor: machine_classification.actor,
    temporal_state: machine_classification.temporal_state,
    confidence: machine_classification.confidence,
    spans: [
      {
        session_id: "ses-1",
        message_id: "msg-1",
        excerpt: "Create the signal router.",
      },
    ],
    review_status: "accepted",
    machine_classification,
    promotion_hints: [],
    classifier: {
      id: "signal-gate",
      version: "0.1.0",
      model: "test",
      prompt_version: "test",
    },
    created_at: "2026-05-15T00:00:00.000Z",
    updated_at: "2026-05-15T00:00:00.000Z",
    ...overrides,
  };
}

const followUpDistiller: Pick<DistillerPlugin, "id" | "consumes_signals"> = {
  id: "@loamlog/distiller-follow-up-work-item",
  consumes_signals: [
    {
      kind: "task_delta",
      tags: ["created"],
      min_confidence: 0.6,
      allowed_actors: ["user", "mixed"],
      allowed_temporal_states: ["future", "current", "in_progress"],
    },
  ],
};

describe("signal routing", () => {
  test("selects accepted signals that satisfy distiller manifest rules", () => {
    const matches = selectSignalsForDistiller(
      [
        makeSignal({ id: "sig-ok" }),
        makeSignal({
          id: "sig-low",
          confidence: 0.2,
          machine_classification: {
            kind: "task_delta",
            tags: ["created"],
            actor: "user",
            temporal_state: "future",
            confidence: 0.2,
          },
        }),
        makeSignal({
          id: "sig-noise",
          review_status: "ignored",
          machine_classification: {
            kind: "noise",
            tags: ["process_log"],
            actor: "assistant",
            temporal_state: "in_progress",
            confidence: 0.95,
          },
        }),
      ],
      followUpDistiller,
    );

    assert.deepEqual(
      matches.map((match) => match.signal.id),
      ["sig-ok"],
    );
  });

  test("uses reviewed classification before machine classification", () => {
    const signal = makeSignal({
      id: "sig-reviewed",
      reviewed_classification: {
        kind: "noise",
        tags: ["process_log"],
        actor: "assistant",
        temporal_state: "unknown",
        confidence: 0.96,
        reviewer: "human",
        reviewed_at: "2026-05-15T01:00:00.000Z",
      },
    });

    const matches = selectSignalsForDistiller([signal], followUpDistiller);

    assert.equal(matches.length, 0);
  });

  test("does not route distiller-targeted ineligible hints", () => {
    const signal = makeSignal({
      promotion_hints: [
        {
          target_distiller: "@loamlog/distiller-follow-up-work-item",
          eligibility: "ineligible",
          reason: "completed work should not become a follow-up",
        },
      ],
    });

    assert.equal(
      selectSignalsForDistiller([signal], followUpDistiller).length,
      0,
    );
  });

  test("scopes artifacts to messages referenced by selected signals", () => {
    const artifact: SessionArtifact = {
      schema_version: "1.0",
      meta: {
        session_id: "ses-1",
        captured_at: "2026-05-15T00:00:00.000Z",
        capture_trigger: "manual",
        loam_version: "0.1.0",
        provider: "test",
      },
      context: {
        cwd: "/repo",
        worktree: "/repo",
      },
      time_range: {
        start: "2026-05-15T00:00:00.000Z",
        end: "2026-05-15T00:00:01.000Z",
      },
      session: {},
      messages: [
        {
          id: "msg-1",
          role: "user",
          timestamp: "2026-05-15T00:00:00.000Z",
          content: "Create the signal router.",
        },
        {
          id: "msg-2",
          role: "assistant",
          timestamp: "2026-05-15T00:00:01.000Z",
          content: "I will inspect files first.",
        },
      ],
      redacted: {
        patterns_applied: [],
        redacted_count: 0,
      },
    };

    const scoped = scopeArtifactToSignals(artifact, [makeSignal()]);

    assert.deepEqual(
      scoped.messages.map((message) => message.id),
      ["msg-1"],
    );
    assert.equal(artifact.messages.length, 2);
  });

  test("selects only signals whose spans overlap candidate evidence", () => {
    const matches = selectSignalsForEvidence(
      [
        makeSignal({
          id: "sig-used",
          spans: [
            {
              session_id: "ses-1",
              message_id: "msg-1",
              excerpt: "Create the signal router.",
            },
          ],
        }),
        makeSignal({
          id: "sig-unrelated",
          spans: [
            {
              session_id: "ses-1",
              message_id: "msg-2",
              excerpt: "Review the quality report.",
            },
          ],
        }),
        makeSignal({
          id: "sig-other-session",
          spans: [
            {
              session_id: "ses-2",
              message_id: "msg-1",
              excerpt: "Create the signal router.",
            },
          ],
        }),
      ],
      [
        {
          session_id: "ses-1",
          message_id: "msg-1",
          excerpt: "Create the signal router.",
        },
      ],
    );

    assert.deepEqual(
      matches.map((signal) => signal.id),
      ["sig-used"],
    );
  });
});
