import { createHash } from "node:crypto";
import {
	defaultSignalReviewStatus,
	isSignalKind,
	isSignalTag,
	SIGNAL_KINDS,
	SIGNAL_TAGS,
	validateSignal,
	type JSONSchema7,
	type LLMRouter,
	type NormalizedSession,
	type Signal,
	type SignalClassifierRef,
	type SignalScope,
	type SignalTag,
} from "@loamlog/core";

export const SIGNAL_CLASSIFIER_ID = "signal-gate";
export const SIGNAL_CLASSIFIER_VERSION = "0.1.0";
export const SIGNAL_CLASSIFIER_PROMPT_VERSION = "2026-05-15";

const SIGNAL_SCOPES = ["message", "session", "cross_session"] as const;
const SIGNAL_ACTORS = ["user", "assistant", "tool", "system", "mixed"] as const;
const SIGNAL_TEMPORAL_STATES = [
	"future",
	"current",
	"in_progress",
	"completed",
	"obsolete",
	"unknown",
] as const;
const PROMOTION_ELIGIBILITIES = [
	"eligible",
	"needs_review",
	"ineligible",
] as const;

export const SIGNAL_CLASSIFIER_OUTPUT_SCHEMA: JSONSchema7 = {
	type: "object",
	additionalProperties: false,
	required: ["signals"],
	properties: {
		signals: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"scope",
					"kind",
					"tags",
					"actor",
					"temporal_state",
					"confidence",
					"evidence_refs",
					"promotion_hints",
				],
				properties: {
					scope: { type: "string", enum: [...SIGNAL_SCOPES] },
					kind: { type: "string", enum: [...SIGNAL_KINDS] },
					tags: {
						type: "array",
						items: { type: "string", enum: [...SIGNAL_TAGS] },
					},
					raw_tags: { type: "array", items: { type: "string" } },
					notes: { type: "string" },
					actor: { type: "string", enum: [...SIGNAL_ACTORS] },
					temporal_state: {
						type: "string",
						enum: [...SIGNAL_TEMPORAL_STATES],
					},
					confidence: { type: "number", minimum: 0, maximum: 1 },
					evidence_refs: {
						type: "array",
						minItems: 1,
						items: {
							type: "object",
							additionalProperties: false,
							required: ["message_id", "excerpt"],
							properties: {
								message_id: { type: "string" },
								excerpt: { type: "string", minLength: 1 },
								position: {
									type: "object",
									additionalProperties: false,
									required: ["start", "end"],
									properties: {
										start: { type: "integer", minimum: 0 },
										end: { type: "integer", minimum: 0 },
									},
								},
							},
						},
					},
					promotion_hints: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							required: ["target_distiller", "eligibility", "reason"],
							properties: {
								target_distiller: { type: "string", minLength: 1 },
								eligibility: {
									type: "string",
									enum: [...PROMOTION_ELIGIBILITIES],
								},
								reason: { type: "string", minLength: 1 },
							},
						},
					},
				},
			},
		},
	},
};

export interface SignalClassifierRejectedItem {
	index: number;
	reason: string;
	raw: unknown;
}

export interface SignalClassifierNormalizationResult {
	signals: Signal[];
	rejected: SignalClassifierRejectedItem[];
}

export interface SignalClassifierOptions {
	classifier?: Partial<SignalClassifierRef> & { model?: string };
	now?: string;
}

export function buildSignalClassifierMessages(normalized: NormalizedSession): Array<{
	role: "system" | "user";
	content: string;
}> {
	return [
		{
			role: "system",
			content: [
				"You classify normalized AI collaboration sessions into durable Signal Gate nodes.",
				"Return only JSON that matches this shape: {\"signals\":[...]}",
				"Use SignalKind for value changes, not final asset types.",
				"Every signal must include at least one valid evidence_refs entry with message_id and excerpt.",
				"Classify process logs, completed/no-value work, duplicates, unsupported inference, and ambiguous items as noise or low-value signals.",
			].join("\n"),
		},
		{
			role: "user",
			content: buildSignalClassifierPrompt(normalized),
		},
	];
}

