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

interface CodexJsonLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface CodexContentItem {
  type?: string;
  text?: string;
}

interface CodexMessagePayload {
  type?: string;
  role?: string;
  content?: CodexContentItem[];
}

interface CodexReasoningPayload {
  type?: string;
  summary?: unknown[];
  encrypted_content?: string;
}

interface CodexFunctionCallPayload {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

interface CodexFunctionCallOutputPayload {
  type?: string;
  call_id?: string;
  output?: CodexContentItem[] | string;
}

interface PendingCodexTool {
  call: SessionToolCall;
  part: SessionArtifactPart;
}

function defaultSessionsDir(): string {
  return path.join(homedir(), ".codex", "sessions");
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

function parseJsonLines(text: string): CodexJsonLine[] {
  const rows: CodexJsonLine[] = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      const isLastLine = index === lines.length - 1;
      const looksIncomplete = !/[\]\}]$/.test(trimmed);
      if (isLastLine && looksIncomplete) {
        continue;
      }
      throw new Error(`Failed to parse JSONL line ${index + 1}`);
    }

    if (parsed && typeof parsed === "object") {
      rows.push(parsed as CodexJsonLine);
    }
  }

  return rows;
}

function extractTextFromContent(content: CodexContentItem[] | string | undefined): string {
  if (!content) {
    return "";
  }

  // Codex output can be a plain string or an array of content items
  if (typeof content === "string") {
    return content;
  }

  if (content.length === 0) {
    return "";
  }

  return content
    .filter((c) => (c.type === "input_text" || c.type === "output_text") && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n");
}

function buildPulledPayload(
  rows: CodexJsonLine[],
  sessionFilePath: string,
  fileMtimeMs: number,
): PulledSessionPayload {
  const messages: SessionMessage[] = [];
  const tools: SessionToolCall[] = [];
  const pendingTools = new Map<string, PendingCodexTool>();
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let model: string | undefined;

  for (const row of rows) {
    const payload = row.payload;

    // session_meta: extract session id and cwd
    if (row.type === "session_meta" && payload) {
      sessionId = typeof payload.id === "string" ? payload.id : undefined;
      cwd = cwd ?? (typeof payload.cwd === "string" ? payload.cwd : undefined);
      model = model ?? (typeof payload.model_provider === "string" ? payload.model_provider : undefined);
      continue;
    }

    // turn_context: extract cwd and model
    if (row.type === "turn_context" && payload) {
      cwd = cwd ?? (typeof payload.cwd === "string" ? payload.cwd : undefined);
      model = model ?? (typeof payload.model === "string" ? payload.model : undefined);
      continue;
    }

    // response_item
    if (row.type === "response_item" && payload) {
      const itemType = typeof payload.type === "string" ? payload.type : undefined;
      const timestamp = typeof row.timestamp === "string" ? row.timestamp : new Date(fileMtimeMs).toISOString();

      if (itemType === "message") {
        const msgPayload = payload as CodexMessagePayload;
        const roleRaw = msgPayload.role ?? "unknown";
        const contentArr = msgPayload.content;

        const textContent = extractTextFromContent(contentArr);
        const parts: SessionArtifactPart[] = [];

        if (textContent.length > 0) {
          parts.push({ type: "text", text: textContent });
        }

        let role: "user" | "assistant" | "system";
        switch (roleRaw) {
          case "user":
            role = "user";
            break;
          case "assistant":
            role = "assistant";
            break;
          default:
            role = "system";
            break;
        }

        const content = textContent.length > 0 ? textContent : undefined;
        if (content || parts.length > 0) {
          const messageId = `codex-${messages.length + 1}`;
          messages.push({
            id: messageId,
            role,
            timestamp,
            content,
            parts: parts.length > 0 ? parts : undefined,
          });
        }
        continue;
      }

      if (itemType === "reasoning") {
        const reasoningPayload = payload as CodexReasoningPayload;
        const existingMsg = messages[messages.length - 1];
        const text = reasoningPayload.encrypted_content
          ? "[encrypted reasoning]"
          : undefined;

        if (text && existingMsg && existingMsg.role === "assistant") {
          if (!existingMsg.parts) {
            existingMsg.parts = [];
          }
          existingMsg.parts.push({ type: "reasoning", text });
        }
        continue;
      }

      if (itemType === "function_call") {
        const fcPayload = payload as CodexFunctionCallPayload;
        const callId = fcPayload.call_id ?? `codex-call-${tools.length + 1}`;
        const callName = fcPayload.name ?? "unknown";
        let args: Record<string, unknown> = {};
        if (typeof fcPayload.arguments === "string") {
          try {
            args = JSON.parse(fcPayload.arguments) as Record<string, unknown>;
          } catch {
            args = { raw: fcPayload.arguments };
          }
        }

        const toolPart: SessionArtifactPart = {
          type: "tool",
          name: callName,
          input: args,
        };

        const call: SessionToolCall = {
          id: callId,
          message_id: messages[messages.length - 1]?.id ?? `codex-msg-${messages.length}`,
          name: callName,
          input: args,
        };

        tools.push(call);
        pendingTools.set(callId, { call, part: toolPart });

        // Attach to the last assistant message if available
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          if (!lastMsg.parts) {
            lastMsg.parts = [];
          }
          lastMsg.parts.push(toolPart);
        }
        continue;
      }

      if (itemType === "function_call_output") {
        const fcoPayload = payload as CodexFunctionCallOutputPayload;
        const callId = fcoPayload.call_id;
        if (callId) {
          const binding = pendingTools.get(callId);
          if (binding) {
            const outputText = extractTextFromContent(fcoPayload.output);
            if (outputText.length > 0) {
              binding.call.output = outputText;
              binding.part.output = outputText;
            }
          }
        }
        continue;
      }
    }
  }

  const repoName = cwd ? path.basename(cwd) : undefined;
  const finalSessionId = sessionId ?? path.basename(sessionFilePath, ".jsonl");
  const start = messages[0]?.timestamp ?? new Date(fileMtimeMs).toISOString();
  const end = messages[messages.length - 1]?.timestamp ?? new Date(fileMtimeMs).toISOString();

  return {
    session: {
      source: "codex",
      session_id: finalSessionId,
      session_file: sessionFilePath,
      model,
      rows: rows.length,
      messages_count: messages.length,
    },
    messages,
    tools: tools.length > 0 ? tools : undefined,
    context: {
      cwd,
      worktree: cwd,
      repo: repoName,
    },
    time_range: {
      start,
      end,
    },
  };
}

