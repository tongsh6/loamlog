import type { DistillerFactory } from "@loamlog/core";
import { createRepresentativeDistiller } from "./base.js";
import { getString, REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS } from "./shared.js";

interface IdeaSeedPayload extends Record<string, unknown> {
  idea: string;
  context: string;
  why_now?: string;
  potential_value?: string;
  target_audience?: string;
  uncertainty?: string;
  next_probe?: string;
}

const SYSTEM_PROMPT = [
  "You extract idea-seed assets from local AI tool sessions.",
  "Return JSON array only.",
  "Each item must include: idea, context, confidence, evidence_refs.",
  "Optional fields: why_now, potential_value, target_audience, uncertainty, next_probe.",
  "Each evidence_refs item must include message_id and excerpt.",
  ...REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS,
  "Accept only new, expandable ideas, opportunities, hypotheses, or content seeds that can go into an idea inbox.",
  "Reject ordinary summaries, user requests, current tasks, completed records, old roadmap items, implementation chores, and ideas inferred merely from reading a design document.",
].join("\n");

const factory: DistillerFactory = () =>
  createRepresentativeDistiller<IdeaSeedPayload>({
    id: "@loamlog/distiller-idea-seed",
    name: "Idea Seed Extractor",
    version: "0.1.0",
    type: "idea-seed",
    consumesSignals: [
      {
        kind: "intent",
        tags: ["goal", "content_seed"],
        min_confidence: 0.5,
        allowed_temporal_states: ["future", "current", "unknown"],
      },
      {
        kind: "insight",
        tags: ["content_seed"],
        min_confidence: 0.5,
        allowed_temporal_states: ["future", "current", "unknown"],
      },
    ],
    systemPrompt: SYSTEM_PROMPT,
    parsePayload(item) {
      const idea = getString(item, "idea");
      const context = getString(item, "context");
      if (!idea || !context) return undefined;
      return {
        idea,
        context,
        why_now: getString(item, "why_now"),
        potential_value: getString(item, "potential_value"),
        target_audience: getString(item, "target_audience"),
        uncertainty: getString(item, "uncertainty"),
        next_probe: getString(item, "next_probe"),
      };
    },
    title(payload) {
      return payload.idea;
    },
    summary(payload) {
      return payload.next_probe
        ? `${payload.context} Next probe: ${payload.next_probe}`
        : payload.context;
    },
    tags() {
      return ["idea-seed"];
    },
  });

export default factory;
