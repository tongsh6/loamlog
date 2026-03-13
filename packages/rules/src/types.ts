export type RuleType = "signal" | "scoring" | "necessity" | "filter" | "execution";

export type NecessityLevel = "must_do" | "should_do" | "nice_to_have";

export interface ActionMetrics {
  impact?: number;
  urgency?: number;
  frequency?: number;
  confidence?: number;
  effort?: number;
  novelty?: number;
  [key: string]: number | undefined;
}

export interface ActionCandidate {
  id?: string;
  type?: string;
  title?: string;
  summary?: string;
  signal_type?: string;
  signals?: string[];
  tags?: string[];
  metrics?: ActionMetrics;
  flags?: Record<string, boolean>;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "includes" | "in";

export interface FieldCondition {
  kind: "field";
  field: string;
  op: ComparisonOperator;
  expected: unknown;
}

export interface AllCondition {
  kind: "all";
  nodes: Condition[];
}

export interface AnyCondition {
  kind: "any";
  nodes: Condition[];
}

export interface NotCondition {
  kind: "not";
  node: Condition;
}

export type Condition = FieldCondition | AllCondition | AnyCondition | NotCondition;

export type ConditionInput =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | { all?: ConditionInput[]; any?: ConditionInput[]; not?: ConditionInput };

export interface BaseRule {
  id: string;
  description?: string;
  priority?: number;
  when?: ConditionInput;
}

export interface SignalRule extends BaseRule {
  type: "signal";
  then: {
    add_signal?: string;
    add_tags?: string[];
    mark_as_candidate?: boolean;
  };
}

export interface ScoringRule extends BaseRule {
  type: "scoring";
  formula: Record<string, number>;
  bias?: number;
  cap?: {
    min?: number;
    max?: number;
  };
  mode?: "override" | "add";
}

export interface NecessityRule extends BaseRule {
  type: "necessity";
  then: {
    level: NecessityLevel;
  };
}

export interface FilterRule extends BaseRule {
  type: "filter";
  then: {
    drop?: boolean;
    reason?: string;
  };
}

export interface ExecutionRule extends BaseRule {
  type: "execution";
  then: {
    allow?: boolean;
    strategy?: string;
    route?: string;
  };
}

export type RuleDefinition = SignalRule | ScoringRule | NecessityRule | FilterRule | ExecutionRule;

export interface RuleConfig {
  version?: string;
  rules: RuleDefinition[];
  metadata?: Record<string, unknown>;
}

export interface ConditionEvaluation {
  matched: boolean;
  reasons: string[];
}

export interface RuleHit {
  id: string;
  type: RuleType;
  priority: number;
  reasons: string[];
  outcome?: string;
  scoreDelta?: number;
  data?: Record<string, unknown>;
}

export interface ActionDecision {
  candidate: ActionCandidate;
  score: number;
  necessity: NecessityLevel;
  filtered: boolean;
  filterReasons: string[];
  allowExecution: boolean;
  executionStrategy?: string;
  executionRoute?: string;
  signals: string[];
  ruleHits: RuleHit[];
  applied: {
    scoring?: RuleHit;
    necessity?: RuleHit;
    filter?: RuleHit;
    execution?: RuleHit;
    signals: RuleHit[];
  };
}

export interface RuleEngine {
  evaluate(candidate: ActionCandidate): ActionDecision;
  evaluateAll(candidates: ActionCandidate[]): ActionDecision[];
  reload(config: RuleConfig): void;
}
