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

interface GeminiContentPart {
  text?: string;
  [key: string]: unknown;
}

interface GeminiContent {
  parts?: GeminiContentPart[];
  role?: string;
}

interface GeminiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: { parts?: GeminiContentPart[] } | null;
  status?: string;
  timestamp?: string;
}

interface GeminiThought {
  text?: string;
  timestamp?: string;
}

interface GeminiTokens {
  input?: number;
  output?: number;
  cached?: number;
  thoughts?: number;
  total?: number;
}

interface GeminiMessage {
  id: string;
  type: string;
  timestamp: string;
  content?: GeminiContent;
  toolCalls?: GeminiToolCall[];
  thoughts?: GeminiThought[];
  tokens?: GeminiTokens | null;
  model?: string;
}

interface GeminiConversationRecord {
  sessionId: string;
  messages: GeminiMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function defaultProjectsDir(): string {
  return path.join(homedir(), ".gemini", "tmp");
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

function extractTextFromParts(parts: GeminiContentPart[] | undefined): string {
  if (!parts || parts.length === 0) {
    return "";
  }

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
}

function buildPulledPayload(
  record: GeminiConversationRecord,
  sessionFilePath: string,
  fileMtimeMs: number,
): PulledSessionPayload {
  const messages: SessionMessage[] = [];
  const tools: SessionToolCall[] = [];

  for (const msg of record.messages) {
    const timestamp = msg.timestamp;
    const messageId = msg.id;

    let role: "user" | "assistant" | "system";

    switch (msg.type) {
      case "user":
        role = "user";
        break;
      case "gemini":
        role = "assistant";
        break;
      default:
        role = "system";
        break;
    }

    const parts: SessionArtifactPart[] = [];
    const textContent = extractTextFromParts(msg.content?.parts);

    if (textContent.length > 0) {
      parts.push({ type: "text", text: textContent });
    }

    if (msg.thoughts && msg.thoughts.length > 0) {
      for (const thought of msg.thoughts) {
        if (typeof thought.text === "string" && thought.text.trim().length > 0) {
          parts.push({ type: "reasoning", text: thought.text });
        }
      }
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        const input = tc.args ?? {};

        const toolPart: SessionArtifactPart = {
          type: "tool",
          name: tc.name,
          input,
        };

        if (tc.result?.parts) {
          const resultText = extractTextFromParts(tc.result.parts);
          if (resultText.length > 0) {
            toolPart.output = resultText;
          }
        }

        if (tc.status === "error") {
          toolPart.error = "tool execution failed";
        }

        parts.push(toolPart);

        const call: SessionToolCall = {
          id: tc.id,
          message_id: messageId,
          name: tc.name,
          input,
        };

        if (toolPart.output) {
          call.output = toolPart.output;
        }

        if (toolPart.error) {
          call.error = toolPart.error;
        }

        tools.push(call);
      }
    }

    const content = textContent.length > 0 ? textContent : undefined;
    if (content || parts.length > 0) {
      messages.push({
        id: messageId,
        role,
        timestamp,
        content,
        parts: parts.length > 0 ? parts : undefined,
      });
    }
  }

  let cwd: string | undefined;
  for (const msg of record.messages) {
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.args?.filePath && typeof tc.args.filePath === "string") {
          const argFilePath = tc.args.filePath;
          const segments = argFilePath.split("/");
          for (let i = segments.length - 1; i >= 2; i--) {
            const candidate = segments.slice(0, i).join("/");
            if (candidate.includes("/Users/") || candidate.includes("/home/")) {
              cwd = candidate;
              break;
            }
          }
          if (cwd) break;
        }
      }
    }
    if (cwd) break;
  }

  const repoName = cwd ? path.basename(cwd) : undefined;
  const start = messages[0]?.timestamp ?? new Date(fileMtimeMs).toISOString();
  const end = messages[messages.length - 1]?.timestamp ?? new Date(fileMtimeMs).toISOString();

  return {
    session: {
      source: "gemini-cli",
      session_id: record.sessionId,
      session_file: sessionFilePath,
      messages_count: record.messages.length,
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

export async function pullGeminiCliSessionFromFilePath(
  sessionFilePath: string,
  options: { readTextFile?: ReadTextFile; statFile?: StatFile } = {},
): Promise<PulledSessionPayload> {
  const readTextFile = options.readTextFile ?? defaultReadTextFile;
  const statFile = options.statFile ?? defaultStatFile;
  const [text, stats] = await Promise.all([readTextFile(sessionFilePath), statFile(sessionFilePath)]);
  const record = JSON.parse(text) as GeminiConversationRecord;
  return buildPulledPayload(record, sessionFilePath, stats.mtimeMs);
}

export interface CreateGeminiCliProviderOptions {
  projectsDir?: string;
  readTextFile?: ReadTextFile;
  readDir?: ReadDir;
  statFile?: StatFile;
}

export function createGeminiCliSessionProvider(
  options: CreateGeminiCliProviderOptions = {},
): SessionProvider {
  const projectsDir = options.projectsDir ?? defaultProjectsDir();
  const readTextFile = options.readTextFile ?? defaultReadTextFile;
  const readDirImpl = options.readDir ?? defaultReadDir;
  const statFile = options.statFile ?? defaultStatFile;

  return {
    id: "gemini-cli",
    async pullSession(sessionId: string): Promise<PulledSessionPayload> {
      const sessionFilePath = await findSessionFile(sessionId, projectsDir, readDirImpl);
      return pullGeminiCliSessionFromFilePath(sessionFilePath, { readTextFile, statFile });
    },
  };
}

async function findSessionFile(
  sessionId: string,
  projectsDir: string,
  readDirImpl: ReadDir,
): Promise<string> {
  let projectEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    projectEntries = await readDirImpl(projectsDir);
  } catch {
    throw new Error(`Gemini CLI session file not found for ${sessionId}`);
  }

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const chatsDir = path.join(projectsDir, entry.name, "chats");
    let chatEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      chatEntries = await readDirImpl(chatsDir);
    } catch {
      continue;
    }

    for (const chatEntry of chatEntries) {
      if (!chatEntry.isFile() || !chatEntry.name.startsWith("session-") || !chatEntry.name.endsWith(".json")) {
        continue;
      }

      if (
        chatEntry.name === sessionId ||
        chatEntry.name === `session-${sessionId}.json` ||
        chatEntry.name.includes(sessionId)
      ) {
        return path.join(chatsDir, chatEntry.name);
      }
    }
  }

  throw new Error(`Gemini CLI session file not found for ${sessionId}`);
}

