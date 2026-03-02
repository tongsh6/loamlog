import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { afterEach, describe, test } from "node:test";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SessionProvider } from "@loamlog/core";
import createOpenCodeBridgePlugin from "../../../plugins/opencode/src/index.js";
import { startDaemon } from "./daemon.js";

let server: Server | undefined;
let tempDumpDir: string | undefined;

afterEach(async () => {
  if (!server) {
    return;
  }

  const activeServer = server;
  server = undefined;

  await new Promise<void>((resolve, reject) => {
    activeServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (tempDumpDir) {
    const target = tempDumpDir;
    tempDumpDir = undefined;
    await rm(target, { recursive: true, force: true });
  }
});

async function findFirstJsonFile(dir: string): Promise<string | undefined> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstJsonFile(fullPath);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      return fullPath;
    }
  }

  return undefined;
}

describe("M0 flow: plugin -> daemon", () => {
  test("forwards idle event to /capture and daemon prints session id", async () => {
    tempDumpDir = await mkdtemp(path.join(tmpdir(), "loamlog-m1-e2e-"));

    const provider: SessionProvider = {
      id: "opencode",
      async pullSession(sessionId) {
        return {
          session: { id: sessionId, source: "test" },
          messages: [
            {
              id: "msg-e2e-1",
              role: "assistant",
              timestamp: "2026-03-02T00:00:00.000Z",
              content: "e2e payload",
            },
          ],
          context: {
            cwd: "D:/repo",
            worktree: "D:/repo",
            repo: "demo/repo",
          },
        };
      },
    };

    const captured: string[] = [];
    const started = await startDaemon({
      port: 0,
      dumpDir: tempDumpDir,
      sessionProvider: provider,
      logger: () => {
        return;
      },
      onCapture: (payload) => {
        captured.push(payload.session_id);
      },
    });
    server = started.server;

    const plugin = await createOpenCodeBridgePlugin({
      daemonUrl: `http://127.0.0.1:${started.port}`,
      log: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await plugin.event({
      event: {
        type: "session.idle",
        session_id: "ses_m0_e2e_001",
      },
    });

    assert.deepEqual(captured, ["ses_m0_e2e_001"]);

    const snapshotPath = await findFirstJsonFile(tempDumpDir);
    assert.equal(typeof snapshotPath, "string");

    const snapshotText = await readFile(snapshotPath as string, "utf8");
    assert.equal(snapshotText.includes("\"session_id\": \"ses_m0_e2e_001\""), true);
  });
});
