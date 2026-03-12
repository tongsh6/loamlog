import {
  type ActionMetrics,
  type ActionPrediction,
  type EvaluationSample,
  type IssueDraftMetrics,
  type IssueDraftPrediction,
  type KnowledgeMetrics,
  type KnowledgePrediction,
  type RedactionMetrics,
  type RedactionPrediction,
  type SampleExpected,
  type SampleMetricBreakdown,
  type SamplePrediction,
  type SignalMetrics,
  type SignalPrediction,
} from "./types.js";

const EPSILON = 1e-9;

function normalizeKey(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function safeDivide(numerator: number, denominator: number): number {
  if (Math.abs(denominator) < EPSILON) {
    return 0;
  }
  return numerator / denominator;
}

type RankedItem = { key?: string; label?: string; confidence?: number };

function computeTopKHit(primaryKey: string, predictions: RankedItem[] | undefined, k: number): number {
  if (!primaryKey || !predictions?.length) {
    return 0;
  }
  const sorted = [...predictions].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const keys = sorted.map((item) => normalizeKey(item.key ?? item.label));
  const normalized = normalizeKey(primaryKey);
  const rank = keys.findIndex((key) => key === normalized);
  return rank >= 0 && rank < k ? 1 : 0;
}

export function evaluateSignalMetrics(
  expected: SampleExpected,
  prediction?: SignalPrediction[],
): SignalMetrics {
  const expectedKeys = new Set(expected.signals.map((signal) => normalizeKey(signal.key)));
  const predictedKeys = new Set((prediction ?? []).map((signal) => normalizeKey(signal.key)));

  let truePositive = 0;
  for (const key of predictedKeys) {
    if (expectedKeys.has(key)) {
      truePositive += 1;
    }
  }

  const falsePositive = Math.max(predictedKeys.size - truePositive, 0);
  const falseNegative = Math.max(expectedKeys.size - truePositive, 0);

  return {
    precision: safeDivide(truePositive, predictedKeys.size),
    recall: safeDivide(truePositive, expectedKeys.size),
    falsePositiveRate: safeDivide(falsePositive, predictedKeys.size || 1),
    falseNegativeRate: safeDivide(falseNegative, expectedKeys.size || 1),
    top1HitRate: computeTopKHit(expected.primarySignal, prediction, 1),
    top3HitRate: computeTopKHit(expected.primarySignal, prediction, 3),
  };
}

export function evaluateIssueMetrics(
  expected: SampleExpected,
  prediction?: IssueDraftPrediction,
): IssueDraftMetrics {
  const expectedIssue = expected.issue;
  const predictedShouldIssue = prediction?.shouldIssue ?? false;
  const shouldIssueAccuracy = expectedIssue.shouldIssue === predictedShouldIssue ? 1 : 0;

  const normalizedExpectedTitle = normalizeKey(expectedIssue.title);
  const normalizedPredictedTitle = normalizeKey(prediction?.title);
  const titleHitRate =
    !expectedIssue.shouldIssue && !predictedShouldIssue
      ? 1
      : normalizedExpectedTitle && normalizedPredictedTitle
        ? jaccardSimilarity(normalizedExpectedTitle, normalizedPredictedTitle) >= 0.6
          ? 1
          : 0
        : 0;

  const typeAccuracy =
    !expectedIssue.shouldIssue && !predictedShouldIssue
      ? 1
      : prediction?.type === expectedIssue.type
        ? 1
        : 0;

  const predictedActionability =
    typeof prediction?.actionability === "number" ? clamp01(prediction.actionability) : 0;
  const actionabilityGap = Math.abs(predictedActionability - expectedIssue.actionability);

  return {
    shouldIssueAccuracy,
    titleHitRate,
    typeAccuracy,
    actionabilityGap,
    averageActionability: predictedActionability,
  };
}

export function evaluateActionMetrics(
  expected: SampleExpected,
  prediction?: ActionPrediction[],
): ActionMetrics {
  const expectedKeys = new Set(expected.actions.map((action) => normalizeKey(action.key)));
  const predictedKeys = new Set((prediction ?? []).map((action) => normalizeKey(action.key ?? action.label)));

  let truePositive = 0;
  for (const key of predictedKeys) {
    if (expectedKeys.has(key)) {
      truePositive += 1;
    }
  }

  const falsePositive = Math.max(predictedKeys.size - truePositive, 0);
  const falseNegative = Math.max(expectedKeys.size - truePositive, 0);

  return {
    precision: safeDivide(truePositive, predictedKeys.size),
    recall: safeDivide(truePositive, expectedKeys.size),
    falsePositiveRate: safeDivide(falsePositive, predictedKeys.size || 1),
    falseNegativeRate: safeDivide(falseNegative, expectedKeys.size || 1),
  };
}

export function evaluateKnowledgeMetrics(
  expected: SampleExpected,
  prediction?: KnowledgePrediction,
): KnowledgeMetrics {
  const shouldDistillAccuracy =
    expected.knowledge.shouldDistill === (prediction?.shouldDistill ?? false) ? 1 : 0;
  const typeAccuracy =
    expected.knowledge.kind === prediction?.kind && expected.knowledge.shouldDistill
      ? 1
      : !expected.knowledge.shouldDistill && !prediction?.shouldDistill
        ? 1
        : 0;

  return {
    shouldDistillAccuracy,
    typeAccuracy,
  };
}

export function evaluateRedactionMetrics(
  expected: SampleExpected,
  prediction?: RedactionPrediction,
): RedactionMetrics {
  const expectedRedacted = new Set(expected.redaction.mustRedact.map(normalizeKey));
  const predictedRedacted = new Set((prediction?.redacted ?? []).map(normalizeKey));
  const allowed = new Set((prediction?.allowed ?? expected.redaction.shouldKeep).map(normalizeKey));

  let leaked = 0;
  for (const item of expectedRedacted) {
    if (!predictedRedacted.has(item)) {
      leaked += 1;
    }
  }

  let overRedacted = 0;
  for (const item of predictedRedacted) {
    if (!expectedRedacted.has(item) && allowed.has(item)) {
      continue;
    }
    if (!expectedRedacted.has(item)) {
      overRedacted += 1;
    }
  }

  return {
    leakRate: safeDivide(leaked, expectedRedacted.size || 1),
    overRedactionRate: safeDivide(overRedacted, predictedRedacted.size || 1),
  };
}

export function evaluateSample(
  sample: EvaluationSample,
  prediction?: SamplePrediction,
): SampleMetricBreakdown {
  return {
    id: sample.id,
    signal: evaluateSignalMetrics(sample.expected, prediction?.signals),
    issue: evaluateIssueMetrics(sample.expected, prediction?.issueDraft),
    action: evaluateActionMetrics(sample.expected, prediction?.actions),
    knowledge: evaluateKnowledgeMetrics(sample.expected, prediction?.knowledge),
    redaction: evaluateRedactionMetrics(sample.expected, prediction?.redaction),
  };
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);
  return safeDivide(intersection.length, union.size);
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
