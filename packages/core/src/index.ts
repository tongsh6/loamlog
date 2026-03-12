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

export type LLMTask = "extract" | "summarize" | "classify" | "score";

export type LLMBudget = "cheap" | "standard" | "premium";

export interface LLMProviderConfig {
  api_key?: string;
  base_url?: string;
  model?: string;
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
    task: LLMTask;
    budget: LLMBudget;
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
    default_budget?: LLMBudget;
    timeout_ms?: number;
    providers?: Record<string, LLMProviderConfig>;
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
  summary: RedactionSummary;
  risk_level: RedactionRiskLevel;
}

type SanitizationCategory =
  | "api_key"
  | "auth_header"
  | "cookie"
  | "session"
  | "password"
  | "token"
  | "url_param"
  | "config"
  | "email"
  | "phone"
  | "sensitive_path";

interface SanitizationPattern {
  id: string;
  regex: RegExp;
  placeholder: string;
  category: SanitizationCategory;
}

const REGEX_PATTERNS: SanitizationPattern[] = [
  { id: "api-key-openai", regex: /sk-[A-Za-z0-9]{20,}/g, placeholder: "[API_KEY:OPENAI]", category: "api_key" },
  {
    id: "github-token",
    regex: /gh[pousr]_[A-Za-z0-9]{20,}/g,
    placeholder: "[TOKEN:GITHUB]",
    category: "api_key",
  },
  { id: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g, placeholder: "[ACCESS_KEY:AWS]", category: "api_key" },
  {
    id: "bearer-inline",
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
    placeholder: "[AUTH_HEADER:BEARER]",
    category: "auth_header",
  },
  {
    id: "email-inline",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    placeholder: "[EMAIL]",
    category: "email",
  },
  {
    id: "phone-inline",
    regex: /\b(?:\+?\d{1,3}[ -]?)?(?:\d[ -]?){6,14}\d\b/g,
    placeholder: "[PHONE]",
    category: "phone",
  },
  {
    id: "sensitive-path",
    regex: /(?:^|[\\/])(auth|credentials|\.env)(?:[\\/]|$)/gi,
    placeholder: "[SENSITIVE_PATH]",
    category: "sensitive_path",
  },
];

const HIGH_RISK_TYPES = new Set<SanitizationCategory>(["api_key", "auth_header", "password", "token", "session", "cookie"]);
const STRUCTURAL_KEYS = new Set([
  "session_id",
  "message_id",
  "id",
  "timestamp",
  "captured_at",
  "capture_trigger",
  "aic_version",
  "provider",
  "role",
  "cwd",
  "worktree",
  "repo",
  "branch",
  "commit",
  "type",
  "name",
  "filename",
  "mime",
]);
const SKIP_VALUE_SANITIZE_KEYS = new Set(["session_id", "message_id", "captured_at", "capture_trigger", "aic_version", "provider"]);

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

class SanitizationStats {
  total = 0;
  byType = new Map<string, number>();
  byPlaceholder = new Map<string, number>();
  patternsApplied = new Set<string>();

  add(category: SanitizationCategory, placeholder: string, patternId: string, count: number): void {
    if (count <= 0) {
      return;
    }

    this.total += count;
    this.patternsApplied.add(patternId);
    this.byType.set(category, (this.byType.get(category) ?? 0) + count);
    this.byPlaceholder.set(placeholder, (this.byPlaceholder.get(placeholder) ?? 0) + count);
  }

  toSummary(): RedactionSummary {
    const byType = Object.fromEntries(this.byType);
    const byPlaceholder = Object.fromEntries(this.byPlaceholder);

    const highRiskTypes = Object.entries(byType)
      .filter(([type, count]) => HIGH_RISK_TYPES.has(type as SanitizationCategory) && count > 0)
      .map(([type]) => type);

    const hasHighRisk = highRiskTypes.length > 0;
    const hasMediumRisk = !hasHighRisk && ((byType.email ?? 0) > 0 || (byType.phone ?? 0) > 0);
    const risk_level: RedactionRiskLevel = hasHighRisk ? "high" : hasMediumRisk ? "medium" : "low";

    return {
      total: this.total,
      by_type: byType,
      by_placeholder: byPlaceholder,
      high_risk_types: highRiskTypes,
      risk_level,
    };
  }
}

