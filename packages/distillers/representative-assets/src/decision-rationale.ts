import type { DistillerFactory } from "@loamlog/core";
import { createRepresentativeDistiller } from "./base.js";
import { getString, getStringArray } from "./shared.js";

interface DecisionRationalePayload extends Record<string, unknown> {
  decision: string;
  context: string;
  options_considered?: string[];
  rationale: string;
  tradeoffs?: string[];
  constraints?: string[];
  revisit_trigger?: string;
}

const SYSTEM_PROMPT = [
  "You extract decision-rationale assets from local AI tool sessions.",
  "Return JSON array only.",
  "Each item must include: decision, context, rationale, confidence, evidence_refs.",
  "Optional fields: options_considered, tradeoffs, constraints, revisit_trigger.",
  "Each evidence_refs item must include message_id and excerpt.",
].join("\n");

const factory: DistillerFactory = () =>
  createRepresentativeDistiller<DecisionRationalePayload>({
    id: "@loamlog/distiller-decision-rationale",
    name: "Decision Rationale Extractor",
    version: "0.1.0",
    type: "decision-rationale",
    consumesSignals: [
      {
        kind: "commitment",
        tags: ["reason", "tradeoff"],
        min_confidence: 0.6,
        allowed_temporal_states: ["current", "completed", "unknown"],
      },
      {
        kind: "insight",
        tags: ["reason", "tradeoff"],
        min_confidence: 0.6,
        allowed_temporal_states: ["current", "completed", "unknown"],
      },
    ],
    systemPrompt: SYSTEM_PROMPT,
    parsePayload(item) {
      const decision = getString(item, "decision");
      const context = getString(item, "context");
      const rationale = getString(item, "rationale");
      if (!decision || !context || !rationale) return undefined;
      return {
        decision,
        context,
        options_considered: getStringArray(item, "options_considered"),
        rationale,
        tradeoffs: getStringArray(item, "tradeoffs"),
        constraints: getStringArray(item, "constraints"),
        revisit_trigger: getString(item, "revisit_trigger"),
      };
    },
    title(payload) {
      return payload.decision;
    },
    summary(payload) {
      return `${payload.context} Rationale: ${payload.rationale}`;
    },
    tags() {
      return ["decision-rationale"];
    },
  });

export default factory;
