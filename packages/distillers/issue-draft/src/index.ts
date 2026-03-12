import type { DistillResultDraft, DistillerFactory, DistillerRunInput } from "@loamlog/core";
import { defineDistiller } from "@loamlog/distiller-sdk";

import { DISTILLER_ID, SYSTEM_PROMPT } from "./constants.js";
import { normalizeIssueKind, normalizeLabels, normalizeText, parseIssueDrafts } from "./parse.js";
import { buildPrompt, estimateTokens } from "./prompt.js";
import { renderMarkdown, toTags } from "./render.js";
import { selectBestCandidate } from "./select.js";
import type { IssueDraftPayload } from "./types.js";

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
