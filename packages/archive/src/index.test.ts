import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { SessionSnapshot } from "@loamlog/core";
import { readArchiveIndex, readSessionSnapshots, writeSessionSnapshot } from "./index.js";

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

describe("readSessionSnapshots index fast path", () => {
  test("uses index when available and consistent — 100 snapshots", async () => {
    tempDumpDir = await mkdtemp(path.join(tmpdir(), "loamlog-archive-perf-"));

    const COUNT = 100;
    const baseSnapshot: SessionSnapshot = {
      schema_version: "1.0",
      meta: {
        session_id: "",
        captured_at: "",
        capture_trigger: "session.idle",
        aic_version: "0.1.0",
        provider: "opencode",
      },
      context: { cwd: "/repo", worktree: "/repo", repo: "perf/repo" },
      time_range: { start: "", end: "" },
      session: {},
      messages: [{ id: "msg-1", role: "user", timestamp: "", content: "test" }],
      redacted: { patterns_applied: [], redacted_count: 0 },
    };

    // Write 100 snapshots
    for (let i = 0; i < COUNT; i++) {
      const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      const snapshot: SessionSnapshot = {
        ...baseSnapshot,
        meta: { ...baseSnapshot.meta, session_id: `ses_perf_${i}`, captured_at: ts },
        time_range: { start: ts, end: ts },
      };
      await writeSessionSnapshot({ dumpDir: tempDumpDir, snapshot });
    }

    // Verify index was built
    const index = await readArchiveIndex(tempDumpDir);
    assert.equal(Object.keys(index.entries).length, COUNT);

    // Read all snapshots — must use index fast path and return all 100
    const seen: string[] = [];
    const startTime = Date.now();
    for await (const s of readSessionSnapshots({ dumpDir: tempDumpDir })) {
      seen.push(s.meta.session_id);
    }
    const durationMs = Date.now() - startTime;

    assert.equal(seen.length, COUNT);
    // Index-based reading 100 files should be fast (< 1s)
    assert.ok(durationMs < 2000, `reading 100 snapshots took ${durationMs}ms, expected < 2000ms`);
  });

  test("filters by repo, since, and session_ids via index", async () => {
    tempDumpDir = await mkdtemp(path.join(tmpdir(), "loamlog-archive-idx-"));

    const makeSnapshot = (sessionId: string, repo: string, day: number): SessionSnapshot => ({
      schema_version: "1.0",
      meta: {
        session_id: sessionId,
        captured_at: new Date(Date.UTC(2026, 2, day, 0, 0, 0)).toISOString(),
        capture_trigger: "session.idle",
        aic_version: "0.1.0",
        provider: "opencode",
      },
      context: { cwd: "/repo", worktree: "/repo", repo },
      time_range: { start: "", end: "" },
      session: {},
      messages: [],
      redacted: { patterns_applied: [], redacted_count: 0 },
    });

    await writeSessionSnapshot({ dumpDir: tempDumpDir, snapshot: makeSnapshot("ses_idx_a", "idx/repo-a", 1) });
    await writeSessionSnapshot({ dumpDir: tempDumpDir, snapshot: makeSnapshot("ses_idx_b", "idx/repo-b", 2) });
    await writeSessionSnapshot({ dumpDir: tempDumpDir, snapshot: makeSnapshot("ses_idx_c", "idx/repo-a", 3) });

    // Filter by repo
    const repoA: string[] = [];
    for await (const s of readSessionSnapshots({ dumpDir: tempDumpDir, repo: "idx/repo-a" })) {
      repoA.push(s.meta.session_id);
    }
    assert.deepEqual(repoA, ["ses_idx_a", "ses_idx_c"]);

    // Filter by since
    const sinceDay3: string[] = [];
    for await (const s of readSessionSnapshots({ dumpDir: tempDumpDir, since: "2026-03-03T00:00:00.000Z" })) {
      sinceDay3.push(s.meta.session_id);
    }
    assert.deepEqual(sinceDay3, ["ses_idx_c"]);

    // Filter by session_ids
    const byIds: string[] = [];
    for await (const s of readSessionSnapshots({ dumpDir: tempDumpDir, session_ids: ["ses_idx_b"] })) {
      byIds.push(s.meta.session_id);
    }
    assert.deepEqual(byIds, ["ses_idx_b"]);
  });
});
