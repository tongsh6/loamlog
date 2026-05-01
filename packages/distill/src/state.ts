import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

async function readStateFile(filePath: string): Promise<DistillerStateDocument> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ...EMPTY_DOC, kv: {}, processed: {} };
    }
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
    return { ...EMPTY_DOC, kv: {}, processed: {} };
  }
}

async function writeStateFile(filePath: string, doc: DistillerStateDocument): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify(doc, null, 2)}\n`;
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
}

type MutexRelease = () => void;

function createMutex(): { acquire: () => Promise<MutexRelease> } {
  let locked = false;
  const queue: Array<(release: MutexRelease) => void> = [];

  function release(): void {
    const next = queue.shift();
    if (next) {
      next(release);
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
      return new Promise<MutexRelease>((resolve) => {
        queue.push(resolve);
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
