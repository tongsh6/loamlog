import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { SessionSnapshot } from "@loamlog/core";
import { writeSessionSnapshot } from "@loamlog/archive";
import { createDistillEngine } from "./engine.js";
import { snapshotToArtifact } from "./query.js";
import { createDistillerRegistry } from "./registry.js";
import { createDistillerStateKV } from "./state.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (!tempDir) {
    return;
  }
  const target = tempDir;
  tempDir = undefined;
  await rm(target, { recursive: true, force: true });
});

function buildSnapshot(sessionId: string): SessionSnapshot {
  return {
    schema_version: "1.0",
    meta: {
      session_id: sessionId,
      captured_at: "2026-03-04T00:00:00.000Z",
      capture_trigger: "session.idle",
      aic_version: "0.1.0",
      provider: "opencode",
    },
    context: {
      cwd: "/tmp/demo",
      worktree: "/tmp/demo",
      repo: "demo/repo",
    },
    time_range: {
      start: "2026-03-04T00:00:00.000Z",
      end: "2026-03-04T00:00:01.000Z",
    },
    session: {},
    messages: [
      {
        id: "msg-1",
        role: "user",
        timestamp: "2026-03-04T00:00:00.000Z",
        content: "bug happened",
      },
    ],
    redacted: {
      patterns_applied: [],
      redacted_count: 0,
    },
  };
}

describe("distill package", () => {
  test("snapshotToArtifact maps aic_version to loam_version", () => {
    const artifact = snapshotToArtifact(buildSnapshot("ses_distill_convert"));
    assert.equal(artifact.meta.loam_version, "0.1.0");
    assert.equal(artifact.meta.session_id, "ses_distill_convert");
  });

  test("state kv stores and marks processed sessions", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-distill-state-"));
    const state = createDistillerStateKV(tempDir, "@test/distiller");

    await state.set("k", { v: 1 });
    const value = await state.get<{ v: number }>("k");
    assert.equal(value?.v, 1);

    await state.markProcessed("@test/distiller", ["ses-1", "ses-2"]);
    const processed = await state.get<Record<string, string>>("processed:@test/distiller");
    assert.equal(typeof processed?.["ses-1"], "string");
    assert.equal(typeof processed?.["ses-2"], "string");
  });

  test("engine runs distiller and sink end-to-end", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-distill-engine-"));
    process.env.OPENAI_API_KEY = "test-key";

    await writeSessionSnapshot({
      dumpDir: tempDir,
      snapshot: buildSnapshot("ses_engine_1"),
    });

    const distillerPath = path.join(tempDir, "distiller.mjs");
    const sinkPath = path.join(tempDir, "sink.mjs");

    await writeFile(
      distillerPath,
      [
        "export default {",
        "  id: '@test/engine-distiller',",
        "  name: 'Engine Distiller',",
        "  version: '0.1.0',",
        "  supported_types: ['pitfall-card'],",
        "  async run({ artifactStore }) {",
        "    for await (const artifact of artifactStore.getUnprocessed('@test/engine-distiller')) {",
        "      return [{",
        "        type: 'pitfall-card',",
        "        title: 't',",
        "        summary: 's',",
        "        confidence: 0.8,",
        "        tags: ['pitfall'],",
        "        payload: { ok: true },",
        "        evidence: [{ session_id: artifact.meta.session_id, message_id: artifact.messages[0].id, excerpt: 'x' }]",
        "      }];",
        "    }",
        "    return [];",
        "  }",
        "};",
      ].join("\n"),
      "utf8",
    );

    await writeFile(
      sinkPath,
      [
        "export default {",
        "  id: '@test/sink',",
        "  name: 'Test Sink',",
        "  version: '0.1.0',",
        "  supports() { return true; },",
        "  async deliver({ results }) { return { delivered: results.length, failed: 0 }; }",
        "};",
      ].join("\n"),
      "utf8",
    );

    const engine = createDistillEngine({
      dumpDir: tempDir,
      config: {
        dump_dir: tempDir,
        distillers: [distillerPath],
        sinks: [sinkPath],
        llm: {
          providers: {
            openai: {
              model: "gpt-4o-mini",
            },
          },
        },
      },
    });

    await engine.loadFromConfig({
      dump_dir: tempDir,
      distillers: [distillerPath],
      sinks: [sinkPath],
      llm: {
        providers: {
          openai: {
            model: "gpt-4o-mini",
          },
        },
      },
    });

    const reports = await engine.run();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].results_produced, 1);
    assert.equal(reports[0].errors.length, 0);
  });

  test("registry loads issue-draft distiller by package specifier", async () => {
    const registry = createDistillerRegistry();
    const plugin = await registry.load("@loamlog/distiller-issue-draft");

    assert.equal(plugin.id, "@loamlog/distiller-issue-draft");
    assert.equal(plugin.supported_types.includes("issue-draft"), true);
  });
});
