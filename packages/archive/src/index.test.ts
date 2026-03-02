import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { SessionSnapshot } from "@loamlog/core";
import { writeSessionSnapshot } from "./index.js";

let tempDumpDir: string | undefined;

afterEach(async () => {
  if (!tempDumpDir) {
    return;
  }

  const target = tempDumpDir;
  tempDumpDir = undefined;
  await rm(target, { recursive: true, force: true });
});

describe("writeSessionSnapshot", () => {
  test("writes snapshot to repo bucket path", async () => {
    tempDumpDir = await mkdtemp(path.join(tmpdir(), "loamlog-archive-"));

    const snapshot: SessionSnapshot = {
      schema_version: "1.0",
      meta: {
        session_id: "ses_archive_001",
        captured_at: "2026-03-02T00:00:00.000Z",
        capture_trigger: "session.idle",
        aic_version: "0.1.0",
        provider: "opencode",
      },
      context: {
        cwd: "D:/repo",
        worktree: "D:/repo",
        repo: "demo/repo",
      },
      time_range: {
        start: "2026-03-02T00:00:00.000Z",
        end: "2026-03-02T00:00:01.000Z",
      },
      session: { id: "ses_archive_001" },
      messages: [],
      redacted: {
        patterns_applied: [],
        redacted_count: 0,
      },
    };

    const output = await writeSessionSnapshot({
      dumpDir: tempDumpDir,
      snapshot,
    });

    assert.equal(output.jsonPath.includes(path.join("repos", "demo_repo", "sessions")), true);

    const text = await readFile(output.jsonPath, "utf8");
    assert.equal(text.includes("\"session_id\": \"ses_archive_001\""), true);
  });
});
