import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyLlmOverride, applyLlmTimeoutOverride, parseArgs } from "./distill.js";

describe("distill cli helpers", () => {
  test("parseArgs reads llm timeout override", () => {
    const parsed = parseArgs([
      "--llm",
      "deepseek/deepseek-chat",
      "--llm-timeout-ms",
      "1234",
      "--dump-dir",
      "/tmp/loam",
    ]);

    assert.equal(parsed.llm, "deepseek/deepseek-chat");
    assert.equal(parsed.llmTimeoutMs, 1234);
    assert.equal(parsed.dumpDir, "/tmp/loam");
  });

  test("applyLlmOverride moves selected provider to highest priority", () => {
    const next = applyLlmOverride(
      {
        dump_dir: "/tmp/loam",
        distillers: ["@loamlog/distiller-pitfall-card"],
        llm: {
          providers: {
            openai: { model: "gpt-4o-mini" },
            deepseek: { model: "deepseek-chat" },
          },
        },
      },
      "deepseek/deepseek-reasoner",
    );

    assert.deepEqual(Object.keys(next.llm?.providers ?? {}), ["deepseek", "openai"]);
    assert.equal(next.llm?.providers?.deepseek?.model, "deepseek-reasoner");
    assert.equal(next.llm?.providers?.openai?.model, "gpt-4o-mini");
  });

  test("applyLlmTimeoutOverride sets timeout in llm config", () => {
    const next = applyLlmTimeoutOverride(
      {
        dump_dir: "/tmp/loam",
        distillers: ["@loamlog/distiller-pitfall-card"],
      },
      30000,
    );

    assert.equal(next.llm?.timeout_ms, 30000);
  });
});
