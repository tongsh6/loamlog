import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DistillerStateKV } from "@loamlog/core";

interface DistillerStateDocument {
  kv: Record<string, unknown>;
  processed: Record<string, string>;
}

const EMPTY_DOC: DistillerStateDocument = {
  kv: {},
  processed: {},
};

function sanitizeDistillerId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function createStateFilePath(stateDir: string, distillerId: string): string {
  return path.join(stateDir, "_global", `distill_state_${sanitizeDistillerId(distillerId)}.db`);
}

function createBackupPath(filePath: string): string {
  return `${filePath}.bak`;
}

async function readStateFile(filePath: string): Promise<DistillerStateDocument> {
  const backupPath = createBackupPath(filePath);

  // Try primary file first
  const doc = await tryReadStateFile(filePath);
  if (doc) return doc;

  // Primary failed, try backup
  const backupDoc = await tryReadStateFile(backupPath);
  if (backupDoc) {
    // Recover: write backup content back to primary
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(backupDoc, null, 2)}\n`, "utf8");
    } catch {
      // Best-effort recovery; the backup data is still available in memory
    }
    return backupDoc;
  }

  // Both failed, start fresh
  return { ...EMPTY_DOC, kv: {}, processed: {} };
}

async function tryReadStateFile(filePath: string): Promise<DistillerStateDocument | null> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }

  try {
    const parsed = JSON.parse(text) as Partial<DistillerStateDocument>;
    return {
      kv: parsed.kv && typeof parsed.kv === "object" ? (parsed.kv as Record<string, unknown>) : {},
      processed:
        parsed.processed && typeof parsed.processed === "object"
          ? (parsed.processed as Record<string, string>)
          : {},
    };
  } catch {
    // Corrupted JSON — caller may try backup
    return null;
  }
}

async function writeStateFile(filePath: string, doc: DistillerStateDocument): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify(doc, null, 2)}\n`;
  const tempPath = `${filePath}.tmp`;
  const backupPath = createBackupPath(filePath);

  // 1. Write to temp file
  await writeFile(tempPath, payload, "utf8");

  // 2. Backup current file if it exists (best-effort)
  try {
    await copyFile(filePath, backupPath);
  } catch {
    // File may not exist yet — that's fine
  }

  // 3. Atomic rename temp → target
  await rename(tempPath, filePath);

  // 4. Clean up backup on successful write
  try {
    await unlink(backupPath);
  } catch {
    // Best-effort cleanup
  }
}

// ── Mutex with timeout ──

type MutexRelease = () => void;

interface MutexOptions {
  acquireTimeoutMs: number;
}

class MutexAcquireTimeoutError extends Error {
  constructor(filePath: string, timeoutMs: number) {
    super(`mutex acquire timeout after ${timeoutMs}ms for ${filePath}`);
    this.name = "MutexAcquireTimeoutError";
  }
}

function createMutex(options?: MutexOptions): { acquire: () => Promise<MutexRelease> } {
  const timeoutMs = options?.acquireTimeoutMs ?? 30_000;
  let locked = false;
  const queue: Array<{ resolve: (release: MutexRelease) => void; timer: ReturnType<typeof setTimeout> }> = [];

  function release(): void {
    const next = queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(release);
    } else {
      locked = false;
    }
  }

  return {
    acquire(): Promise<MutexRelease> {
      if (!locked) {
        locked = true;
        return Promise.resolve(release);
      }
      return new Promise<MutexRelease>((resolve, reject) => {
        const timer = setTimeout(() => {
          // Remove this entry from queue
          const idx = queue.findIndex((e) => e.timer === timer);
          if (idx >= 0) queue.splice(idx, 1);
          reject(new MutexAcquireTimeoutError("<state-file>", timeoutMs));
        }, timeoutMs);
        queue.push({ resolve, timer });
      });
    },
  };
}

const fileMutexes = new Map<string, { acquire: () => Promise<MutexRelease> }>();

function getFileMutex(filePath: string): { acquire: () => Promise<MutexRelease> } {
  let mutex = fileMutexes.get(filePath);
  if (!mutex) {
    mutex = createMutex();
    fileMutexes.set(filePath, mutex);
  }
  return mutex;
}

// ── Public API ──

export function createDistillerStateKV(stateDir: string, distillerId: string): DistillerStateKV {
  const filePath = createStateFilePath(stateDir, distillerId);
  const mutex = getFileMutex(filePath);

  return {
    async get<V>(key: string): Promise<V | undefined> {
      const release = await mutex.acquire();
      try {
        const doc = await readStateFile(filePath);
        return doc.kv[key] as V | undefined;
      } finally {
        release();
      }
    },

    async set<V>(key: string, value: V): Promise<void> {
      const release = await mutex.acquire();
      try {
        const doc = await readStateFile(filePath);
        doc.kv[key] = value;
        await writeStateFile(filePath, doc);
      } finally {
        release();
      }
    },

    async update<V>(key: string, fn: (current: V | undefined) => V): Promise<void> {
      const release = await mutex.acquire();
      try {
        const doc = await readStateFile(filePath);
        const current = doc.kv[key] as V | undefined;
        doc.kv[key] = fn(current);
        await writeStateFile(filePath, doc);
      } finally {
        release();
      }
    },

    async markProcessed(targetDistillerId: string, sessionIds: string[]): Promise<void> {
      if (sessionIds.length === 0) {
        return;
      }

      const release = await mutex.acquire();
      try {
        const now = new Date().toISOString();
        const processedKey = `processed:${targetDistillerId}`;
        const doc = await readStateFile(filePath);
        const currentProcessed =
          (doc.kv[processedKey] as Record<string, string> | undefined) ?? Object.create(null) as Record<string, string>;

        for (const sessionId of sessionIds) {
          currentProcessed[sessionId] = now;
        }

        doc.kv[processedKey] = currentProcessed;
        doc.kv.watermark = now;
        await writeStateFile(filePath, doc);
      } finally {
        release();
      }
    },
  };
}
