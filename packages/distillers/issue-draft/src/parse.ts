import { SUPPORTED_ISSUE_KINDS } from "./constants.js";
import type { IssueKind, LlmIssueDraft } from "./types.js";

function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  return trimmed;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

export function normalizeIssueKind(value: unknown): IssueKind | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return SUPPORTED_ISSUE_KINDS.has(value) ? (value as IssueKind) : undefined;
}

export function normalizeLabels(value: unknown): string[] | undefined {
  if (!isStringArray(value)) {
    return undefined;
  }

  const labels = value.map((label: string) => label.trim()).filter((label: string) => label.length > 0);
  return labels.length > 0 ? Array.from(new Set(labels)) : undefined;
}

export function normalizeText(value: string): string {
  return value.trim();
}

export function parseIssueDrafts(content: string): LlmIssueDraft[] {
  const json = extractJsonPayload(content);
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item: unknown): item is LlmIssueDraft => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.title === "string" &&
      normalizeText(candidate.title).length > 0 &&
      typeof candidate.summary === "string" &&
      normalizeText(candidate.summary).length > 0 &&
      typeof candidate.background === "string" &&
      normalizeText(candidate.background).length > 0 &&
      typeof candidate.problem === "string" &&
      normalizeText(candidate.problem).length > 0 &&
      typeof candidate.proposed_solution === "string" &&
      normalizeText(candidate.proposed_solution).length > 0 &&
      isStringArray(candidate.acceptance_criteria)
    );
  });
}
