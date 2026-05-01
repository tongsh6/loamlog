import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { SessionSnapshot } from "@loamlog/core";
import { writeSessionSnapshot } from "@loamlog/archive";
import { validateDAG } from "@loamlog/pipeline";
import { createDistillerStateKV } from "./state.js";
import { createDistillDAG, runDistillDAG } from "./dag-runner.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (!tempDir) return;
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
        content: "TODO: refactor this module",
      },
    ],
    redacted: {
      patterns_applied: [],
      redacted_count: 0,
    },
  };
}

function makeLLMRouter() {
  return {
    route() {
      return { provider: { id: "mock", complete: async () => ({ content: "{}", tokens: { input: 0, output: 0 } }) }, model: "mock" };
    },
  };
}

describe("createDistillDAG", () => {
  test("generates a valid DAG with 4 nodes and 3 edges", () => {
    const dag = createDistillDAG(
      {
        distiller: {
          id: "@test/dag-distiller",
          name: "Test",
          version: "0.1.0",
          supported_types: ["test"],
          async run() {
            return [];
          },
        },
        llm: makeLLMRouter(),
        state: createDistillerStateKV("/tmp", "@test/dag-distiller"),
        sinks: [],
        dumpDir: "/tmp",
      },
      { results: [], skipped: 0, errors: [], artifactsProcessed: 0 },
    );

    const errors = validateDAG(dag);
    assert.deepEqual(errors, []);
    assert.equal(dag.nodes.length, 4);
    assert.equal(dag.edges.length, 3);

    const ids = dag.nodes.map((n) => n.id);
    assert.ok(ids.includes("query_artifacts"));
    assert.ok(ids.includes("run_distiller"));
    assert.ok(ids.includes("process_results"));
    assert.ok(ids.includes("deliver_to_sinks"));
  });
});

describe("runDistillDAG", () => {
  test("runs end-to-end with a session and produces results", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-dag-e2e-"));
    process.env.OPENAI_API_KEY = "test-key";

    // Write a session snapshot so there's something to process
    await writeSessionSnapshot({
      dumpDir: tempDir,
      snapshot: buildSnapshot("ses_dag_e2e"),
    });

    const distillerPath = path.join(tempDir, "dag-distiller.mjs");
    const sinkPath = path.join(tempDir, "dag-sink.mjs");

    await writeFile(
      distillerPath,
      [
        "export default {",
        "  id: '@test/dag-distiller',",
        "  name: 'DAG Distiller',",
        "  version: '0.1.0',",
        "  supported_types: ['test'],",
        "  async run({ artifactStore }) {",
        "    for await (const artifact of artifactStore.getUnprocessed('@test/dag-distiller')) {",
        "      return [{",
        "        type: 'test',",
        "        title: 'Found TODO',",
        "        summary: 'There is a TODO in the session',",
        "        confidence: 0.9,",
        "        tags: ['todo'],",
        "        payload: { raw: 'TODO: refactor' },",
        "        evidence: [{ session_id: artifact.meta.session_id, message_id: artifact.messages[0].id, excerpt: 'TODO' }]",
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
        "  id: '@test/dag-sink',",
        "  name: 'DAG Sink',",
        "  version: '0.1.0',",
        "  supports() { return true; },",
        "  async deliver({ results }) { return { delivered: results.length, failed: 0 }; }",
        "};",
      ].join("\n"),
      "utf8",
    );

    const { default: distillerFactory } = await import(distillerPath);
    const { default: sinkFactory } = await import(sinkPath);
    const d = typeof distillerFactory === "function" ? distillerFactory() : distillerFactory;
    const s = typeof sinkFactory === "function" ? sinkFactory() : sinkFactory;

    const state = createDistillerStateKV(tempDir, "@test/dag-distiller");

    const result = await runDistillDAG({
      distiller: d,
      llm: makeLLMRouter(),
      state,
      sinks: [{ plugin: s, config: {} }],
      dumpDir: tempDir,
    });

    assert.equal(result.report.status, "success");
    assert.equal(result.results.length, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.artifactsProcessed, 1);

    // Phase 3: asset graph was populated
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].candidate_type, "test");
    assert.equal(result.candidates[0].title, "Found TODO");
    assert.equal(result.qualityReports.length, 1);
    assert.equal(result.qualityReports[0].passed, true);

    // Phase 4: audit records were generated
    assert.equal(result.audit.length, 1);
    assert.equal(result.audit[0].candidate_type, "test");
    assert.equal(result.audit[0].delivery_status, "delivered");

    // Verify execution report has all 4 nodes
    const nodeIds = result.report.nodes.map((n) => n.nodeId);
    assert.ok(nodeIds.includes("query_artifacts"));
    assert.ok(nodeIds.includes("run_distiller"));
    assert.ok(nodeIds.includes("process_results"));
    assert.ok(nodeIds.includes("deliver_to_sinks"));

    // All nodes should succeed
    assert.equal(result.report.nodes.every((n) => n.status === "success"), true);
  });

  test("runs without artifacts without error", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-dag-empty-"));

    const state = createDistillerStateKV(tempDir, "@test/dag-empty");

    const result = await runDistillDAG({
      distiller: {
        id: "@test/dag-empty",
        name: "Empty",
        version: "0.1.0",
        supported_types: ["empty"],
        async run() {
          return [];
        },
      },
      llm: makeLLMRouter(),
      state,
      sinks: [],
      dumpDir: tempDir,
    });

    assert.equal(result.report.status, "success");
    assert.equal(result.results.length, 0);
    assert.equal(result.artifactsProcessed, 0);
  });

  test("skips duplicate results via fingerprint dedup", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-dag-dedup-"));
    process.env.OPENAI_API_KEY = "test-key";

    await writeSessionSnapshot({
      dumpDir: tempDir,
      snapshot: buildSnapshot("ses_dag_dedup"),
    });

    const state = createDistillerStateKV(tempDir, "@test/dag-dedup");

    // Pre-populate fingerprint
    const { createHash } = await import("node:crypto");
    const fp = createHash("sha256")
      .update("@test/dag-dedup:ses_dag_dedup:{\"raw\":\"TODO: refactor\"}")
      .digest("hex");
    await state.set("fingerprints", { [fp]: true });

    const result = await runDistillDAG({
      distiller: {
        id: "@test/dag-dedup",
        name: "Dedup",
        version: "0.1.0",
        supported_types: ["test"],
        async run({ artifactStore }) {
          for await (const artifact of artifactStore.getUnprocessed("@test/dag-dedup")) {
            return [{
              type: "test",
              title: "Found TODO",
              summary: "There is a TODO",
              confidence: 0.9,
              tags: ["todo"],
              payload: { raw: "TODO: refactor" },
              evidence: [{ session_id: artifact.meta.session_id, message_id: artifact.messages[0].id, excerpt: "TODO" }],
            }];
          }
          return [];
        },
      },
      llm: makeLLMRouter(),
      state,
      sinks: [],
      dumpDir: tempDir,
    });

    assert.equal(result.skipped, 1);
    assert.equal(result.results.length, 0);
  });
});