export async function pullCodexSessionFromFilePath(
  sessionFilePath: string,
  options: { readTextFile?: ReadTextFile; statFile?: StatFile } = {},
): Promise<PulledSessionPayload> {
  const readTextFile = options.readTextFile ?? defaultReadTextFile;
  const statFile = options.statFile ?? defaultStatFile;
  const [text, stats] = await Promise.all([readTextFile(sessionFilePath), statFile(sessionFilePath)]);
  const rows = parseJsonLines(text);
  return buildPulledPayload(rows, sessionFilePath, stats.mtimeMs);
}

export interface CreateCodexProviderOptions {
  sessionsDir?: string;
  readTextFile?: ReadTextFile;
  readDir?: ReadDir;
  statFile?: StatFile;
}

export function createCodexSessionProvider(
  options: CreateCodexProviderOptions = {},
): SessionProvider {
  const sessionsDir = options.sessionsDir ?? defaultSessionsDir();
  const readTextFile = options.readTextFile ?? defaultReadTextFile;
  const readDirImpl = options.readDir ?? defaultReadDir;
  const statFile = options.statFile ?? defaultStatFile;

  return {
    id: "codex",
    async pullSession(sessionId: string): Promise<PulledSessionPayload> {
      const sessionFilePath = await findSessionFile(sessionId, sessionsDir, readDirImpl);
      return pullCodexSessionFromFilePath(sessionFilePath, { readTextFile, statFile });
    },
  };
}

