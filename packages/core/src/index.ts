import type { JSONSchema7 } from "json-schema";

export const DEFAULT_DAEMON_HOST = "127.0.0.1";
export const DEFAULT_DAEMON_PORT = 37468;
export const CAPTURE_PATH = "/capture";
export const DEFAULT_MAX_MESSAGE_CHARS = 1200;
export const DEFAULT_AIC_VERSION = "0.1.0";

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export interface ExecutionContext {
  traceId: string;
  logger: Logger;
}

const consoleLogger: Logger = {
  info(msg: string) {
    console.log(msg);
  },
  warn(msg: string) {
    console.warn(msg);
  },
  error(msg: string, err?: unknown) {
    console.error(msg, err ?? "");
  },
};

export function createExecutionContext(options?: {
  logger?: Logger;
}): ExecutionContext {
  return {
    traceId: crypto.randomUUID(),
    logger: options?.logger ?? consoleLogger,
  };
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  // Retry on transient-like errors but not on auth or validation failures
  const message = error instanceof Error ? error.message : String(error);
  return /timed?[ -]?out|ECONNREFUSED|ECONNRESET|ETIMEDOUT|5[0-9][0-9]|rate[ -]?limit/i.test(
    message,
  );
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  ctx?: ExecutionContext,
): Promise<T> {
  const logger = ctx?.logger;
  const traceId = ctx?.traceId ?? "-";

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new TimeoutError(
          `operation timed out after ${timeoutMs}ms trace_id=${traceId}`,
        ),
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof TimeoutError) {
      logger?.warn(
        `[aspect:timeout] trace_id=${traceId} timeout_ms=${timeoutMs}`,
      );
    }
    throw error;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  ctx?: ExecutionContext,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  const shouldRetry = options.shouldRetry ?? isRetryable;
  const logger = ctx?.logger;
  const traceId = ctx?.traceId ?? "-";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      logger?.warn(
        `[aspect:retry] trace_id=${traceId} attempt=${attempt}/${maxAttempts} delay_ms=${delay} error=${error instanceof Error ? error.message : String(error)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export interface CaptureRequest {
  session_id: string;
  trigger: string;
  captured_at: string;
  provider: string;
  /** Pre-fetched session payload from the plugin side. When present, the daemon skips the provider pull. */
  pulled?: PulledSessionPayload;
}

export interface CaptureResponse {
  accepted: boolean;
  session_id?: string;
  snapshot_path?: string;
  error?: string;
}

export interface SessionArtifactPart {
  type: "text" | "reasoning" | "tool" | "file";
  text?: string;
  name?: string;
  input?: unknown;
  output?: string;
  error?: string;
  filename?: string;
  mime?: string;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  timestamp: string;
  content?: string;
  parts?: SessionArtifactPart[];
}

export interface SessionToolCall {
  id: string;
  message_id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
}

export interface SessionSnapshot {
  schema_version: "1.0";
  meta: {
    session_id: string;
    captured_at: string;
    capture_trigger: string;
    aic_version: string;
    provider: string;
  };
  context: {
    cwd: string;
    worktree: string;
    repo?: string;
    branch?: string;
    commit?: string;
    dirty?: boolean;
  };
  time_range: {
    start: string;
    end: string;
  };
  session: Record<string, unknown>;
  messages: SessionMessage[];
  tools?: SessionToolCall[];
  redacted: {
    patterns_applied: string[];
    redacted_count: number;
    summary?: RedactionSummary;
    risk_level?: RedactionRiskLevel;
    sanitized_at?: string;
  };
}

export type RedactionRiskLevel = "low" | "medium" | "high";

export interface RedactionSummary {
  total: number;
  by_type: Record<string, number>;
  by_placeholder: Record<string, number>;
  high_risk_types: string[];
  risk_level: RedactionRiskLevel;
}

export type ArtifactPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      name: string;
      input: unknown;
      output?: string;
      error?: string;
    }
  | { type: "file"; filename: string; mime: string };

export interface SessionArtifact {
  schema_version: "1.0";
  meta: {
    session_id: string;
    captured_at: string;
    capture_trigger: string;
    loam_version: string;
    provider: string;
  };
  context: {
    cwd: string;
    worktree: string;
    repo?: string;
    branch?: string;
    commit?: string;
    dirty?: boolean;
  };
  time_range: {
    start: string;
    end: string;
  };
  session: Record<string, unknown>;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    timestamp: string;
    content?: string;
    parts?: ArtifactPart[];
  }>;
  tools?: Array<{
    id: string;
    message_id: string;
    name: string;
    input: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
  redacted: {
    patterns_applied: string[];
    redacted_count: number;
    summary?: RedactionSummary;
    risk_level?: RedactionRiskLevel;
    sanitized_at?: string;
  };
}

export interface DistillEvidenceDraft {
  session_id: string;
  message_id: string;
  excerpt: string;
  position?: { start: number; end: number };
}

export interface DistillEvidence extends DistillEvidenceDraft {
  trace_command: string;
}

export type DistillResultDraft<T = Record<string, unknown>> = {
  type: string;
  title: string;
  summary: string;
  confidence: number;
  tags: string[];
  payload: T;
  evidence: DistillEvidenceDraft[];
  actions?: Array<{
    type: string;
    label: string;
    metadata?: Record<string, unknown>;
  }>;
  render?: {
    markdown?: string;
    html?: string;
  };
};

export interface DistillResult<T = Record<string, unknown>> {
  id: string;
  fingerprint: string;
  distiller_id: string;
  distiller_version: string;
  type: string;
  title: string;
  summary: string;
  confidence: number;
  tags: string[];
  payload: T;
  evidence: DistillEvidence[];
  actions?: Array<{
    type: string;
    label: string;
    metadata?: Record<string, unknown>;
  }>;
  render?: {
    markdown?: string;
    html?: string;
  };
}

// ── Asset graph domain types (Phase 4) ──

export interface EvidenceSpan {
  session_id: string;
  message_id: string;
  excerpt: string;
  position?: { start: number; end: number };
}

export const SIGNAL_KINDS = [
  "intent",
  "insight",
  "commitment",
  "task_delta",
  "problem_event",
  "workflow_pattern",
  "artifact_reference",
  "noise",
] as const;

export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const SIGNAL_TAGS = [
  "goal",
  "requirement",
  "preference",
  "constraint",
  "objection",
  "created",
  "updated",
  "completed",
  "blocked",
  "cancelled",
  "deferred",
  "obsolete",
  "reason",
  "example",
  "cause",
  "fix",
  "metric",
  "tradeoff",
  "repeatable",
  "multi_step",
  "rule_like",
  "workflow_like",
  "content_seed",
  "process_log",
  "duplicate",
  "low_information",
  "unsupported_inference",
  "ambiguous_type",
  "document",
  "code",
  "issue",
  "rule",
  "skill",
  "dataset",
  "config",
] as const;

export type SignalTag = (typeof SIGNAL_TAGS)[number];
export type SignalScope = "message" | "session" | "cross_session";
export type SignalActor = "user" | "assistant" | "tool" | "system" | "mixed";
export type SignalTemporalState =
  | "future"
  | "current"
  | "in_progress"
  | "completed"
  | "obsolete"
  | "unknown";
export type SignalReviewStatus =
  | "accepted"
  | "pending"
  | "ignored"
  | "rejected";
export type SignalPromotionEligibility =
  | "eligible"
  | "needs_review"
  | "ineligible";
export type SignalConsumptionResult =
  | "produced"
  | "rejected"
  | "skipped"
  | "error";

export interface SignalSpan extends EvidenceSpan {}

export interface SignalClassification {
  kind: SignalKind;
  tags: SignalTag[];
  actor: SignalActor;
  temporal_state: SignalTemporalState;
  confidence: number;
}

export interface ReviewedSignalClassification extends SignalClassification {
  reviewer: string;
  reviewed_at: string;
  note?: string;
}

export interface SignalPromotionHint {
  target_distiller: string;
  eligibility: SignalPromotionEligibility;
  reason: string;
}

export interface SignalClassifierRef {
  id: string;
  version: string;
  model: string;
  prompt_version: string;
}

export interface Signal {
  id: string;
  scope: SignalScope;
  kind: SignalKind;
  tags: SignalTag[];
  raw_tags?: string[];
  notes?: string;
  actor: SignalActor;
  temporal_state: SignalTemporalState;
  confidence: number;
  spans: SignalSpan[];
  parent_signal_id?: string;
  related_signal_ids?: string[];
  review_status: SignalReviewStatus;
  machine_classification: SignalClassification;
  reviewed_classification?: ReviewedSignalClassification;
  promotion_hints: SignalPromotionHint[];
  raw_model_output?: unknown;
  classifier: SignalClassifierRef;
  created_at: string;
  updated_at: string;
  stale_by_classifier_version?: boolean;
  /** @deprecated use kind. Kept for legacy AssetCandidate signal mapping. */
  signal_type?: string;
  /** @deprecated use spans. Kept for legacy AssetCandidate signal mapping. */
  evidence?: EvidenceSpan[];
  metadata?: Record<string, unknown>;
}

export interface SignalConsumptionRule {
  kind: SignalKind;
  tags?: SignalTag[];
  min_confidence?: number;
  allowed_actors?: SignalActor[];
  allowed_temporal_states?: SignalTemporalState[];
}

export interface SignalConsumption {
  signal_id: string;
  distiller_id: string;
  distiller_version: string;
  result: SignalConsumptionResult;
  asset_id?: string;
  reason?: string;
  created_at: string;
}

export interface SignalReviewDecision {
  review_status: SignalReviewStatus;
  classification?: SignalClassification;
  reviewer: string;
  reviewed_at?: string;
  note?: string;
}

export interface SignalListFilter {
  session_id?: string;
  kind?: SignalKind[];
  status?: SignalReviewStatus[];
  promotable?: boolean;
  distiller_id?: string;
}

export interface AssetLineage {
  asset?: VerifiedAsset;
  signal?: Signal;
  signal_consumptions: SignalConsumption[];
  produced_assets: VerifiedAsset[];
}

export interface DistillerManifest {
  id: string;
  name: string;
  version: string;
  supported_types: string[];
  consumes_signals?: SignalConsumptionRule[];
}

export interface AssetCandidate {
  id: string;
  fingerprint: string;
  candidate_type: string;
  title: string;
  summary: string;
  confidence: number;
  tags: string[];
  distiller_id: string;
  signals: Signal[];
  evidence: EvidenceSpan[];
  payload: Record<string, unknown>;
  render?: { markdown?: string; html?: string };
  /** Optional verification report from the Smelting workshop */
  verification?: VerificationReport;
}

export interface VerificationReport {
  status: "verified" | "archived" | "unverified" | "rejected";
  /** Mining value score (0.0 - 1.0): higher score means bigger gap or harder evidence */
  mining_score: number;
  evidence: {
    dialogue_ref: string;
    evidence_support_status?: string;
    git_gap_status?: string;
    physical_log_ref?: string;
  };
  reason?: string;
  verified_at: string;
}

export interface VerifiedAsset extends AssetCandidate {
  verification: VerificationReport;
}

export interface RefinedAsset extends VerifiedAsset {
  /** Global identity hash across sessions: SHA256(Repo:Distiller:Topic) */
  identity_hash: string;
  /** List of all original session IDs that contributed to this refined asset */
  contributing_sessions: string[];
  /** Flag indicating if this asset was merged with others during the run */
  is_merged: boolean;
  /** Iterative version of the asset (e.g. 1, 2, 3...) */
  version: number;
}

export interface AggregatorContext {
  repo_path: string;
  logger: Logger;
}

export interface AggregatorPlugin {
  id: string;
  name: string;
  /** Refine a batch of verified assets, returning a deduplicated and merged list */
  refine(
    assets: VerifiedAsset[],
    ctx: AggregatorContext,
  ): Promise<RefinedAsset[]>;
}

export interface VerifierContext {
  repoPath: string;
  capturedAt: string;
  logger: Logger;
}

export interface VerifierPlugin {
  id: string;
  name: string;
  verify(
    candidate: AssetCandidate,
    ctx: VerifierContext,
  ): Promise<VerificationReport>;
}

/** Central ledger for managing evolving engineering assets */
export interface AssetStore {
  repoPath: string;
  get(assetId: string): Promise<VerifiedAsset | undefined>;
  update(assetId: string, update: Partial<VerifiedAsset>): Promise<void>;
  list(filter?: { status?: string[] }): Promise<VerifiedAsset[]>;
  putSignal(signal: Signal): Promise<void>;
  listSignals(filter?: SignalListFilter): Promise<Signal[]>;
  getSignal(signalId: string): Promise<Signal | undefined>;
  reviewSignal(
    signalId: string,
    decision: SignalReviewDecision,
  ): Promise<Signal>;
  recordSignalConsumption(consumption: SignalConsumption): Promise<void>;
  listSignalConsumptions(signalId?: string): Promise<SignalConsumption[]>;
  getLineage(id: string): Promise<AssetLineage>;
}

/** Searchable fact-grid for cross-session evidence weaving */
export interface GlobalEvidenceRegistry {
  findPhysicalEvidence(query: {
    time_window: [string, string];
    entities: string[];
    keywords: string[];
  }): Promise<EvidenceSpan[]>;
}

export type DecisionType = "approved" | "rejected" | "deferred";

export interface Decision {
  candidate_id: string;
  decision: DecisionType;
  reason?: string;
  decided_at: string;
}

export interface AssetDelivery {
  candidate_id: string;
  sink_id: string;
  status: "pending" | "delivered" | "failed";
  delivered_at?: string;
  external_url?: string;
  error?: string;
}

export interface QualityReport {
  passed: boolean;
  checks: QualityCheck[];
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  reason?: string;
}

export function mapDistillResultToCandidate(
  result: DistillResult,
): AssetCandidate {
  const evidence: EvidenceSpan[] = result.evidence.map((e) => ({
    session_id: e.session_id,
    message_id: e.message_id,
    excerpt: e.excerpt,
    position: e.position,
  }));

  const createdAt = new Date().toISOString();
  const machineClassification: SignalClassification = {
    kind: "artifact_reference",
    tags: [],
    actor: "mixed",
    temporal_state: "unknown",
    confidence: result.confidence,
  };
  const signal: Signal = {
    id: `${result.id}:signal`,
    scope: "session",
    kind: machineClassification.kind,
    tags: machineClassification.tags,
    raw_tags: result.tags,
    actor: machineClassification.actor,
    temporal_state: machineClassification.temporal_state,
    signal_type: result.type,
    confidence: result.confidence,
    spans: evidence,
    evidence,
    review_status: defaultSignalReviewStatus({
      kind: machineClassification.kind,
      confidence: result.confidence,
      spans: evidence,
    }),
    machine_classification: machineClassification,
    promotion_hints: [],
    classifier: {
      id: "legacy-distill-result-mapper",
      version: "0.1.0",
      model: "deterministic",
      prompt_version: "none",
    },
    created_at: createdAt,
    updated_at: createdAt,
    metadata: { distiller_id: result.distiller_id, tags: result.tags },
  };

  return {
    id: result.id,
    fingerprint: result.fingerprint,
    candidate_type: result.type,
    title: result.title,
    summary: result.summary,
    confidence: result.confidence,
    tags: result.tags,
    distiller_id: result.distiller_id,
    signals: [signal],
    evidence,
    payload: result.payload,
    render: result.render,
  };
}

const signalKindSet = new Set<string>(SIGNAL_KINDS);
const signalTagSet = new Set<string>(SIGNAL_TAGS);

export function isSignalKind(value: unknown): value is SignalKind {
  return typeof value === "string" && signalKindSet.has(value);
}

export function isSignalTag(value: unknown): value is SignalTag {
  return typeof value === "string" && signalTagSet.has(value);
}

export function getEffectiveSignalClassification(
  signal: Signal,
): SignalClassification {
  return signal.reviewed_classification ?? signal.machine_classification;
}

export function defaultSignalReviewStatus(input: {
  kind: SignalKind;
  confidence: number;
  spans?: SignalSpan[];
}): SignalReviewStatus {
  if (input.spans && input.spans.length === 0) return "rejected";
  if (input.kind === "noise") return "ignored";
  if (input.confidence >= 0.8) return "accepted";
  if (input.confidence >= 0.5) return "pending";
  return "ignored";
}

export function validateSignal(signal: Signal): QualityReport {
  const effective = getEffectiveSignalClassification(signal);
  const checks: QualityCheck[] = [
    {
      name: "has_spans",
      passed: signal.spans.length > 0,
      reason: signal.spans.length > 0 ? undefined : "no signal spans",
    },
    {
      name: "valid_kind",
      passed: isSignalKind(effective.kind),
      reason: isSignalKind(effective.kind)
        ? undefined
        : `invalid signal kind: ${String(effective.kind)}`,
    },
    {
      name: "valid_tags",
      passed: effective.tags.every(isSignalTag),
      reason: effective.tags.every(isSignalTag)
        ? undefined
        : "signal tags must use the platform whitelist",
    },
    {
      name: "confidence_range",
      passed: effective.confidence >= 0 && effective.confidence <= 1,
      reason:
        effective.confidence >= 0 && effective.confidence <= 1
          ? undefined
          : `confidence ${effective.confidence} outside range 0..1`,
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

export function validateAssetCandidate(
  candidate: AssetCandidate,
  options?: { minConfidence?: number; requireEvidence?: boolean },
): QualityReport {
  const minConfidence = options?.minConfidence ?? 0.5;
  const requireEvidence = options?.requireEvidence ?? true;
  const checks: QualityCheck[] = [];

  checks.push({
    name: "has_evidence",
    passed: !requireEvidence || candidate.evidence.length > 0,
    reason:
      !requireEvidence || candidate.evidence.length > 0
        ? undefined
        : "no evidence spans",
  });

  checks.push({
    name: "confidence_threshold",
    passed: candidate.confidence >= minConfidence,
    reason:
      candidate.confidence >= minConfidence
        ? undefined
        : `confidence ${candidate.confidence} below threshold ${minConfidence}`,
  });

  checks.push({
    name: "has_title",
    passed: candidate.title.length > 0,
    reason: candidate.title.length > 0 ? undefined : "empty title",
  });

  checks.push({
    name: "has_summary",
    passed: candidate.summary.length > 0,
    reason: candidate.summary.length > 0 ? undefined : "empty summary",
  });

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ── Approval gate & audit (Phase 5) ──

export interface AuditRecord {
  id: string;
  candidate_id: string;
  session_id?: string;
  distiller_id: string;
  candidate_type: string;
  candidate_title: string;
  quality_passed: boolean;
  decision: DecisionType;
  decision_reason?: string;
  sink_id: string;
  delivery_status: "pending" | "delivered" | "failed";
  delivery_error?: string;
  created_at: string;
  updated_at: string;
}

export function createAuditRecord(
  candidate: AssetCandidate,
  decision: Decision,
  quality: QualityReport,
  sinkId: string,
): AuditRecord {
  return {
    id: `audit-${candidate.id}-${Date.now()}`,
    candidate_id: candidate.id,
    session_id: candidate.evidence[0]?.session_id,
    distiller_id: candidate.distiller_id,
    candidate_type: candidate.candidate_type,
    candidate_title: candidate.title,
    quality_passed: quality.passed,
    decision: decision.decision,
    decision_reason: decision.reason,
    sink_id: sinkId,
    delivery_status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function auditRecordDelivered(record: AuditRecord): AuditRecord {
  return {
    ...record,
    delivery_status: "delivered",
    updated_at: new Date().toISOString(),
  };
}

export function auditRecordFailed(
  record: AuditRecord,
  error: string,
): AuditRecord {
  return {
    ...record,
    delivery_status: "failed",
    delivery_error: error,
    updated_at: new Date().toISOString(),
  };
}

export interface ApprovalResult {
  allowed: boolean;
  reason?: string;
  requires_explicit_optin?: boolean;
}

export function approvalGate(
  candidate: AssetCandidate,
  decision: Decision,
  quality: QualityReport,
  options?: { allowExternal?: boolean },
): ApprovalResult {
  // Gate 1: quality must pass
  if (!quality.passed) {
    const failed = quality.checks.filter((c) => !c.passed).map((c) => c.name);
    return {
      allowed: false,
      reason: `quality gate failed: ${failed.join(", ")}`,
    };
  }

  // Gate 2: decision must be "approved"
  if (decision.decision !== "approved") {
    return {
      allowed: false,
      reason: `decision is '${decision.decision}', not 'approved'`,
    };
  }

  // Gate 3: evidence required for external sinks
  if (candidate.evidence.length === 0) {
    return { allowed: false, reason: "evidence is required for delivery" };
  }

  // Gate 4: external sinks require explicit opt-in
  if (!options?.allowExternal) {
    return {
      allowed: false,
      reason: "external delivery not enabled",
      requires_explicit_optin: true,
    };
  }

  return { allowed: true };
}

export interface DeliveryReport {
  delivered: number;
  failed: number;
  errors?: Array<{ result_index: number; error: string }>;
}

export interface SinkPlugin {
  id: string;
  name: string;
  version: string;
  supports(resultType: string): boolean;
  deliver(input: {
    results: DistillResult[];
    config: Record<string, unknown>;
  }): Promise<DeliveryReport>;
}

export interface ArtifactQueryClient {
  getUnprocessed(
    distillerId: string,
    limit?: number,
  ): AsyncIterable<SessionArtifact>;
  query(filter: {
    repo?: string;
    since?: string;
    until?: string;
    session_ids?: string[];
  }): AsyncIterable<SessionArtifact>;
}

export interface DistillerStateKV {
  get<V>(key: string): Promise<V | undefined>;
  set<V>(key: string, value: V): Promise<void>;
  /** Atomically read, transform, and write a value under the state lock. */
  update<V>(key: string, fn: (current: V | undefined) => V): Promise<void>;
  markProcessed(distillerId: string, sessionIds: string[]): Promise<void>;
}

export type LLMTask = "extract" | "summarize" | "classify" | "score";

export type LLMBudget = "cheap" | "standard" | "premium";

export interface LLMProviderConfig {
  api_key?: string;
  base_url?: string;
  model?: string;
  /** Override the default context window size in tokens. */
  context_window?: number;
}

export class LLMError extends Error {
  provider: string;

  constructor(message: string, provider: string) {
    super(message);
    this.name = "LLMError";
    this.provider = provider;
  }
}

export class LLMAuthError extends LLMError {
  constructor(message: string, provider: string) {
    super(message, provider);
    this.name = "LLMAuthError";
  }
}

export class LLMRateLimitError extends LLMError {
  retryAfterMs?: number;

  constructor(message: string, provider: string, retryAfterMs?: number) {
    super(message, provider);
    this.name = "LLMRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class LLMTimeoutError extends LLMError {
  constructor(message: string, provider: string) {
    super(message, provider);
    this.name = "LLMTimeoutError";
  }
}

export class LLMResponseFormatError extends LLMError {
  constructor(message: string, provider: string) {
    super(message, provider);
    this.name = "LLMResponseFormatError";
  }
}

export interface LLMProvider {
  id: string;
  /** Maximum context window size in tokens. Used for shard threshold calculation. */
  contextWindow?: number;
  complete(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    model: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: "text" | "json";
  }): Promise<{
    content: string;
    tokens: { input: number; output: number };
    cost?: number;
  }>;
}

export interface LLMRouter {
  route(request: { task: LLMTask; budget: LLMBudget; input_tokens: number }): {
    provider: LLMProvider;
    model: string;
    contextWindow?: number;
  };
  /** Return the context window of the first configured provider, without routing overhead. */
  getDefaultContextWindow(): number | undefined;
}

export interface DistillerContext {
  dumpDir: string;
  repo?: string;
  logger: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string, err?: unknown): void;
  };
}

export interface DistillerRunInput {
  artifactStore: ArtifactQueryClient;
  llm: LLMRouter;
  state: DistillerStateKV;
  config?: Record<string, unknown>;
  distiller_id?: string;
  distiller_version?: string;
  /**
   * Physically processed session data from the Normalizer workshop.
   * Optional for backward compatibility with distillers that prefer RAW access.
   */
  normalized?: NormalizedSession;
  /**
   * Signal Gate output selected for this distiller by its manifest.
   * Distillers without `consumes_signals` can ignore this field and keep
   * consuming RAW session artifacts through artifactStore.
   */
  signals?: Signal[];
}

export interface NormalizedSession {
  header: {
    session_id: string;
    repo_path?: string;
    vcs_context?: { branch: string; commit_sha: string };
    provider: string;
    captured_at: string;
    /** Semantic fingerprint for cross-session correlation (Mining-aligned) */
    topic_fingerprint?: string;
    /** Whether this session is a continuation of a previous one */
    session_continuity?: "new" | "continuation";
  };
  messages: NormalizedMessage[];
  stats: {
    total_messages: number;
    tool_calls: number;
    raw_chars: number;
    normalized_chars: number;
  };
}

export interface NormalizedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  timestamp: string;
  text: string;
  reasoning?: string;
  tools?: Array<{
    name: string;
    summary: string;
    /** Metadata for future deep-tracing back to RAW logs */
    source_index?: { raw_size: number };
  }>;
}

export interface PrefilterResult {
  /** Whether the session should proceed to LLM distillation. */
  pass: boolean;
  /** Reason for filtering. Used for journal observability, not user-facing. */
  reason?: string;
}

export interface DistillerPlugin {
  id: string;
  name: string;
  version: string;
  supported_types: string[];
  consumes_signals?: SignalConsumptionRule[];
  configSchema?: JSONSchema7;
  payloadSchema?: Record<string, JSONSchema7>;
  initialize?(ctx: DistillerContext): Promise<void>;
  /**
   * Pre-LLM filter: runs before the distiller is invoked to skip sessions
   * that clearly contain no extractable signal. Must be synchronous and
   * pure in-memory computation (no external service calls).
   *
   * Not implementing this method means all sessions pass through (the
   * default, backward-compatible behavior).
   *
   * Design principle: prefer false-positives (let through) over
   * false-negatives (filter out). This is a cost-saving layer, not a
   * quality gate.
   */
  prefilter?(artifact: SessionArtifact): PrefilterResult;
  run(input: DistillerRunInput): Promise<DistillResultDraft[]>;
  teardown?(): Promise<void>;
}

export type DistillerFactory = (
  config?: Record<string, unknown>,
) => DistillerPlugin;

export interface DistillerRegistry {
  load(
    specifier: string,
    config?: Record<string, unknown>,
  ): Promise<DistillerPlugin>;
  register(plugin: DistillerPlugin): void;
  get(id: string): DistillerPlugin | undefined;
  list(): DistillerPlugin[];
}

export interface DistillReport {
  distiller_id: string;
  artifacts_processed: number;
  results_produced: number;
  results_skipped: number;
  errors: Array<{ message: string; session_id?: string }>;
  duration_ms: number;
}

export interface DistillEngine {
  loadFromConfig(config: AICConfig): Promise<void>;
  run(options?: {
    distillers?: string[];
    repo?: string;
    since?: string;
    until?: string;
    session_ids?: string[];
  }): Promise<DistillReport[]>;
}

export type RuleType =
  | "signal"
  | "scoring"
  | "necessity"
  | "filter"
  | "execution";

export type NecessityLevel = "must_do" | "should_do" | "nice_to_have";

export interface ActionMetrics {
  impact?: number;
  urgency?: number;
  frequency?: number;
  confidence?: number;
  effort?: number;
  novelty?: number;
  [key: string]: number | undefined;
}

export interface ActionCandidate {
  id?: string;
  type?: string;
  title?: string;
  summary?: string;
  signal_type?: string;
  signals?: string[];
  tags?: string[];
  metrics?: ActionMetrics;
  flags?: Record<string, boolean>;
  attributes?: Record<string, unknown>;
}

export type ComparisonOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "includes"
  | "in";

export interface FieldCondition {
  kind: "field";
  field: string;
  op: ComparisonOperator;
  expected: unknown;
}

export interface AllCondition {
  kind: "all";
  nodes: Condition[];
}

export interface AnyCondition {
  kind: "any";
  nodes: Condition[];
}

export interface NotCondition {
  kind: "not";
  node: Condition;
}

export type Condition =
  | FieldCondition
  | AllCondition
  | AnyCondition
  | NotCondition;

export type ConditionInput =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | { all?: ConditionInput[]; any?: ConditionInput[]; not?: ConditionInput };

export interface ConditionEvaluation {
  matched: boolean;
  reasons: string[];
}

export interface BaseRule {
  id: string;
  description?: string;
  priority?: number;
  when?: ConditionInput;
}

export interface SignalRule extends BaseRule {
  type: "signal";
  then: {
    add_signal?: string;
    add_tags?: string[];
    mark_as_candidate?: boolean;
  };
}

export interface ScoringRule extends BaseRule {
  type: "scoring";
  formula: Record<string, number>;
  bias?: number;
  cap?: {
    min?: number;
    max?: number;
  };
  mode?: "override" | "add";
}

export interface NecessityRule extends BaseRule {
  type: "necessity";
  then: {
    level: NecessityLevel;
  };
}

export interface FilterRule extends BaseRule {
  type: "filter";
  then: {
    drop?: boolean;
    reason?: string;
  };
}

export interface ExecutionRule extends BaseRule {
  type: "execution";
  then: {
    allow?: boolean;
    strategy?: string;
    route?: string;
  };
}

export type RuleDefinition =
  | SignalRule
  | ScoringRule
  | NecessityRule
  | FilterRule
  | ExecutionRule;

export interface RuleConfig {
  version?: string;
  rules: RuleDefinition[];
  metadata?: Record<string, unknown>;
}

export interface RuleHit {
  id: string;
  type: RuleType;
  priority: number;
  reasons: string[];
  outcome?: string;
  scoreDelta?: number;
  data?: Record<string, unknown>;
}

export interface ActionDecision {
  candidate: ActionCandidate;
  score: number;
  necessity: NecessityLevel;
  filtered: boolean;
  filterReasons: string[];
  allowExecution: boolean;
  executionStrategy?: string;
  executionRoute?: string;
  signals: string[];
  ruleHits: RuleHit[];
  applied: {
    scoring?: RuleHit;
    necessity?: RuleHit;
    filter?: RuleHit;
    execution?: RuleHit;
    signals: RuleHit[];
  };
}

export interface AICConfig {
  dump_dir?: string;
  capture?: {
    providers: string[];
    debounce_ms?: number;
  };
  distill?: {
    /** User-facing output language for distill assets. `auto` follows source-session detection. */
    output_language?: "auto" | "zh" | "en";
  };
  distillers: Array<
    string | { plugin: string; config: Record<string, unknown> }
  >;
  sinks?: Array<string | { plugin: string; config: Record<string, unknown> }>;
  llm?: {
    default_budget?: LLMBudget;
    timeout_ms?: number;
    providers?: Record<string, LLMProviderConfig>;
  };
  intelligence?: TriggeredIntelligenceConfig;
}

export type ProcessingMode = "full" | "summary-only";

export interface TriggerThresholdConfig {
  frequency?: {
    /** Time window in milliseconds for frequency counting. */
    window_ms?: number;
    /** Minimum occurrences required within the window to trigger. */
    threshold?: number;
  };
  severity_keywords?: string[];
  semantic_keywords?: string[];
  manual_triggers?: string[];
}

export interface TriggerBatchConfig {
  max_size?: number;
  max_wait_ms?: number;
}

export interface TriggerRateLimitConfig {
  max_pending?: number;
}

export interface TriggeredDistillConfig {
  enabled?: boolean;
  distillers?: Array<
    string | { plugin: string; config: Record<string, unknown> }
  >;
  sinks?: Array<string | { plugin: string; config: Record<string, unknown> }>;
  llm?: {
    default_budget?: LLMBudget;
    timeout_ms?: number;
    providers?: Record<string, LLMProviderConfig>;
  };
}

export interface TriggeredIntelligenceConfig {
  enabled?: boolean;
  /** Processing mode: "signal" = keyword-triggered only (default), "continuous" = all sessions enqueued */
  mode?: "signal" | "continuous";
  processing_mode?: ProcessingMode;
  thresholds?: TriggerThresholdConfig;
  batch?: TriggerBatchConfig;
  rate_limit?: TriggerRateLimitConfig;
  distill?: TriggeredDistillConfig;
}

export interface PulledSessionPayload {
  session: Record<string, unknown>;
  messages: SessionMessage[];
  tools?: SessionToolCall[];
  context?: {
    cwd?: string;
    worktree?: string;
    repo?: string;
    branch?: string;
    commit?: string;
    dirty?: boolean;
  };
  time_range?: {
    start: string;
    end: string;
  };
}

export interface SessionProvider {
  id: string;
  pullSession(sessionId: string): Promise<PulledSessionPayload>;
}

export interface CreateSnapshotInput {
  capture: CaptureRequest;
  pulled: PulledSessionPayload;
  aicVersion?: string;
}

export interface RedactionResult {
  snapshot: SessionSnapshot;
  patterns_applied: string[];
  redacted_count: number;
  summary: RedactionSummary;
  risk_level: RedactionRiskLevel;
}

export interface RedactionConfig {
  /** Additional regex patterns to redact */
  patterns?: RedactionPatternDef[];
  /** Patterns to ignore (skip redaction for matching text) */
  ignore_patterns?: string[];
  /** Disable specific built-in categories */
  disabled_categories?: string[];
  /** Minimum risk level that triggers a warning log */
  warn_risk_level?: RedactionRiskLevel;
}

export interface RedactionPatternDef {
  id: string;
  regex: string;
  placeholder: string;
  category?: string;
}

function createEmptySummary(): RedactionSummary {
  return {
    total: 0,
    by_type: {},
    by_placeholder: {},
    high_risk_types: [],
    risk_level: "low",
  };
}

export function buildSessionSnapshot(
  input: CreateSnapshotInput,
): SessionSnapshot {
  const firstTimestamp =
    input.pulled.messages[0]?.timestamp ?? input.capture.captured_at;
  const lastTimestamp =
    input.pulled.messages[input.pulled.messages.length - 1]?.timestamp ??
    input.capture.captured_at;

  return {
    schema_version: "1.0",
    meta: {
      session_id: input.capture.session_id,
      captured_at: input.capture.captured_at,
      capture_trigger: input.capture.trigger,
      aic_version: input.aicVersion ?? DEFAULT_AIC_VERSION,
      provider: input.capture.provider,
    },
    context: {
      cwd: input.pulled.context?.cwd ?? "",
      worktree: input.pulled.context?.worktree ?? "",
      repo: input.pulled.context?.repo,
      branch: input.pulled.context?.branch,
      commit: input.pulled.context?.commit,
      dirty: input.pulled.context?.dirty,
    },
    time_range: {
      start: input.pulled.time_range?.start ?? firstTimestamp,
      end: input.pulled.time_range?.end ?? lastTimestamp,
    },
    session: input.pulled.session,
    messages: input.pulled.messages,
    tools: input.pulled.tools,
    redacted: {
      patterns_applied: [],
      redacted_count: 0,
      summary: createEmptySummary(),
      risk_level: "low",
    },
  };
}

export function isCaptureRequest(value: unknown): value is CaptureRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.session_id === "string" &&
    candidate.session_id.length > 0 &&
    typeof candidate.trigger === "string" &&
    candidate.trigger.length > 0 &&
    typeof candidate.captured_at === "string" &&
    candidate.captured_at.length > 0 &&
    typeof candidate.provider === "string" &&
    candidate.provider.length > 0
  );
}

export type { JSONSchema7 };
