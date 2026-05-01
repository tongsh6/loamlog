import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  LLMAuthError,
  buildSessionSnapshot,
  mapDistillResultToCandidate,
  validateAssetCandidate,
  type AICConfig,
  type DistillResult,
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

describe("asset graph mapping", () => {
  const sampleResult: DistillResult = {
    id: "result-001",
    fingerprint: "fp-abc",
    distiller_id: "@loamlog/distiller-issue-draft",
    distiller_version: "1.0.0",
    type: "issue-draft",
    title: "Fix login timeout bug",
    summary: "Session timeout handling needs improvement in the auth flow.",
    confidence: 0.85,
    tags: ["bug", "auth"],
    payload: { severity: "high", affected_files: ["auth/login.ts"] },
    evidence: [
      {
        session_id: "ses_001",
        message_id: "msg_42",
        excerpt: "the login keeps timing out after 30s",
        trace_command: "loam evidence ses_001 msg_42",
        position: { start: 120, end: 160 },
      },
    ],
  };

  test("maps DistillResult to AssetCandidate with signal and evidence spans", () => {
    const candidate = mapDistillResultToCandidate(sampleResult);

    assert.equal(candidate.id, "result-001");
    assert.equal(candidate.fingerprint, "fp-abc");
    assert.equal(candidate.candidate_type, "issue-draft");
    assert.equal(candidate.title, "Fix login timeout bug");
    assert.equal(candidate.confidence, 0.85);
    assert.equal(candidate.distiller_id, "@loamlog/distiller-issue-draft");

    // Evidence spans
    assert.equal(candidate.evidence.length, 1);
    assert.equal(candidate.evidence[0].session_id, "ses_001");
    assert.equal(candidate.evidence[0].message_id, "msg_42");
    assert.equal(candidate.evidence[0].excerpt, "the login keeps timing out after 30s");
    assert.deepEqual(candidate.evidence[0].position, { start: 120, end: 160 });

    // Signal derived from result
    assert.equal(candidate.signals.length, 1);
    assert.equal(candidate.signals[0].signal_type, "issue-draft");
    assert.equal(candidate.signals[0].confidence, 0.85);

    // Payload preserved
    assert.equal((candidate.payload as Record<string, unknown>).severity, "high");
  });
});

describe("asset candidate quality gate", () => {
  function makeCandidate(overrides: Partial<import("./index.js").AssetCandidate> = {}): import("./index.js").AssetCandidate {
    return {
      id: "cand-1",
      fingerprint: "fp-1",
      candidate_type: "issue-draft",
      title: "Test issue",
      summary: "A test issue for validation.",
      confidence: 0.8,
      tags: ["test"],
      distiller_id: "@test/distiller",
      signals: [],
      evidence: [{ session_id: "ses_1", message_id: "msg_1", excerpt: "some text" }],
      payload: {},
      ...overrides,
    };
  }

  test("passes with valid candidate", () => {
    const report = validateAssetCandidate(makeCandidate());
    assert.equal(report.passed, true);
    assert.ok(report.checks.every((c) => c.passed));
  });

  test("fails when evidence is empty and requireEvidence is true", () => {
    const report = validateAssetCandidate(makeCandidate({ evidence: [] }));
    assert.equal(report.passed, false);
    const evCheck = report.checks.find((c) => c.name === "has_evidence");
    assert.equal(evCheck?.passed, false);
  });

  test("fails when confidence is below threshold", () => {
    const report = validateAssetCandidate(
      makeCandidate({ confidence: 0.3 }),
      { minConfidence: 0.6 },
    );
    assert.equal(report.passed, false);
    const confCheck = report.checks.find((c) => c.name === "confidence_threshold");
    assert.equal(confCheck?.passed, false);
    assert.ok(confCheck?.reason?.includes("0.3"));
  });

  test("fails with empty title", () => {
    const report = validateAssetCandidate(makeCandidate({ title: "" }));
    assert.equal(report.passed, false);
    const titleCheck = report.checks.find((c) => c.name === "has_title");
    assert.equal(titleCheck?.passed, false);
  });

  test("fails with empty summary", () => {
    const report = validateAssetCandidate(makeCandidate({ summary: "" }));
    assert.equal(report.passed, false);
    const summaryCheck = report.checks.find((c) => c.name === "has_summary");
    assert.equal(summaryCheck?.passed, false);
  });

  test("blocks low-evidence candidates from output", () => {
    // Simulate: confidence too low AND no evidence → should be blocked
    const candidate = makeCandidate({ confidence: 0.2, evidence: [] });
    const report = validateAssetCandidate(candidate, { minConfidence: 0.5, requireEvidence: true });
    assert.equal(report.passed, false);
    assert.equal(report.checks.length, 4);
    const failed = report.checks.filter((c) => !c.passed);
    assert.equal(failed.length, 2); // evidence + confidence
  });
});
