import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { SessionSnapshot } from "@loamlog/core";
import { readSessionSnapshots, writeSessionSnapshot } from "./index.js";

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

  test("reads snapshots with filters", async () => {
    tempDumpDir = await mkdtemp(path.join(tmpdir(), "loamlog-archive-"));

    const snapshotA: SessionSnapshot = {
      schema_version: "1.0",
      meta: {
        session_id: "ses_archive_filter_a",
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
      session: { id: "a" },
      messages: [],
      redacted: { patterns_applied: [], redacted_count: 0 },
    };

    const snapshotB: SessionSnapshot = {
      ...snapshotA,
      meta: {
        ...snapshotA.meta,
        session_id: "ses_archive_filter_b",
        captured_at: "2026-03-03T00:00:00.000Z",
      },
      session: { id: "b" },
    };

    await writeSessionSnapshot({ dumpDir: tempDumpDir, snapshot: snapshotA });
    await writeSessionSnapshot({ dumpDir: tempDumpDir, snapshot: snapshotB });

    const seen: string[] = [];
    for await (const snapshot of readSessionSnapshots({
      dumpDir: tempDumpDir,
      since: "2026-03-02T12:00:00.000Z",
      until: "2026-03-03T12:00:00.000Z",
      session_ids: ["ses_archive_filter_b"],
    })) {
      seen.push(snapshot.meta.session_id);
    }

    assert.deepEqual(seen, ["ses_archive_filter_b"]);
  });
});
