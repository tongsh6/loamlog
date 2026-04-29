import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { homedir } from "node:os";
import type {
  PulledSessionPayload,
  SessionArtifactPart,
  SessionMessage,
  SessionProvider,
  SessionToolCall,
} from "@loamlog/core";

export type OpencodeSessionFetcher = (sessionId: string) => Promise<PulledSessionPayload>;

export interface CreateOpencodeProviderOptions {
  fetcher?: OpencodeSessionFetcher;
  baseUrl?: string;
  directory?: string;
  token?: string;
  username?: string;
  password?: string;
  fetchImpl?: typeof fetch;
}

interface OpencodeSessionInfo {
  id: string;
  directory?: string;
  time?: {
    created?: number;
    updated?: number;
  };
}

interface OpencodePathInfo {
  worktree?: string;
  directory?: string;
}

interface OpencodeVcsInfo {
  branch?: string;
}

interface OpencodeMessageInfo {
  id: string;
  role: "user" | "assistant";
  time?: {
    created?: number;
  };
}

interface OpencodeMessageWithParts {
  info: OpencodeMessageInfo;
  parts: Array<Record<string, unknown>>;
}

function toIsoTime(value: number | undefined, fallback: string): string {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }
  return new Date(value).toISOString();
}

function extractTextContent(parts: Array<Record<string, unknown>>): string | undefined {
  const texts: string[] = [];
  for (const part of parts) {
    const type = part.type;
    if ((type === "text" || type === "reasoning") && typeof part.text === "string") {
      texts.push(part.text);
    }
  }

  if (texts.length === 0) {
    return undefined;
  }

  return texts.join("\n");
}

function mapPart(part: Record<string, unknown>): SessionArtifactPart | undefined {
  const type = part.type;

  if (type === "text" && typeof part.text === "string") {
    return { type: "text", text: part.text };
  }

  if (type === "reasoning" && typeof part.text === "string") {
    return { type: "reasoning", text: part.text };
  }

  if (type === "file") {
    const mime = typeof part.mime === "string" ? part.mime : "application/octet-stream";
    const filename = typeof part.filename === "string" ? part.filename : undefined;
    return { type: "file", mime, filename };
  }

  if (type === "tool") {
    const state = typeof part.state === "object" && part.state ? (part.state as Record<string, unknown>) : undefined;
    const input = state && typeof state.input === "object" && state.input ? state.input : {};
    const output = state && typeof state.output === "string" ? state.output : undefined;
    const error = state && typeof state.error === "string" ? state.error : undefined;
    return {
      type: "tool",
      name: typeof part.tool === "string" ? part.tool : "unknown",
      input,
      output,
      error,
    };
  }

  return undefined;
}

function mapMessages(rows: OpencodeMessageWithParts[]): SessionMessage[] {
  const now = new Date().toISOString();
  return rows.map((row) => {
    const parts = row.parts.map((part) => mapPart(part)).filter((item): item is SessionArtifactPart => Boolean(item));
    return {
      id: row.info.id,
      role: row.info.role,
      timestamp: toIsoTime(row.info.time?.created, now),
      content: extractTextContent(row.parts),
      parts,
    };
  });
}

function mapToolCalls(rows: OpencodeMessageWithParts[]): SessionToolCall[] {
  const calls: SessionToolCall[] = [];

  for (const row of rows) {
    for (const part of row.parts) {
      if (part.type !== "tool") {
        continue;
      }

      const state = typeof part.state === "object" && part.state ? (part.state as Record<string, unknown>) : undefined;
      const input =
        state && typeof state.input === "object" && state.input ? (state.input as Record<string, unknown>) : {};

      calls.push({
        id: typeof part.callID === "string" ? part.callID : `${row.info.id}-tool`,
        message_id: row.info.id,
        name: typeof part.tool === "string" ? part.tool : "unknown",
        input,
        output: state && typeof state.output === "string" ? state.output : undefined,
        error: state && typeof state.error === "string" ? state.error : undefined,
      });
    }
  }

  return calls;
}

