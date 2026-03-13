import type {
  ActionCandidate,
  AllCondition,
  AnyCondition,
  Condition,
  ConditionEvaluation,
  ConditionInput,
  FieldCondition,
  NotCondition,
  ComparisonOperator,
} from "./types.js";

const COMPARATOR_SUFFIX: Record<string, ComparisonOperator> = {
  _gte: "gte",
  _gt: "gt",
  _lte: "lte",
  _lt: "lt",
  _eq: "eq",
  _includes: "includes",
  _in: "in",
};

const OP_SYMBOL: Record<ComparisonOperator, string> = {
  eq: "==",
  neq: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  includes: "includes",
  in: "in",
};

export function parseCondition(input?: ConditionInput): Condition | undefined {
  if (!input) {
    return undefined;
  }

  if (Array.isArray(input)) {
    return {
      kind: "all",
      nodes: input.map((item) => parseCondition(item)!).filter(Boolean) as Condition[],
    };
  }

  if (typeof input !== "object") {
    return undefined;
  }

  const candidate = input as Record<string, unknown>;
  const allNodes: Condition[] = [];

  if (candidate.all) {
    const nodes = Array.isArray(candidate.all) ? candidate.all : [candidate.all];
    allNodes.push({
      kind: "all",
      nodes: nodes.map((node) => parseCondition(node)!).filter(Boolean) as Condition[],
    });
  }

  if (candidate.any) {
    const nodes = Array.isArray(candidate.any) ? candidate.any : [candidate.any];
    allNodes.push({
      kind: "any",
      nodes: nodes.map((node) => parseCondition(node)!).filter(Boolean) as Condition[],
    });
  }

  if (candidate.not) {
    const node = parseCondition(candidate.not);
    if (node) {
      allNodes.push({ kind: "not", node });
    }
  }

  for (const [key, value] of Object.entries(candidate)) {
    if (key === "all" || key === "any" || key === "not") {
      continue;
    }
    allNodes.push(buildFieldCondition(key, value));
  }

  if (allNodes.length === 1) {
    return allNodes[0];
  }

  return {
    kind: "all",
    nodes: allNodes,
  };
}

export function evaluateCondition(condition: Condition | undefined, candidate: ActionCandidate): ConditionEvaluation {
  if (!condition) {
    return { matched: true, reasons: [] };
  }

  switch (condition.kind) {
    case "all": {
      const reasons: string[] = [];
      for (const node of condition.nodes) {
        const result = evaluateCondition(node, candidate);
        reasons.push(...result.reasons);
        if (!result.matched) {
          return { matched: false, reasons };
        }
      }
      return { matched: true, reasons };
    }
    case "any": {
      const reasons: string[] = [];
      let matched = false;
      for (const node of condition.nodes) {
        const result = evaluateCondition(node, candidate);
        reasons.push(...result.reasons);
        if (result.matched) {
          matched = true;
        }
      }
      return { matched, reasons };
    }
    case "not": {
      const inner = evaluateCondition(condition.node, candidate);
      return { matched: !inner.matched, reasons: inner.reasons };
    }
    case "field": {
      return evaluateFieldCondition(condition, candidate);
    }
    default:
      return { matched: false, reasons: [] };
  }
}

function buildFieldCondition(key: string, expected: unknown): FieldCondition {
  for (const [suffix, op] of Object.entries(COMPARATOR_SUFFIX)) {
    if (key.endsWith(suffix)) {
      return { kind: "field", field: key.slice(0, -suffix.length), op, expected };
    }
  }
  return { kind: "field", field: key, op: "eq", expected };
}

function evaluateFieldCondition(condition: FieldCondition, candidate: ActionCandidate): ConditionEvaluation {
  const actual = getValue(candidate, condition.field);
  const matched = compare(condition.op, actual, condition.expected);
  const reason = `${condition.field} ${OP_SYMBOL[condition.op]} ${formatValue(condition.expected)} (actual: ${formatValue(actual)})`;

  return { matched, reasons: [reason] };
}

function getValue(candidate: ActionCandidate, field: string): unknown {
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

function compare(op: ComparisonOperator, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "eq":
      return normalize(actual) === normalize(expected);
    case "neq":
      return normalize(actual) !== normalize(expected);
    case "gt":
      return toNumber(actual) > toNumber(expected);
    case "gte":
      return toNumber(actual) >= toNumber(expected);
    case "lt":
      return toNumber(actual) < toNumber(expected);
    case "lte":
      return toNumber(actual) <= toNumber(expected);
    case "includes":
      if (Array.isArray(actual)) {
        return actual.map(normalize).includes(normalize(expected));
      }
      if (typeof actual === "string") {
        return actual.toLowerCase().includes(String(expected ?? "").toLowerCase());
      }
      return false;
    case "in":
      if (Array.isArray(expected)) {
        return expected.map(normalize).includes(normalize(actual));
      }
      return false;
    default:
      return false;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.toLowerCase();
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  return value;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatValue).join(",");
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(2) : String(value);
  }
  if (value === undefined) {
    return "undefined";
  }
  return String(value);
}
