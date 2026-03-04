import { appendFileSync } from "fs";
import type { PulledSessionPayload, SessionArtifactPart } from "@loamlog/core";

// ---------------------------------------------------------------------------
// Minimal OpenCode SDK client types (injected by the plugin runtime)
// ---------------------------------------------------------------------------

interface SessionRow {
  info?: { id: string; role: string; time?: { created?: number } };
  parts?: MessagePart[];
  // flat variants (some SDK versions)
  id?: string;
  role?: string;
  time?: { created?: number };
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "file"; mime?: string; filename?: string }
  | { type: "tool"; tool?: string; callID?: string; state?: ToolState };

interface ToolState {
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
}

interface OpenCodeClient {
  session: {
    get(opts: { path: { id: string } }): Promise<{ data?: Record<string, unknown> }>;
    messages(opts: { path: { id: string } }): Promise<{ data?: SessionRow[] }>;
  };
  path: {
    get(): Promise<{ data?: { directory?: string; worktree?: string } }>;
  };
  vcs: {
    get(): Promise<{ data?: { branch?: string } }>;
  };
}

interface OpenCodeEvent {
  type: string;
  properties?: { sessionID?: string };
}

// ---------------------------------------------------------------------------
// Debug logging (writes to LOAM_DEBUG_LOG or /tmp/loamlog-debug.log)
// ---------------------------------------------------------------------------

const DEBUG_LOG = process.env.LOAM_DEBUG_LOG ?? "/tmp/loamlog-debug.log";
const DAEMON_URL = process.env.LOAM_DAEMON_URL ?? "http://127.0.0.1:37468";
const CAPTURE_PATH = "/capture";

