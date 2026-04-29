# Loamlog 狗粮验证阶段 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `loam list` 命令和 Gemini CLI provider，让狗粮验证阶段有工具可用、有足够覆盖的采集面。

**Architecture:** Gemini CLI provider 完全复用 Claude Code provider 的文件系统 watcher 模式（轮询 → idle 检测 → POST /capture）。`loam list` 是纯文件系统读取的新 CLI 子命令，不依赖任何新包。

**Tech Stack:** TypeScript, Node.js ≥20, pnpm workspace monorepo, native `node:fs/promises`

---

## 文件结构

```
新增:
  packages/providers/gemini-cli/
    package.json                         # @loamlog/provider-gemini-cli
    tsconfig.json                        # extends ../../tsconfig.base.json
    src/
      index.ts                          # SessionProvider + startWatcher + pullFromFilePath
      index.test.ts                     # fixture 驱动测试
      __fixtures__/
        sample-session.json             # 完整 Gemini CLI 会话样本
  packages/cli/src/
    list.ts                             # loam list 命令实现

修改:
  packages/cli/src/index.ts             # 注册 "list" 命令; 集成 gemini-cli watcher
  packages/cli/src/providers.ts         # 注册 "gemini-cli" → createGeminiCliSessionProvider
  packages/cli/package.json             # 添加 @loamlog/provider-gemini-cli 依赖
```

---

### Task 1: Gemini CLI Provider — 包脚手架

**Files:**
- Create: `packages/providers/gemini-cli/package.json`
- Create: `packages/providers/gemini-cli/tsconfig.json`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@loamlog/provider-gemini-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@loamlog/core": "workspace:*"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 fixture 目录和 sample session JSON**

参考 Gemini CLI `ConversationRecord` 格式，包含 user/gemini/info 三种消息类型、toolCalls、thoughts、tokens。

```json
{
  "sessionId": "test-session-001",
  "messages": [
    {
      "id": "msg-001",
      "type": "user",
      "timestamp": "2026-04-29T10:00:00.000Z",
      "content": {
        "parts": [{ "text": "帮我重构 packages/core/src/index.ts 里的类型定义" }],
        "role": "user"
      }
    },
    {
      "id": "msg-002",
      "type": "gemini",
      "timestamp": "2026-04-29T10:00:05.000Z",
      "model": "gemini-2.5-pro",
      "content": {
        "parts": [{ "text": "好的，我先看一下现有的类型定义。" }],
        "role": "model"
      },
      "toolCalls": [
        {
          "id": "call-001",
          "name": "read_file",
          "args": { "filePath": "/Users/dev/project/packages/core/src/index.ts" },
          "result": {
            "parts": [{ "text": "import type { JSONSchema7 } from \"json-schema\";\n\nexport interface CaptureRequest { ... }" }]
          },
          "status": "success",
          "timestamp": "2026-04-29T10:00:03.000Z",
          "displayName": "Read file"
        }
      ],
      "thoughts": [
        { "text": "我需要先读取现有文件来了解类型定义的结构。", "timestamp": "2026-04-29T10:00:02.000Z" }
      ],
      "tokens": {
        "input": 1500,
        "output": 200,
        "cached": 800,
        "thoughts": 100,
        "total": 1700
      }
    },
    {
      "id": "msg-003",
      "type": "gemini",
      "timestamp": "2026-04-29T10:00:20.000Z",
      "model": "gemini-2.5-pro",
      "content": {
        "parts": [{ "text": "我建议将 CaptureRequest 拆分为更小的接口，提高可组合性。" }],
        "role": "model"
      },
      "tokens": {
        "input": 2000,
        "output": 350,
        "cached": 1200,
        "thoughts": 0,
        "total": 2350
      }
    },
    {
      "id": "msg-004",
      "type": "user",
      "timestamp": "2026-04-29T10:01:00.000Z",
      "content": {
        "parts": [{ "text": "可以，开始重构吧" }],
        "role": "user"
      }
    },
    {
      "id": "msg-005",
      "type": "info",
      "timestamp": "2026-04-29T10:05:00.000Z",
      "content": {
        "parts": [{ "text": "Session auto-saved" }],
        "role": "system"
      }
    }
  ]
}
```

- [ ] **Step 4: 安装依赖并验证包结构**

```bash
cd packages/providers/gemini-cli && pnpm install
```

预期：无错误。

- [ ] **Step 5: Commit**

