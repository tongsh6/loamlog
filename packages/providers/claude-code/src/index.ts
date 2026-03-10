import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import type {
  PulledSessionPayload,
  SessionArtifactPart,
  SessionMessage,
  SessionProvider,
  SessionToolCall,
} from "@loamlog/core";

type ReadTextFile = (filePath: string) => Promise<string>;
type ReadDir = (dirPath: string) => Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>>;
type StatFile = (filePath: string) => Promise<{ mtimeMs: number }>;

interface ClaudeTranscriptRow {
  type?: string;
  uuid?: string;
  timestamp?: string;
  cwd?: string;
  sessionId?: string;
  gitBranch?: string;
  toolUseID?: string;
  parentToolUseID?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  data?: {
    type?: string;
    output?: string;
    fullOutput?: string;
  };
  toolUseResult?: {
    stdout?: string;
    stderr?: string;
    interrupted?: boolean;
  };
}

interface ClaudeTextContent {
  type: "text";
  text: string;
}

interface ClaudeThinkingContent {
  type: "thinking";
  thinking?: string;
  text?: string;
}

interface ClaudeToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input?: Record<string, unknown>;
}

interface ClaudeToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content?: unknown;
  is_error?: boolean;
}

type ClaudeContentItem =
  | ClaudeTextContent
  | ClaudeThinkingContent
  | ClaudeToolUseContent
  | ClaudeToolResultContent;

interface PendingToolBinding {
  call: SessionToolCall;
  part: {
    type: "tool";
    name: string;
    input: unknown;
    output?: string;
    error?: string;
  };
}

export interface CreateClaudeCodeProviderOptions {
  projectsDir?: string;
  readTextFile?: ReadTextFile;
  readDir?: ReadDir;
  statFile?: StatFile;
}

export interface StartClaudeCodeWatcherOptions {
  projectsDir?: string;
  idleMs?: number;
  pollIntervalMs?: number;
  retryDelayMs?: number;
  logger?: (message: string) => void;
  onReady(event: { sessionId: string; filePath: string; trigger: string }): void | Promise<void>;
  readDir?: ReadDir;
  statFile?: StatFile;
}

export interface ClaudeCodeWatcher {
  close(): void;
}

function defaultProjectsDir(): string {
  return path.join(homedir(), ".claude", "projects");
}

function defaultReadTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

async function defaultReadDir(dirPath: string): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>> {
  return readdir(dirPath, { withFileTypes: true });
}

async function defaultStatFile(filePath: string): Promise<{ mtimeMs: number }> {
  return stat(filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function inferRepoName(cwd: string | undefined): string | undefined {
  if (!cwd) {
    return undefined;
  }

  const normalized = cwd.replace(/\\/g, "/");
  const basename = path.posix.basename(normalized);
  return basename || undefined;
}

function ensureIsoTimestamp(value: string | undefined, fallbackMs: number): string {
  if (!value) {
    return new Date(fallbackMs).toISOString();
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return new Date(fallbackMs).toISOString();
  }

  return new Date(parsed).toISOString();
}

function normalizeContentItems(value: unknown): ClaudeContentItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ClaudeContentItem => isRecord(item) && typeof item.type === "string") as ClaudeContentItem[];
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (isRecord(item)) {
          if (typeof item.text === "string") {
            return item.text;
          }
          if (typeof item.content === "string") {
            return item.content;
          }
        }

        return JSON.stringify(item);
      })
      .filter((item) => item.length > 0);
    return parts.join("\n");
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

function parseJsonLines(text: string): ClaudeTranscriptRow[] {
  const rows: ClaudeTranscriptRow[] = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch (error) {
      const isLastLine = index === lines.length - 1;
      const looksIncomplete = !/[\]\}]$/.test(trimmed);
      if (isLastLine && looksIncomplete) {
        continue;
      }

      throw error;
    }

    if (isRecord(parsed)) {
      rows.push(parsed as ClaudeTranscriptRow);
    }
  }

  return rows;
}

