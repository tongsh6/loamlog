import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  LLMAuthError,
  buildSessionSnapshot,
  type AICConfig,
  type DistillResultDraft,
} from "./index.js";

describe("core distill exports", () => {
  test("exposes distill contracts for consumers", () => {
    const config: AICConfig = {
      dump_dir: "/tmp/loam",
      distillers: ["@loamlog/distiller-pitfall-card"],
      sinks: ["@loamlog/sink-file"],
      llm: {
        timeout_ms: 30_000,
        providers: {
          openai: {
            model: "gpt-4o-mini",
          },
        },
      },
    };

    const draft: DistillResultDraft = {
      type: "pitfall-card",
      title: "bad pattern",
      summary: "bad -> fixed",
      confidence: 0.8,
      tags: ["pitfall"],
      payload: { detail: "x" },
      evidence: [
        {
          session_id: "ses_1",
          message_id: "msg_1",
          excerpt: "excerpt",
        },
      ],
    };

    assert.equal(typeof buildSessionSnapshot, "function");
    assert.equal(config.distillers.length, 1);
    assert.equal(draft.evidence.length, 1);
    assert.equal(config.llm?.timeout_ms, 30_000);
    assert.equal(new LLMAuthError("missing key", "openai").provider, "openai");
  });
});