export function buildSignalClassifierPrompt(normalized: NormalizedSession): string {
	const messages = normalized.messages.map((message) => {
		const tools =
			message.tools && message.tools.length > 0
				? ` tools=${message.tools.map((tool) => tool.name).join(",")}`
				: "";
		return `[${message.id}] (${message.role}${tools}) ${message.text.slice(0, 1600)}`;
	});

	return [
		`session_id: ${normalized.header.session_id}`,
		`provider: ${normalized.header.provider}`,
		`repo_path: ${normalized.header.repo_path ?? ""}`,
		`captured_at: ${normalized.header.captured_at}`,
		"allowed_kinds:",
		SIGNAL_KINDS.join(", "),
		"allowed_tags:",
		SIGNAL_TAGS.join(", "),
		"messages:",
		...messages,
	].join("\n");
}

export async function classifySignals(
	normalized: NormalizedSession,
	llm: LLMRouter,
	options: SignalClassifierOptions = {},
): Promise<SignalClassifierNormalizationResult> {
	const messages = buildSignalClassifierMessages(normalized);
	const inputTokens = estimateTokens(messages.map((message) => message.content).join("\n"));
	const route = llm.route({
		task: "classify",
		budget: "cheap",
		input_tokens: inputTokens,
	});

	const response = await route.provider.complete({
		messages,
		model: route.model,
		temperature: 0.1,
		response_format: "json",
	});

	return normalizeSignalClassifierOutput(response.content, normalized, {
		...options,
		classifier: {
			...options.classifier,
			model: options.classifier?.model ?? route.model,
		},
	});
}

export function normalizeSignalClassifierOutput(
	content: string,
	normalized: NormalizedSession,
	options: SignalClassifierOptions = {},
): SignalClassifierNormalizationResult {
	const parsed = parseClassifierJson(content);
	const rawSignals = getRawSignals(parsed);
	const rejected: SignalClassifierRejectedItem[] = [];
	const signals: Signal[] = [];
	const now = options.now ?? new Date().toISOString();
	const classifier: SignalClassifierRef = {
		id: options.classifier?.id ?? SIGNAL_CLASSIFIER_ID,
		version: options.classifier?.version ?? SIGNAL_CLASSIFIER_VERSION,
		model: options.classifier?.model ?? "unknown",
		prompt_version:
			options.classifier?.prompt_version ?? SIGNAL_CLASSIFIER_PROMPT_VERSION,
	};

	for (let index = 0; index < rawSignals.length; index += 1) {
		const raw = rawSignals[index];
		const record = asRecord(raw);
		if (!record) {
			rejected.push({ index, reason: "not_object", raw });
			continue;
		}

		const normalizedSignal = normalizeSignalRecord({
			record,
			raw,
			index,
			normalized,
			classifier,
			now,
		});
		if ("rejected" in normalizedSignal) {
			rejected.push(normalizedSignal.rejected);
			continue;
		}

		signals.push(normalizedSignal.signal);
	}

	return { signals, rejected };
}

function normalizeSignalRecord(input: {
	record: Record<string, unknown>;
	raw: unknown;
	index: number;
	normalized: NormalizedSession;
	classifier: SignalClassifierRef;
	now: string;
}): { signal: Signal } | { rejected: SignalClassifierRejectedItem } {
	const { record, raw, index, normalized, classifier, now } = input;
	const scope = getEnum(record.scope, SIGNAL_SCOPES);
	if (!scope) return reject(index, "invalid_scope", raw);

	const kind = isSignalKind(record.kind) ? record.kind : undefined;
	if (!kind) return reject(index, "invalid_kind", raw);

	const actor = getEnum(record.actor, SIGNAL_ACTORS);
	if (!actor) return reject(index, "invalid_actor", raw);

	const temporalState = getEnum(record.temporal_state, SIGNAL_TEMPORAL_STATES);
	if (!temporalState) return reject(index, "invalid_temporal_state", raw);

	const confidence =
		typeof record.confidence === "number" &&
		Number.isFinite(record.confidence) &&
		record.confidence >= 0 &&
		record.confidence <= 1
			? record.confidence
			: undefined;
	if (confidence === undefined) return reject(index, "invalid_confidence", raw);

	const { tags, rawTags } = normalizeTags(record.tags, record.raw_tags);
	const spans = normalizeEvidenceRefs(record.evidence_refs, normalized);
	if (spans.length === 0) return reject(index, "no_valid_evidence", raw);

	const machineClassification = {
		kind,
		tags,
		actor,
		temporal_state: temporalState,
		confidence,
	};
	const signal: Signal = {
		id: buildSignalId({
			normalized,
			classifier,
			scope,
			kind,
			tags,
			spans,
			index,
		}),
		scope,
		kind,
		tags,
		raw_tags: rawTags.length > 0 ? rawTags : undefined,
		notes: getString(record.notes),
		actor,
		temporal_state: temporalState,
		confidence,
		spans,
		review_status: defaultSignalReviewStatus({
			kind,
			confidence,
			spans,
		}),
		machine_classification: machineClassification,
		promotion_hints: normalizePromotionHints(record.promotion_hints),
		raw_model_output: raw,
		classifier,
		created_at: now,
		updated_at: now,
	};

	const report = validateSignal(signal);
	if (!report.passed) {
		return reject(
			index,
			report.checks
				.filter((check) => !check.passed)
				.map((check) => check.reason ?? check.name)
				.join("; "),
			raw,
		);
	}

	return { signal };
}

