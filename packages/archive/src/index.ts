import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionSnapshot } from "@loamlog/core";

export interface ArchiveIndexEntry {
  session_id: string;
  provider: string;
  repo: string;
  captured_at: string;
  messages_count: number;
  redacted_count: number;
  snapshot_path: string;
}

interface ArchiveIndex {
  version: "1";
  entries: Record<string, ArchiveIndexEntry>;
}

function indexFilePath(dumpDir: string): string {
  return path.join(dumpDir, "index.json");
}

function emptyIndex(): ArchiveIndex {
  return { version: "1", entries: {} };
}

export interface WriteSessionSnapshotInput {
  dumpDir: string;
  snapshot: SessionSnapshot;
}

export interface WriteSessionSnapshotResult {
  jsonPath: string;
}

export interface ReadSessionSnapshotsOptions {
  dumpDir: string;
  repo?: string;
  since?: string;
  until?: string;
  session_ids?: string[];
}

function sanitizeRepoName(repo: string): string {
  return repo.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildBaseDir(dumpDir: string, snapshot: SessionSnapshot): string {
  const repo = snapshot.context.repo;
  if (!repo) {
    return path.join(dumpDir, "_global", "sessions");
  }

  return path.join(dumpDir, "repos", sanitizeRepoName(repo), "sessions");
}

function formatTimestampForFile(isoTime: string): string {
  return isoTime.replace(/[:.]/g, "-");
}

function parseOptionalIso(
  value: string | undefined,
  fieldName: "since" | "until",
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`invalid ${fieldName} value: ${value}`);
  }

  return parsed;
}

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const meta = candidate.meta as Record<string, unknown> | undefined;
  return (
    candidate.schema_version === "1.0" &&
    typeof meta?.session_id === "string" &&
    typeof meta.captured_at === "string" &&
    Array.isArray(candidate.messages)
  );
}

function inRange(
  capturedAt: string,
  sinceTs: number | undefined,
  untilTs: number | undefined,
): boolean {
  const capturedTs = Date.parse(capturedAt);
  if (Number.isNaN(capturedTs)) {
    return false;
  }

  if (sinceTs !== undefined && capturedTs < sinceTs) {
    return false;
  }

  if (untilTs !== undefined && capturedTs > untilTs) {
    return false;
  }

  return true;
}

async function listRepoSessionDirs(
  dumpDir: string,
  repo: string | undefined,
): Promise<string[]> {
  if (repo) {
    return [path.join(dumpDir, "repos", sanitizeRepoName(repo), "sessions")];
  }

  const reposRoot = path.join(dumpDir, "repos");
  let entries: Dirent[];
  try {
    entries = await readdir(reposRoot, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(reposRoot, entry.name, "sessions"));
}

async function* readSnapshotsFromDir(
  dir: string,
): AsyncGenerator<SessionSnapshot> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return;
    }
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      continue;
    }

    if (!isSessionSnapshot(parsed)) {
      continue;
    }

    yield parsed;
  }
}

export async function readArchiveIndex(dumpDir: string): Promise<ArchiveIndex> {
  const indexPath = indexFilePath(dumpDir);
  try {
    const text = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(text) as ArchiveIndex;
    if (
      parsed.version === "1" &&
      parsed.entries &&
      typeof parsed.entries === "object"
    ) {
      return parsed;
    }
    return emptyIndex();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return emptyIndex();
    }
    throw error;
  }
}

async function appendArchiveIndex(
  dumpDir: string,
  entry: ArchiveIndexEntry,
): Promise<void> {
  const indexPath = indexFilePath(dumpDir);
  await mkdir(dumpDir, { recursive: true });

  const index = await readArchiveIndex(dumpDir);
  index.entries[entry.session_id] = entry;

  const tempPath = `${indexPath}.tmp`;
  await writeFile(tempPath, JSON.stringify(index, null, 2), "utf8");
  await rename(tempPath, indexPath);
}