async function findSessionFile(
  sessionId: string,
  sessionsDir: string,
  readDirImpl: ReadDir,
): Promise<string> {
  // sessionsDir = ~/.codex/sessions
  // Files are at sessionsDir/YYYY/MM/DD/rollout-*.jsonl
  let yearEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    yearEntries = await readDirImpl(sessionsDir);
  } catch {
    throw new Error(`Codex session file not found for ${sessionId}`);
  }

  for (const yearEntry of yearEntries) {
    if (!yearEntry.isDirectory() || !/^\d{4}$/.test(yearEntry.name)) {
      continue;
    }

    const monthDir = path.join(sessionsDir, yearEntry.name);
    let monthEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      monthEntries = await readDirImpl(monthDir);
    } catch {
      continue;
    }

    for (const monthEntry of monthEntries) {
      if (!monthEntry.isDirectory() || !/^\d{2}$/.test(monthEntry.name)) {
        continue;
      }

      const dayDir = path.join(monthDir, monthEntry.name);
      let dayEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try {
        dayEntries = await readDirImpl(dayDir);
      } catch {
        continue;
      }

      for (const dayEntry of dayEntries) {
        // Check files directly under day directory (newer Codex format)
        if (dayEntry.isFile() && dayEntry.name.startsWith("rollout-") && dayEntry.name.endsWith(".jsonl")) {
          if (dayEntry.name.includes(sessionId)) {
            return path.join(dayDir, dayEntry.name);
          }
          continue;
        }

        if (!dayEntry.isDirectory() || !/^\d{2}$/.test(dayEntry.name)) {
          continue;
        }

        const filesDir = path.join(dayDir, dayEntry.name);
        let fileEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
        try {
          fileEntries = await readDirImpl(filesDir);
        } catch {
          continue;
        }

        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.startsWith("rollout-") || !fileEntry.name.endsWith(".jsonl")) {
            continue;
          }

          if (fileEntry.name.includes(sessionId)) {
            return path.join(filesDir, fileEntry.name);
          }
        }
      }
    }
  }

  throw new Error(`Codex session file not found for ${sessionId}`);
}

async function listSessionFiles(sessionsDir: string, readDirImpl: ReadDir): Promise<string[]> {
  const files: string[] = [];

  let yearEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    yearEntries = await readDirImpl(sessionsDir);
  } catch {
    return files;
  }

  for (const yearEntry of yearEntries) {
    if (!yearEntry.isDirectory() || !/^\d{4}$/.test(yearEntry.name)) {
      continue;
    }

    const monthDir = path.join(sessionsDir, yearEntry.name);
    let monthEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      monthEntries = await readDirImpl(monthDir);
    } catch {
      continue;
    }

    for (const monthEntry of monthEntries) {
      if (!monthEntry.isDirectory() || !/^\d{2}$/.test(monthEntry.name)) {
        continue;
      }

      const dayDir = path.join(monthDir, monthEntry.name);
      let dayEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try {
        dayEntries = await readDirImpl(dayDir);
      } catch {
        continue;
      }

      for (const dayEntry of dayEntries) {
        // Handle files directly under day directory (newer Codex format)
        if (dayEntry.isFile() && dayEntry.name.startsWith("rollout-") && dayEntry.name.endsWith(".jsonl")) {
          files.push(path.join(dayDir, dayEntry.name));
          continue;
        }

        if (!dayEntry.isDirectory() || !/^\d{2}$/.test(dayEntry.name)) {
          continue;
        }

        const filesDir = path.join(dayDir, dayEntry.name);
        let fileEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
        try {
          fileEntries = await readDirImpl(filesDir);
        } catch {
          continue;
        }

        for (const fileEntry of fileEntries) {
          if (fileEntry.isFile() && fileEntry.name.startsWith("rollout-") && fileEntry.name.endsWith(".jsonl")) {
            files.push(path.join(filesDir, fileEntry.name));
          }
        }
      }
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

export interface StartCodexWatcherOptions {
  sessionsDir?: string;
  idleMs?: number;
  pollIntervalMs?: number;
  retryDelayMs?: number;
  logger?: (message: string) => void;
  onReady(event: { sessionId: string; filePath: string; trigger: string }): void | Promise<void>;
  readDir?: ReadDir;
  statFile?: StatFile;
}

export interface CodexWatcher {
  close(): void;
}

export function startCodexWatcher(options: StartCodexWatcherOptions): CodexWatcher {
  const sessionsDir = options.sessionsDir ?? defaultSessionsDir();
  const logger = options.logger ?? (() => undefined);
  const idleMs = clampIdleMs(options.idleMs ?? Number(process.env.LOAM_CODEX_IDLE_MS));
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
        logger(`[loam codex] watcher callback failed session_id=${sessionId} error=${message}`);
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
      const files = await listSessionFiles(sessionsDir, readDirImpl);
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
      logger(`[loam codex] watcher scan failed: ${message}`);
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