function createHeaders(options: CreateOpencodeProviderOptions): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (options.directory) {
    headers["x-opencode-directory"] = options.directory;
  }

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
    return headers;
  }

  if (options.username && options.password) {
    const encoded = Buffer.from(`${options.username}:${options.password}`).toString("base64");
    headers.authorization = `Basic ${encoded}`;
  }

  return headers;
}

function normalizeBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/")) {
    return baseUrl.slice(0, -1);
  }
  return baseUrl;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`unexpected content-type: ${contentType}; body=${text.slice(0, 200)}`);
  }
  return (await response.json()) as unknown;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: HeadersInit,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`opencode request failed status=${response.status} url=${url} body=${text.slice(0, 200)}`);
  }

  return readJson(response);
}

function inferRepoName(sessionDirectory: string | undefined, cwd: string | undefined): string | undefined {
  const candidate = sessionDirectory ?? cwd;
  if (!candidate) {
    return undefined;
  }

  const normalized = candidate.replace(/\\/g, "/");
  const basename = path.posix.basename(normalized);
  return basename || undefined;
}

async function fetchViaOpenCodeServer(
  sessionId: string,
  options: CreateOpencodeProviderOptions,
): Promise<PulledSessionPayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.OPENCODE_SERVER_URL ?? "http://127.0.0.1:4096");
  const headers = createHeaders(options);

  const [sessionRaw, messagesRaw, pathRaw, vcsRaw] = await Promise.all([
    fetchJson(fetchImpl, `${baseUrl}/session/${encodeURIComponent(sessionId)}`, headers),
    fetchJson(fetchImpl, `${baseUrl}/session/${encodeURIComponent(sessionId)}/message`, headers),
    fetchJson(fetchImpl, `${baseUrl}/path`, headers).catch(() => undefined),
    fetchJson(fetchImpl, `${baseUrl}/vcs`, headers).catch(() => undefined),
  ]);

  const session = (sessionRaw ?? {}) as OpencodeSessionInfo;
  const messagesWithParts = Array.isArray(messagesRaw) ? (messagesRaw as OpencodeMessageWithParts[]) : [];
  const pathInfo = (pathRaw ?? {}) as OpencodePathInfo;
  const vcsInfo = (vcsRaw ?? {}) as OpencodeVcsInfo;

  const messages = mapMessages(messagesWithParts);
  const tools = mapToolCalls(messagesWithParts);
  const now = new Date().toISOString();

  return {
    session: sessionRaw as Record<string, unknown>,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    context: {
      cwd: pathInfo.directory,
      worktree: pathInfo.worktree,
      repo: inferRepoName(session.directory, pathInfo.directory),
      branch: vcsInfo.branch,
    },
    time_range: {
      start: toIsoTime(session.time?.created, messages[0]?.timestamp ?? now),
      end: toIsoTime(session.time?.updated, messages[messages.length - 1]?.timestamp ?? now),
    },
  };
}

export function createOpencodeSessionProvider(
  options: CreateOpencodeProviderOptions = {},
): SessionProvider {
  const resolvedOptions: CreateOpencodeProviderOptions = {
    ...options,
    baseUrl: options.baseUrl ?? process.env.OPENCODE_SERVER_URL,
    token: options.token ?? process.env.OPENCODE_SERVER_TOKEN,
    username: options.username ?? process.env.OPENCODE_SERVER_USERNAME,
    password: options.password ?? process.env.OPENCODE_SERVER_PASSWORD,
    directory: options.directory ?? process.env.OPENCODE_DIRECTORY,
  };

  const fetcher: OpencodeSessionFetcher = options.fetcher
    ? options.fetcher
    : async (sessionId: string) => fetchViaOpenCodeServer(sessionId, resolvedOptions);

  return {
    id: "opencode",
    async pullSession(sessionId: string): Promise<PulledSessionPayload> {
      return fetcher(sessionId);
    },
  };
}

