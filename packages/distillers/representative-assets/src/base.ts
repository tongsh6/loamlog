import type {
  DistillerPlugin,
  DistillResultDraft,
  SignalConsumptionRule,
} from "@loamlog/core";
import { defineDistiller } from "@loamlog/distiller-sdk";
import {
  asRecord,
  buildSessionPrompt,
  collectEvidence,
  estimateTokens,
  extractJsonArray,
  getEvidenceRefs,
  normalizeConfidence,
} from "./shared.js";

interface RepresentativeDistillerSpec<
  TPayload extends Record<string, unknown>,
> {
  id: string;
  name: string;
  version: string;
  type: string;
  consumesSignals?: SignalConsumptionRule[];
  systemPrompt: string;
  parsePayload(item: Record<string, unknown>): TPayload | undefined;
  title(payload: TPayload): string;
  summary(payload: TPayload): string;
  tags(payload: TPayload): string[];
}

export function createRepresentativeDistiller<
  TPayload extends Record<string, unknown>,
>(spec: RepresentativeDistillerSpec<TPayload>): DistillerPlugin {
  return defineDistiller<TPayload>({
    id: spec.id,
    name: spec.name,
    version: spec.version,
    supported_types: [spec.type],
    consumes_signals: spec.consumesSignals,

    async run({ artifactStore, llm }): Promise<DistillResultDraft<TPayload>[]> {
      const results: DistillResultDraft<TPayload>[] = [];

      for await (const artifact of artifactStore.getUnprocessed(spec.id)) {
        try {
          const prompt = buildSessionPrompt(artifact);
          const { provider, model } = llm.route({
            task: "extract",
            budget: "cheap",
            input_tokens: estimateTokens(prompt),
          });

          const response = await provider.complete({
            messages: [
              { role: "system", content: spec.systemPrompt },
              { role: "user", content: prompt },
            ],
            model,
            temperature: 0.3,
            response_format: "json",
          });

          for (const raw of extractJsonArray(response.content)) {
            const item = asRecord(raw);
            if (!item) continue;
            const payload = spec.parsePayload(item);
            if (!payload) continue;

            const evidence = collectEvidence(artifact, getEvidenceRefs(item));
            if (evidence.length === 0) continue;

            const title = spec.title(payload).slice(0, 100);
            const summary = spec.summary(payload);

            results.push({
              type: spec.type,
              title,
              summary,
              confidence: normalizeConfidence(item.confidence),
              tags: spec.tags(payload),
              payload,
              evidence,
              render: {
                markdown: [`## ${title}`, "", summary].join("\n"),
              },
            });
          }
        } catch (error) {
          console.error(
            `[${spec.type}] session ${artifact.meta.session_id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      return results;
    },
  });
}