async function findSessionFile(
  sessionId: string,
  projectsDir: string,
  readDirImpl: ReadDir,
): Promise<string> {
  const projectEntries = await readDirImpl(projectsDir);

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = path.join(projectsDir, entry.name, `${sessionId}.jsonl`);
    try {
      const nestedEntries = await readDirImpl(path.join(projectsDir, entry.name));
      if (nestedEntries.some((nested) => nested.isFile() && nested.name === `${sessionId}.jsonl`)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Claude Code session file not found for ${sessionId}`);
}

function buildPulledPayload(rows: ClaudeTranscriptRow[], sessionFilePath: string, fileMtimeMs: number): PulledSessionPayload {
  const messages: SessionMessage[] = [];
  const tools: SessionToolCall[] = [];
  const pendingTools = new Map<string, PendingToolBinding>();
  let cwd: string | undefined;
  let branch: string | undefined;
  let resolvedSessionId: string | undefined;

  for (const row of rows) {
    cwd ??= row.cwd;
    branch ??= row.gitBranch && row.gitBranch !== "HEAD" ? row.gitBranch : undefined;
    resolvedSessionId ??= row.sessionId;

    const timestamp = ensureIsoTimestamp(row.timestamp, fileMtimeMs);
    const messageId = row.uuid ?? `${resolvedSessionId ?? "claude"}-${messages.length + 1}`;

    if (row.type === "assistant") {
      const parts: SessionArtifactPart[] = [];
      const textChunks: string[] = [];

      for (const item of normalizeContentItems(row.message?.content)) {
        if (item.type === "text" && typeof item.text === "string" && item.text.trim().length > 0) {
          textChunks.push(item.text);
          parts.push({ type: "text", text: item.text });
          continue;
        }

        if (item.type === "thinking") {
          const reasoning = typeof item.thinking === "string" ? item.thinking : item.text;
          if (reasoning && reasoning.trim().length > 0) {
            parts.push({ type: "reasoning", text: reasoning });
          }
          continue;
        }

        if (item.type === "tool_use") {
          const toolPart: PendingToolBinding["part"] = {
            type: "tool",
            name: item.name,
            input: isRecord(item.input) ? item.input : {},
          };
          parts.push(toolPart);

          const call: SessionToolCall = {
            id: item.id,
            message_id: messageId,
            name: item.name,
            input: isRecord(item.input) ? item.input : {},
          };
          tools.push(call);
          pendingTools.set(item.id, { call, part: toolPart });
        }
      }

      const content = textChunks.length > 0 ? textChunks.join("\n") : undefined;
      if (content || parts.length > 0) {
        messages.push({
          id: messageId,
          role: "assistant",
          timestamp,
          content,
          parts,
        });
      }
      continue;
    }

    if (row.type === "user") {
      const contentValue = row.message?.content;

      if (typeof contentValue === "string") {
        messages.push({
          id: messageId,
          role: "user",
          timestamp,
          content: contentValue,
        });
        continue;
      }

      const items = normalizeContentItems(contentValue);
      const textChunks: string[] = [];
      let sawToolResult = false;

      for (const item of items) {
        if (item.type === "text" && typeof item.text === "string" && item.text.trim().length > 0) {
          textChunks.push(item.text);
          continue;
        }

        if (item.type !== "tool_result") {
          continue;
        }

        sawToolResult = true;
        const binding = pendingTools.get(item.tool_use_id);
        const contentOutput = stringifyUnknown(item.content);
        const stdout = row.toolUseResult?.stdout ?? "";
        const stderr = row.toolUseResult?.stderr ?? "";
        const output = contentOutput.trim().length > 0 ? contentOutput : stdout;
        const errorText = stderr.trim().length > 0 ? stderr : output;
        const error = item.is_error ? errorText || "tool result error" : undefined;

        if (binding) {
          if (error) {
            binding.call.error = error;
            binding.part.error = error;
            if (output.length > 0) {
              binding.call.output = output;
              binding.part.output = output;
            }
          } else if (output.length > 0) {
            binding.call.output = output;
            binding.part.output = output;
          }
        }
      }

      if (textChunks.length > 0) {
        messages.push({
          id: messageId,
          role: "user",
          timestamp,
          content: textChunks.join("\n"),
        });
      } else if (!sawToolResult && typeof contentValue !== "undefined") {
        const fallback = stringifyUnknown(contentValue);
        if (fallback.trim().length > 0) {
          messages.push({
            id: messageId,
            role: "user",
            timestamp,
            content: fallback,
          });
        }
      }
      continue;
    }

    if (row.type === "progress") {
      const toolId = row.parentToolUseID ?? row.toolUseID;
      if (!toolId) {
        continue;
      }

      const binding = pendingTools.get(toolId);
      if (!binding) {
        continue;
      }

      const progressOutput = row.data?.fullOutput ?? row.data?.output;
      if (typeof progressOutput === "string" && progressOutput.trim().length > 0) {
        binding.call.output = progressOutput;
        binding.part.output = progressOutput;
      }
      continue;
    }

    if (row.type === "system") {
      const contentValue = row.message?.content;
      const content = typeof contentValue === "string" ? contentValue : stringifyUnknown(contentValue);
      if (content.trim().length > 0) {
        messages.push({
          id: messageId,
          role: "system",
          timestamp,
          content,
        });
      }
    }
  }

  const fallbackSessionId = path.basename(sessionFilePath, ".jsonl");
  const finalSessionId = resolvedSessionId ?? fallbackSessionId;
  const start = messages[0]?.timestamp ?? new Date(fileMtimeMs).toISOString();
  const end = messages[messages.length - 1]?.timestamp ?? new Date(fileMtimeMs).toISOString();

  return {
    session: {
      source: "claude-code",
      session_id: finalSessionId,
      session_file: sessionFilePath,
      rows: rows.length,
    },
    messages,
    tools: tools.length > 0 ? tools : undefined,
    context: {
      cwd,
      worktree: cwd,
      repo: inferRepoName(cwd),
      branch,
    },
    time_range: {
      start,
      end,
    },
  };
}

export async function pullClaudeCodeSessionFromFilePath(
  sessionFilePath: string,
  options: { readTextFile?: ReadTextFile; statFile?: StatFile } = {},
): Promise<PulledSessionPayload> {
  const readTextFile = options.readTextFile ?? defaultReadTextFile;
  const statFile = options.statFile ?? defaultStatFile;
  const [text, stats] = await Promise.all([readTextFile(sessionFilePath), statFile(sessionFilePath)]);
  const rows = parseJsonLines(text);
  return buildPulledPayload(rows, sessionFilePath, stats.mtimeMs);
}

export function createClaudeCodeSessionProvider(
  options: CreateClaudeCodeProviderOptions = {},
): SessionProvider {
  const projectsDir = options.projectsDir ?? defaultProjectsDir();
  const readTextFile = options.readTextFile ?? defaultReadTextFile;
  const readDirImpl = options.readDir ?? defaultReadDir;
  const statFile = options.statFile ?? defaultStatFile;

  return {
    id: "claude-code",
    async pullSession(sessionId: string): Promise<PulledSessionPayload> {
      const sessionFilePath = await findSessionFile(sessionId, projectsDir, readDirImpl);
      return pullClaudeCodeSessionFromFilePath(sessionFilePath, { readTextFile, statFile });
    },
  };
}

async function listSessionFiles(projectsDir: string, readDirImpl: ReadDir): Promise<string[]> {
  const files: string[] = [];
  const projectEntries = await readDirImpl(projectsDir);

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }

    const projectPath = path.join(projectsDir, projectEntry.name);
    let nestedEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      nestedEntries = await readDirImpl(projectPath);
    } catch {
      continue;
    }

    for (const nestedEntry of nestedEntries) {
      if (!nestedEntry.isFile() || !nestedEntry.name.endsWith(".jsonl")) {
        continue;
      }

      files.push(path.join(projectPath, nestedEntry.name));
    }
  }

  return files;
}

function clampIdleMs(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 30_000;
  }
  return Math.max(5_000, Math.floor(value));
}

function clampPollIntervalMs(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 1_000;
  }
  return Math.max(100, Math.floor(value));
}

export function startClaudeCodeWatcher(options: StartClaudeCodeWatcherOptions): ClaudeCodeWatcher {
  const projectsDir = options.projectsDir ?? defaultProjectsDir();
  const logger = options.logger ?? (() => undefined);
  const idleMs = clampIdleMs(options.idleMs ?? Number(process.env.LOAM_CLAUDE_IDLE_MS));
  const pollIntervalMs = clampPollIntervalMs(options.pollIntervalMs);
  const retryDelayMs = clampPollIntervalMs(options.retryDelayMs ?? 2_000);
  const readDirImpl = options.readDir ?? defaultReadDir;
  const statFile = options.statFile ?? defaultStatFile;
  const knownFiles = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let stopped = false;
  let scanning = false;

  const scheduleReady = (sessionId: string, filePath: string, delayMs = idleMs) => {
    const key = filePath;
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      timers.delete(key);
      void Promise.resolve(options.onReady({ sessionId, filePath, trigger: "session.idle" })).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger(`[loam claude-code] watcher callback failed session_id=${sessionId} error=${message}`);
        if (!stopped) {
          scheduleReady(sessionId, filePath, retryDelayMs);
        }
      });
    }, delayMs);

    timers.set(key, timer);
  };

  const scan = async (seedOnly: boolean): Promise<void> => {
    if (stopped || scanning) {
      return;
    }

    scanning = true;
    try {
      const files = await listSessionFiles(projectsDir, readDirImpl);
      const now = Date.now();
      const startupWindowMs = Math.max(idleMs, 60_000);
      for (const filePath of files) {
        const fileStats = await statFile(filePath);
        const previousMtime = knownFiles.get(filePath);
        knownFiles.set(filePath, fileStats.mtimeMs);

        if (seedOnly) {
          if (previousMtime !== undefined) {
            continue;
          }

          const timeSince = now - fileStats.mtimeMs;
          if (timeSince <= startupWindowMs) {
            const delayMs = Math.max(0, idleMs - timeSince);
            const sessionId = path.basename(filePath, ".jsonl");
            scheduleReady(sessionId, filePath, delayMs);
          }
          continue;
        }

        if (previousMtime !== undefined && fileStats.mtimeMs <= previousMtime) {
          continue;
        }

        const sessionId = path.basename(filePath, ".jsonl");
        scheduleReady(sessionId, filePath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`[loam claude-code] watcher scan failed: ${message}`);
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