```bash
git add packages/providers/gemini-cli/package.json \
        packages/providers/gemini-cli/tsconfig.json \
        packages/providers/gemini-cli/src/__fixtures__/sample-session.json
git commit -m "feat: scaffold gemini-cli provider package"
```

---

### Task 2: Gemini CLI Provider — 核心实现

**Files:**
- Create: `packages/providers/gemini-cli/src/index.ts`

- [ ] **Step 1: 定义 Gemini CLI 数据类型**

```typescript
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
```

- [ ] **Step 2: 实现工具函数**

```typescript
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
```

- [ ] **Step 3: 实现会话解析函数 `buildPulledPayload`**

```typescript
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

    // Map thoughts → reasoning parts
    if (msg.thoughts && msg.thoughts.length > 0) {
      for (const thought of msg.thoughts) {
        if (typeof thought.text === "string" && thought.text.trim().length > 0) {
          parts.push({ type: "reasoning", text: thought.text });
        }
      }
    }

    // Map toolCalls → tool parts + SessionToolCall[]
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

  // Infer repo/context from tool call file paths
  let cwd: string | undefined;
  for (const msg of record.messages) {
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.args?.filePath && typeof tc.args.filePath === "string") {
          const argFilePath = tc.args.filePath;
          // Try to find a plausible project root
          const segments = argFilePath.split("/");
          // Look for common project markers
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
```

- [ ] **Step 4: 实现 `pullGeminiCliSessionFromFilePath`（公开导出）**

```typescript
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
```

- [ ] **Step 5: 实现 `createGeminiCliSessionProvider`**

```typescript
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
      // sessionId may be the full filename (session-<ts>-<id>.json) or just the UUID
      const sessionFilePath = await findSessionFile(sessionId, projectsDir, readDirImpl);
      return pullGeminiCliSessionFromFilePath(sessionFilePath, { readTextFile, statFile });
    },
  };
}
```

- [ ] **Step 6: 实现 `findSessionFile`**

```typescript
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

      // Match by filename or by session ID contained within
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
```

- [ ] **Step 7: 实现 `listSessionFiles` 和 `startGeminiCliWatcher`**

```typescript
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
```

- [ ] **Step 8: Commit**

```bash
git add packages/providers/gemini-cli/src/index.ts
git commit -m "feat: implement gemini-cli session provider and watcher"
```

---

### Task 3: Gemini CLI Provider — 测试

