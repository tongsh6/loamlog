import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { afterEach, describe, test } from "node:test";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SessionProvider } from "@loamlog/core";
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

describe("daemon /capture", () => {
  test("accepts valid payload and returns 202", async () => {
    const captured: string[] = [];
    const started = await startDaemon({
      port: 0,
      logger: () => {
        return;
      },
      onCapture: (payload) => {
        captured.push(payload.session_id);
      },
    });
    server = started.server;

    const response = await fetch(`http://127.0.0.1:${started.port}/capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session_id: "ses_demo_001",
        trigger: "session.idle",
        captured_at: new Date().toISOString(),
        provider: "opencode",
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(captured, ["ses_demo_001"]);
  });

  test("rejects invalid payload", async () => {
    const started = await startDaemon({ port: 0, logger: () => undefined });
    server = started.server;

    const response = await fetch(`http://127.0.0.1:${started.port}/capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ foo: "bar" }),
    });

    assert.equal(response.status, 400);
  });

  test("writes minimal snapshot JSON when dumpDir is configured", async () => {
    tempDumpDir = await mkdtemp(path.join(tmpdir(), "loamlog-m1-"));

    const provider: SessionProvider = {
      id: "opencode",
      async pullSession(sessionId) {
        return {
          session: { id: sessionId, source: "test" },
          messages: [
            {
              id: "msg-1",
              role: "assistant",
              timestamp: "2026-03-02T00:00:00.000Z",
              content: "hello token sk-abcdefghijklmnopqrstuvwxyz",
            },
          ],
          context: {
            cwd: "D:/repo",
            worktree: "D:/repo",
            repo: "demo/repo",
            branch: "main",
            dirty: false,
          },
          time_range: {
            start: "2026-03-02T00:00:00.000Z",
            end: "2026-03-02T00:00:01.000Z",
          },
        };
      },
    };

    const started = await startDaemon({
      port: 0,
      dumpDir: tempDumpDir,
      sessionProvider: provider,
      logger: () => undefined,
    });
    server = started.server;

    const response = await fetch(`http://127.0.0.1:${started.port}/capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session_id: "ses_m1_001",
        trigger: "session.idle",
        captured_at: "2026-03-02T00:00:02.000Z",
        provider: "opencode",
      }),
    });

    assert.equal(response.status, 202);
    const body = (await response.json()) as { snapshot_path?: string; accepted: boolean };
    assert.equal(body.accepted, true);
    assert.equal(typeof body.snapshot_path, "string");

    const snapshotText = await readFile(body.snapshot_path as string, "utf8");
    assert.equal(snapshotText.includes("\"session_id\": \"ses_m1_001\""), true);
    assert.equal(snapshotText.includes("\"redacted\""), true);
    assert.equal(snapshotText.includes("[REDACTED:openai-token]"), true);
  });
});
