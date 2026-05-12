import type { DistillResultDraft, DistillerFactory, DistillerRunInput, SessionArtifact } from "@loamlog/core";
import { createEvidence, defineDistiller } from "@loamlog/distiller-sdk";

const DISTILLER_ID = "@loamlog/distiller-prd-draft";

const SYSTEM_PROMPT = [
  "You extract product requirement document (PRD) drafts from AI coding sessions.",
  "A PRD draft captures a feature or improvement that was discussed and is worth formalizing.",
  "Return JSON array only. Each item must include:",
  "- title: short feature name",
  "- problem: what problem does this solve (1-2 sentences)",
  "- user_story: who needs this and why (As a... I want... so that...)",
  "- proposed_solution: high-level approach (2-3 sentences)",
  "- technical_notes: technical considerations (2-3 sentences, optional)",
  "- dependencies: array of prerequisite items (strings, optional)",
  "- acceptance_criteria: array of checkable conditions (strings)",
  "- priority: one of [p0_critical, p1_high, p2_medium, p3_low]",
  "- effort: one of [xs, s, m, l, xl]",
  "- confidence: 0.0-1.0",
  "- evidence_refs: array of {message_id, excerpt}",
  "Only extract features that were meaningfully discussed. Skip vague mentions.",
].join("\n");

interface PrdDraftPayload {
  title: string;
  problem: string;
  user_story: string;
  proposed_solution: string;
  technical_notes?: string;
  dependencies?: string[];
  acceptance_criteria: string[];
  priority: string;
  effort: string;
}

interface LlmEvidenceRef {
  message_id: string;
  excerpt: string;
}

interface LlmPrdDraft extends PrdDraftPayload {
  confidence?: number;
  evidence_refs?: LlmEvidenceRef[];
}

const VALID_PRIORITIES = new Set(["p0_critical", "p1_high", "p2_medium", "p3_low"]);
const VALID_EFFORTS = new Set(["xs", "s", "m", "l", "xl"]);

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function buildPrompt(artifact: SessionArtifact): string {
  const chunks = artifact.messages.map((message: SessionArtifact["messages"][number]) => {
    const text = (message.content ?? "").slice(0, 1500);
    return `[${message.id}] (${message.role}) ${text}`;
  });

  return [
    `session_id: ${artifact.meta.session_id}`,
    "Extract PRD-worthy feature drafts from this AI coding session. Return a JSON array.",
    "",
    "messages:",
    ...chunks,
    "",
    "Priority: p0_critical | p1_high | p2_medium | p3_low",
    "Effort: xs | s | m | l | xl",
    "",
    "Output format:",
    '[{"title":"...","problem":"...","user_story":"As a... I want... so that...","proposed_solution":"...","technical_notes":"...","dependencies":["..."],"acceptance_criteria":["..."],"priority":"p1_high","effort":"m","confidence":0.0,"evidence_refs":[{"message_id":"...","excerpt":"..."}]}]',
  ].join("\n");
}

function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  return trimmed;
}

function normalizePriority(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (VALID_PRIORITIES.has(lower)) return lower;
  if (lower.includes("critic") || lower.startsWith("p0")) return "p0_critical";
  if (lower.includes("high") || lower.startsWith("p1")) return "p1_high";
  if (lower.startsWith("p2")) return "p2_medium";
  return "p3_low";
}

function normalizeEffort(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (VALID_EFFORTS.has(lower)) return lower;
  if (lower === "x-small" || lower === "tiny") return "xs";
  if (lower === "small") return "s";
  if (lower === "medium") return "m";
  if (lower === "large") return "l";
  if (lower === "x-large" || lower === "xxl") return "xl";
  return "m";
}

function parsePrdDrafts(content: string): LlmPrdDraft[] {
  const json = extractJsonPayload(content);
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) return [];

  return parsed.filter((item): item is LlmPrdDraft => {
    if (!item || typeof item !== "object") return false;
    const c = item as Record<string, unknown>;
    return (
      typeof c.title === "string" && c.title.length > 0 &&
      typeof c.problem === "string" && c.problem.length > 0 &&
      typeof c.user_story === "string" && c.user_story.length > 0 &&
      typeof c.proposed_solution === "string" && c.proposed_solution.length > 0
    );
  });
}

function findMessage(artifact: SessionArtifact, messageId: string): SessionArtifact["messages"][number] | undefined {
  return artifact.messages.find((m: SessionArtifact["messages"][number]) => m.id === messageId);
}

const factory: DistillerFactory = () =>
  defineDistiller<PrdDraftPayload>({
    id: DISTILLER_ID,
    name: "PRD Draft Extractor",
    version: "0.1.0",
    supported_types: ["prd-draft"],

    async run({ artifactStore, llm }: DistillerRunInput): Promise<DistillResultDraft<PrdDraftPayload>[]> {
      const results: DistillResultDraft<PrdDraftPayload>[] = [];

      for await (const artifact of artifactStore.getUnprocessed(DISTILLER_ID)) {
        try {
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
          temperature: 0.3,
          response_format: "json",
        });

        const parsed = parsePrdDrafts(response.content);
        for (const draft of parsed) {
          const evidence = (draft.evidence_refs ?? [])
            .map((ref) => {
              const message = findMessage(artifact, ref.message_id);
              if (!message) return undefined;
              return createEvidence(artifact, message, ref.excerpt);
            })
            .filter((item): item is DistillResultDraft["evidence"][number] => Boolean(item));

          if (evidence.length === 0) {
            const fallback = artifact.messages[0];
            if (!fallback) continue;
            evidence.push(createEvidence(artifact, fallback, fallback.content ?? draft.title));
          }

          const priority = normalizePriority(draft.priority ?? "p2_medium");
          const effort = normalizeEffort(draft.effort ?? "m");

          const payload: PrdDraftPayload = {
            title: draft.title.trim(),
            problem: draft.problem.trim(),
            user_story: draft.user_story.trim(),
            proposed_solution: draft.proposed_solution.trim(),
            technical_notes: draft.technical_notes?.trim(),
            dependencies: Array.isArray(draft.dependencies)
              ? draft.dependencies.map((d) => String(d).trim()).filter(Boolean)
              : undefined,
            acceptance_criteria: Array.isArray(draft.acceptance_criteria)
              ? draft.acceptance_criteria.map((a) => String(a).trim()).filter(Boolean)
              : [],
            priority,
            effort,
          };

          results.push({
            type: "prd-draft",
            title: draft.title.trim().slice(0, 100),
            summary: `[${priority}/${effort}] ${draft.problem.trim().slice(0, 120)}`,
            confidence: typeof draft.confidence === "number" ? draft.confidence : 0.7,
            tags: ["prd", priority, effort],
            payload,
            evidence,
          });
        }
        } catch (error) {
          console.error(
            `[prd-draft] session ${artifact.meta.session_id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return results;
    },
  });

export default factory;
