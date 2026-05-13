import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createExecutionContext } from "@loamlog/core";
import { executeDAG, validateDAG } from "./index.js";
import type { DAGDefinition, PipelineNode } from "./index.js";

const ctx = createExecutionContext({ logger: { info: () => {}, warn: () => {}, error: () => {} } });

function makeNode(
  id: string,
  fn: (input: unknown) => unknown = (x) => x,
  opts?: { timeoutMs?: number; retry?: { maxAttempts?: number; baseDelayMs?: number } },
): PipelineNode {
  return {
    id,
    run: async (input) => fn(input),
    ...opts,
  };
}

describe("validateDAG", () => {
  test("returns empty array for valid DAG", () => {
    const errors = validateDAG({
      nodes: [makeNode("A"), makeNode("B"), makeNode("C")],
      edges: [["A", "B"], ["B", "C"]],
    });
    assert.deepEqual(errors, []);
  });

  test("detects duplicate node ids", () => {
    const errors = validateDAG({
      nodes: [makeNode("A"), makeNode("A")],
      edges: [],
    });
    assert.ok(errors.some((e) => e.includes("duplicate")));
  });

  test("detects unknown edge references", () => {
    const errors = validateDAG({
      nodes: [makeNode("A")],
      edges: [["A", "X"]],
    });
    assert.ok(errors.some((e) => e.includes("unknown")));
  });

  test("detects cycles", () => {
    const errors = validateDAG({
      nodes: [makeNode("A"), makeNode("B"), makeNode("C")],
      edges: [["A", "B"], ["B", "C"], ["C", "A"]],
    });
    assert.ok(errors.some((e) => e.includes("cycle")));
  });
});

describe("executeDAG", () => {
  test("runs a linear DAG sequentially", async () => {
    const order: string[] = [];
    const def: DAGDefinition = {
      nodes: [
        { id: "A", run: async () => { order.push("A"); return { a: 1 }; } },
        { id: "B", run: async (input: unknown) => { order.push("B"); return { b: ((input as Record<string,unknown>).A as Record<string,number> | undefined)?.a }; } },
        { id: "C", run: async () => { order.push("C"); return { c: 3 }; } },
      ],
      edges: [["A", "B"], ["B", "C"]],
    };

    const report = await executeDAG(def, ctx);
    assert.equal(report.status, "success");
    assert.deepEqual(order, ["A", "B", "C"]);
    assert.equal(report.nodes.length, 3);
    assert.ok(report.totalDurationMs >= 0);
  });

  test("runs independent nodes in parallel at same level", async () => {
    const starts: number[] = [];
    const finishes: number[] = [];
    const makeDelayed = (id: string, delayMs: number): PipelineNode => ({
      id,
      run: async () => {
        starts.push(Date.now());
        await new Promise((r) => setTimeout(r, delayMs));
        finishes.push(Date.now());
        return id;
      },
    });

    const def: DAGDefinition = {
      nodes: [makeDelayed("A", 50), makeDelayed("B", 50)],
      edges: [],
    };

    const report = await executeDAG(def, ctx, { concurrency: 4 });
    assert.equal(report.status, "success");

    // Both should have started before either finished (parallel execution)
    const secondStart = starts[1];
    const firstFinish = finishes[0];
    assert.ok(secondStart < firstFinish, "second node should start before first finishes");
  });

  test("skips downstream nodes when upstream fails", async () => {
    const executed: string[] = [];
    const def: DAGDefinition = {
      nodes: [
        {
          id: "A",
          run: async () => { executed.push("A"); throw new Error("A failed"); },
        },
        {
          id: "B",
          run: async () => { executed.push("B"); return "ok"; },
        },
      ],
      edges: [["A", "B"]],
    };

    const report = await executeDAG(def, ctx);
    assert.equal(report.status, "partial_failure");
    assert.deepEqual(executed, ["A"]);

    const aReport = report.nodes.find((n) => n.nodeId === "A");
    assert.equal(aReport?.status, "failed");
    assert.ok(aReport?.error?.includes("A failed"));

    const bReport = report.nodes.find((n) => n.nodeId === "B");
    assert.equal(bReport?.status, "skipped");
  });

  test("unrelated branches continue after a failure", async () => {
    const executed: string[] = [];
    const def: DAGDefinition = {
      nodes: [
        { id: "A", run: async () => { executed.push("A"); throw new Error("fail"); } },
        { id: "B", run: async () => { executed.push("B"); return "ok"; } },
        { id: "C", run: async () => { executed.push("C"); return "ok"; } },
      ],
      edges: [["A", "B"]],
    };

    const report = await executeDAG(def, ctx);
    assert.equal(report.status, "partial_failure");

    // C should run because it has no failing upstream
    assert.ok(executed.includes("C"));
    // B should be skipped because A failed
    assert.ok(!executed.includes("B"));
  });

  test("produces node reports with duration and summaries", async () => {
    const def: DAGDefinition = {
      nodes: [
        { id: "fetch", run: async () => ({ data: [1, 2, 3] }) },
        { id: "transform", run: async () => ({ result: "done" }) },
      ],
      edges: [["fetch", "transform"]],
    };

    const report = await executeDAG(def, ctx);
    assert.equal(report.nodes.length, 2);

    const fetchReport = report.nodes.find((n) => n.nodeId === "fetch");
    assert.equal(fetchReport?.status, "success");
    assert.ok(fetchReport.durationMs >= 0);
    assert.ok(fetchReport.outputSummary?.includes("Object"), `expected Object, got: ${fetchReport.outputSummary}`);

    const transformReport = report.nodes.find((n) => n.nodeId === "transform");
    assert.equal(transformReport?.status, "success");
    assert.ok(transformReport.inputSummary?.includes("Object"), `expected Object, got: ${transformReport.inputSummary}`);
  });
});