async function listSessionFiles(projectsDir: string, readDirImpl: ReadDir): Promise<string[]> {
  const files: string[] = [];
  const projectEntries = await readDirImpl(projectsDir);

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }

    const chatsDir = path.join(projectsDir, projectEntry.name, "chats");
    let chatEntries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      chatEntries = await readDirImpl(chatsDir);
    } catch {
      continue;
    }

    for (const chatEntry of chatEntries) {
      if (!chatEntry.isFile() || !chatEntry.name.startsWith("session-") || !chatEntry.name.endsWith(".json")) {
        continue;
      }

      files.push(path.join(chatsDir, chatEntry.name));
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

export interface StartGeminiCliWatcherOptions {
  projectsDir?: string;
  idleMs?: number;
  pollIntervalMs?: number;
  retryDelayMs?: number;
  logger?: (message: string) => void;
  onReady(event: { sessionId: string; filePath: string; trigger: string }): void | Promise<void>;
  readDir?: ReadDir;
  statFile?: StatFile;
}

export interface GeminiCliWatcher {
  close(): void;
}

export function startGeminiCliWatcher(options: StartGeminiCliWatcherOptions): GeminiCliWatcher {
  const projectsDir = options.projectsDir ?? defaultProjectsDir();
  const logger = options.logger ?? (() => undefined);
  const idleMs = clampIdleMs(options.idleMs ?? Number(process.env.LOAM_GEMINI_IDLE_MS));
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
        logger(`[loam gemini-cli] watcher callback failed session_id=${sessionId} error=${message}`);
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
            const sessionId = path.basename(filePath, ".json");
            scheduleReady(sessionId, filePath, delayMs);
          }
          continue;
        }

        if (previousMtime !== undefined && fileStats.mtimeMs <= previousMtime) {
          continue;
        }

        const sessionId = path.basename(filePath, ".json");
        scheduleReady(sessionId, filePath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`[loam gemini-cli] watcher scan failed: ${message}`);
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