function debugLog(msg: string): void {
  try {
    appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {
    // Never crash the host
  }
}

// ---------------------------------------------------------------------------
// Payload mapping helpers
// ---------------------------------------------------------------------------

function toIsoTime(value: unknown, fallback: string): string {
  if (!value || !Number.isFinite(value as number)) return fallback;
  return new Date(value as number).toISOString();
}

function extractTextContent(parts: MessagePart[] | undefined): string | undefined {
  const texts: string[] = [];
  for (const part of parts ?? []) {
    if ((part.type === "text" || part.type === "reasoning") && "text" in part) {
      texts.push(part.text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function mapPart(part: MessagePart): SessionArtifactPart | undefined {
  if (part.type === "text" && "text" in part) return { type: "text", text: part.text };
  if (part.type === "reasoning" && "text" in part) return { type: "reasoning", text: part.text };
  if (part.type === "file") {
    return {
      type: "file",
      mime: typeof part.mime === "string" ? part.mime : "application/octet-stream",
      filename: typeof part.filename === "string" ? part.filename : undefined,
    };
  }
  if (part.type === "tool") {
    const state = part.state && typeof part.state === "object" ? part.state : undefined;
    return {
      type: "tool",
      name: typeof part.tool === "string" ? part.tool : "unknown",
      input: state?.input ?? {},
      output: typeof state?.output === "string" ? state.output : undefined,
      error: typeof state?.error === "string" ? state.error : undefined,
    };
  }
  return undefined;
}

function mapMessages(rows: SessionRow[], now: string): PulledSessionPayload["messages"] {
  return rows.map((row) => {
    const info = row.info ?? row;
    const parts = (row.parts ?? []).map(mapPart).filter((p): p is NonNullable<typeof p> => p != null);
    return {
      id: info.id ?? "",
      role: (info.role ?? "unknown") as "user" | "assistant",
      timestamp: toIsoTime(info.time?.created, now),
      content: extractTextContent(row.parts),
      parts,
    };
  });
}

function mapToolCalls(rows: SessionRow[]): NonNullable<PulledSessionPayload["tools"]> {
  const calls: NonNullable<PulledSessionPayload["tools"]> = [];
  for (const row of rows) {
    for (const part of row.parts ?? []) {
      if (part.type !== "tool") continue;
      const state = part.state && typeof part.state === "object" ? part.state : undefined;
      const info = row.info ?? row;
      calls.push({
        id: typeof part.callID === "string" ? part.callID : `${info.id ?? "unknown"}-tool`,
        message_id: info.id ?? "",
        name: typeof part.tool === "string" ? part.tool : "unknown",
        input: state?.input ?? {},
        output: typeof state?.output === "string" ? state.output : undefined,
        error: typeof state?.error === "string" ? state.error : undefined,
      });
    }
  }
  return calls;
}

function inferRepoName(directory: string | undefined): string | undefined {
  if (!directory) return undefined;
  const parts = directory.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || undefined;
}

// ---------------------------------------------------------------------------
// Plugin export — OpenCode plugin runtime calls this with { client }
// ---------------------------------------------------------------------------

export const LoamlogPlugin = async ({ client }: { client: OpenCodeClient }) => {
  debugLog("LoamlogPlugin initialized");

  return {
    event: async ({ event }: { event: OpenCodeEvent }): Promise<void> => {
      debugLog(`event received: ${event.type} sessionID=${event.properties?.sessionID ?? "n/a"}`);
      if (event.type !== "session.idle") return;

      const sessionId = event.properties?.sessionID;
      if (!sessionId) {
        debugLog("session.idle but no sessionId, skipping");
        return;
      }

      try {
        const now = new Date().toISOString();

        const [sessionRes, messagesRes, pathRes, vcsRes] = await Promise.allSettled([
          client.session.get({ path: { id: sessionId } }),
          client.session.messages({ path: { id: sessionId } }),
          client.path.get(),
          client.vcs.get(),
        ]);

        debugLog(
          `sessionRes=${sessionRes.status} messagesRes=${messagesRes.status} ` +
            `pathRes=${pathRes.status} vcsRes=${vcsRes.status}`,
        );
        if (messagesRes.status === "rejected") debugLog(`messagesRes error: ${messagesRes.reason}`);
        if (sessionRes.status === "rejected") debugLog(`sessionRes error: ${sessionRes.reason}`);

        const sessionData =
          sessionRes.status === "fulfilled" ? (sessionRes.value.data ?? {}) : {};
        const messagesRaw =
          messagesRes.status === "fulfilled" && Array.isArray(messagesRes.value.data)
            ? messagesRes.value.data
            : [];
        const pathData =
          pathRes.status === "fulfilled" ? (pathRes.value.data ?? {}) : {};
        const vcsData =
          vcsRes.status === "fulfilled" ? (vcsRes.value.data ?? {}) : {};

        const messages = mapMessages(messagesRaw, now);
        const tools = mapToolCalls(messagesRaw);

        const pulled: PulledSessionPayload = {
          session: sessionData,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          context: {
            cwd: pathData.directory,
            worktree: pathData.worktree,
            repo: inferRepoName((sessionData["directory"] as string | undefined) ?? pathData.directory),
            branch: vcsData.branch,
          },
          time_range: {
            start: toIsoTime(sessionData["time"] != null && typeof sessionData["time"] === "object" ? (sessionData["time"] as { created?: number }).created : undefined, messages[0]?.timestamp ?? now),
            end: toIsoTime(sessionData["time"] != null && typeof sessionData["time"] === "object" ? (sessionData["time"] as { updated?: number }).updated : undefined, messages[messages.length - 1]?.timestamp ?? now),
          },
        };

        const res = await fetch(`${DAEMON_URL}${CAPTURE_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            trigger: event.type,
            captured_at: now,
            provider: "opencode",
            pulled,
          }),
        });
        debugLog(`POST to daemon: ${res.status}`);
      } catch (err) {
        debugLog(`error in session.idle handler: ${err}`);
        // Errors MUST NOT crash OpenCode
      }
    },
  };
};
