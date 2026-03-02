import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionSnapshot } from "@loamlog/core";

export interface WriteSessionSnapshotInput {
  dumpDir: string;
  snapshot: SessionSnapshot;
}

export interface WriteSessionSnapshotResult {
  jsonPath: string;
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

export async function writeSessionSnapshot(input: WriteSessionSnapshotInput): Promise<WriteSessionSnapshotResult> {
  const baseDir = buildBaseDir(input.dumpDir, input.snapshot);
  await mkdir(baseDir, { recursive: true });

  const fileName = `${formatTimestampForFile(input.snapshot.meta.captured_at)}-${input.snapshot.meta.session_id}.json`;
  const finalPath = path.join(baseDir, fileName);
  const tempPath = `${finalPath}.tmp`;
  const payload = `${JSON.stringify(input.snapshot, null, 2)}\n`;

  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, finalPath);

  return { jsonPath: finalPath };
}
