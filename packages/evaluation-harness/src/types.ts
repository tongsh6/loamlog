export type Severity = "low" | "medium" | "high" | "critical";
export type ActionPriority = "P0" | "P1" | "P2" | "P3";

export interface SignalLabel {
  key: string;
  summary: string;
  category: string;
  severity: Severity;
  mustHave?: boolean;
  weight?: number;
}

export interface ActionLabel {
  key: string;
  label: string;
  priority: ActionPriority;
  rationale?: string;
}

export interface IssueDraftLabel {
  shouldIssue: boolean;
  title: string;
  type: "bug" | "feature" | "chore" | "doc" | "improvement";
  priority: ActionPriority;
  actionability: number; // 0-1 human score on how executable the draft is
}

export interface KnowledgeLabel {
  shouldDistill: boolean;
  kind: "skill" | "template" | "checklist" | "best-practice";
  scope: string;
}

export interface RedactionLabel {
  mustRedact: string[];
  shouldKeep: string[];
}

export interface SampleExpected {
  primarySignal: string;
  signals: SignalLabel[];
  issue: IssueDraftLabel;
  actions: ActionLabel[];
  knowledge: KnowledgeLabel;
  redaction: RedactionLabel;
}

export interface EvaluationSample {
  id: string;
  rawInput: string;
  intent: string;
  tags?: string[];
  expected: SampleExpected;
}

export interface SignalPrediction {
  key: string;
  summary?: string;
  category?: string;
  severity?: Severity;
  confidence?: number;
}

export interface ActionPrediction {
  key?: string;
  label: string;
  priority?: ActionPriority;
  confidence?: number;
}

export interface IssueDraftPrediction {
  shouldIssue?: boolean;
  title?: string;
  type?: IssueDraftLabel["type"];
  priority?: ActionPriority;
  actionability?: number;
}

export interface KnowledgePrediction {
  shouldDistill?: boolean;
  kind?: KnowledgeLabel["kind"];
  scope?: string;
}

export interface RedactionPrediction {
  redacted?: string[];
  allowed?: string[];
}

export interface SamplePrediction {
  id: string;
  signals?: SignalPrediction[];
  actions?: ActionPrediction[];
  issueDraft?: IssueDraftPrediction;
  knowledge?: KnowledgePrediction;
  redaction?: RedactionPrediction;
  sourceRun?: string;
}

export interface SignalMetrics extends Record<string, number> {
  precision: number;
  recall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  top1HitRate: number;
  top3HitRate: number;
}

export interface IssueDraftMetrics extends Record<string, number> {
  shouldIssueAccuracy: number;
  titleHitRate: number;
  typeAccuracy: number;
  actionabilityGap: number;
  averageActionability: number;
}

export interface ActionMetrics extends Record<string, number> {
  precision: number;
  recall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
}

export interface KnowledgeMetrics extends Record<string, number> {
  shouldDistillAccuracy: number;
  typeAccuracy: number;
}

export interface RedactionMetrics extends Record<string, number> {
  leakRate: number;
  overRedactionRate: number;
}

export interface SampleMetricBreakdown {
  id: string;
  signal: SignalMetrics;
  issue: IssueDraftMetrics;
  action: ActionMetrics;
  knowledge: KnowledgeMetrics;
  redaction: RedactionMetrics;
}

export interface EvaluationReport {
  variant: string;
  datasetName: string;
  sampleCount: number;
  timestamp: string;
  metrics: {
    signal: SignalMetrics;
    issue: IssueDraftMetrics;
    action: ActionMetrics;
    knowledge: KnowledgeMetrics;
    redaction: RedactionMetrics;
  };
  perSample: SampleMetricBreakdown[];
}

export interface EvaluationRunInput {
  variant: string;
  datasetName: string;
  samples: EvaluationSample[];
  predictions: SamplePrediction[];
}
