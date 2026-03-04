import { mkdir, readdir, readFile, unlink, writeFile, stat, rename } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { CaptureRequest } from "@loamlog/core";

const MAX_BUFFER_FILES = 50;
const BUFFER_DIR = join(homedir(), ".loamlog", "buffer");

export class BufferManager {
  private dir: string;
  private isFlushing = false;
  private logger?: (msg: string) => void;

  constructor(dir: string = BUFFER_DIR, logger?: (msg: string) => void) {
    this.dir = dir;
    this.logger = logger;
  }

  async save(payload: CaptureRequest): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await this.evictOldestIfNeeded();

      const baseName = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const finalPath = join(this.dir, `${baseName}.json`);
      const tmpPath = join(this.dir, `${baseName}.tmp`);

      // Atomic write: write to .tmp then rename to .json
      await writeFile(tmpPath, JSON.stringify(payload), "utf-8");
      await rename(tmpPath, finalPath);

      this.logger?.(`buffered payload to ${finalPath}`);
    } catch (err) {
      this.logger?.(`failed to buffer payload: ${err}`);
    }
  }

  async flush(sendFn: (payload: CaptureRequest) => Promise<void>): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      const files = await this.listSorted();
      if (files.length === 0) return;

      this.logger?.(`flushing ${files.length} buffered payloads...`);
      let successCount = 0;

      for (const file of files) {
        const filePath = join(this.dir, file.name);
        try {
          const content = await readFile(filePath, "utf-8");
          const payload = JSON.parse(content) as CaptureRequest;
          await sendFn(payload);
          await unlink(filePath);
          successCount++;
        } catch (err) {
          if (err instanceof SyntaxError) {
            this.logger?.(`deleting corrupted buffer file: ${file.name}`);
            await unlink(filePath).catch(() => {});
          } else {
            this.logger?.(`flush interrupted at ${file.name}: ${err}`);
            break; 
          }
        }
      }
      if (successCount > 0) {
        this.logger?.(`flush completed: ${successCount} files sent.`);
      }
    } catch (err) {
      this.logger?.(`flush error: ${err}`);
    } finally {
      this.isFlushing = false;
    }
  }


  private async listSorted() {
    try {
      const entries = await readdir(this.dir, { withFileTypes: true });
      const files = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));
      const stats = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          mtime: (await stat(join(this.dir, f.name))).mtimeMs,
        }))
      );
      return stats.sort((a, b) => a.mtime - b.mtime);
    } catch (err) {
      return [];
    }
  }

  private async evictOldestIfNeeded(): Promise<void> {
    const files = await this.listSorted();
    if (files.length >= MAX_BUFFER_FILES) {
      const toDelete = files.slice(0, files.length - MAX_BUFFER_FILES + 1);
      for (const file of toDelete) {
        await unlink(join(this.dir, file.name)).catch(() => {});
      }
    }
  }
}
