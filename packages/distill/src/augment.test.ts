import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LLMProvider, LLMRouter, SessionArtifact } from "@loamlog/core";
import {
  detectLanguage,
  resolveOutputLanguage,
  withLanguageRouter,
} from "./augment.js";

function makeArtifact(content: string): SessionArtifact {
  return {
    schema_version: "1.0",
    meta: {
      session_id: "ses-lang",
      captured_at: "2026-05-12T00:00:00.000Z",
      capture_trigger: "test",
      loam_version: "0.1.0",
      provider: "test",
    },
    context: { cwd: "/tmp", worktree: "/tmp" },
    time_range: {
      start: "2026-05-12T00:00:00.000Z",
      end: "2026-05-12T00:00:01.000Z",
    },
    session: {},
    messages: [
      {
        id: "msg-1",
        role: "user",
        timestamp: "2026-05-12T00:00:00.000Z",
        content,
      },
    ],
    redacted: { patterns_applied: [], redacted_count: 0 },
  };
}

function makeRouter(captured: { system?: string }): LLMRouter {
  const provider: LLMProvider = {
    id: "mock",
    async complete(input) {
      captured.system = input.messages.find((m) => m.role === "system")?.content;
      return { content: "{}", tokens: { input: 1, output: 1 } };
    },
  };

  return {
    route() {
      return { provider, model: "mock" };
    },
    getDefaultContextWindow() {
      return undefined;
    },
  };
}

describe("output language augmentation", () => {
  test("auto uses detected Chinese language", () => {
    const artifact = makeArtifact("请帮我总结这个调试经验，后续需要沉淀为知识卡。");
    assert.equal(detectLanguage(artifact), "zh");
    assert.equal(resolveOutputLanguage(artifact, "auto"), "zh");
  });

  test("explicit zh injects Chinese output instruction even for English input", async () => {
    const captured: { system?: string } = {};
    const router = withLanguageRouter(makeRouter(captured), "zh", { explicit: true });

    const { provider, model } = router.route({ task: "extract", budget: "cheap", input_tokens: 10 });
    await provider.complete({
      model,
      messages: [{ role: "system", content: "Return JSON." }],
    });

    assert.match(captured.system ?? "", /Output ALL user-facing content in Chinese/);
  });

  test("explicit en injects English output instruction for Chinese input", async () => {
    const captured: { system?: string } = {};
    const router = withLanguageRouter(makeRouter(captured), "en", { explicit: true });

    const { provider, model } = router.route({ task: "extract", budget: "cheap", input_tokens: 10 });
    await provider.complete({
      model,
      messages: [{ role: "system", content: "Return JSON." }],
    });

    assert.match(captured.system ?? "", /Output ALL user-facing content in English/);
  });
});
