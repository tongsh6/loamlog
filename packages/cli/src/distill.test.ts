import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  applyLlmOverride,
  applyLlmTimeoutOverride,
  buildRuntimeDistillConfig,
  normalizeBuiltInPluginSpecifiers,
  parseArgs,
} from "./distill.js";

function createBuiltInResolver(): (specifier: string) => string {
  return (specifier: string) => {
    if (specifier === "@loamlog/distiller-pitfall-card") {
      return "/virtual/distiller-pitfall-card/index.js";
    }

    if (specifier === "@loamlog/distiller-issue-draft") {
      return "/virtual/distiller-issue-draft/index.js";
    }

    if (specifier === "@loamlog/sink-file") {
      return "/virtual/sink-file/index.js";
    }

    throw new Error(`unexpected specifier: ${specifier}`);
  };
}

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

  test("buildRuntimeDistillConfig normalizes default built-ins", () => {
    const next = buildRuntimeDistillConfig(
      {
        dump_dir: "/tmp/loam",
        distillers: [],
      },
      undefined,
      createBuiltInResolver(),
    );

    assert.deepEqual(next.distillers, [pathToFileURL("/virtual/distiller-pitfall-card/index.js").href]);
    assert.deepEqual(next.sinks, [pathToFileURL("/virtual/sink-file/index.js").href]);
  });

  test("normalizeBuiltInPluginSpecifiers rewrites config-provided built-ins only", () => {
    const next = normalizeBuiltInPluginSpecifiers(
      {
        dump_dir: "/tmp/loam",
        distillers: [
          "@loamlog/distiller-issue-draft",
          {
            plugin: "@loamlog/distiller-pitfall-card",
            config: { mode: "strict" },
          },
          "./local-distiller.mjs",
          "@custom-org/custom-distiller",
        ],
        sinks: [
          "@loamlog/sink-file",
          {
            plugin: "./local-sink.mjs",
            config: { path: "./out" },
          },
        ],
      },
      createBuiltInResolver(),
    );

    assert.deepEqual(next.distillers, [
      pathToFileURL("/virtual/distiller-issue-draft/index.js").href,
      {
        plugin: pathToFileURL("/virtual/distiller-pitfall-card/index.js").href,
        config: { mode: "strict" },
      },
      "./local-distiller.mjs",
      "@custom-org/custom-distiller",
    ]);

    assert.deepEqual(next.sinks, [
      pathToFileURL("/virtual/sink-file/index.js").href,
      {
        plugin: "./local-sink.mjs",
        config: { path: "./out" },
      },
    ]);
  });

  test("normalizeBuiltInPluginSpecifiers resolves repository built-ins with default resolver", () => {
    const next = normalizeBuiltInPluginSpecifiers({
      dump_dir: "/tmp/loam",
      distillers: ["@loamlog/distiller-pitfall-card"],
      sinks: ["@loamlog/sink-file"],
    });

    assert.match(next.distillers[0] as string, /^file:\/\//);
    assert.match(next.distillers[0] as string, /packages\/(distillers\/pitfall-card\/(src\/index\.ts|dist\/index\.js))$/);
    assert.match(next.sinks?.[0] as string, /^file:\/\//);
    assert.match(next.sinks?.[0] as string, /packages\/(sinks\/file\/(src\/index\.ts|dist\/index\.js))$/);
  });

  test("buildRuntimeDistillConfig normalizes explicit built-in --distiller", () => {
    const next = buildRuntimeDistillConfig(
      {
        dump_dir: "/tmp/loam",
        distillers: ["@loamlog/distiller-pitfall-card"],
        sinks: ["@loamlog/sink-file"],
      },
      "@loamlog/distiller-issue-draft",
      createBuiltInResolver(),
    );

    assert.deepEqual(next.distillers, [pathToFileURL("/virtual/distiller-issue-draft/index.js").href]);
    assert.deepEqual(next.sinks, [pathToFileURL("/virtual/sink-file/index.js").href]);
  });
});
