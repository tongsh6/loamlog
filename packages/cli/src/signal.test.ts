import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { writeSessionSnapshot } from "@loamlog/archive";
import type { Logger, SessionSnapshot, Signal } from "@loamlog/core";
import { LocalAssetStore } from "@loamlog/distill";
import { runSignalCommand } from "./signal.js";

let tempDir: string | undefined;
const originalFetch = globalThis.fetch;
const originalOpenAIKey = process.env.OPENAI_API_KEY;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (originalOpenAIKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
  }
  if (!tempDir) return;
  const target = tempDir;
  tempDir = undefined;
  await rm(target, { recursive: true, force: true });
});

const logger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const machine_classification = {
    kind: "task_delta" as const,
    tags: ["created" as const],
    actor: "user" as const,
    temporal_state: "future" as const,
    confidence: 0.82,
  };

  return {
    id: "sig-cli-1",
    scope: "message",
    kind: machine_classification.kind,
    tags: machine_classification.tags,
    actor: machine_classification.actor,
    temporal_state: machine_classification.temporal_state,
    confidence: machine_classification.confidence,
    spans: [
      {
        session_id: "ses-cli",
        message_id: "msg-cli",
        excerpt: "Create a minimal loam signal CLI.",
      },
    ],
    review_status: "accepted",
    machine_classification,
    promotion_hints: [
      {
        target_distiller: "@loamlog/distiller-follow-up-work-item",
        eligibility: "eligible",
        reason: "future user task",
      },
    ],
    raw_model_output: { hidden: true },
    classifier: {
      id: "signal-gate",
      version: "0.1.0",
      model: "deterministic-test",
      prompt_version: "none",
    },
    created_at: "2026-05-15T00:00:00.000Z",
    updated_at: "2026-05-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  const now = "2026-05-15T02:00:00.000Z";
  return {
    schema_version: "1.0",
    meta: {
      session_id: "ses-rerun",
      captured_at: now,
      capture_trigger: "manual",
      aic_version: "0.7.0",
      provider: "test-provider",
    },
    context: {
      cwd: "/tmp/repo-rerun",
      worktree: "/tmp/repo-rerun",
    },
    time_range: {
      start: now,
      end: now,
    },
    session: {},
    messages: [
      {
        id: "msg-rerun",
        role: "user",
        timestamp: now,
        content:
          "We need to rerun the Signal Gate classifier for archived sessions.",
      },
    ],
    redacted: {
      patterns_applied: [],
      redacted_count: 0,
    },
    ...overrides,
  };
}

async function seedSignals(dumpDir: string): Promise<void> {
  const store = new LocalAssetStore(dumpDir, "repo-a", logger);
  await store.putSignal(makeSignal({ id: "sig-cli-accepted" }));
  await store.putSignal(
    makeSignal({
      id: "sig-cli-pending",
      review_status: "pending",
      machine_classification: {
        kind: "insight",
        tags: ["reason"],
        actor: "assistant",
        temporal_state: "current",
        confidence: 0.64,
      },
      created_at: "2026-05-15T01:00:00.000Z",
    }),
  );
}

describe("loam signal", () => {
  test("list filters stored signals", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-signal-list-"));
    await seedSignals(tempDir);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => logs.push(args.join(" "));

    try {
      await runSignalCommand([
        "list",
        "--dump-dir",
        tempDir,
        "--kind",
        "insight",
      ]);
    } finally {
      console.log = origLog;
    }

    const output = logs.join("\n");
    assert.ok(output.includes("sig-cli-pending"));
    assert.ok(!output.includes("sig-cli-accepted"));
  });

  test("show hides raw model output unless debug is requested", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-signal-show-"));
    await seedSignals(tempDir);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => logs.push(args.join(" "));

    try {
      await runSignalCommand([
        "show",
        "sig-cli-accepted",
        "--dump-dir",
        tempDir,
      ]);
    } finally {
      console.log = origLog;
    }

    const output = logs.join("\n");
    assert.ok(output.includes("Create a minimal loam signal CLI"));
    assert.ok(!output.includes("raw_model_output"));
  });

  test("review updates status and classification", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-signal-review-"));
    await seedSignals(tempDir);

    await runSignalCommand([
      "review",
      "sig-cli-pending",
      "--dump-dir",
      tempDir,
      "--status",
      "rejected",
      "--kind",
      "noise",
      "--tags",
      "process_log",
      "--actor",
      "assistant",
      "--temporal-state",
      "unknown",
      "--confidence",
      "0.9",
      "--reviewer",
      "tester",
      "--note",
      "assistant process log",
    ]);

    const store = new LocalAssetStore(tempDir, "repo-a", logger);
    const signal = await store.getSignal("sig-cli-pending");
    assert.equal(signal?.review_status, "rejected");
    assert.equal(signal?.kind, "noise");
    assert.deepEqual(signal?.tags, ["process_log"]);
    assert.equal(signal?.reviewed_classification?.reviewer, "tester");
    assert.equal(
      signal?.reviewed_classification?.note,
      "assistant process log",
    );
  });

  test("rerun classifies archived sessions into stored signals", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-signal-rerun-"));
    process.env.OPENAI_API_KEY = "test-key";
    await writeSessionSnapshot({
      dumpDir: tempDir,
      snapshot: makeSnapshot(),
    });

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  signals: [
                    {
                      scope: "message",
                      kind: "task_delta",
                      tags: ["created"],
                      actor: "user",
                      temporal_state: "future",
                      confidence: 0.91,
                      evidence_refs: [
                        {
                          message_id: "msg-rerun",
                          excerpt: "rerun the Signal Gate classifier",
                        },
                      ],
                      promotion_hints: [
                        {
                          target_distiller:
                            "@loamlog/distiller-follow-up-work-item",
                          eligibility: "eligible",
                          reason: "explicit future task",
                        },
                      ],
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => logs.push(args.join(" "));

    try {
      await runSignalCommand([
        "rerun",
        "--dump-dir",
        tempDir,
        "--session",
        "ses-rerun",
        "--llm",
        "openai/gpt-test",
      ]);
    } finally {
      console.log = origLog;
    }

    const store = new LocalAssetStore(tempDir, "_global", logger);
    const signals = await store.listSignals({ session_id: "ses-rerun" });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, "task_delta");
    assert.equal(signals[0].classifier.model, "gpt-test");
    assert.ok(logs.join("\n").includes("processed=1 signals=1"));
  });
});