const KEY_PLACEHOLDERS: Array<{
  match: RegExp;
  placeholder: string;
  category: SanitizationCategory;
  id: string;
}> = [
  { match: /^openai[_-]?api[_-]?key$/i, placeholder: "[API_KEY:OPENAI]", category: "api_key", id: "key:openai" },
  { match: /^anthropic[_-]?api[_-]?key$/i, placeholder: "[API_KEY:ANTHROPIC]", category: "api_key", id: "key:anthropic" },
  { match: /^deepseek[_-]?api[_-]?key$/i, placeholder: "[API_KEY:DEEPSEEK]", category: "api_key", id: "key:deepseek" },
  { match: /^github[_-]?token$/i, placeholder: "[TOKEN:GITHUB]", category: "api_key", id: "key:github-token" },
  { match: /api[_-]?key/i, placeholder: "[API_KEY]", category: "api_key", id: "key:api-key" },
  { match: /(access[_-]?token|auth[_-]?token|token)$/i, placeholder: "[TOKEN]", category: "token", id: "key:token" },
  { match: /secret/i, placeholder: "[SECRET]", category: "token", id: "key:secret" },
  { match: /(sessionid|session_id|sid|session)/i, placeholder: "[SESSION_ID]", category: "session", id: "key:session" },
  { match: /cookie|csrf/i, placeholder: "[COOKIE]", category: "cookie", id: "key:cookie" },
  { match: /(password|passwd|pwd|passphrase)/i, placeholder: "[PASSWORD]", category: "password", id: "key:password" },
  { match: /email/i, placeholder: "[EMAIL]", category: "email", id: "key:email" },
  { match: /(phone|mobile|tel)/i, placeholder: "[PHONE]", category: "phone", id: "key:phone" },
  { match: /authorization/i, placeholder: "[AUTH_HEADER]", category: "auth_header", id: "key:authorization" },
];

function classifyKey(key: string):
  | {
      placeholder: string;
      category: SanitizationCategory;
      id: string;
    }
  | undefined {
  for (const candidate of KEY_PLACEHOLDERS) {
    if (candidate.match.test(key)) {
      return { placeholder: candidate.placeholder, category: candidate.category, id: candidate.id };
    }
  }
  return undefined;
}

function shouldSkipKeyClassification(key: string): boolean {
  return STRUCTURAL_KEYS.has(key.toLowerCase());
}

function sanitizeAuthorizationHeaders(value: string, stats: SanitizationStats): { value: string; count: number } {
  let count = 0;
  let next = value.replace(/Authorization:\s*Bearer\s+[^\s]+/gi, () => {
    stats.add("auth_header", "[AUTH_HEADER:BEARER]", "auth-header:bearer", 1);
    count += 1;
    return "Authorization: [AUTH_HEADER:BEARER]";
  });

  next = next.replace(/Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi, () => {
    stats.add("auth_header", "[AUTH_HEADER:BASIC]", "auth-header:basic", 1);
    count += 1;
    return "Authorization: [AUTH_HEADER:BASIC]";
  });

  next = next.replace(/(X-Api-Key|X-Auth-Token):\s*([^\s]+)/gi, (_, headerName: string) => {
    const placeholder = `[AUTH_HEADER:${headerName.toUpperCase().replace(/-/g, "_")}]`;
    stats.add("auth_header", placeholder, `auth-header:${headerName.toLowerCase()}`, 1);
    count += 1;
    return `${headerName}: ${placeholder}`;
  });

  return { value: next, count };
}