// ── OpenCode Watcher (SQLite-based active discovery) ──

function defaultOpendcodeHome(): string {
  return process.env.OPENCODE_HOME ?? path.join(homedir(), ".local", "share", "opencode");
}

function defaultOpencodeDbPath(): string {
  return path.join(defaultOpendcodeHome(), "opencode.db");
}

interface OpenCodeSessionRow {
  id: string;
  directory: string;
  time_created: number;
  time_updated: number;
}

async function listOpencodeSessionRows(dbPath: string): Promise<OpenCodeSessionRow[]> {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare(
      "SELECT id, directory, time_created, time_updated FROM session WHERE parent_id IS NULL AND time_archived IS NULL ORDER BY time_updated DESC",
    ).all() as unknown as OpenCodeSessionRow[];
    return rows;
  } finally {
    db.close();
  }
}

function clampIdleMs(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 30_000;
  }
  return Math.max(5_000, Math.floor(value));
}

function clampPollIntervalMs(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 2_000;
  }
  return Math.max(500, Math.floor(value));
}

export interface StartOpencodeWatcherOptions {
  dbPath?: string;
  baseUrl?: string;
  token?: string;
  idleMs?: number;
  pollIntervalMs?: number;
  retryDelayMs?: number;
  logger?: (message: string) => void;
  onReady(event: { sessionId: string; trigger: string }): void | Promise<void>;
}

export interface OpencodeWatcher {
  close(): void;
}

export function startOpencodeWatcher(options: StartOpencodeWatcherOptions): OpencodeWatcher {
  const dbPath = options.dbPath ?? defaultOpencodeDbPath();
  const logger = options.logger ?? (() => undefined);
  const idleMs = clampIdleMs(options.idleMs ?? Number(process.env.LOAM_OPENCODE_IDLE_MS));
  const pollIntervalMs = clampPollIntervalMs(options.pollIntervalMs);
  const retryDelayMs = clampPollIntervalMs(options.retryDelayMs ?? 5_000);
  const knownSessions = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let stopped = false;
  let scanning = false;

  const scheduleReady = (sessionId: string, delayMs = idleMs) => {
    const existing = timers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      timers.delete(sessionId);
      void Promise.resolve(options.onReady({ sessionId, trigger: "session.idle" })).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger(`[loam opencode] watcher callback failed session_id=${sessionId} error=${message}`);
        if (!stopped) {
          scheduleReady(sessionId, retryDelayMs);
        }
      });
    }, delayMs);

    timers.set(sessionId, timer);
  };

  const scan = async (seedOnly: boolean): Promise<void> => {
    if (stopped || scanning) {
      return;
    }

    scanning = true;
    try {
      let rows: OpenCodeSessionRow[];
      try {
        rows = await listOpencodeSessionRows(dbPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger(`[loam opencode] watcher db scan failed: ${message}`);
        return;
      }

      const now = Date.now();
      const startupWindowMs = Math.max(idleMs, 120_000);

      for (const row of rows) {
        const sessionId = row.id;
        const previousUpdated = knownSessions.get(sessionId);
        knownSessions.set(sessionId, row.time_updated);

        if (seedOnly) {
          if (previousUpdated !== undefined) {
            continue;
          }

          const timeSince = now - row.time_updated;
          if (timeSince <= startupWindowMs) {
            const delayMs = Math.max(0, idleMs - timeSince);
            scheduleReady(sessionId, delayMs);
          }
          continue;
        }

        if (previousUpdated !== undefined && row.time_updated <= previousUpdated) {
          continue;
        }

        scheduleReady(sessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`[loam opencode] watcher scan failed: ${message}`);
    } finally {
      scanning = false;
    }
  };

  void scan(true);
  const interval = setInterval(() => {
    void scan(false);
  }, pollIntervalMs);

  return {
    close(): void {
      stopped = true;
      clearInterval(interval);
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
}
