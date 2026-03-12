import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { writeSessionSnapshot } from "@loamlog/archive";
import {
  CAPTURE_PATH,
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  buildSessionSnapshot,
  type CaptureRequest,
  type SessionProvider,
  isCaptureRequest,
} from "@loamlog/core";
import { applySnapshotRedaction, parseRedactIgnore } from "@loamlog/sanitizer";
import { createOpencodeSessionProvider } from "@loamlog/provider-opencode";

export interface StartDaemonOptions {
  host?: string;
  port?: number;
  dumpDir?: string;
  logger?: (message: string) => void;
  onCapture?: (payload: CaptureRequest) => void;
  sessionProvider?: SessionProvider;
  sessionProviders?: Record<string, SessionProvider>;
}

export interface StartedDaemon {
  host: string;
  port: number;
  server: Server;
}

interface ProcessCaptureOptions {
  dumpDir?: string;
  logger?: (message: string) => void;
  onCapture?: (payload: CaptureRequest) => void;
  sessionProvider?: SessionProvider;
  sessionProviders?: Record<string, SessionProvider>;
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

function resolveSessionProviders(options: ProcessCaptureOptions): Record<string, SessionProvider> {
  if (options.sessionProviders && Object.keys(options.sessionProviders).length > 0) {
    return options.sessionProviders;
  }

  if (options.sessionProvider) {
    return { [options.sessionProvider.id]: options.sessionProvider };
  }

  const provider = createOpencodeSessionProvider();
  return { [provider.id]: provider };
}

export async function processCaptureRequest(
  payload: CaptureRequest,
  options: ProcessCaptureOptions = {},
): Promise<{ accepted: boolean; session_id?: string; snapshot_path?: string; error?: string }> {
  const logger = options.logger ?? ((message: string) => console.log(message));
  const dumpDir = options.dumpDir ?? process.env.LOAM_DUMP_DIR;
  const redactIgnorePatterns = parseRedactIgnore(process.env.LOAM_REDACT_IGNORE);
  const sessionProviders = resolveSessionProviders(options);

  logger(`[loam daemon] captured session_id=${payload.session_id} trigger=${payload.trigger} provider=${payload.provider}`);
  options.onCapture?.(payload);

  if (!dumpDir) {
    logger("[loam daemon] LOAM_DUMP_DIR is not configured; skip snapshot write");
    return { accepted: true, session_id: payload.session_id };
  }

  try {
    const provider = sessionProviders[payload.provider];
    if (!payload.pulled && !provider) {
      throw new Error(`unknown provider: ${payload.provider}`);
    }

    const pulled = payload.pulled ?? (await provider.pullSession(payload.session_id));
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
    return {
      accepted: true,
      session_id: payload.session_id,
      snapshot_path: persisted.jsonPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected daemon error";
    logger(`[loam daemon] capture failed: ${message}`);
    return {
      accepted: false,
      error: message,
    };
  }
}

export async function startDaemon(options: StartDaemonOptions = {}): Promise<StartedDaemon> {
  const host = options.host ?? DEFAULT_DAEMON_HOST;
  const port = options.port ?? DEFAULT_DAEMON_PORT;

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

        const result = await processCaptureRequest(payload, options);
        sendJson(res, result.accepted ? 202 : 400, result);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unexpected daemon error";
        const logger = options.logger ?? ((line: string) => console.log(line));
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
