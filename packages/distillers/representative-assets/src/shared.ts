import type {
  DistillEvidenceDraft,
  DistillResultDraft,
  SessionArtifact,
} from "@loamlog/core";
import { createEvidence } from "@loamlog/distiller-sdk";

export interface LlmEvidenceRef {
  message_id: string;
  excerpt: string;
}

export const REPRESENTATIVE_ASSET_PROMPT_GUARDRAILS = [
  "Only extract assets directly supported by the cited evidence text.",
  "Do not infer owners, deadlines, tradeoffs, revisit triggers, audiences, business value, or implementation priority unless the evidence states them.",
  "Do not extract assistant process logs, tool/action names, sink actions, completed work, routine execution records, old roadmap residue, or generic troubleshooting noise.",
  "Do not turn a user request, a phase plan, a file-reading step, or a transient fallback into a reusable asset.",
  "If the evidence is weak, ambiguous, already completed, or only supports a different asset type, return no item for it.",
] as const;

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
      const message = artifact.messages.find(
        (item) => item.id === ref.message_id,
      );
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

export function getString(
  item: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = item[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function getStringArray(
  item: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = item[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

export function getEvidenceRefs(
  item: Record<string, unknown>,
): LlmEvidenceRef[] | undefined {
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
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : undefined;
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
      ...Object.values(input.payload).flatMap((value) =>
        flattenPayloadText(value),
      ),
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
        !isTroubleshootingDuplicateTopic(combinedText) &&
        !isRoutineRepoImplementationTopic(combinedText) &&
        !isDogfoodingExecutionTopic(combinedText)
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

const DUPLICATE_TOPIC_THRESHOLD = 0.6;

const TOPIC_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "asset",
  "assets",
  "candidate",
  "candidates",
  "for",
  "from",
  "in",
  "input",
  "inputs",
  "into",
  "item",
  "items",
  "of",
  "on",
  "output",
  "outputs",
  "representative",
  "the",
  "to",
  "with",
]);

export function dedupeRepresentativeAssetDrafts<T>(
  drafts: DistillResultDraft<T>[],
): DistillResultDraft<T>[] {
  const groups: DistillResultDraft<T>[][] = [];

  for (const draft of drafts) {
    const existing = groups.find((group) =>
      sameRepresentativeAssetTopic(group[0], draft),
    );
    if (existing) {
      existing.push(draft);
      continue;
    }
    groups.push([draft]);
  }

  return groups.map((group) => mergeRepresentativeAssetDrafts(group));
}

function sameRepresentativeAssetTopic<T>(
  a: DistillResultDraft<T>,
  b: DistillResultDraft<T>,
): boolean {
  if (a.type !== b.type) return false;

  const aEvidenceKeys = new Set(
    a.evidence.map(
      (evidence) =>
        `${evidence.session_id}:${evidence.message_id}:${normalizeText(evidence.excerpt)}`,
    ),
  );
  if (
    b.evidence.some((evidence) =>
      aEvidenceKeys.has(
        `${evidence.session_id}:${evidence.message_id}:${normalizeText(evidence.excerpt)}`,
      ),
    )
  ) {
    return true;
  }

  return (
    representativeTopicSimilarity(a.title, b.title) >= DUPLICATE_TOPIC_THRESHOLD
  );
}

function mergeRepresentativeAssetDrafts<T>(
  group: DistillResultDraft<T>[],
): DistillResultDraft<T> {
  const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
  const primary = sorted[0];
  return {
    ...primary,
    tags: Array.from(new Set(group.flatMap((draft) => draft.tags))),
    evidence: mergeDraftEvidence(group),
  };
}

function mergeDraftEvidence<T>(
  group: DistillResultDraft<T>[],
): DistillEvidenceDraft[] {
  const seen = new Set<string>();
  const merged: DistillEvidenceDraft[] = [];

  for (const draft of group) {
    for (const evidence of draft.evidence) {
      const key = `${evidence.session_id}:${evidence.message_id}:${evidence.excerpt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(evidence);
    }
  }

  return merged;
}

function representativeTopicSimilarity(a: string, b: string): number {
  const aTokens = new Set(representativeTopicTokens(a));
  const bTokens = new Set(representativeTopicTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1;
  }
  const union = aTokens.size + bTokens.size - shared;
  const jaccard = union > 0 ? shared / union : 0;
  if (jaccard >= DUPLICATE_TOPIC_THRESHOLD) return jaccard;

  const aCjk = representativeCjkBigrams(a);
  const bCjk = representativeCjkBigrams(b);
  if (aCjk.length === 0 || bCjk.length === 0) return jaccard;
  const bCjkSet = new Set(bCjk);
  const sharedCjk = new Set(aCjk.filter((token) => bCjkSet.has(token))).size;
  const smallerCjkSetSize = Math.min(new Set(aCjk).size, new Set(bCjk).size);
  if (sharedCjk >= 4 && sharedCjk / smallerCjkSetSize >= 0.55) {
    return DUPLICATE_TOPIC_THRESHOLD;
  }

  return jaccard;
}

function representativeTopicTokens(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  const latin = (normalized.match(/[a-z0-9]+/g) ?? [])
    .map((token) =>
      token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token,
    )
    .filter((token) => token.length >= 3 && !TOPIC_STOPWORDS.has(token));
  return [...latin, ...representativeCjkBigrams(normalized)];
}

function representativeCjkBigrams(text: string): string[] {
  const cjkChars = Array.from(
    text.toLowerCase().matchAll(/[\p{Script=Han}]/gu),
    (match) => match[0],
  );
  const bigrams: string[] = [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    bigrams.push(`${cjkChars[i]}${cjkChars[i + 1]}`);
  }
  return bigrams;
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
  return (
    Array.isArray(acceptance) &&
    acceptance.some(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  );
}

function keepDecisionRationale(
  payload: Record<string, unknown>,
  combinedText: string,
): boolean {
  const decision = normalizeText(String(payload.decision ?? ""));
  const rationale = normalizeText(String(payload.rationale ?? ""));
  if (!decision || !rationale) return false;
  if (isTroubleshootingDuplicateTopic(combinedText)) {
    return false;
  }
  if (
    isOldRoadmapResidue(combinedText) &&
    !hasDecisionSupportLanguage(combinedText)
  ) {
    return false;
  }
  if (
    isRoutineRepoImplementationTopic(combinedText) &&
    !hasDecisionSupportLanguage(combinedText)
  ) {
    return false;
  }
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
  if (
    /api key.*(missing|empty|not set)|未设置.*api key|key 为空/.test(
      combinedText,
    )
  ) {
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
    /\b(git push|git_push|git commit|single command|shell command)\b/.test(
      combinedText,
    )
  ) {
    return false;
  }
  if (
    /\b(ci workflow|github actions|bug fix|provider bug|one-off)\b/.test(
      combinedText,
    )
  ) {
    return false;
  }
  if (
    /一次性|单次|普通命令|bug 修复|项目内部|ci 工作流|github actions|流水线/.test(
      combinedText,
    )
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
    .map((item) =>
      artifact.messages.find((message) => message.id === item.message_id),
    )
    .filter((message): message is SessionArtifact["messages"][number] =>
      Boolean(message),
    );
  if (
    evidenceMessages.length > 0 &&
    evidenceMessages.every((message) => message.role === "assistant") &&
    /\b(let me|i(?:'ll| will| have| need to)|now i|next i|updated|created|ran|running|checking|reading|inspect|tackle)\b/.test(
      normalizeText(evidenceText),
    )
  ) {
    return true;
  }
  return /我(先|会|已经|将|来)|现在(我)?(读取|更新|处理|检查)|已(更新|创建|运行|完成)/.test(
    evidenceText,
  );
}

function isActionShellTitle(title: string): boolean {
  const normalized = normalizeText(title);
  if (!/^[a-z][a-z0-9]+(?:[_-][a-z0-9]+)+$/.test(normalized)) return false;
  return /^(create|draft|set|git|implement|conduct|initiate|run|update|sync)[_-]/.test(
    normalized,
  );
}

function hasDoneState(text: string): boolean {
  return (
    /\b(completed|done|already done|implemented|shipped|fixed|closed|merged)\b/.test(
      text,
    ) || /已完成|已落成|已修复|已关闭|已实现|已经完成/.test(text)
  );
}

function isOldRoadmapResidue(text: string): boolean {
  return (
    /\b(old roadmap|roadmap residue|legacy roadmap|legacy plan|stale plan|obsolete plan|golden user testing|mcp api gateway|issue[- ]candidate|prd[- ]draft)\b/.test(
      text,
    ) ||
    /\b(tool[- ]specific ai rules?|ai rules? files?)\b.*\bphase 4\b/.test(
      text,
    ) ||
    /\bphase 4\b.*\b(tool[- ]specific ai rules?|ai rules? files?)\b/.test(
      text,
    ) ||
    /旧路线图|历史计划|过时|过期计划|历史方向|黄金用户测试|工具专属\s*ai\s*规则文件|工具专属.*规则文件.*phase 4|phase 4.*工具专属.*规则文件/i.test(
      text,
    )
  );
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

function isRoutineRepoImplementationTopic(text: string): boolean {
  return (
    /\b(ci workflow|github actions|typecheck|build coverage|missing packages|workflow integration)\b/.test(
      text,
    ) ||
    /ci ?工作流|github actions|流水线|typecheck|构建覆盖|缺失 packages|加入缺失 packages/.test(
      text,
    )
  );
}

function isDogfoodingExecutionTopic(text: string): boolean {
  return (
    /\b(start|launch|complete|finish|run)\b.*\bdogfooding\b/.test(text) ||
    /\bdogfooding\b.*\b(execution|validation run|batch|completed)\b/.test(
      text,
    ) ||
    /(启动|完成|执行|运行).*dogfooding|dogfooding.*(执行|运行|批次|已完成)/.test(
      text,
    )
  );
}

function hasDecisionSupportLanguage(text: string): boolean {
  return (
    /\b(decided|decision|rationale|tradeoff|instead|defer|because|constraint)\b/.test(
      text,
    ) || /决定|决策|理由|取舍|暂缓|因为|约束/.test(text)
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
    /项目内部.*(dogfooding|验证|ci|provider bug|redaction)|dogfooding.*项目内部/.test(
      text,
    )
  );
}

function evidenceSourceText(
  artifact: SessionArtifact,
  evidence: DistillEvidenceDraft[],
): string {
  return evidence
    .map((item) => {
      const message = artifact.messages.find(
        (candidate) => candidate.id === item.message_id,
      );
      return [item.excerpt, message?.content ?? ""].join(" ");
    })
    .join(" ");
}

function flattenPayloadText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return value.flatMap((item) => flattenPayloadText(item));
  return [];
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
