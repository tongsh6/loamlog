import type { RuleDefinition, RuleType } from "./types.js";

export function isRuleDefinition(value: unknown): value is RuleDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string") {
    return false;
  }
  const allowedTypes: RuleType[] = ["signal", "scoring", "necessity", "filter", "execution"];
  return allowedTypes.includes(candidate.type as RuleType);
}