describe("approval gate + external sink integration", () => {
  function makeExternalSink(id: string) {
    return {
      id,
      name: `External ${id}`,
      version: "0.1.0",
      supports: () => true,
      deliver: async (input: { results: Array<{ id: string; title: string }>; config: Record<string, unknown> }) => {
        return { delivered: input.results.length, failed: 0 };
      },
    };
  }

  test("delivers to external sink when allowExternal is true", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-dag-ext-allow-"));
    process.env.OPENAI_API_KEY = "test-key";

    await writeSessionSnapshot({
      dumpDir: tempDir,
      snapshot: buildSnapshot("ses_ext_allow"),
    });

    const extSink = makeExternalSink("@test/github-sink");
    const state = createDistillerStateKV(tempDir, "@test/ext-allow");

    const result = await runDistillDAG({
      distiller: {
        id: "@test/ext-allow",
        name: "Ext Allow",
        version: "0.1.0",
        supported_types: ["issue-draft"],
        async run({ artifactStore }: { artifactStore: { getUnprocessed: (id: string) => AsyncIterable<{ meta: { session_id: string }; messages: Array<{ id: string }> }> } }) {
          for await (const a of artifactStore.getUnprocessed("@test/ext-allow")) {
            return [{
              type: "issue-draft", title: "Allowed", summary: "Should work",
              confidence: 0.9, tags: ["test"], payload: {},
              evidence: [{ session_id: a.meta.session_id, message_id: a.messages[0].id, excerpt: "x" }],
            }];
          }
          return [];
        },
      },
      llm: makeLLMRouter(),
      state,
      sinks: [{ plugin: extSink, config: {} }],
      dumpDir: tempDir,
      allowExternal: true,
    });

    assert.equal(result.report.status, "success");
    assert.equal(result.results.length, 1);
    assert.ok(result.audit.length > 0);
  });

  test("generates audit records for external delivery", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-dag-ext-audit-"));
    process.env.OPENAI_API_KEY = "test-key";

    await writeSessionSnapshot({
      dumpDir: tempDir,
      snapshot: buildSnapshot("ses_ext_audit"),
    });

    const extSink = makeExternalSink("@test/ext-sink");
    const state = createDistillerStateKV(tempDir, "@test/ext-audit");

    const result = await runDistillDAG({
      distiller: {
        id: "@test/ext-audit",
        name: "Ext Audit",
        version: "0.1.0",
        supported_types: ["issue-draft"],
        async run({ artifactStore }: { artifactStore: { getUnprocessed: (id: string) => AsyncIterable<{ meta: { session_id: string }; messages: Array<{ id: string }> }> } }) {
          for await (const a of artifactStore.getUnprocessed("@test/ext-audit")) {
            return [{
              type: "issue-draft", title: "Audit Test", summary: "Test",
              confidence: 0.95, tags: ["test"], payload: {},
              evidence: [{ session_id: a.meta.session_id, message_id: a.messages[0].id, excerpt: "test" }],
            }];
          }
          return [];
        },
      },
      llm: makeLLMRouter(),
      state,
      sinks: [{ plugin: extSink, config: {} }],
      dumpDir: tempDir,
      allowExternal: true,
    });

    assert.equal(result.audit.length, 1);
    const audit = result.audit[0];
    assert.equal(audit.candidate_type, "issue-draft");
    assert.equal(audit.delivery_status, "delivered");
    assert.ok(audit.id.startsWith("audit-"));
    assert.ok(audit.session_id);
  });
});
