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

export function shouldKeepRepresentativeAsset(input: {
	type: string;
	title: string;
	summary: string;
	payload: Record<string, unknown>;
	evidence: DistillEvidenceDraft[];
	artifact: SessionArtifact;
}): boolean {
	const evidenceText = evidenceSourceText(input.artifact, input.evidence);
	const assetText = normalizeText(
		[
			input.title,
			input.summary,
			...Object.values(input.payload).flatMap((value) => flattenPayloadText(value)),
		].join(" "),
	);
	const combinedText = `${assetText} ${normalizeText(evidenceText)}`;

	if (isAssistantProcessLog(input.artifact, input.evidence, evidenceText)) {
		return false;
	}
	if (isActionShellTitle(input.title)) {
		return false;
	}

	switch (input.type) {
		case "follow-up-work-item":
			return keepFollowUpWorkItem(input.payload, combinedText);
		case "idea-seed":
			return (
				!hasDoneState(combinedText) &&
				!isOldRoadmapResidue(combinedText) &&
				!isTroubleshootingDuplicateTopic(combinedText)
			);
		case "decision-rationale":
			return keepDecisionRationale(input.payload, combinedText);
		case "practice-pitfall":
			return keepPracticePitfall(input.payload, combinedText);
		case "skill-candidate":
			return keepSkillCandidate(input.payload, combinedText);
		default:
			return true;
	}
}

function keepFollowUpWorkItem(
	payload: Record<string, unknown>,
	combinedText: string,
): boolean {
	const action = String(payload.action ?? "");
	if (hasDoneState(combinedText)) return false;
	if (isOldRoadmapResidue(combinedText)) return false;
	if (isActionShellTitle(action)) return false;
	const acceptance = payload.acceptance;
	return Array.isArray(acceptance) && acceptance.some((item) => typeof item === "string" && item.trim().length > 0);
}

function keepDecisionRationale(
	payload: Record<string, unknown>,
	combinedText: string,
): boolean {
	const decision = normalizeText(String(payload.decision ?? ""));
	const rationale = normalizeText(String(payload.rationale ?? ""));
	if (!decision || !rationale) return false;
	if (/\b(need to decide|needs decision|should decide)\b/.test(combinedText)) {
		return false;
	}
	if (/正在|需要判断|需要决定/.test(combinedText)) {
		return false;
	}
	return true;
}

function keepPracticePitfall(
	payload: Record<string, unknown>,
	combinedText: string,
): boolean {
	const hasFix = Boolean(payload.fix_or_pattern);
	const hasContext = Boolean(payload.situation && payload.pitfall_or_practice);
	if (!hasFix || !hasContext) return false;
	if (/api key.*(missing|empty|not set)|未设置.*api key|key 为空/.test(combinedText)) {
		return false;
	}
	return true;
}

function keepSkillCandidate(
	payload: Record<string, unknown>,
	combinedText: string,
): boolean {
	const steps = payload.workflow_steps;
	if (!Array.isArray(steps) || steps.length < 2) return false;
	if (
		/\b(git push|git_push|git commit|single command|shell command)\b/.test(combinedText)
	) {
		return false;
	}
	if (/\b(ci workflow|github actions|bug fix|provider bug|one-off)\b/.test(combinedText)) {
		return false;
	}
	if (
		/一次性|单次|普通命令|bug 修复|项目内部|ci 工作流|github actions|流水线/.test(combinedText)
	) {
		return false;
	}
	if (isProjectInternalWorkflow(combinedText)) {
		return false;
	}
	return true;
}

function isAssistantProcessLog(
	artifact: SessionArtifact,
	evidence: DistillEvidenceDraft[],
	evidenceText: string,
): boolean {
	const evidenceMessages = evidence
		.map((item) => artifact.messages.find((message) => message.id === item.message_id))
		.filter((message): message is SessionArtifact["messages"][number] => Boolean(message));
	if (
		evidenceMessages.length > 0 &&
		evidenceMessages.every((message) => message.role === "assistant") &&
		/\b(let me|i(?:'ll| will| have| need to)|now i|next i|updated|created|ran|running|checking|reading|inspect|tackle)\b/.test(
			normalizeText(evidenceText),
		)
	) {
		return true;
	}
	return /我(先|会|已经|将|来)|现在(我)?(读取|更新|处理|检查)|已(更新|创建|运行|完成)/.test(evidenceText);
}

function isActionShellTitle(title: string): boolean {
	const normalized = normalizeText(title);
	if (!/^[a-z][a-z0-9]+(?:[_-][a-z0-9]+)+$/.test(normalized)) return false;
	return /^(create|draft|set|git|implement|conduct|initiate|run|update|sync)[_-]/.test(normalized);
}

function hasDoneState(text: string): boolean {
	return /\b(completed|done|already done|implemented|shipped|fixed|closed|merged)\b/.test(text) || /已完成|已落成|已修复|已关闭|已实现|已经完成/.test(text);
}

function isOldRoadmapResidue(text: string): boolean {
	return /\b(old roadmap|roadmap residue|legacy roadmap|mcp api gateway|issue-candidate|prd-draft)\b/.test(text) || /旧路线图|历史计划|过时/.test(text);
}

function isTroubleshootingDuplicateTopic(text: string): boolean {
	return (
		/\b(api key|apikey|environment variable|env var|deepseek|openai|anthropic)\b.*\b(missing|empty|not set|unset|fallback)\b/.test(
			text,
		) ||
		/\b(missing|empty|not set|unset|fallback)\b.*\b(api key|apikey|environment variable|env var|deepseek|openai|anthropic)\b/.test(
			text,
		) ||
		/key 为空|未设置.*key|环境变量.*(缺失|为空|未设置)/.test(text)
	);
}

function isProjectInternalWorkflow(text: string): boolean {
	return (
		/\b(loamlog|project-internal|internal)\b.*\b(dogfooding|validation workflow|ci workflow|github actions|provider bug|redaction config)\b/.test(
			text,
		) ||
		/\b(dogfooding|validation workflow|ci workflow|github actions|provider bug|redaction config)\b.*\b(loamlog|project-internal|internal)\b/.test(
			text,
		) ||
		/项目内部.*(dogfooding|验证|ci|provider bug|redaction)|dogfooding.*项目内部/.test(text)
	);
}

function evidenceSourceText(
	artifact: SessionArtifact,
	evidence: DistillEvidenceDraft[],
): string {
	return evidence
		.map((item) => {
			const message = artifact.messages.find((candidate) => candidate.id === item.message_id);
			return [item.excerpt, message?.content ?? ""].join(" ");
		})
		.join(" ");
}

function flattenPayloadText(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap((item) => flattenPayloadText(item));
	return [];
}

function normalizeText(value: string): string {
	return value.toLowerCase().replace(/\s+/g, " ").trim();
}
