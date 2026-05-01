import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listScanReports } from "./list.js";

const cliEntry = fileURLToPath(new URL("index.ts", import.meta.url));

async function createMockScanDir(base: string): Promise<void> {
  const scanDir = path.join(base, "AIEF", "reports", "static-scan");
  await mkdir(scanDir, { recursive: true });

  for (const [runId, profile, findings, blocking] of [
    ["2026-05-01T10-00-00Z", "fast", 45, 0],
    ["2026-05-01T11-00-00Z", "security", 52, 3],
  ] as const) {
    const runDir = path.join(scanDir, runId);
    await mkdir(runDir);
    await writeFile(
      path.join(runDir, "metadata.json"),
      JSON.stringify({
        runId,
        profile,
        startedAt: "2026-05-01T10:00:00.000Z",
        git: { branch: "develop", dirty: false },
      }),
    );
    await writeFile(
      path.join(runDir, "scan.normalized.json"),
      JSON.stringify({
        findings: Array.from({ length: findings }, (_, i) => ({
          id: `finding:${runId}:${i}`,
          tool: "biome",
          severity: i < blocking ? "high" : "info",
          category: "lint",
          inChangedFile: i < blocking,
        })),
      }),
    );
  }
}

async function createMockDumpDir(base: string): Promise<void> {
  const sessionsDir = path.join(base, "repos", "my-project", "sessions");
  await mkdir(sessionsDir, { recursive: true });

  await writeFile(
    path.join(sessionsDir, "2026-05-01T10-00-00-000Z-ses-001.json"),
    JSON.stringify({
      schema_version: "1.0",
      meta: {
        session_id: "ses-001",
        captured_at: "2026-05-01T10:00:00.000Z",
        capture_trigger: "session.idle",
        aic_version: "0.1.0",
        provider: "claude-code",
      },
      messages: [{ id: "m1", role: "user", content: "hello" }, { id: "m2", role: "assistant", content: "hi" }],
      redacted: { patterns_applied: ["api-key-openai"], redacted_count: 2 },
    }),
  );

  await writeFile(
    path.join(sessionsDir, "2026-05-01T11-00-00-000Z-ses-002.json"),
    JSON.stringify({
      schema_version: "1.0",
      meta: {
        session_id: "ses-002",
        captured_at: "2026-05-01T11:00:00.000Z",
        capture_trigger: "manual",
        aic_version: "0.1.0",
        provider: "opencode",
      },
      messages: [{ id: "m3", role: "user", content: "test" }],
      redacted: { patterns_applied: [], redacted_count: 0 },
    }),
  );
}

describe("listScanReports", () => {
  test("returns scan reports sorted newest first", async () => {
    const base = path.join(tmpdir(), `loam-list-scan-${Date.now()}`);
    await createMockScanDir(base);

    try {
      const reports = await listScanReports(
        { dumpDir: "", limit: 10, json: true, scan: true },
        base,
      );

      assert.equal(reports.length, 2);
      assert.equal(reports[0].runId, "2026-05-01T11-00-00Z"); // newest first
      assert.equal(reports[0].profile, "security");
      assert.equal(reports[0].findings, 52);
      assert.equal(reports[0].blocking, 3);
      assert.equal(reports[1].runId, "2026-05-01T10-00-00Z");
      assert.equal(reports[1].profile, "fast");
      assert.equal(reports[1].findings, 45);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("respects limit option", async () => {
    const base = path.join(tmpdir(), `loam-list-limit-${Date.now()}`);
    await createMockScanDir(base);

    try {
      const reports = await listScanReports(
        { dumpDir: "", limit: 1, json: true, scan: true },
        base,
      );
      assert.equal(reports.length, 1);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("returns empty when no scan directory exists", async () => {
    const base = path.join(tmpdir(), `loam-list-empty-${Date.now()}`);
    await mkdir(base, { recursive: true });

    try {
      const reports = await listScanReports(
        { dumpDir: "", limit: 10, json: true, scan: true },
        base,
      );
      assert.equal(reports.length, 0);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("loam list sessions (CLI)", () => {
  test("--json lists sessions from dump dir", async () => {
    const base = path.join(tmpdir(), `loam-list-dump-${Date.now()}`);
    await createMockDumpDir(base);

    try {
      const result = spawnSync("node", ["--import", "tsx", cliEntry, "list", "--json", "--dump-dir", base, "--limit", "5"], {
        encoding: "utf8",
        timeout: 15000,
      });

      const parsed = JSON.parse(result.stdout.trim());
      assert.ok(Array.isArray(parsed));
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].session_id, "ses-002"); // newest first
      assert.equal(parsed[1].session_id, "ses-001");
      assert.equal(parsed[1].redacted_count, 2);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("invalid --limit value produces error", async () => {
    const result = spawnSync("node", ["--import", "tsx", cliEntry, "list", "--limit", "-1"], {
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("invalid --limit value"));
  });

  test("fails fast when LOAM_DUMP_DIR is not set", async () => {
    const result = spawnSync("node", ["--import", "tsx", cliEntry, "list", "--json"], {
      encoding: "utf8",
      env: { ...process.env, LOAM_DUMP_DIR: "" },
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("LOAM_DUMP_DIR"));
  });
});
