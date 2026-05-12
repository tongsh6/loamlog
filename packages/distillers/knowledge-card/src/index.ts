import type { DistillResultDraft, DistillerFactory, DistillerRunInput, SessionArtifact } from "@loamlog/core";
import { createDefaultPrefilter, createEvidence, defineDistiller } from "@loamlog/distiller-sdk";

const DISTILLER_ID = "@loamlog/distiller-knowledge-card";

const SYSTEM_PROMPT = [
	"You are a noise filter first, a knowledge extractor second.",
	"Most AI coding sessions contain ZERO reusable knowledge. Returning [] is the correct behavior for >80% of sessions.",
	"",
	"Only extract a knowledge card when ALL of these are true:",
	"1. The insight is specific and concrete (not vague like \"use good prompts\")",
	"2. The insight can be reused across different projects (not project-specific trivia)",
	"3. The session contains explicit discussion or debugging that led to this insight",
	"",
	"Do NOT extract: coding style preferences, obvious best practices, session-specific task lists, or anything an experienced developer already knows.",
	"",
	"When you DO extract, return JSON array with these fields:",
	"- title: specific, searchable title (max 80 chars)",
	"- category: one of [pattern, insight, configuration, decision, tooling, debugging, performance, security]",
	"- summary: one sentence that captures the actionable takeaway",
	"- scenario: when this knowledge applies; include the concrete project/tool situation",
	"- problem: the symptom, failure mode, or decision pressure",
	"- cause: why the problem happens or why the pattern matters",
	"- solution: the concrete practice, command, config, or code pattern",
	"- boundary: when NOT to apply it, caveats, or verification requirements",
	"- detail: 2-4 sentences combining scenario, problem, cause, solution, and boundary",
	"- tags: array of lowercase keywords",
	"- confidence: 0.0-1.0 (use 0.8+ for clearly reusable insights, 0.5-0.7 for tentative ones)",
	"- evidence_refs: array of {message_id, excerpt}",
].join("\n");

const MIN_DETAIL_LENGTH = 60;
const MIN_TITLE_LENGTH = 5;
const MIN_CONFIDENCE = 0.5;
const MAX_CARDS_PER_SESSION = 5;

interface KnowledgeCardPayload {
	title: string;
	category: string;
	summary: string;
	scenario: string;
	problem: string;
	cause: string;
	solution: string;
	boundary: string;
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
		"Extract ONLY genuinely reusable knowledge from this session. Most sessions have none — return [] if nothing qualifies.",
		"Every card must stand alone without reading the original session.",
		"Reject thin cards that only state a practice without scenario, problem, cause, solution, and boundary.",
		"",
		"messages:",
		...chunks,
		"",
		"Categories: pattern | insight | configuration | decision | tooling | debugging | performance | security",
		"",
		"Output format (return [] if no reusable knowledge found):",
		'[{"title":"...","category":"...","summary":"...","scenario":"...","problem":"...","cause":"...","solution":"...","boundary":"...","detail":"...","tags":["..."],"confidence":0.0,"evidence_refs":[{"message_id":"...","excerpt":"..."}]}]',
	].join("\n");
}

function extractJsonPayload(content: string): string {
	const trimmed = content.trim();
	if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
		return trimmed;
	}

	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (fenced?.[1]) {
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
	let parsed: unknown;
	try {
		parsed = JSON.parse(json) as unknown;
	} catch {
		return [];
	}

	if (!Array.isArray(parsed)) {
		return [];
	}

	return parsed.filter((item): item is LlmKnowledgeCard => {
		if (!item || typeof item !== "object") return false;
		const c = item as Record<string, unknown>;
			return (
				typeof c.title === "string" &&
				c.title.trim().length >= MIN_TITLE_LENGTH &&
				typeof c.summary === "string" &&
				c.summary.trim().length > 0 &&
				hasReusableContext(c) &&
				typeof c.detail === "string" &&
				c.detail.trim().length >= MIN_DETAIL_LENGTH &&
				(typeof c.confidence !== "number" || c.confidence >= MIN_CONFIDENCE)
			);
		});
}

function hasReusableContext(card: Record<string, unknown>): boolean {
	for (const field of ["scenario", "problem", "cause", "solution", "boundary"]) {
		const value = card[field];
		if (typeof value !== "string" || value.trim().length < 12) {
			return false;
		}
	}
	return true;
}

function findMessage(artifact: SessionArtifact, messageId: string): SessionArtifact["messages"][number] | undefined {
	return artifact.messages.find((message: SessionArtifact["messages"][number]) => message.id === messageId);
}

/** Simple word-overlap similarity for dedup. */
function titleSimilarity(a: string, b: string): number {
	const wordsA = new Set(titleTokens(a));
	const wordsB = new Set(titleTokens(b));
	if (wordsA.size === 0 || wordsB.size === 0) return 0;
	const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
	const union = new Set([...wordsA, ...wordsB]).size;
	return intersection / union;
}

function titleTokens(title: string): string[] {
	const normalized = title.toLowerCase().trim();
	const latin = normalized.match(/[a-z0-9]+/g) ?? [];
	const cjkChars = Array.from(normalized.matchAll(/[\p{Script=Han}]/gu), (m) => m[0]);
	const cjkBigrams: string[] = [];
	for (let i = 0; i < cjkChars.length - 1; i++) {
		cjkBigrams.push(`${cjkChars[i]}${cjkChars[i + 1]}`);
	}
	return [...latin, ...cjkChars, ...cjkBigrams];
}

function dedupeByTitle(cards: LlmKnowledgeCard[]): LlmKnowledgeCard[] {
	const kept: LlmKnowledgeCard[] = [];
	const titles: string[] = [];

	for (const card of cards) {
		const title = card.title.toLowerCase().trim();
		const isDup = titles.some((t) => titleSimilarity(title, t) >= 0.7);
		if (!isDup) {
			titles.push(title);
			kept.push(card);
		}
	}

	return kept;
}

const factory: DistillerFactory = () =>
	defineDistiller<KnowledgeCardPayload>({
		id: DISTILLER_ID,
		name: "Knowledge Card Extractor",
		version: "0.3.0",
		supported_types: ["knowledge-card"],

			prefilter: createDefaultPrefilter({ minMessages: 3 }),

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
				// Sort by confidence descending, take top N
				parsed.sort((a, b) => (b.confidence ?? 0.7) - (a.confidence ?? 0.7));
				const selected = parsed.slice(0, MAX_CARDS_PER_SESSION);

				for (const card of selected) {
					const evidence = (card.evidence_refs ?? [])
						.map((ref) => {
							const message = findMessage(artifact, ref.message_id);
							if (!message) return undefined;
							return createEvidence(artifact, message, ref.excerpt);
						})
						.filter((item): item is DistillResultDraft["evidence"][number] => Boolean(item));

					if (evidence.length === 0) {
						continue;
					}

					const category = normalizeCategory(card.category);
					const tags = Array.isArray(card.tags)
						? [...new Set(card.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean))]
						: [category];

						const payload: KnowledgeCardPayload = {
							title: card.title.trim(),
							category,
							summary: card.summary.trim(),
							scenario: card.scenario.trim(),
							problem: card.problem.trim(),
							cause: card.cause.trim(),
							solution: card.solution.trim(),
							boundary: card.boundary.trim(),
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
