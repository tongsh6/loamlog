import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { LLMProvider, LLMRouter, SessionArtifact } from "@loamlog/core";
import { LocalAssetStore } from "./store.js";
import { runSignalGateForArtifact } from "./signal-job.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (!tempDir) return;
  const target = tempDir;
  tempDir = undefined;
  await rm(target, { recursive: true, force: true });
});

function makeArtifact(): SessionArtifact {
  return {
    schema_version: "1.0",
    meta: {
      session_id: "ses-signal-job",
      captured_at: "2026-05-15T07:00:00.000Z",
      capture_trigger: "session.idle",
      loam_version: "0.7.0",
      provider: "test",
    },
    context: {
      cwd: "/tmp/repo",
      worktree: "/tmp/repo",
      repo: "repo-signal-job",
    },
    time_range: {
      start: "2026-05-15T07:00:00.000Z",
      end: "2026-05-15T07:00:01.000Z",
    },
    session: {},
    messages: [
      {
        id: "msg-signal-job",
        role: "user",
        timestamp: "2026-05-15T07:00:00.000Z",
        content: "Create a post-capture Signal Gate job.",
      },
    ],
    redacted: {
      patterns_applied: [],
      redacted_count: 0,
    },
  };
}

function makeLLM(): LLMRouter {
  const provider: LLMProvider = {
    id: "mock",
    async complete() {
      return {
        content: JSON.stringify({
          signals: [
            {
              scope: "message",
              kind: "task_delta",
              tags: ["created"],
              actor: "user",
              temporal_state: "future",
              confidence: 0.92,
              evidence_refs: [
                {
                  message_id: "msg-signal-job",
                  excerpt: "post-capture Signal Gate job",
                },
              ],
              promotion_hints: [
                {
                  target_distiller: "@loamlog/distiller-follow-up-work-item",
                  eligibility: "eligible",
                  reason: "explicit implementation task",
                },
              ],
            },
          ],
        }),
        tokens: { input: 10, output: 10 },
      };
    },
  };

  return {
    route() {
      return { provider, model: "mock-signal-model" };
    },
    getDefaultContextWindow() {
      return undefined;
    },
  };
}

describe("runSignalGateForArtifact", () => {
  test("classifies and stores signals for a single captured artifact", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-signal-job-"));

    const result = await runSignalGateForArtifact({
      artifact: makeArtifact(),
      dumpDir: tempDir,
      llm: makeLLM(),
    });

    assert.equal(result.session_id, "ses-signal-job");
    assert.equal(result.repo, "repo-signal-job");
    assert.equal(result.signals.length, 1);
    assert.equal(result.rejected_count, 0);

    const store = new LocalAssetStore(tempDir, "repo-signal-job", {
      info() {},
      warn() {},
      error() {},
    });
    const stored = await store.listSignals({ session_id: "ses-signal-job" });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].classifier.model, "mock-signal-model");
  });
});
