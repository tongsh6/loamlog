import type { ActionCandidate, ActionDecision, RuleConfig } from "@loamlog/core";

export type {
  ActionCandidate,
  ActionDecision,
  ActionMetrics,
  AllCondition,
  AnyCondition,
  BaseRule,
  Condition,
  ConditionEvaluation,
  ConditionInput,
  ComparisonOperator,
  ExecutionRule,
  FieldCondition,
  FilterRule,
  NecessityLevel,
  NecessityRule,
  NotCondition,
  RuleConfig,
  RuleDefinition,
  RuleHit,
  RuleType,
  ScoringRule,
  SignalRule,
} from "@loamlog/core";

export interface RuleEngine {
  evaluate(candidate: ActionCandidate): ActionDecision;
  evaluateAll(candidates: ActionCandidate[]): ActionDecision[];
  reload(config: RuleConfig): void;
}
