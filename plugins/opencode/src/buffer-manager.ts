import { mkdir, readdir, readFile, unlink, writeFile, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { CaptureRequest } from "@loamlog/core";

const MAX_BUFFER_FILES = 50;
const BUFFER_DIR = join(homedir(), ".loamlog", "buffer");

export class BufferManager {
  private dir: string;
  private isFlushing = false;

  constructor(dir: string = BUFFER_DIR) {
    this.dir = dir;
  }

  async save(payload: CaptureRequest): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await this.evictOldestIfNeeded();
      const filename = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`;
      await writeFile(join(this.dir, filename), JSON.stringify(payload), "utf-8");
    } catch (err) {
      // Silent error to avoid crashing the plugin
    }
  }

  async flush(sendFn: (payload: CaptureRequest) => Promise<void>): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;
    try {
      const files = await this.listSorted();
      for (const file of files) {
        const filePath = join(this.dir, file.name);
        try {
          const content = await readFile(filePath, "utf-8");
          const payload = JSON.parse(content) as CaptureRequest;
          await sendFn(payload);
          await unlink(filePath);
        } catch (err) {
          // If sending fails, stop flushing to preserve order for next time
          // If parsing fails, delete the corrupted file
          if (err instanceof SyntaxError) {
            await unlink(filePath).catch(() => {});
          } else {
            break; 
          }
        }
      }
    } catch (err) {
      // Silent error
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
