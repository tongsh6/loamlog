import assert from "node:assert";
import { describe, test } from "node:test";
import type { AssetCandidate, VerifierContext } from "@loamlog/core";
import { EvidenceSupportVerifier } from "./evidence-support.js";

const ctx: VerifierContext = {
  repoPath: "/work/repo",
  capturedAt: "2026-05-18T10:00:00Z",
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
};

function candidate(overrides: Partial<AssetCandidate> = {}): AssetCandidate {
  return {
    id: "candidate-1",
    fingerprint: "fp-1",
    candidate_type: "decision-rationale",
    title: "Defer MCP until cross-asset quality stabilizes",
    summary:
      "The project should defer MCP work because cross-asset dogfooding quality is the current constraint.",
    confidence: 0.82,
    tags: ["decision", "cross-asset", "quality"],
    distiller_id: "@loamlog/distiller-decision-rationale",
    signals: [],
    evidence: [
      {
        session_id: "session-1",
        message_id: "message-1",
        excerpt:
          "Decision: defer MCP implementation until cross-asset dogfooding quality stabilizes.",
      },
    ],
    payload: {
      decision: "Defer MCP",
      rationale: "Cross-asset quality is the current constraint.",
    },
    ...overrides,
  };
}

describe("EvidenceSupportVerifier", () => {
  test("verifies non-code assets when claims are supported by cited evidence", async () => {
    const verifier = new EvidenceSupportVerifier();

    const report = await verifier.verify(candidate(), ctx);

    assert.equal(report.status, "verified");
    assert.equal(report.evidence.dialogue_ref, "message-1");
    assert.match(report.evidence.evidence_support_status ?? "", /supported/);
  });

  test("keeps weakly supported assets unverified for human review", async () => {
    const verifier = new EvidenceSupportVerifier();

    const report = await verifier.verify(
      candidate({
        title: "Create an auto-skill marketplace",
        summary:
          "The session proves that Loamlog should build a marketplace immediately.",
        payload: {
          idea: "Auto-skill marketplace",
          potential_value: "Immediate external distribution.",
        },
      }),
      ctx,
    );

    assert.equal(report.status, "unverified");
    assert.match(report.evidence.evidence_support_status ?? "", /weak_support/);
  });

  test("rejects structurally evidence-free candidates", async () => {
    const verifier = new EvidenceSupportVerifier();

    const report = await verifier.verify(candidate({ evidence: [] }), ctx);

    assert.equal(report.status, "rejected");
    assert.equal(report.evidence.evidence_support_status, "missing_evidence");
  });

  test("handles Chinese evidence with CJK token support", async () => {
    const verifier = new EvidenceSupportVerifier();

    const report = await verifier.verify(
      candidate({
        title: "补 Signal Gate 防止资产误路由",
        summary:
          "代表性资产需要先经过 Signal Gate，避免过程日志和已完成事项被误路由。",
        tags: ["signal-gate", "quality"],
        evidence: [
          {
            session_id: "session-zh",
            message_id: "message-zh",
            excerpt:
              "当前缺口是缺少 Signal Gate，导致代表性资产把过程日志、已完成事项和旧路线图误路由。",
          },
        ],
        payload: {
          idea: "补 Signal Gate 防止资产误路由",
          context: "代表性资产质量 No-Go",
        },
      }),
      ctx,
    );

    assert.equal(report.status, "verified");
    assert.equal(report.evidence.dialogue_ref, "message-zh");
  });
});
