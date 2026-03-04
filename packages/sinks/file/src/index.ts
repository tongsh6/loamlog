import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeliveryReport, DistillResult, SinkPlugin } from "@loamlog/core";

function sanitizeRepoName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const fileSink: SinkPlugin = {
  id: "@loamlog/sink-file",
  name: "File Sink",
  version: "0.1.0",

  supports(): boolean {
    return true;
  },

  async deliver(input: { results: DistillResult[]; config: Record<string, unknown> }): Promise<DeliveryReport> {
    const { results, config } = input;
    const dumpDirRaw = config.dump_dir;
    if (typeof dumpDirRaw !== "string" || dumpDirRaw.length === 0) {
      throw new Error("sink-file requires config.dump_dir");
    }

    const repoRaw = typeof config.repo === "string" && config.repo.length > 0 ? config.repo : "_global";
    const repoName = sanitizeRepoName(repoRaw);
    const baseDir = path.join(dumpDirRaw, "distill", repoName, "pending");
    await mkdir(baseDir, { recursive: true });

    let delivered = 0;
    const errors: Array<{ result_index: number; error: string }> = [];

    for (const [index, result] of results.entries()) {
      const filePath = path.join(baseDir, `${result.id}.json`);
      const tempPath = `${filePath}.tmp`;
      const payload = `${JSON.stringify(result, null, 2)}\n`;

      try {
        await writeFile(tempPath, payload, "utf8");
        await rename(tempPath, filePath);
        delivered += 1;
      } catch (error) {
        errors.push({
          result_index: index,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      delivered,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
};

export default fileSink;
