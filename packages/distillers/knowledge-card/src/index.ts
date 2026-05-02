import type { DistillResultDraft, DistillerFactory, DistillerRunInput, SessionArtifact } from "@loamlog/core";
import { createEvidence, defineDistiller } from "@loamlog/distiller-sdk";

const DISTILLER_ID = "@loamlog/distiller-knowledge-card";

const SYSTEM_PROMPT = [
  "You extract reusable knowledge cards from AI coding sessions.",
  "A knowledge card captures one discrete insight that can be reused across projects.",
  "Return JSON array only. Each item must include:",
  "- title: short title for this knowledge item",
  "- category: one of [pattern, insight, configuration, decision, tooling, debugging, performance, security]",
  "- summary: one sentence describing the knowledge",
  "- detail: 2-4 sentence explanation with concrete specifics",
  "- tags: array of keywords",
  "- confidence: 0.0-1.0",
  "- evidence_refs: array of {message_id, excerpt}",
  "Focus on reusable, generalizable knowledge. Skip trivial observations.",
].join("\n");

interface KnowledgeCardPayload {
  title: string;
  category: string;
  summary: string;
  detail: string;
  tags: string[];
}

interface LlmEvidenceRef {
  message_id: string;
  excerpt: string;
}

interface LlmKnowledgeCard extends KnowledgeCardPayload {
  confidence?: number;
  evidence_refs?: LlmEvidenceRef[];
}

const VALID_CATEGORIES = new Set([
  "pattern",
  "insight",
  "configuration",
  "decision",
  "tooling",
  "debugging",
  "performance",
  "security",
]);

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
    "Extract reusable knowledge from this AI coding session. Return a JSON array of knowledge cards.",
    "",
    "messages:",
    ...chunks,
    "",
    "Categories: pattern | insight | configuration | decision | tooling | debugging | performance | security",
    "",
    "Output format:",
    '[{"title":"...","category":"...","summary":"...","detail":"...","tags":["..."],"confidence":0.0,"evidence_refs":[{"message_id":"...","excerpt":"..."}]}]',
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

function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (VALID_CATEGORIES.has(lower)) return lower;
  if (lower.includes("pattern")) return "pattern";
  if (lower.includes("config")) return "configuration";
  if (lower.includes("decision") || lower.includes("arch")) return "decision";
  if (lower.includes("tool")) return "tooling";
  if (lower.includes("debug") || lower.includes("fix")) return "debugging";
  if (lower.includes("perform") || lower.includes("optim")) return "performance";
  if (lower.includes("secur")) return "security";
  return "insight";
}

function parseKnowledgeCards(content: string): LlmKnowledgeCard[] {
  const json = extractJsonPayload(content);
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is LlmKnowledgeCard => {
    if (!item || typeof item !== "object") return false;
    const c = item as Record<string, unknown>;
    return (
      typeof c.title === "string" &&
      c.title.length > 0 &&
      typeof c.summary === "string" &&
      c.summary.length > 0
    );
  });
}

function findMessage(artifact: SessionArtifact, messageId: string): SessionArtifact["messages"][number] | undefined {
  return artifact.messages.find((message: SessionArtifact["messages"][number]) => message.id === messageId);
}

function dedupeByTitle(cards: LlmKnowledgeCard[]): LlmKnowledgeCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const factory: DistillerFactory = () =>
  defineDistiller<KnowledgeCardPayload>({
    id: DISTILLER_ID,
    name: "Knowledge Card Extractor",
    version: "0.1.0",
    supported_types: ["knowledge-card"],

    async run({ artifactStore, llm }: DistillerRunInput): Promise<DistillResultDraft<KnowledgeCardPayload>[]> {
      const results: DistillResultDraft<KnowledgeCardPayload>[] = [];

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

        const parsed = dedupeByTitle(parseKnowledgeCards(response.content));
        for (const card of parsed) {
          const evidence = (card.evidence_refs ?? [])
            .map((ref) => {
              const message = findMessage(artifact, ref.message_id);
              if (!message) return undefined;
              return createEvidence(artifact, message, ref.excerpt);
            })
            .filter((item): item is DistillResultDraft["evidence"][number] => Boolean(item));

          if (evidence.length === 0) {
            const fallback = artifact.messages[0];
            if (!fallback) continue;
            evidence.push(createEvidence(artifact, fallback, fallback.content ?? card.title));
          }

          const category = normalizeCategory(card.category);
          const tags = Array.isArray(card.tags)
            ? [...new Set(card.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean))]
            : [category];

          const payload: KnowledgeCardPayload = {
            title: card.title.trim(),
            category,
            summary: card.summary.trim(),
            detail: (card.detail ?? card.summary).trim(),
            tags,
          };

          results.push({
            type: "knowledge-card",
            title: card.title.trim().slice(0, 100),
            summary: card.summary.trim(),
            confidence: typeof card.confidence === "number" ? card.confidence : 0.7,
            tags: [category, ...tags].slice(0, 8),
            payload,
            evidence,
          });
        }
        } catch (error) {
          console.error(
            `[knowledge-card] session ${artifact.meta.session_id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return results;
    },
  });

export default factory;