export async function writeSessionSnapshot(
  input: WriteSessionSnapshotInput,
): Promise<WriteSessionSnapshotResult> {
  const baseDir = buildBaseDir(input.dumpDir, input.snapshot);
  await mkdir(baseDir, { recursive: true });

  const fileName = `${formatTimestampForFile(input.snapshot.meta.captured_at)}-${input.snapshot.meta.session_id}.json`;
  const finalPath = path.join(baseDir, fileName);
  const tempPath = `${finalPath}.tmp`;
  const payload = `${JSON.stringify(input.snapshot, null, 2)}\n`;

  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, finalPath);

  const repo = input.snapshot.context.repo || "_global";
  const relativePath = path.relative(input.dumpDir, finalPath);
  await appendArchiveIndex(input.dumpDir, {
    session_id: input.snapshot.meta.session_id,
    provider: input.snapshot.meta.provider,
    repo,
    captured_at: input.snapshot.meta.captured_at,
    messages_count: input.snapshot.messages.length,
    redacted_count: input.snapshot.redacted?.redacted_count ?? 0,
    snapshot_path: relativePath,
  });

  return { jsonPath: finalPath };
}

export async function* readSessionSnapshots(
  options: ReadSessionSnapshotsOptions,
): AsyncGenerator<SessionSnapshot> {
  const sinceTs = parseOptionalIso(options.since, "since");
  const untilTs = parseOptionalIso(options.until, "until");
  const sessionIdSet = options.session_ids
    ? new Set(options.session_ids)
    : undefined;
  const rawRepo = options.repo;
  const sanitizedRepo = rawRepo ? sanitizeRepoName(rawRepo) : undefined;

  // Fast path: use index when available and consistent with filesystem
  try {
    const index = await readArchiveIndex(options.dumpDir);
    const indexEntries = Object.values(index.entries);

    if (indexEntries.length > 0) {
      // Check filesystem count to confirm index is not stale
      const repoDirs = await listRepoSessionDirs(options.dumpDir, options.repo);
      let fileCount = 0;
      for (const dir of repoDirs) {
        fileCount += await countJsonFiles(dir);
      }
      {
        const globalDir = path.join(options.dumpDir, "_global", "sessions");
        fileCount += await countJsonFiles(globalDir);
      }

      if (fileCount <= indexEntries.length) {
        // Index is authoritative — read only matching snapshots
        for (const entry of indexEntries) {
          // Filter by repo (match against both raw and sanitized name)
          if (sanitizedRepo && rawRepo) {
            if (entry.repo !== sanitizedRepo && entry.repo !== rawRepo) continue;
          }

          // Filter by session_ids
          if (sessionIdSet && !sessionIdSet.has(entry.session_id)) continue;

          // Filter by time range
          if (!inRange(entry.captured_at, sinceTs, untilTs)) continue;

          // Read the specific snapshot file
          const filePath = path.join(options.dumpDir, entry.snapshot_path);
          try {
            const text = await readFile(filePath, "utf8");
            const parsed = JSON.parse(text) as unknown;
            if (isSessionSnapshot(parsed)) {
              yield parsed;
            }
          } catch {
            // Skip unavailable snapshots — index may reference deleted files
            continue;
          }
        }
        return;
      }
    }
  } catch {
    // Index unavailable — fall through to full scan
  }

  // Full scan fallback
  const repoDirs = await listRepoSessionDirs(options.dumpDir, options.repo);
  const scanDirs = [
    ...repoDirs,
    path.join(options.dumpDir, "_global", "sessions"),
  ];

  for (const dir of scanDirs) {
    for await (const snapshot of readSnapshotsFromDir(dir)) {
      if (sessionIdSet && !sessionIdSet.has(snapshot.meta.session_id)) {
        continue;
      }

      if (!inRange(snapshot.meta.captured_at, sinceTs, untilTs)) {
        continue;
      }

      yield snapshot;
    }
  }
}

async function countJsonFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

// ── Evidence registry ──
export { TemporalEvidenceRegistry } from "./registry.js";
