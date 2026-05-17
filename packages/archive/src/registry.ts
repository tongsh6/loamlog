import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  EvidenceSpan,
  GlobalEvidenceRegistry,
  SessionSnapshot,
} from "@loamlog/core";

/**
 * Robust temporal evidence registry.
 * Scans the local archive for physical evidence within specific time windows.
 */
export class TemporalEvidenceRegistry implements GlobalEvidenceRegistry {
  constructor(private dumpDir: string) {}

  async findPhysicalEvidence(query: {
    time_window: [string, string];
    entities: string[];
    keywords: string[];
  }): Promise<EvidenceSpan[]> {
    const evidence: EvidenceSpan[] = [];
    const [start, end] = query.time_window;
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    // 1. Locate relevant session directories
    const providers = await readdir(this.dumpDir, { withFileTypes: true });

    for (const provider of providers) {
      if (!provider.isDirectory() || provider.name.startsWith(".")) continue;

      const providerPath = path.join(this.dumpDir, provider.name);
      const snapshots = await readdir(providerPath);

      for (const snapshotFile of snapshots) {
        if (!snapshotFile.endsWith(".json")) continue;

        try {
          const fullPath = path.join(providerPath, snapshotFile);
          const content = await readFile(fullPath, "utf8");
          const snapshot: SessionSnapshot = JSON.parse(content);

          const snapTime = new Date(snapshot.meta.captured_at).getTime();

          // 2. Temporal Filtering
          if (snapTime >= startTime && snapTime <= endTime) {
            // 3. Entity & Keyword Weaving
            for (const msg of snapshot.messages) {
              const text = msg.content ?? "";
              const matches = [...query.entities, ...query.keywords].some((k) =>
                text.toLowerCase().includes(k.toLowerCase()),
              );

              if (matches) {
                evidence.push({
                  session_id: snapshot.meta.session_id,
                  message_id: msg.id,
                  excerpt: text.slice(0, 500),
                });
              }
            }

            // Also check tool outputs in snapshot
            if (snapshot.tools) {
              for (const tool of snapshot.tools) {
                const output = tool.output ?? "";
                const matches = [...query.entities, ...query.keywords].some(
                  (k) => output.toLowerCase().includes(k.toLowerCase()),
                );

                if (matches) {
                  evidence.push({
                    session_id: snapshot.meta.session_id,
                    message_id: tool.message_id,
                    excerpt: `[tool:${tool.name}] ${output.slice(0, 500)}`,
                  });
                }
              }
            }
          }
        } catch {
          // Skip corrupted or unreadable snapshots
        }
      }
    }

    return evidence;
  }
}
