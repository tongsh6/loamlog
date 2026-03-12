import { evaluateSample } from "./metrics.js";
import {
  type EvaluationReport,
  type EvaluationRunInput,
  type SampleMetricBreakdown,
  type SignalMetrics,
  type IssueDraftMetrics,
  type ActionMetrics,
  type KnowledgeMetrics,
  type RedactionMetrics,
} from "./types.js";

export function evaluateRun(input: EvaluationRunInput): EvaluationReport {
  const predictionMap = new Map(
    input.predictions.map((prediction): [string, EvaluationRunInput["predictions"][number]] => [
      prediction.id,
      prediction,
    ]),
  );
  const perSample: SampleMetricBreakdown[] = input.samples.map((sample: EvaluationRunInput["samples"][number]) =>
    evaluateSample(sample, predictionMap.get(sample.id)),
  );

  return {
    variant: input.variant,
    datasetName: input.datasetName,
    sampleCount: input.samples.length,
    timestamp: new Date().toISOString(),
    metrics: {
      signal: averageSignalMetrics(perSample),
      issue: averageIssueMetrics(perSample),
      action: averageActionMetrics(perSample),
      knowledge: averageKnowledgeMetrics(perSample),
      redaction: averageRedactionMetrics(perSample),
    },
    perSample,
  };
}

function averageSignalMetrics(perSample: SampleMetricBreakdown[]): SignalMetrics {
  return average(perSample.map((item) => item.signal));
}

function averageIssueMetrics(perSample: SampleMetricBreakdown[]): IssueDraftMetrics {
  return average(perSample.map((item) => item.issue));
}

function averageActionMetrics(perSample: SampleMetricBreakdown[]): ActionMetrics {
  return average(perSample.map((item) => item.action));
}

function averageKnowledgeMetrics(perSample: SampleMetricBreakdown[]): KnowledgeMetrics {
  return average(perSample.map((item) => item.knowledge));
}

function averageRedactionMetrics(perSample: SampleMetricBreakdown[]): RedactionMetrics {
  return average(perSample.map((item) => item.redaction));
}

function average<T extends Record<string, number>>(rows: T[]): T {
  if (rows.length === 0) {
    return {} as T;
  }

  const totals: Record<string, number> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  const result: Record<string, number> = {};
  for (const [key, total] of Object.entries(totals)) {
    result[key] = total / rows.length;
  }

  return result as T;
}
