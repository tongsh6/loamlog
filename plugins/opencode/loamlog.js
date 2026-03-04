import { appendFileSync } from "fs";

/**
 * Loamlog bridge plugin for OpenCode
 *
 * Uses the OpenCode SDK client to fetch full session data on idle,
 * then pushes it to the loam daemon. The daemon does NOT need to
 * know OpenCode's address or port.
 *
 * Prerequisites:
 *   export LOAM_DUMP_DIR=~/loamlog-archive
 *   loam daemon --providers opencode
 */

const DAEMON_URL = process.env.LOAM_DAEMON_URL ?? "http://127.0.0.1:37468";
const CAPTURE_PATH = "/capture";

function toIsoTime(value, fallback) {
  if (!value || !Number.isFinite(value)) return fallback;
  return new Date(value).toISOString();
}

function extractTextContent(parts) {
  const texts = [];
  for (const part of parts ?? []) {
    if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") {
      texts.push(part.text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function mapPart(part) {
  if (part.type === "text" && typeof part.text === "string")
    return { type: "text", text: part.text };
  if (part.type === "reasoning" && typeof part.text === "string")
    return { type: "reasoning", text: part.text };
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

function mapMessages(rows, now) {
  return rows.map((row) => {
    const info = row.info ?? row;
    const parts = (row.parts ?? []).map(mapPart).filter(Boolean);
    return {
      id: info.id,
      role: info.role,
      timestamp: toIsoTime(info.time?.created, now),
      content: extractTextContent(row.parts),
      parts,
    };
  });
}

function mapToolCalls(rows) {
  const calls = [];
  for (const row of rows) {
    for (const part of row.parts ?? []) {
      if (part.type !== "tool") continue;
      const state = part.state && typeof part.state === "object" ? part.state : undefined;
      calls.push({
        id: typeof part.callID === "string" ? part.callID : `${(row.info ?? row).id}-tool`,
        message_id: (row.info ?? row).id,
        name: typeof part.tool === "string" ? part.tool : "unknown",
        input: state?.input ?? {},
        output: typeof state?.output === "string" ? state.output : undefined,
        error: typeof state?.error === "string" ? state.error : undefined,
      });
    }
  }
  return calls;
}

function inferRepoName(directory) {
  if (!directory) return undefined;
  const normalized = directory.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || undefined;
}


const DEBUG_LOG = process.env.LOAM_DEBUG_LOG ?? "/tmp/loamlog-debug.log";

function debugLog(msg) {
  try {
    appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

export const LoamlogPlugin = async ({ client }) => {
  debugLog("LoamlogPlugin initialized");
  return {
    event: async ({ event }) => {
      debugLog(`event received: ${event.type} sessionID=${event.properties?.sessionID ?? 'n/a'}`);
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

        debugLog(`sessionRes=${sessionRes.status} messagesRes=${messagesRes.status} pathRes=${pathRes.status} vcsRes=${vcsRes.status}`);
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

        const pulled = {
          session: sessionData,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          context: {
            cwd: pathData.directory,
            worktree: pathData.worktree,
            repo: inferRepoName(sessionData.directory ?? pathData.directory),
            branch: vcsData.branch,
          },
          time_range: {
            start: toIsoTime(sessionData.time?.created, messages[0]?.timestamp ?? now),
            end: toIsoTime(
              sessionData.time?.updated,
              messages[messages.length - 1]?.timestamp ?? now,
            ),
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
      } catch (_err) {
        debugLog(`error in session.idle handler: ${_err}`);
        // Errors MUST NOT crash OpenCode
      }
    },
  };
};