**Files:**
- Create: `packages/providers/gemini-cli/src/index.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pullGeminiCliSessionFromFilePath, createGeminiCliSessionProvider } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "__fixtures__", "sample-session.json");

describe("pullGeminiCliSessionFromFilePath", () => {
  it("parses a full Gemini CLI session with messages, toolCalls, and thoughts", async () => {
    const result = await pullGeminiCliSessionFromFilePath(fixturePath);

    assert.equal(result.session.source, "gemini-cli");
    assert.equal(result.session.session_id, "test-session-001");
    assert.ok(result.messages.length >= 4, `expected >= 4 messages, got ${result.messages.length}`);

    // user message
    const userMsg = result.messages.find((m) => m.role === "user");
    assert.ok(userMsg, "should have a user message");
    assert.ok(userMsg.content?.includes("重构"), `user content should mention 重构: ${userMsg.content}`);

    // assistant message with tool call
    const assistantMsg = result.messages.find((m) => m.role === "assistant" && m.parts?.some((p) => p.type === "tool"));
    assert.ok(assistantMsg, "should have an assistant message with tool call");
    assert.ok(assistantMsg.parts?.some((p) => p.type === "reasoning"), "should have reasoning parts");
    assert.ok(assistantMsg.parts?.some((p) => p.type === "tool"), "should have tool parts");

    // system message
    const systemMsg = result.messages.find((m) => m.role === "system");
    assert.ok(systemMsg, "should have a system message (info type)");

    // tool calls
    assert.ok(result.tools, "should have tools array");
    assert.ok(result.tools.length >= 1, `expected >= 1 tool, got ${result.tools?.length}`);
    const readFileTool = result.tools.find((t) => t.name === "read_file");
    assert.ok(readFileTool, "should have a read_file tool call");
    assert.ok(readFileTool.output, "read_file tool should have output");

    // context
    assert.ok(result.context?.repo, "should infer a repo from file paths");
    assert.ok(result.time_range?.start, "should have time_range.start");
    assert.ok(result.time_range?.end, "should have time_range.end");
  });

  it("handles a session without toolCalls", async () => {
    const minimalRecord = {
      sessionId: "minimal-session",
      messages: [
        {
          id: "msg-001",
          type: "user",
          timestamp: "2026-04-29T10:00:00.000Z",
          content: { parts: [{ text: "hello" }], role: "user" },
        },
        {
          id: "msg-002",
          type: "gemini",
          timestamp: "2026-04-29T10:00:05.000Z",
          content: { parts: [{ text: "hi there" }], role: "model" },
        },
      ],
    };

    const { mkdir, rm, writeFile } = await import("node:fs/promises");
    const os = await import("node:os");
    const tmpDir = path.join(os.tmpdir(), `loam-gemini-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "minimal-session.json");
    await writeFile(tmpFile, JSON.stringify(minimalRecord, null, 2));
    try {
      const result = await pullGeminiCliSessionFromFilePath(tmpFile);
      assert.equal(result.messages.length, 2);
      assert.equal(result.messages[0].role, "user");
      assert.equal(result.messages[1].role, "assistant");
      assert.equal(result.tools, undefined);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles a session with error-type message", async () => {
    const errorRecord = {
      sessionId: "error-session",
      messages: [
        {
          id: "msg-001",
          type: "user",
          timestamp: "2026-04-29T10:00:00.000Z",
          content: { parts: [{ text: "do something" }], role: "user" },
        },
        {
          id: "msg-002",
          type: "error",
          timestamp: "2026-04-29T10:00:05.000Z",
          content: { parts: [{ text: "API rate limit exceeded" }], role: "system" },
        },
      ],
    };

    const { mkdir, rm, writeFile } = await import("node:fs/promises");
    const os = await import("node:os");
    const tmpDir = path.join(os.tmpdir(), `loam-gemini-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "error-session.json");
    await writeFile(tmpFile, JSON.stringify(errorRecord, null, 2));
    try {
      const result = await pullGeminiCliSessionFromFilePath(tmpFile);
      const errorMsg = result.messages.find((m) => m.role === "system");
      assert.ok(errorMsg, "should map error type to system role");
      assert.ok(errorMsg.content?.includes("rate limit"));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("createGeminiCliSessionProvider", () => {
  it("returns a provider with id gemini-cli", () => {
    const provider = createGeminiCliSessionProvider();
    assert.equal(provider.id, "gemini-cli");
  });

  it("throws when session file not found", async () => {
    const provider = createGeminiCliSessionProvider({
      projectsDir: "/nonexistent/path",
    });
    await assert.rejects(
      () => provider.pullSession("nonexistent-session-id"),
      /session file not found/,
    );
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd packages/providers/gemini-cli && node --import tsx --test src/index.test.ts
```

预期：测试通过。

- [ ] **Step 3: Commit**

```bash
git add packages/providers/gemini-cli/src/index.test.ts
git commit -m "test: add gemini-cli provider tests"
```

---

### Task 4: Gemini CLI Provider — CLI 集成

**Files:**
- Modify: `packages/cli/src/providers.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: 在 providers.ts 中注册 gemini-cli**

在 `packages/cli/src/providers.ts` 中添加 import 和分支：

```typescript
import type { SessionProvider } from "@loamlog/core";
import { createClaudeCodeSessionProvider } from "@loamlog/provider-claude-code";
import { createGeminiCliSessionProvider } from "@loamlog/provider-gemini-cli";
import { createOpencodeSessionProvider } from "@loamlog/provider-opencode";

const DEFAULT_PROVIDERS = ["opencode"];

export function parseProviderList(raw: string | undefined): string[] {
  if (!raw) {
    return [...DEFAULT_PROVIDERS];
  }

  const providerIds = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (providerIds.length === 0) {
    return [...DEFAULT_PROVIDERS];
  }

  return Array.from(new Set(providerIds));
}

export function createSessionProviders(providerIds: string[]): Record<string, SessionProvider> {
  const providers: Record<string, SessionProvider> = {};

  for (const providerId of providerIds) {
    if (providerId === "opencode") {
      providers[providerId] = createOpencodeSessionProvider();
      continue;
    }

    if (providerId === "claude-code") {
      providers[providerId] = createClaudeCodeSessionProvider();
      continue;
    }

    if (providerId === "gemini-cli") {
      providers[providerId] = createGeminiCliSessionProvider();
      continue;
    }

    throw new Error(`unknown provider: ${providerId}`);
  }

  return providers;
}
```

- [ ] **Step 2: 更新 CLI package.json 添加依赖**

在 `packages/cli/package.json` 的 `dependencies` 中添加：

```json
"@loamlog/provider-gemini-cli": "workspace:*"
```

- [ ] **Step 3: 在 index.ts 中集成 gemini-cli watcher**

在 `packages/cli/src/index.ts` 中添加 import：

```typescript
import { pullGeminiCliSessionFromFilePath, startGeminiCliWatcher } from "@loamlog/provider-gemini-cli";
```

在 daemon 启动后、claude-code watcher 之后添加 gemini-cli watcher：

```typescript
const watchers: Array<{ close(): void }> = [];

if (providerIds.includes("claude-code")) {
  const watcher = startClaudeCodeWatcher({
    // ... existing claude-code watcher setup
  });
  watchers.push(watcher);
  console.log("[loam daemon] enabled provider watcher: claude-code");
}

if (providerIds.includes("gemini-cli")) {
  const watcher = startGeminiCliWatcher({
    logger(message) {
      console.log(message);
    },
    onReady: async (event) => {
      const pulled = await pullGeminiCliSessionFromFilePath(event.filePath);
      const response = await fetch(`http://${started.host}:${started.port}/capture`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          session_id: event.sessionId,
          trigger: event.trigger,
          captured_at: new Date().toISOString(),
          provider: "gemini-cli",
          pulled,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `[loam gemini-cli] watcher capture failed session_id=${event.sessionId} file_path=${event.filePath} status=${response.status} body=${text}`,
        );
      }
    },
  });
  watchers.push(watcher);
  console.log("[loam daemon] enabled provider watcher: gemini-cli");
}
```

更新 graceful close 逻辑：

```typescript
const gracefulClose = () => {
  for (const w of watchers) {
    w.close();
  }
  started.server.close(() => {
    process.exit(0);
  });
};
```

- [ ] **Step 4: 安装依赖并构建**

```bash
pnpm install && pnpm --filter @loamlog/provider-gemini-cli run build && pnpm --filter @loamlog/cli run build
```

预期：无编译错误。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/providers.ts packages/cli/src/index.ts packages/cli/package.json pnpm-lock.yaml
git commit -m "feat: integrate gemini-cli provider into CLI daemon"
```

---

### Task 5: `loam list` — 核心实现

**Files:**
- Create: `packages/cli/src/list.ts`

- [ ] **Step 1: 实现 list 命令**

```typescript
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

interface ListOptions {
  dumpDir: string;
  repo?: string;
  since?: string;
  distill?: boolean;
  pending?: boolean;
  limit: number;
  json: boolean;
}

interface SessionSummary {
  session_id: string;
  provider: string;
  repo: string;
  captured_at: string;
  messages_count: number;
  redacted_count: number;
}

interface DistillResultSummary {
  id: string;
  type: string;
  title: string;
  confidence: number;
  distiller_id: string;
  repo: string;
}

function sanitizeRepoName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parseDuration(value: string): number {
  const match = value.match(/^(\d+)(h|d|w)$/);
  if (!match) {
    throw new Error(`invalid duration: ${value}; expected format like 24h, 7d, 30d`);
  }

  const num = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "h":
      return num * 60 * 60 * 1000;
    case "d":
      return num * 24 * 60 * 60 * 1000;
    case "w":
      return num * 7 * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`unknown duration unit: ${unit}`);
  }
}

async function listRepos(dumpDir: string): Promise<string[]> {
  const reposRoot = path.join(dumpDir, "repos");
  let entries;
  try {
    entries = await readdir(reposRoot, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listSessions(
  dumpDir: string,
  opts: ListOptions,
): Promise<SessionSummary[]> {
  const results: SessionSummary[] = [];
  const sinceTs = opts.since ? Date.now() - parseDuration(opts.since) : undefined;

  const repoDirs = opts.repo
    ? [sanitizeRepoName(opts.repo)]
    : await listRepos(dumpDir);

  for (const repoDir of repoDirs) {
    const sessionsDir = path.join(dumpDir, "repos", repoDir, "sessions");
    let entries;
    try {
      entries = await readdir(sessionsDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const jsonFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort()
      .reverse(); // newest first

    for (const fileName of jsonFiles) {
      if (results.length >= opts.limit) {
        break;
      }

      const filePath = path.join(sessionsDir, fileName);
      let text: string;
      try {
        text = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      let parsed: { meta?: Record<string, unknown>; messages?: unknown[]; redacted?: Record<string, unknown> };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        continue;
      }

      const meta = parsed.meta;
      if (!meta || typeof meta.session_id !== "string") {
        continue;
      }

      const capturedAt = typeof meta.captured_at === "string" ? meta.captured_at : "";

      if (sinceTs) {
        const capturedTs = Date.parse(capturedAt);
        if (!Number.isNaN(capturedTs) && capturedTs < sinceTs) {
          continue;
        }
      }

      results.push({
        session_id: meta.session_id as string,
        provider: typeof meta.provider === "string" ? (meta.provider as string) : "unknown",
        repo: repoDir,
        captured_at: capturedAt,
        messages_count: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
        redacted_count:
          parsed.redacted && typeof parsed.redacted.redacted_count === "number"
            ? (parsed.redacted.redacted_count as number)
            : 0,
      });
    }
  }

  return results;
}

async function listDistillResults(
  dumpDir: string,
  opts: ListOptions,
): Promise<DistillResultSummary[]> {
  const results: DistillResultSummary[] = [];
  const sinceTs = opts.since ? Date.now() - parseDuration(opts.since) : undefined;

  const repoDirs = opts.repo
    ? [sanitizeRepoName(opts.repo)]
    : await listDistillRepos(dumpDir);

  for (const repoDir of repoDirs) {
    const typeDirs = opts.pending ? ["pending"] : ["pending", "approved", "rejected"];

    for (const typeDir of typeDirs) {
      const resultsDir = path.join(dumpDir, "distill", repoDir, typeDir);
      let entries;
      try {
        entries = await readdir(resultsDir, { withFileTypes: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          continue;
        }
        throw error;
      }

      const jsonFiles = entries
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name)
        .sort()
        .reverse();

      for (const fileName of jsonFiles) {
        if (results.length >= opts.limit) {
          break;
        }

        const filePath = path.join(resultsDir, fileName);
        let text: string;
        try {
          text = await readFile(filePath, "utf8");
        } catch {
          continue;
        }

        let parsed: {
          id?: string;
          type?: string;
          title?: string;
          confidence?: number;
          distiller_id?: string;
        };
        try {
          parsed = JSON.parse(text) as typeof parsed;
        } catch {
          continue;
        }

        if (!parsed.id) {
          continue;
        }

        results.push({
          id: parsed.id,
          type: typeof parsed.type === "string" ? parsed.type : "unknown",
          title: typeof parsed.title === "string" ? parsed.title : "(untitled)",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
          distiller_id: typeof parsed.distiller_id === "string" ? parsed.distiller_id : "unknown",
          repo: repoDir,
        });
      }
    }
  }

  return results;
}

async function listDistillRepos(dumpDir: string): Promise<string[]> {
  const distillRoot = path.join(dumpDir, "distill");
  let entries;
  try {
    entries = await readdir(distillRoot, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((header, colIdx) => {
    const maxDataWidth = rows.reduce((max, row) => Math.max(max, (row[colIdx] ?? "").length), 0);
    return Math.max(header.length, maxDataWidth);
  });

  const padRight = (str: string, width: number) => {
    return str + " ".repeat(Math.max(0, width - str.length));
  };

  const separator = colWidths.map((w) => "─".repeat(w)).join("  ");
  const headerLine = headers.map((h, i) => padRight(h, colWidths[i])).join("  ");

  const lines = [headerLine, separator];
  for (const row of rows) {
    lines.push(row.map((cell, i) => padRight(cell, colWidths[i])).join("  "));
  }
  lines.push(separator);

  return lines.join("\n");
}

function inferRepoFromCwd(): string | undefined {
  try {
    const cwd = process.cwd();
    return path.basename(cwd);
  } catch {
    return undefined;
  }
}

export async function runListCommand(args: string[]): Promise<void> {
  const dumpDir = getArg(args, "--dump-dir") ?? process.env.LOAM_DUMP_DIR;
  if (!dumpDir) {
    console.error("Error: LOAM_DUMP_DIR is not configured. Set env or pass --dump-dir");
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo") ?? inferRepoFromCwd();
  const since = getArg(args, "--since");
  const distill = args.includes("--distill");
  const pending = args.includes("--pending");
  const json = args.includes("--json");
  const limitRaw = getArg(args, "--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;

  if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
    console.error(`Error: invalid --limit value: ${limitRaw}`);
    process.exitCode = 1;
    return;
  }

  const opts: ListOptions = {
    dumpDir,
    repo,
    since,
    distill,
    pending,
    limit,
    json,
  };

  if (distill) {
    const results = await listDistillResults(dumpDir, opts);

    if (json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(`No distill results found${repo ? ` in ${repo}` : ""}`);
      return;
    }

    const headers = ["Result ID", "Type", "Title", "Confidence"];
    const rows = results.map((r) => [
      r.id,
      r.type,
      r.title.length > 50 ? r.title.slice(0, 47) + "..." : r.title,
      r.confidence.toFixed(2),
    ]);

    console.log(formatTable(headers, rows));
    const scope = repo ? ` in ${repo}` : "";
    const mode = pending ? "pending" : "all";
    console.log(`${results.length} ${mode} results${scope}`);
  } else {
    const sessions = await listSessions(dumpDir, opts);

    if (json) {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }

    if (sessions.length === 0) {
      console.log(`No sessions found${repo ? ` in ${repo}` : ""}`);
      return;
    }

    const headers = ["Session", "Provider", "Messages", "Time"];
    const rows = sessions.map((s) => [
      s.session_id.slice(0, 20),
      s.provider,
      String(s.messages_count),
      s.captured_at.slice(0, 16).replace("T", " "),
    ]);

    console.log(formatTable(headers, rows));
    console.log(`${sessions.length} sessions${repo ? ` in ${repo}` : ""}${opts.since ? ` (since ${opts.since})` : ""}`);
  }
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  return args[idx + 1];
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/list.ts
git commit -m "feat: add loam list command for session and distill browsing"
```

---

### Task 6: `loam list` — CLI 注册

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: 在 index.ts 注册 list 命令**

在 `packages/cli/src/index.ts` 中添加 list 命令的处理。找到 `if (command === "capture")` 附近，在前面添加：

```typescript
if (command === "list") {
  await runListCommand(args);
  return;
}
```

同时在文件顶部添加 import：

```typescript
import { runListCommand } from "./list.js";
```

更新 `printUsage` 添加 list 命令：

```typescript
console.log("  list    [--repo <name>] [--since <duration>] [--distill] [--pending] [--limit <n>] [--json] [--dump-dir <path>]");
```

- [ ] **Step 2: 构建并验证 CLI 可用**

```bash
pnpm --filter @loamlog/cli run build
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat: register loam list command in CLI"
```

---

### Task 7: 完整构建与测试

**Files:** (验证性任务，无文件变更)

- [ ] **Step 1: 全量构建**

```bash
pnpm run build
```

预期：所有包编译成功，无错误。

- [ ] **Step 2: 全量测试**

```bash
pnpm run test
```

预期：所有 18+ 测试通过（含新增的 gemini-cli 测试）。

- [ ] **Step 3: Typecheck**

```bash
pnpm run typecheck
```

预期：无类型错误。

- [ ] **Step 4: 手动 smoke test — `loam list` 用法**

```bash
# 确认 help 显示 list 命令
node packages/cli/dist/index.js --help 2>&1 | grep -q "list" && echo "PASS" || echo "FAIL"

# 确认 list 命令能运行（即使没有数据）
LOAM_DUMP_DIR=/tmp/loamlog-smoke-test node packages/cli/dist/index.js list 2>&1 || true
```

- [ ] **Step 5: Commit（如有未提交变更）**

```bash
git status
```

---

### Task 8: 启动狗粮采集（零代码）

- [ ] **Step 1: 设置环境变量**

在 `~/.zshrc` 或当前 shell 中：

```bash
export LOAM_DUMP_DIR=~/loamlog-archive
mkdir -p "$LOAM_DUMP_DIR"
```

- [ ] **Step 2: 启动 daemon**

```bash
loam daemon --providers opencode,claude-code,gemini-cli
```

预期日志：

```
[loam daemon] listening on http://127.0.0.1:37468
[loam daemon] enabled provider watcher: claude-code
[loam daemon] enabled provider watcher: gemini-cli
```

- [ ] **Step 3: 验证采集**

运行一次手动采集测试后，检查：

```bash
loam list --limit 5
```

- [ ] **Step 4: 启动 daemon 为后台进程**

```bash
# 使用 tmux/screen 或 nohup 后台运行
nohup loam daemon --providers opencode,claude-code,gemini-cli > /tmp/loam-daemon.log 2>&1 &
```
