import type { JSONSchema7 } from "json-schema";

export const DEFAULT_DAEMON_HOST = "127.0.0.1";
export const DEFAULT_DAEMON_PORT = 37468;
export const CAPTURE_PATH = "/capture";
export const DEFAULT_AIC_VERSION = "0.1.0";

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
  };
}

export type ArtifactPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; name: string; input: unknown; output?: string; error?: string }
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
  getUnprocessed(distillerId: string, limit?: number): AsyncIterable<SessionArtifact>;
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
  markProcessed(distillerId: string, sessionIds: string[]): Promise<void>;
}

export interface LLMProvider {
  id: string;
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
  route(request: {
    task: "extract" | "summarize" | "classify" | "score";
    budget: "cheap" | "standard" | "premium";
    input_tokens: number;
  }): { provider: LLMProvider; model: string };
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
}

export interface DistillerPlugin {
  id: string;
  name: string;
  version: string;
  supported_types: string[];
  configSchema?: JSONSchema7;
  payloadSchema?: Record<string, JSONSchema7>;
  initialize?(ctx: DistillerContext): Promise<void>;
  run(input: DistillerRunInput): Promise<DistillResultDraft[]>;
  teardown?(): Promise<void>;
}

export type DistillerFactory = (config?: Record<string, unknown>) => DistillerPlugin;

export interface DistillerRegistry {
  load(specifier: string, config?: Record<string, unknown>): Promise<DistillerPlugin>;
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
  }): Promise<DistillReport[]>;
}

export interface AICConfig {
  dump_dir?: string;
  capture?: {
    providers: string[];
    debounce_ms?: number;
  };
  distillers: Array<string | { plugin: string; config: Record<string, unknown> }>;
  sinks?: Array<string | { plugin: string; config: Record<string, unknown> }>;
  llm?: {
    default_budget?: "cheap" | "standard" | "premium";
    providers?: Record<string, { api_key?: string; base_url?: string; model?: string }>;
  };
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
}

interface RedactionPattern {
  id: string;
  regex: RegExp;
}

const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  { id: "openai-token", regex: /sk-[A-Za-z0-9_-]{20,}/g },
  { id: "github-token", regex: /ghp_[A-Za-z0-9]{20,}/g },
  { id: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "bearer-token", regex: /Bearer\s+[A-Za-z0-9._-]+/g },
  { id: "sensitive-path", regex: /(?:^|[\\/])(auth|credentials|\.env)(?:[\\/]|$)/gi },
];

function replaceWithCount(text: string, regex: RegExp, replacement: string): { value: string; count: number } {
  let count = 0;
  const value = text.replace(regex, () => {
    count += 1;
    return replacement;
  });
  return { value, count };
}

function tryCompileRegex(pattern: string): RegExp | undefined {
  try {
    if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
      const lastSlash = pattern.lastIndexOf("/");
      const body = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      return new RegExp(body, flags);
    }
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

export function parseRedactIgnore(value: string | undefined): RegExp[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => tryCompileRegex(item))
    .filter((item): item is RegExp => Boolean(item));
}

function shouldIgnoreText(text: string, ignorePatterns: RegExp[]): boolean {
  return ignorePatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function redactStringValue(
  value: string,
  ignorePatterns: RegExp[],
  patternsApplied: Set<string>,
): { value: string; count: number } {
  if (shouldIgnoreText(value, ignorePatterns)) {
    return { value, count: 0 };
  }

  let result = value;
  let redactedCount = 0;

  for (const pattern of DEFAULT_REDACTION_PATTERNS) {
    const replacement = `[REDACTED:${pattern.id}]`;
    const replaced = replaceWithCount(result, pattern.regex, replacement);
    if (replaced.count > 0) {
      patternsApplied.add(pattern.id);
      redactedCount += replaced.count;
      result = replaced.value;
    }
  }

  return { value: result, count: redactedCount };
}

function redactUnknownValue(
  value: unknown,
  ignorePatterns: RegExp[],
  patternsApplied: Set<string>,
): { value: unknown; count: number } {
  if (typeof value === "string") {
    return redactStringValue(value, ignorePatterns, patternsApplied);
  }

  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const redacted = redactUnknownValue(item, ignorePatterns, patternsApplied);
      count += redacted.count;
      return redacted.value;
    });
    return { value: next, count };
  }

  if (value && typeof value === "object") {
    let count = 0;
    const next: Record<string, unknown> = {};
    for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
      const redacted = redactUnknownValue(current, ignorePatterns, patternsApplied);
      count += redacted.count;
      next[key] = redacted.value;
    }
    return { value: next, count };
  }

  return { value, count: 0 };
}

export function buildSessionSnapshot(input: CreateSnapshotInput): SessionSnapshot {
  const firstTimestamp = input.pulled.messages[0]?.timestamp ?? input.capture.captured_at;
  const lastTimestamp = input.pulled.messages[input.pulled.messages.length - 1]?.timestamp ?? input.capture.captured_at;

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
    },
  };
}

export function applySnapshotRedaction(snapshot: SessionSnapshot, ignorePatterns: RegExp[] = []): RedactionResult {
  const patternsApplied = new Set<string>();
  const redacted = redactUnknownValue(snapshot, ignorePatterns, patternsApplied);
  const output = redacted.value as SessionSnapshot;

  output.redacted = {
    patterns_applied: Array.from(patternsApplied),
    redacted_count: redacted.count,
  };

  return {
    snapshot: output,
    patterns_applied: output.redacted.patterns_applied,
    redacted_count: output.redacted.redacted_count,
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