function sanitizeCookieHeaders(value: string, stats: SanitizationStats): { value: string; count: number } {
  let count = 0;
  const next = value.replace(/(Set-Cookie|Cookie):\s*([^\r\n]+)/gi, (match: string, headerName: string, cookieValue: string) => {
    const sanitized = cookieValue
      .split(/;\s*/)
      .map((pair) => {
        const [name, raw] = pair.split("=");
        if (!raw) {
          return pair;
        }
        const placeholder = `[COOKIE:${name.trim().toUpperCase()}]`;
        stats.add("cookie", placeholder, `cookie:${name.toLowerCase()}`, 1);
        count += 1;
        return `${name}=${placeholder}`;
      })
      .join("; ");

    return `${headerName}: ${sanitized}`;
  });

  return { value: next, count };
}

function sanitizeUrlParams(value: string, stats: SanitizationStats): { value: string; count: number } {
  let count = 0;
  const next = value.replace(
    /([?&])(token|api[_-]?key|access_token|sessionid?|sid|auth|code|password|secret|email|phone)=([^&#\s]+)/gi,
    (match: string, prefix: string, rawKey: string) => {
      const classification =
        classifyKey(rawKey) ??
        ({
          placeholder: `[URL_PARAM:${rawKey.toUpperCase()}]`,
          category: rawKey.toLowerCase().includes("password") ? "password" : "url_param",
          id: `url-param:${rawKey.toLowerCase()}`,
        } satisfies ReturnType<typeof classifyKey>);

      stats.add(classification.category, classification.placeholder, classification.id, 1);
      count += 1;
      return `${prefix}${rawKey}=${classification.placeholder}`;
    },
  );

  return { value: next, count };
}

function sanitizeKeyValueAssignments(
  value: string,
  stats: SanitizationStats,
  ignorePatterns: RegExp[],
): { value: string; count: number } {
  let count = 0;
  const assignmentPattern = /^(\s*export\s+)?([A-Za-z0-9_.-]+)\s*[:=]\s*([^\s#]+)(.*)$/gm;

  const next = value.replace(assignmentPattern, (match: string, exportPrefix: string, key: string, rawValue: string, suffix: string) => {
    const normalizedKey = key.trim();
    if (/^(authorization|cookie)$/i.test(normalizedKey)) {
      return match;
    }

    if (shouldSkipKeyClassification(normalizedKey)) {
      return match;
    }

    const classification = classifyKey(normalizedKey);
    if (!classification) {
      return match;
    }

    stats.add(classification.category, classification.placeholder, `${classification.id}:kv`, 1);
    if (suffix && suffix.trim().length > 0) {
      sanitizeStringValue(suffix, ignorePatterns, stats);
    }
    count += 1;
    const prefix = exportPrefix ?? "";
    return `${prefix}${normalizedKey}=${classification.placeholder}`;
  });

  return { value: next, count };
}

function sanitizeInlineAssignments(value: string, stats: SanitizationStats): { value: string; count: number } {
  let count = 0;
  const next = value.replace(/\b([A-Za-z0-9_.-]{3,30})\s*=\s*([^\s;&]+)/g, (match: string, key: string, rawValue: string) => {
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      return match;
    }

    if (shouldSkipKeyClassification(key)) {
      return match;
    }

    const classification = classifyKey(key);
    if (!classification) {
      return match;
    }

    stats.add(classification.category, classification.placeholder, `${classification.id}:inline`, 1);
    count += 1;
    return `${key}=${classification.placeholder}`;
  });

  return { value: next, count };
}

function sanitizeJsonLikePairs(value: string, stats: SanitizationStats): { value: string; count: number } {
  let count = 0;
  const next = value.replace(/"([A-Za-z0-9_.-]{3,50})"\s*:\s*"([^"]+)"/g, (match: string, key: string) => {
    if (shouldSkipKeyClassification(key)) {
      return match;
    }

    const classification = classifyKey(key);
    if (!classification) {
      return match;
    }

    stats.add(classification.category, classification.placeholder, `${classification.id}:json`, 1);
    count += 1;
    return `"${key}": "${classification.placeholder}"`;
  });

  return { value: next, count };
}

function sanitizeJsonBlock(
  value: string,
  ignorePatterns: RegExp[],
  stats: SanitizationStats,
): { value: string; count: number } | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    const before = stats.total;
    const sanitized = sanitizeUnknownValue(parsed, ignorePatterns, stats).value;
    const after = stats.total;
    const count = Math.max(after - before, 0);
    const serialized =
      typeof sanitized === "string" || typeof sanitized === "number" || typeof sanitized === "boolean"
        ? String(sanitized)
        : JSON.stringify(sanitized, null, 2);
    return { value: serialized, count };
  } catch {
    return undefined;
  }
}

