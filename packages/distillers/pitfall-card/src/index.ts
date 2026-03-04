import type { DistillResultDraft, DistillerFactory, DistillerRunInput, SessionArtifact } from "@loamlog/core";
import { createEvidence, defineDistiller } from "@loamlog/distiller-sdk";

const DISTILLER_ID = "@loamlog/distiller-pitfall-card";
const SYSTEM_PROMPT = [
  "You extract pitfall cards from AI coding sessions.",
  "Return JSON array only.",
  "Each item must include: problem, root_cause, solution, prevention, category, confidence, evidence_refs.",
  "Each evidence_refs item must include message_id and excerpt.",
].join("\n");

interface PitfallCardPayload {
  problem: string;
  root_cause: string;
  solution: string;
  prevention: string;
  category: string;
  language?: string;
}

interface LlmEvidenceRef {
  message_id: string;
  excerpt: string;
}

interface LlmPitfall extends PitfallCardPayload {
  confidence?: number;
  evidence_refs?: LlmEvidenceRef[];
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function buildPrompt(artifact: SessionArtifact): string {
  const chunks = artifact.messages.map((message: SessionArtifact["messages"][number]) => {
    const text = (message.content ?? "").slice(0, 1200);
    return `[${message.id}] (${message.role}) ${text}`;
  });

  return [
    `session_id: ${artifact.meta.session_id}`,
    "messages:",
    ...chunks,
    "",
    "Output format:",
    "[{\"problem\":\"...\",\"root_cause\":\"...\",\"solution\":\"...\",\"prevention\":\"...\",\"category\":\"...\",\"confidence\":0.0,\"evidence_refs\":[{\"message_id\":\"...\",\"excerpt\":\"...\"}]}]",
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

function parsePitfalls(content: string): LlmPitfall[] {
  const json = extractJsonPayload(content);
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is LlmPitfall => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.problem === "string" &&
      typeof candidate.root_cause === "string" &&
      typeof candidate.solution === "string" &&
      typeof candidate.prevention === "string" &&
      typeof candidate.category === "string"
    );
  });
}

function findMessage(artifact: SessionArtifact, messageId: string): SessionArtifact["messages"][number] | undefined {
  return artifact.messages.find((message: SessionArtifact["messages"][number]) => message.id === messageId);
}

const factory: DistillerFactory = () =>
  defineDistiller<PitfallCardPayload>({
    id: DISTILLER_ID,
    name: "Pitfall Card Extractor",
    version: "0.1.0",
    supported_types: ["pitfall-card"],

    async run({ artifactStore, llm }: DistillerRunInput): Promise<DistillResultDraft<PitfallCardPayload>[]> {
      const results: DistillResultDraft<PitfallCardPayload>[] = [];

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
          temperature: 0.3,
          response_format: "json",
        });

        const parsed = parsePitfalls(response.content);
        for (const pitfall of parsed) {
          const evidence = (pitfall.evidence_refs ?? [])
            .map((ref) => {
              const message = findMessage(artifact, ref.message_id);
              if (!message) {
                return undefined;
              }
              return createEvidence(artifact, message, ref.excerpt);
            })
            .filter((item): item is DistillResultDraft["evidence"][number] => Boolean(item));

          if (evidence.length === 0) {
            const fallbackMessage = artifact.messages[0];
            if (!fallbackMessage) {
              continue;
            }
            evidence.push(createEvidence(artifact, fallbackMessage, fallbackMessage.content ?? pitfall.problem));
          }

          const payload: PitfallCardPayload = {
            problem: pitfall.problem,
            root_cause: pitfall.root_cause,
            solution: pitfall.solution,
            prevention: pitfall.prevention,
            category: pitfall.category,
            language: pitfall.language,
          };

          results.push({
            type: "pitfall-card",
            title: pitfall.problem.slice(0, 80),
            summary: `${pitfall.problem} -> ${pitfall.solution}`,
            confidence: typeof pitfall.confidence === "number" ? pitfall.confidence : 0.7,
            tags: ["pitfall", pitfall.category],
            payload,
            evidence,
          });
        }
      }

      return results;
    },
  });

export default factory;