function reject(
	index: number,
	reason: string,
	raw: unknown,
): { rejected: SignalClassifierRejectedItem } {
	return { rejected: { index, reason, raw } };
}

function parseClassifierJson(content: string): unknown {
	const trimmed = content.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	return JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown;
}

function getRawSignals(parsed: unknown): unknown[] {
	if (Array.isArray(parsed)) return parsed;
	const record = asRecord(parsed);
	return Array.isArray(record?.signals) ? record.signals : [];
}

function normalizeTags(
	tagsValue: unknown,
	rawTagsValue: unknown,
): { tags: SignalTag[]; rawTags: string[] } {
	const tags: SignalTag[] = [];
	const rawTags: string[] = [];

	for (const value of toStringArray(tagsValue)) {
		if (isSignalTag(value)) {
			if (!tags.includes(value)) tags.push(value);
		} else if (!rawTags.includes(value)) {
			rawTags.push(value);
		}
	}

	for (const value of toStringArray(rawTagsValue)) {
		if (!rawTags.includes(value)) rawTags.push(value);
	}

	return { tags, rawTags };
}

function normalizeEvidenceRefs(
	value: unknown,
	normalized: NormalizedSession,
): Signal["spans"] {
	if (!Array.isArray(value)) return [];
	const spans: Signal["spans"] = [];

	for (const item of value) {
		const ref = asRecord(item);
		if (!ref) continue;
		const messageId = getString(ref.message_id);
		const excerpt = getString(ref.excerpt);
		if (!messageId || !excerpt) continue;
		const message = normalized.messages.find((candidate) => candidate.id === messageId);
		if (!message) continue;

		const position = normalizePosition(ref.position);
		spans.push({
			session_id: normalized.header.session_id,
			message_id: message.id,
			excerpt,
			position,
		});
	}

	return spans.map((span) => ({ ...span }));
}

function normalizePromotionHints(value: unknown): Signal["promotion_hints"] {
	if (!Array.isArray(value)) return [];
	const hints: Signal["promotion_hints"] = [];

	for (const item of value) {
		const record = asRecord(item);
		if (!record) continue;
		const targetDistiller = getString(record.target_distiller);
		const eligibility = getEnum(record.eligibility, PROMOTION_ELIGIBILITIES);
		const reason = getString(record.reason);
		if (!targetDistiller || !eligibility || !reason) continue;
		hints.push({
			target_distiller: targetDistiller,
			eligibility,
			reason,
		});
	}

	return hints;
}

function normalizePosition(value: unknown): { start: number; end: number } | undefined {
	const record = asRecord(value);
	if (!record) return undefined;
	const start = record.start;
	const end = record.end;
	if (
		typeof start !== "number" ||
		typeof end !== "number" ||
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		end < start
	) {
		return undefined;
	}
	return { start, end };
}

function buildSignalId(input: {
	normalized: NormalizedSession;
	classifier: SignalClassifierRef;
	scope: SignalScope;
	kind: string;
	tags: string[];
	spans: Signal["spans"];
	index: number;
}): string {
	const hash = createHash("sha256")
		.update(
			JSON.stringify({
				session_id: input.normalized.header.session_id,
				classifier: input.classifier,
				scope: input.scope,
				kind: input.kind,
				tags: input.tags,
				spans: input.spans.map((span) => ({
					message_id: span.message_id,
					excerpt: span.excerpt,
				})),
				index: input.index,
			}),
		)
		.digest("hex")
		.slice(0, 16);
	return `sig-${hash}`;
}

function getEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
): T | undefined {
	return typeof value === "string" && allowed.includes(value as T)
		? (value as T)
		: undefined;
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter((item) => item.length > 0);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function estimateTokens(content: string): number {
	return Math.max(1, Math.ceil(content.length / 4));
}
