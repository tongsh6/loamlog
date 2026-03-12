import assert from "node:assert/strict";
import test from "node:test";
import { buildBaselinePredictions } from "./baseline.js";
import { evaluateRun } from "./index.js";
import {
  evaluateActionMetrics,
  evaluateIssueMetrics,
  evaluateRedactionMetrics,
  evaluateSignalMetrics,
} from "./metrics.js";
import type { EvaluationSample } from "./types";

const sample: EvaluationSample = {
  id: "sample-1",
  intent: "bug",
  rawInput: "API returns 500 for null payload. email alice@example.com, request req-123",
  expected: {
    primarySignal: "api-500",
    signals: [
      {
        key: "api-500",
        summary: "API 500 on null payload",
        category: "reliability",
        severity: "high",
      },
      {
        key: "payload-validation",
        summary: "Validation missing on payload",
        category: "reliability",
        severity: "medium",
      },
    ],
    issue: {
      shouldIssue: true,
      title: "Handle null payload without 500",
      type: "bug",
      priority: "P0",
      actionability: 0.9,
    },
    actions: [
      { key: "add-validation", label: "Add payload validation", priority: "P0" },
      { key: "add-test", label: "Add regression test", priority: "P1" },
    ],
    knowledge: {
      shouldDistill: true,
      kind: "checklist",
      scope: "Validate inputs before persistence",
    },
    redaction: {
      mustRedact: ["alice@example.com", "req-123"],
      shouldKeep: ["API", "payload"],
    },
  },
};

test("evaluateSignalMetrics calculates precision and recall", () => {
  const metrics = evaluateSignalMetrics(sample.expected, [
    { key: "api-500", confidence: 0.9 },
    { key: "extra-noise", confidence: 0.5 },
  ]);
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.recall, 0.5);
  assert.equal(metrics.falsePositiveRate, 0.5);
  assert.equal(metrics.falseNegativeRate, 0.5);
});

test("evaluateIssueMetrics checks shouldIssue and title hit", () => {
  const metrics = evaluateIssueMetrics(sample.expected, {
    shouldIssue: true,
    title: "Handle null payload without 500 error",
    type: "bug",
    actionability: 0.8,
  });
  assert.equal(metrics.shouldIssueAccuracy, 1);
  assert.equal(metrics.titleHitRate, 1);
  assert.equal(metrics.typeAccuracy, 1);
  assert.ok(metrics.actionabilityGap > 0);
});

test("evaluateActionMetrics covers precision/recall", () => {
  const metrics = evaluateActionMetrics(sample.expected, [
    { key: "add-validation", label: "Add payload validation" },
  ]);
  assert.equal(metrics.precision, 1);
  assert.equal(metrics.recall, 0.5);
});

test("evaluateRedactionMetrics catches leaks", () => {
  const metrics = evaluateRedactionMetrics(sample.expected, {
    redacted: ["alice@example.com"],
    allowed: ["API", "payload"],
  });
  assert.equal(metrics.leakRate, 0.5);
});

test("evaluateRun aggregates sample metrics", () => {
  const predictions = [
    {
      id: sample.id,
      signals: [{ key: "api-500", confidence: 0.9 }],
      issueDraft: { shouldIssue: true, title: "Handle null payload without 500", type: "bug", actionability: 0.8 },
      actions: [{ key: "add-validation", label: "Add payload validation", priority: "P0" }],
      knowledge: { shouldDistill: true, kind: "checklist", scope: "Validate inputs" },
      redaction: { redacted: ["alice@example.com", "req-123"] },
    },
  ];

  const report = evaluateRun({
    variant: "test",
    datasetName: "unit",
    samples: [sample],
    predictions,
  });

  assert.equal(report.sampleCount, 1);
  assert.equal(report.metrics.signal.recall, 0.5);
  assert.equal(report.metrics.issue.shouldIssueAccuracy, 1);
  assert.equal(report.metrics.action.precision, 1);
  assert.equal(report.metrics.redaction.leakRate, 0);
});

test("baseline predictions are deterministic", () => {
  const predictionsA = buildBaselinePredictions([sample], { variant: "demo" });
  const predictionsB = buildBaselinePredictions([sample], { variant: "demo" });
  assert.deepEqual(predictionsA, predictionsB);
});