describe("issue-draft vertical slice DAG", () => {
  test("models the capture→archive→distill→sink pipeline", async () => {
    const store: Record<string, unknown> = {};

    const def: DAGDefinition = {
      nodes: [
        {
          id: "capture_validate",
          run: async () => {
            return { session_id: "ses_001", valid: true, message_count: 5 };
          },
        },
        {
          id: "sanitize_snapshot",
          run: async (input: unknown) => {
            const captured = (input as Record<string, unknown>).capture_validate as Record<string, unknown>;
            store.sanitized = true;
            return { ...captured, sanitized: true, redacted_count: 2 };
          },
        },
        {
          id: "persist_snapshot",
          run: async (input: unknown) => {
            const sanitized = (input as Record<string, unknown>).sanitize_snapshot as Record<string, unknown>;
            store.persisted = sanitized;
            return { path: "/tmp/snapshots/ses_001.json" };
          },
        },
        {
          id: "trigger_score",
          run: async (input: unknown) => {
            const p = (input as Record<string, unknown>).persist_snapshot as Record<string, unknown>;
            return { path: p.path, score: 0.85, should_distill: true };
          },
        },
        {
          id: "distill_issue_draft",
          run: async (input: unknown) => {
            const triggered = (input as Record<string, unknown>).trigger_score as Record<string, unknown>;
            if (triggered.should_distill) {
              return { title: "Fix authentication bug", type: "issue-draft", confidence: 0.9 };
            }
            return null;
          },
        },
        {
          id: "validate_evidence",
          run: async (input: unknown) => {
            const draft = (input as Record<string, unknown>).distill_issue_draft as Record<string, unknown> | null;
            if (!draft) return { valid: false, reason: "no draft produced" };
            return { valid: true, title: draft.title, evidence_count: 3 };
          },
        },
        {
          id: "sink_file",
          run: async (input: unknown) => {
            const validated = (input as Record<string, unknown>).validate_evidence as Record<string, unknown>;
            if (validated.valid) {
              store.sink_result = validated;
              return { delivered: true, path: "/tmp/distill/ses_001.md" };
            }
            return { delivered: false };
          },
        },
      ],
      edges: [
        ["capture_validate", "sanitize_snapshot"],
        ["sanitize_snapshot", "persist_snapshot"],
        ["persist_snapshot", "trigger_score"],
        ["trigger_score", "distill_issue_draft"],
        ["distill_issue_draft", "validate_evidence"],
        ["validate_evidence", "sink_file"],
      ],
    };

    const report = await executeDAG(def, ctx, { concurrency: 2 });
    assert.equal(report.status, "success");
    assert.equal(report.nodes.length, 7);

    // All nodes succeeded
    for (const n of report.nodes) {
      assert.equal(n.status, "success", `${n.nodeId} should succeed, got: ${n.error}`);
      assert.ok(n.durationMs >= 0);
    }

    // Sink should have delivered
    const sinkReport = report.nodes.find((n) => n.nodeId === "sink_file");
    assert.ok(sinkReport?.outputSummary?.includes("Object"), `expected Object summary, got: ${sinkReport?.outputSummary}`);

    // Store should have the final result
    assert.equal((store.sink_result as Record<string, unknown>)?.title, "Fix authentication bug");
  });

  test("skips sink when evidence validation fails", async () => {
    const def: DAGDefinition = {
      nodes: [
        { id: "distill_issue_draft", run: async () => ({ title: "Weak signal", confidence: 0.3 }) },
        {
          id: "validate_evidence",
          run: async () => {
            throw new Error("evidence check failed: confidence too low");
          },
        },
        {
          id: "sink_file",
          run: async () => ({ delivered: true }),
        },
      ],
      edges: [
        ["distill_issue_draft", "validate_evidence"],
        ["validate_evidence", "sink_file"],
      ],
    };

    const report = await executeDAG(def, ctx);
    assert.equal(report.status, "partial_failure");

    const validate = report.nodes.find((n) => n.nodeId === "validate_evidence");
    assert.equal(validate?.status, "failed");

    const sink = report.nodes.find((n) => n.nodeId === "sink_file");
    assert.equal(sink?.status, "skipped");
  });
});
