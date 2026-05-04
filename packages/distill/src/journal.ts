import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Status of a single session after distillation. */
export type ProcessStatus = "produced" | "no_signal" | "error" | "prefiltered";

export interface ProcessJournalEntry {
  session_id: string;
  distiller_id: string;
  processed_at: string;
  status: ProcessStatus;
  drafts_count: number;
  error_message?: string;
}

/**
 * Write a processing journal entry for a session.
 *
 * Every session that goes through the distill engine gets a journal entry,
 * whether it produced results or not. This makes the system auditable:
 * users can see processing history via `loam list --distill --journal`.
 */
export async function writeProcessJournal(
  dumpDir: string,
  repo: string,
  entry: ProcessJournalEntry,
): Promise<void> {
  const dir = path.join(dumpDir, "distill", repo.replace(/[^a-zA-Z0-9._-]/g, "_"), "journal");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${entry.session_id}.json`);
  await writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
}
