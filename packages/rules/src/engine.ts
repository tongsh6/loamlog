import { evaluateCondition, parseCondition } from "./condition.js";
import { normalizeRuleConfig } from "./config.js";
import type {
  ActionCandidate,
  ActionDecision,
  ComparisonOperator,
  NecessityLevel,
  RuleConfig,
  RuleDefinition,
  RuleEngine,
  RuleHit,
  ScoringRule,
} from "./types.js";

interface InternalRule extends RuleDefinition {
  priority: number;
  condition?: ReturnType<typeof parseCondition>;
}

const DEFAULT_PRIORITY = 0;

export function createRuleEngine(config: RuleConfig): RuleEngine {
  let rules = normalizeRules(config);

  function evaluate(candidate: ActionCandidate): ActionDecision {
    const signals = [...(candidate.signals ?? [])];
    const ruleHits: RuleHit[] = [];
    const signalHits: RuleHit[] = [];

    let filtered = false;
    let filterReasons: string[] = [];
    let appliedFilter: RuleHit | undefined;
    let filterPriority = -Infinity;

    let necessity: NecessityLevel = "should_do";
    let appliedNecessity: RuleHit | undefined;

    let score = 0;
    let appliedScore: RuleHit | undefined;
    let scorePriority = -Infinity;

    let executionAllow: boolean | undefined;
    let executionStrategy: string | undefined;
    let executionRoute: string | undefined;
    let appliedExecution: RuleHit | undefined;
    let executionPriority = -Infinity;

    for (const rule of rules) {
      const { matched, reasons } = evaluateCondition(rule.condition, candidate);
      if (!matched) {
        continue;
      }

      switch (rule.type) {
        case "signal": {
          if (rule.then.add_signal && !signals.includes(rule.then.add_signal)) {
            signals.push(rule.then.add_signal);
          }
          const hit: RuleHit = {
            id: rule.id,
            type: rule.type,
            priority: rule.priority,
            reasons,
            outcome: rule.then.mark_as_candidate ? "marked" : "signal",
            data: {
              mark_as_candidate: rule.then.mark_as_candidate ?? false,
              tags: rule.then.add_tags,
            },
          };
          signalHits.push(hit);
          ruleHits.push(hit);
          break;
        }
        case "scoring": {
          const scoring = computeScore(rule, candidate);
          const hit: RuleHit = {
            id: rule.id,
            type: rule.type,
            priority: rule.priority,
            reasons: [...reasons, ...scoring.breakdown],
            outcome: `score=${scoring.score.toFixed(3)}`,
            scoreDelta: scoring.score,
          };
          ruleHits.push(hit);

          if (rule.mode === "add") {
            score += scoring.score;
            appliedScore = hit;
          } else if (rule.priority > scorePriority || !appliedScore) {
            score = scoring.score;
            scorePriority = rule.priority;
            appliedScore = hit;
          }
          break;
        }
        case "necessity": {
          const hit: RuleHit = {
            id: rule.id,
            type: rule.type,
            priority: rule.priority,
            reasons,
            outcome: rule.then.level,
          };
          ruleHits.push(hit);
          if (!appliedNecessity || rule.priority > appliedNecessity.priority) {
            necessity = rule.then.level;
            appliedNecessity = hit;
          }
          break;
        }
        case "filter": {
          const hit: RuleHit = {
            id: rule.id,
            type: rule.type,
            priority: rule.priority,
            reasons,
            outcome: rule.then.drop === false ? "keep" : "drop",
            data: rule.then.reason ? { reason: rule.then.reason } : undefined,
          };
          ruleHits.push(hit);
          if (rule.then.drop !== false) {
            const priority = rule.priority ?? DEFAULT_PRIORITY;
            if (!filtered || priority > filterPriority) {
              filtered = true;
              filterPriority = priority;
              filterReasons = rule.then.reason ? [rule.then.reason] : reasons;
              appliedFilter = hit;
            }
          }
          break;
        }
        case "execution": {
          const hit: RuleHit = {
            id: rule.id,
            type: rule.type,
            priority: rule.priority,
            reasons,
            outcome: rule.then.allow === false ? "block" : "allow",
            data: {
              strategy: rule.then.strategy,
              route: rule.then.route,
            },
          };
          ruleHits.push(hit);
          const priority = rule.priority ?? DEFAULT_PRIORITY;
          if (priority > executionPriority) {
            executionPriority = priority;
            executionAllow = rule.then.allow !== false;
            executionStrategy = rule.then.strategy;
            executionRoute = rule.then.route;
            appliedExecution = hit;
          }
          break;
        }
        default:
          break;
      }
    }

    const allowExecution = !filtered && (executionAllow ?? true);

    return {
      candidate,
      score,
      necessity,
      filtered,
      filterReasons,
      allowExecution,
      executionStrategy,
      executionRoute,
      signals,
      ruleHits,
      applied: {
        scoring: appliedScore,
        necessity: appliedNecessity,
        filter: appliedFilter,
        execution: appliedExecution,
        signals: signalHits,
      },
    };
  }

  return {
    evaluate,
    evaluateAll: (candidates: ActionCandidate[]) => candidates.map((item) => evaluate(item)),
    reload: (nextConfig: RuleConfig) => {
      rules = normalizeRules(normalizeRuleConfig(nextConfig));
    },
  };
}

function normalizeRules(config: RuleConfig): InternalRule[] {
  return (config.rules ?? []).map((rule) => ({
    ...rule,
    priority: rule.priority ?? DEFAULT_PRIORITY,
    condition: parseCondition(rule.when),
  }));
}

function computeScore(rule: ScoringRule, candidate: ActionCandidate): { score: number; breakdown: string[] } {
  let total = typeof rule.bias === "number" ? rule.bias : 0;
  const breakdown: string[] = [];

  for (const [field, weight] of Object.entries(rule.formula)) {
    const value = toNumber(resolveValue(candidate, field));
    const delta = value * weight;
    total += delta;
    breakdown.push(`${field}(${value.toFixed(2)})*${weight.toFixed(2)}=${delta.toFixed(2)}`);
  }

  const min = rule.cap?.min ?? 0;
  const max = rule.cap?.max ?? 1;
  const score = clamp(total, min, max);

  return { score, breakdown };
}

function resolveValue(candidate: ActionCandidate, field: string): unknown {
  const direct = (candidate as Record<string, unknown>)[field];
  if (direct !== undefined) {
    return direct;
  }

  if (candidate.metrics && field in candidate.metrics) {
    return candidate.metrics[field];
  }

  if (candidate.flags && field in candidate.flags) {
    return candidate.flags[field];
  }

  if (candidate.attributes && field in candidate.attributes) {
    return candidate.attributes[field];
  }

  if (field.includes(".")) {
    const parts = field.split(".");
    let current: unknown = candidate;
    for (const part of parts) {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  return undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isRuleDefinition(value: unknown): value is RuleDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.type === "string";
}