function sanitizeStringValue(
  value: string,
  ignorePatterns: RegExp[],
  stats: SanitizationStats,
): { value: string; count: number } {
  if (shouldIgnoreText(value, ignorePatterns)) {
    return { value, count: 0 };
  }

  let result = value;
  let redactedCount = 0;

  const jsonBlock = sanitizeJsonBlock(value, ignorePatterns, stats);
  if (jsonBlock) {
    result = jsonBlock.value;
    redactedCount += jsonBlock.count;
  }

  const auth = sanitizeAuthorizationHeaders(result, stats);
  result = auth.value;
  redactedCount += auth.count;

  const cookies = sanitizeCookieHeaders(result, stats);
  result = cookies.value;
  redactedCount += cookies.count;

  const jsonPairs = sanitizeJsonLikePairs(result, stats);
  result = jsonPairs.value;
  redactedCount += jsonPairs.count;

  const kv = sanitizeKeyValueAssignments(result, stats, ignorePatterns);
  result = kv.value;
  redactedCount += kv.count;

  const inline = sanitizeInlineAssignments(result, stats);
  result = inline.value;
  redactedCount += inline.count;

  const urlParams = sanitizeUrlParams(result, stats);
  result = urlParams.value;
  redactedCount += urlParams.count;

  for (const pattern of REGEX_PATTERNS) {
    const replaced = replaceWithCount(result, pattern.regex, pattern.placeholder);
    if (replaced.count > 0) {
      stats.add(pattern.category, pattern.placeholder, pattern.id, replaced.count);
      redactedCount += replaced.count;
      result = replaced.value;
    }
  }

  return { value: result, count: redactedCount };
}

function sanitizeUnknownValue(
  value: unknown,
  ignorePatterns: RegExp[],
  stats: SanitizationStats,
): { value: unknown; count: number } {
  if (typeof value === "string") {
    return sanitizeStringValue(value, ignorePatterns, stats);
  }

  if (Array.isArray(value)) {
    const next = value.map((item) => sanitizeUnknownValue(item, ignorePatterns, stats).value);
    return { value: next, count: 0 };
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
      if (key === "redacted") {
        next[key] = current;
        continue;
      }

      const lowerKey = key.toLowerCase();
      if (typeof current === "string" && SKIP_VALUE_SANITIZE_KEYS.has(lowerKey)) {
        next[key] = current;
        continue;
      }

      const keyClassification =
        typeof current === "string" && !shouldSkipKeyClassification(lowerKey) ? classifyKey(key) : undefined;
      if (keyClassification && typeof current === "string" && !shouldIgnoreText(current, ignorePatterns)) {
        stats.add(keyClassification.category, keyClassification.placeholder, `${keyClassification.id}:field`, 1);
        next[key] = keyClassification.placeholder;
        continue;
      }

      next[key] = sanitizeUnknownValue(current, ignorePatterns, stats).value;
    }
    return { value: next, count: 0 };
  }

  return { value, count: 0 };
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
      summary: createEmptySummary(),
      risk_level: "low",
    },
  };
}

export function applySnapshotRedaction(snapshot: SessionSnapshot, ignorePatterns: RegExp[] = []): RedactionResult {
  const stats = new SanitizationStats();
  const redacted = sanitizeUnknownValue(snapshot, ignorePatterns, stats);
  const output = redacted.value as SessionSnapshot;
  const summary = stats.toSummary();

  output.redacted = {
    patterns_applied: Array.from(stats.patternsApplied),
    redacted_count: summary.total,
    summary,
    risk_level: summary.risk_level,
    sanitized_at: new Date().toISOString(),
  };

  return {
    snapshot: output,
    patterns_applied: output.redacted.patterns_applied,
    redacted_count: output.redacted.redacted_count,
    summary,
    risk_level: summary.risk_level,
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
