import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { writeSessionSnapshot } from "@loamlog/archive";
import {
  CAPTURE_PATH,
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  applySnapshotRedaction,
  buildSessionSnapshot,
  parseRedactIgnore,
  type CaptureRequest,
  type SessionProvider,
  isCaptureRequest,
} from "@loamlog/core";
import { createOpencodeSessionProvider } from "@loamlog/provider-opencode";

export interface StartDaemonOptions {
  host?: string;
  port?: number;
  dumpDir?: string;
  logger?: (message: string) => void;
  onCapture?: (payload: CaptureRequest) => void;
  sessionProvider?: SessionProvider;
}

export interface StartedDaemon {
  host: string;
  port: number;
  server: Server;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as unknown;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export async function startDaemon(options: StartDaemonOptions = {}): Promise<StartedDaemon> {
  const host = options.host ?? DEFAULT_DAEMON_HOST;
  const port = options.port ?? DEFAULT_DAEMON_PORT;
  const logger = options.logger ?? ((message: string) => console.log(message));
  const dumpDir = options.dumpDir ?? process.env.LOAM_DUMP_DIR;
  const sessionProvider = options.sessionProvider ?? createOpencodeSessionProvider();
  const redactIgnorePatterns = parseRedactIgnore(process.env.LOAM_REDACT_IGNORE);

  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === CAPTURE_PATH) {
      try {
        const payload = await readJsonBody(req);

        if (!isCaptureRequest(payload)) {
          sendJson(res, 400, {
            accepted: false,
            error: "invalid capture payload",
          });
          return;
        }

        logger(`[loam daemon] captured session_id=${payload.session_id} trigger=${payload.trigger} provider=${payload.provider}`);
        options.onCapture?.(payload);

        if (!dumpDir) {
          logger("[loam daemon] LOAM_DUMP_DIR is not configured; skip snapshot write");
          sendJson(res, 202, { accepted: true, session_id: payload.session_id });
          return;
        }

        const pulled = payload.pulled ?? await sessionProvider.pullSession(payload.session_id);
        const snapshot = buildSessionSnapshot({
          capture: payload,
          pulled,
        });
        const redacted = applySnapshotRedaction(snapshot, redactIgnorePatterns);

        const persisted = await writeSessionSnapshot({
          dumpDir,
          snapshot: redacted.snapshot,
        });

        logger(`[loam daemon] snapshot saved path=${persisted.jsonPath} redacted_count=${redacted.redacted_count}`);
        sendJson(res, 202, {
          accepted: true,
          session_id: payload.session_id,
          snapshot_path: persisted.jsonPath,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected daemon error";
        logger(`[loam daemon] capture failed: ${message}`);
        sendJson(res, 400, {
          accepted: false,
          error: message,
        });
        return;
      }
    }

    sendJson(res, 404, { accepted: false, error: "not found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    host,
    port: address.port,
    server,
  };
}
