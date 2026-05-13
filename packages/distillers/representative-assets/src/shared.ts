import type { DistillEvidenceDraft, SessionArtifact } from "@loamlog/core";
import { createEvidence } from "@loamlog/distiller-sdk";

export interface LlmEvidenceRef {
	message_id: string;
	excerpt: string;
}

export function estimateTokens(content: string): number {
	return Math.max(1, Math.ceil(content.length / 4));
}

export function buildSessionPrompt(artifact: SessionArtifact): string {
	const chunks = artifact.messages.map((message) => {
		const text = (message.content ?? "").slice(0, 1200);
		return `[${message.id}] (${message.role}) ${text}`;
	});

	return [
		`session_id: ${artifact.meta.session_id}`,
		`provider: ${artifact.meta.provider}`,
		`captured_at: ${artifact.meta.captured_at}`,
		"messages:",
		...chunks,
	].join("\n");
}

export function extractJsonArray(content: string): unknown[] {
	const trimmed = content.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	const json = fenced?.[1]?.trim() ?? trimmed;
	const parsed = JSON.parse(json) as unknown;
	return Array.isArray(parsed) ? parsed : [];
}

export function normalizeConfidence(value: unknown): number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return 0.7;
	}
	return Math.max(0, Math.min(1, value));
}

export function collectEvidence(
	artifact: SessionArtifact,
	refs: LlmEvidenceRef[] | undefined,
): DistillEvidenceDraft[] {
	if (!refs) return [];
	return refs
		.map((ref) => {
			const message = artifact.messages.find((item) => item.id === ref.message_id);
			if (!message) return undefined;
			return createEvidence(artifact, message, ref.excerpt);
		})
		.filter((item): item is DistillEvidenceDraft => Boolean(item));
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

export function getString(item: Record<string, unknown>, key: string): string | undefined {
	const value = item[key];
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function getStringArray(item: Record<string, unknown>, key: string): string[] | undefined {
	const value = item[key];
	if (!Array.isArray(value)) return undefined;
	const strings = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
	return strings.length > 0 ? strings : undefined;
}

export function getEvidenceRefs(item: Record<string, unknown>): LlmEvidenceRef[] | undefined {
	const value = item.evidence_refs;
	if (!Array.isArray(value)) return undefined;
	const refs = value
		.map((entry) => {
			const record = asRecord(entry);
			if (!record) return undefined;
			const messageId = getString(record, "message_id");
			const excerpt = getString(record, "excerpt");
			if (!messageId || !excerpt) return undefined;
			return { message_id: messageId, excerpt };
		})
		.filter((entry): entry is LlmEvidenceRef => Boolean(entry));
	return refs.length > 0 ? refs : undefined;
}

export function getEnumValue<T extends string>(
	item: Record<string, unknown>,
	key: string,
	allowed: readonly T[],
): T | undefined {
	const value = item[key];
	return typeof value === "string" && allowed.includes(value as T) ? (value as T) : undefined;
}

