import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { DistillResult } from "@loamlog/core";
import { createGitHubSink, type GitHubSinkConfig } from "./index.js";

function makeResult(overrides: Partial<DistillResult> = {}): DistillResult {
  return {
    id: "result-001",
    fingerprint: "abc123",
    distiller_id: "@loamlog/distiller-issue-draft",
    distiller_version: "0.1.0",
    type: "issue-draft",
    title: "Add MFA support to auth module",
    summary: "The auth module needs MFA support for enhanced security.",
    confidence: 0.85,
    tags: ["security", "enhancement"],
    payload: { raw: "TODO: implement MFA" },
    evidence: [
      {
        session_id: "ses_001",
        message_id: "msg-1",
        excerpt: "TODO: implement MFA support",
        trace_command: "loam trace --session ses_001 --message msg-1",
      },
    ],
    render: {
      markdown: "## Add MFA support\n\nThe auth module needs MFA support.\n\n### Evidence\n- `ses_001` / `msg-1`",
    },
    ...overrides,
  };
}

describe("createGitHubSink", () => {
  test("creates a valid SinkPlugin", () => {
    const sink = createGitHubSink();
    assert.equal(sink.id, "@loamlog/sink-github");
    assert.equal(sink.name, "GitHub Issue Sink");
    assert.equal(sink.version, "0.1.0");
    assert.equal(typeof sink.supports, "function");
    assert.equal(typeof sink.deliver, "function");
  });

  test("supports issue-draft, pitfall-card, and todo-item types", () => {
    const sink = createGitHubSink();
    assert.equal(sink.supports("issue-draft"), true);
    assert.equal(sink.supports("pitfall-card"), true);
    assert.equal(sink.supports("todo-item"), true);
    assert.equal(sink.supports("unknown-type"), false);
  });

  test("throws when repo is missing", async () => {
    const sink = createGitHubSink();
    await assert.rejects(
      async () => sink.deliver({ results: [makeResult()], config: {} }),
      /owner\/repo/,
    );
  });

  test("dry run mode does not call GitHub API", async () => {
    const sink = createGitHubSink({ dryRun: true });
    const report = await sink.deliver({
      results: [makeResult()],
      config: { repo: "owner/repo", token: "fake-token" },
    });

    assert.equal(report.delivered, 1);
    assert.equal(report.failed, 0);
  });

  test("rejects results without evidence", async () => {
    const sink = createGitHubSink({ dryRun: true });
    const noEvidence = makeResult({ evidence: [] });

    const report = await sink.deliver({
      results: [noEvidence],
      config: { repo: "owner/repo", token: "fake-token" },
    });

    assert.equal(report.delivered, 0);
    assert.equal(report.failed, 1);
    assert.ok(report.errors?.[0]?.error.includes("without evidence"));
  });

  test("builds fallback body when render.markdown is missing", async () => {
    const sink = createGitHubSink({ dryRun: true });
    const noRender = makeResult({ render: undefined });

    const report = await sink.deliver({
      results: [noRender],
      config: { repo: "owner/repo", token: "fake-token" },
    });

    assert.equal(report.delivered, 1);
    assert.equal(report.failed, 0);
  });

  test("delivers multiple results in one call", async () => {
    const sink = createGitHubSink({ dryRun: true });
    const results = [
      makeResult({ id: "r1", title: "Issue 1" }),
      makeResult({ id: "r2", title: "Issue 2" }),
      makeResult({ id: "r3", title: "Issue 3" }),
    ];

    const report = await sink.deliver({
      results,
      config: { repo: "owner/repo", token: "fake-token" },
    });

    assert.equal(report.delivered, 3);
    assert.equal(report.failed, 0);
  });
});
