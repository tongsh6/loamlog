import type { DistillResultDraft, DistillerFactory, DistillerRunInput, SessionArtifact } from "@loamlog/core";
import { createEvidence, defineDistiller } from "@loamlog/distiller-sdk";

const DISTILLER_ID = "@loamlog/distiller-issue-draft";
const MAX_MESSAGE_CHARS = 1200;
const SUPPORTED_ISSUE_KINDS = new Set(["bug", "feature", "docs", "refactor", "chore"]);
const SYSTEM_PROMPT = [
  "You extract exactly one strong GitHub issue draft from an AI coding session.",
  "Return a JSON array only.",
  "Each item must include: title, summary, background, problem, proposed_solution, acceptance_criteria, confidence, evidence_refs.",
  "Optional fields: issue_kind, labels.",
  "Each evidence_refs item must include message_id and excerpt.",
  "Prefer no result over weakly supported results.",
].join("\n");

type IssueKind = "bug" | "feature" | "docs" | "refactor" | "chore";

interface IssueDraftPayload {
  title: string;
  issue_kind?: IssueKind;
  labels?: string[];
}

interface LlmEvidenceRef {
  message_id: string;
  excerpt: string;
}

interface LlmIssueDraft {
  title: string;
  summary: string;
  background: string;
  problem: string;
  proposed_solution: string;
  acceptance_criteria: string[];
  confidence?: number;
  issue_kind?: string;
  labels?: string[];
  evidence_refs?: LlmEvidenceRef[];
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function buildPrompt(artifact: SessionArtifact): string {
  const chunks = artifact.messages.map((message: SessionArtifact["messages"][number]) => {
    const text = (message.content ?? "").slice(0, MAX_MESSAGE_CHARS);
    return `[${message.id}] (${message.role}) ${text}`;
  });

  return [
    `session_id: ${artifact.meta.session_id}`,
    "messages:",
    ...chunks,
    "",
    "Output format:",
    '[{"title":"...","summary":"...","background":"...","problem":"...","proposed_solution":"...","acceptance_criteria":["..."],"confidence":0.0,"issue_kind":"feature","labels":["triage"],"evidence_refs":[{"message_id":"...","excerpt":"..."}]}]',
  ].join("\n");
}

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

function normalizeIssueKind(value: unknown): IssueKind | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return SUPPORTED_ISSUE_KINDS.has(value) ? (value as IssueKind) : undefined;
}

function normalizeLabels(value: unknown): string[] | undefined {
  if (!isStringArray(value)) {
    return undefined;
  }

  const labels = value.map((label: string) => label.trim()).filter((label: string) => label.length > 0);
  return labels.length > 0 ? Array.from(new Set(labels)) : undefined;
}

function normalizeText(value: string): string {
  return value.trim();
}

function parseIssueDrafts(content: string): LlmIssueDraft[] {
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

function findMessage(artifact: SessionArtifact, messageId: string): SessionArtifact["messages"][number] | undefined {
  return artifact.messages.find((message: SessionArtifact["messages"][number]) => message.id === messageId);
}

function buildEvidence(artifact: SessionArtifact, refs: LlmEvidenceRef[] | undefined) {
  const seen = new Set<string>();
  const evidence: DistillResultDraft["evidence"] = [];

  for (const ref of refs ?? []) {
    const message = findMessage(artifact, ref.message_id);
    if (!message) {
      continue;
    }

    const excerpt = ref.excerpt.trim();
    if (excerpt.length === 0) {
      continue;
    }

    const key = `${ref.message_id}:${excerpt}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    evidence.push(createEvidence(artifact, message, excerpt));
  }

  return evidence;
}

function renderMarkdown(issue: LlmIssueDraft, evidence: DistillResultDraft["evidence"]): string {
  const acceptanceCriteria = issue.acceptance_criteria.map((item: string) => `- ${item}`).join("\n");
  const evidenceLines = evidence
    .map((item: DistillResultDraft["evidence"][number]) => `- \`${item.message_id}\`: ${item.excerpt}`)
    .join("\n");
  const labelLine = normalizeLabels(issue.labels);
  const issueKind = normalizeIssueKind(issue.issue_kind);

  return [
    issueKind ? `Type: ${issueKind}` : undefined,
    labelLine ? `Labels: ${labelLine.join(", ")}` : undefined,
    "## Background",
    issue.background,
    "",
    "## Problem",
    issue.problem,
    "",
    "## Proposed Solution",
    issue.proposed_solution,
    "",
    "## Acceptance Criteria",
    acceptanceCriteria,
    "",
    "## Evidence",
    evidenceLines,
  ]
    .filter((line: string | undefined): line is string => line !== undefined)
    .join("\n");
}

function toTags(issue: LlmIssueDraft): string[] {
  const tags = ["issue-draft"];
  const issueKind = normalizeIssueKind(issue.issue_kind);
  if (issueKind) {
    tags.push(issueKind);
  }

  const labels = normalizeLabels(issue.labels);
  if (labels) {
    tags.push(...labels);
  }

  return Array.from(new Set(tags));
}

function selectBestCandidate(candidates: LlmIssueDraft[], artifact: SessionArtifact): {
  issue: LlmIssueDraft;
  evidence: DistillResultDraft["evidence"];
} | null {
  const scored = candidates
    .map((issue: LlmIssueDraft) => ({ issue, evidence: buildEvidence(artifact, issue.evidence_refs) }))
    .filter((candidate) => candidate.evidence.length > 0)
    .sort((left, right) => {
      const confidenceDelta =
        (typeof right.issue.confidence === "number" ? right.issue.confidence : 0.5) -
        (typeof left.issue.confidence === "number" ? left.issue.confidence : 0.5);
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      const evidenceDelta = right.evidence.length - left.evidence.length;
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }

      return normalizeText(left.issue.title).localeCompare(normalizeText(right.issue.title));
    });

  return scored[0] ?? null;
}

const factory: DistillerFactory = () =>
  defineDistiller<IssueDraftPayload>({
    id: DISTILLER_ID,
    name: "Issue Draft Extractor",
    version: "0.1.0",
    supported_types: ["issue-draft"],

    async run({ artifactStore, llm }: DistillerRunInput): Promise<DistillResultDraft<IssueDraftPayload>[]> {
      const results: DistillResultDraft<IssueDraftPayload>[] = [];

      for await (const artifact of artifactStore.getUnprocessed(DISTILLER_ID)) {
        const prompt = buildPrompt(artifact);
        const { provider, model } = llm.route({
          task: "extract",
          budget: "cheap",
          input_tokens: estimateTokens(prompt),
        });

        const response = await provider.complete({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          model,
          temperature: 0.2,
          response_format: "json",
        });

        const parsed = parseIssueDrafts(response.content);
        const selected = selectBestCandidate(parsed, artifact);
        if (!selected) {
          continue;
        }

        const { issue, evidence } = selected;
        const payload: IssueDraftPayload = {
          title: normalizeText(issue.title),
          issue_kind: normalizeIssueKind(issue.issue_kind),
          labels: normalizeLabels(issue.labels),
        };

        results.push({
          type: "issue-draft",
          title: normalizeText(issue.title),
          summary: normalizeText(issue.summary),
          confidence: typeof issue.confidence === "number" ? issue.confidence : 0.7,
          tags: toTags(issue),
          payload,
          evidence,
          render: {
            markdown: renderMarkdown(issue, evidence),
          },
        });
      }

      return results;
    },
  });

export default factory;
