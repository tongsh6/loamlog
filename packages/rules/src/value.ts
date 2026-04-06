import type { ActionCandidate } from "./types.js";

export function getCandidateValue(candidate: ActionCandidate, field: string): unknown {
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

export function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
