import type { DistillerFactory } from "@loamlog/core";
import { createRepresentativeDistiller } from "./base.js";
import { getString } from "./shared.js";

interface PracticePitfallPayload extends Record<string, unknown> {
	situation: string;
	pitfall_or_practice: string;
	symptom?: string;
	root_cause?: string;
	fix_or_pattern: string;
	prevention?: string;
	reusable_scope: string;
}

const SYSTEM_PROMPT = [
	"You extract practice-pitfall assets from local AI tool sessions.",
	"Return JSON array only.",
	"Each item must include: situation, pitfall_or_practice, fix_or_pattern, reusable_scope, confidence, evidence_refs.",
	"Optional fields: symptom, root_cause, prevention.",
	"Each evidence_refs item must include message_id and excerpt.",
].join("\n");

const factory: DistillerFactory = () =>
	createRepresentativeDistiller<PracticePitfallPayload>({
		id: "@loamlog/distiller-practice-pitfall",
		name: "Practice Pitfall Extractor",
		version: "0.1.0",
		type: "practice-pitfall",
		systemPrompt: SYSTEM_PROMPT,
		parsePayload(item) {
			const situation = getString(item, "situation");
			const pitfallOrPractice = getString(item, "pitfall_or_practice");
			const fixOrPattern = getString(item, "fix_or_pattern");
			const reusableScope = getString(item, "reusable_scope");
			if (!situation || !pitfallOrPractice || !fixOrPattern || !reusableScope) return undefined;
			return {
				situation,
				pitfall_or_practice: pitfallOrPractice,
				symptom: getString(item, "symptom"),
				root_cause: getString(item, "root_cause"),
				fix_or_pattern: fixOrPattern,
				prevention: getString(item, "prevention"),
				reusable_scope: reusableScope,
			};
		},
		title(payload) {
			return payload.pitfall_or_practice;
		},
		summary(payload) {
			return `${payload.situation}: ${payload.fix_or_pattern}`;
		},
		tags() {
			return ["practice-pitfall"];
		},
	});

export default factory;

