import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";

interface PendingItem {
  id: string;
  type: string;
  title: string;
  confidence: number;
  distiller_id: string;
  repo: string;
  evidenceCount: number;
}

function sanitizeRepo(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function listDistillRepos(dumpDir: string): Promise<string[]> {
  const distillRoot = path.join(dumpDir, "distill");
  try {
    const entries = await readdir(distillRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listPendingItems(
  dumpDir: string,
  repo?: string,
  limit?: number,
): Promise<{ items: PendingItem[]; repo: string }[]> {
  const repos = repo ? [sanitizeRepo(repo)] : await listDistillRepos(dumpDir);
  const results: { items: PendingItem[]; repo: string }[] = [];

  for (const r of repos) {
    const pendingDir = path.join(dumpDir, "distill", r, "pending");
    const items: PendingItem[] = [];

    let entries: Dirent[];
    try {
      entries = await readdir(pendingDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const jsonFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort()
      .reverse();

    for (const fileName of jsonFiles) {
      if (limit !== undefined && items.length >= limit) break;

      const filePath = path.join(pendingDir, fileName);
      try {
        const text = await readFile(filePath, "utf8");
        const parsed = JSON.parse(text) as {
          id?: string;
          type?: string;
          title?: string;
          confidence?: number;
          distiller_id?: string;
          evidence?: unknown[];
        };

        if (!parsed.id) continue;

        items.push({
          id: parsed.id,
          type: typeof parsed.type === "string" ? parsed.type : "unknown",
          title: typeof parsed.title === "string" ? parsed.title : "(untitled)",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
          distiller_id: typeof parsed.distiller_id === "string" ? parsed.distiller_id : "unknown",
          repo: r,
          evidenceCount: Array.isArray(parsed.evidence) ? parsed.evidence.length : 0,
        });
      } catch {
        // skip unreadable files
      }
    }

    if (items.length > 0) {
      results.push({ items, repo: r });
    }
  }

  return results;
}

async function findAndMoveResult(
  dumpDir: string,
  resultId: string,
  target: "approved" | "rejected",
): Promise<boolean> {
  const repos = await listDistillRepos(dumpDir);

  for (const r of repos) {
    const pendingDir = path.join(dumpDir, "distill", r, "pending");
    const jsonPath = path.join(pendingDir, `${resultId}.json`);
    const mdPath = path.join(pendingDir, `${resultId}.md`);

    try {
      await readFile(jsonPath, "utf8");
    } catch {
      continue; // File not in this repo
    }

    const targetDir = path.join(dumpDir, "distill", r, target);
    await mkdir(targetDir, { recursive: true });

    // Move JSON
    await rename(jsonPath, path.join(targetDir, `${resultId}.json`));

    // Move markdown if exists
    try {
      await readFile(mdPath, "utf8");
      await rename(mdPath, path.join(targetDir, `${resultId}.md`));
    } catch {
      // No markdown sibling
    }

    return true;
  }

  return false;
}

function formatReviewTable(items: PendingItem[]): string {
  if (items.length === 0) return "(none)";

  const lines: string[] = [];
  const idWidth = Math.max(8, ...items.map((i) => i.id.length));
  const typeWidth = Math.max(6, ...items.map((i) => i.type.length));
  const titleWidth = Math.max(8, ...items.map((i) => Math.min(i.title.length, 50)));

  const header = `${"ID".padEnd(idWidth)}  ${"TYPE".padEnd(typeWidth)}  ${"TITLE".padEnd(titleWidth)}  CONF  EVID`;
  const sep = `${"─".repeat(idWidth)}  ${"─".repeat(typeWidth)}  ${"─".repeat(titleWidth)}  ────  ────`;

  lines.push(header, sep);

  for (const item of items) {
    const id = item.id.padEnd(idWidth);
    const type = item.type.padEnd(typeWidth);
    const truncated = item.title.length > 50 ? `${item.title.slice(0, 47)}...` : item.title;
    const title = truncated.padEnd(titleWidth);
    const conf = `${(item.confidence * 100).toFixed(0).padStart(3)}%`;
    const evid = String(item.evidenceCount).padStart(4);
    lines.push(`${id}  ${type}  ${title}  ${conf}  ${evid}`);
  }

  lines.push(sep);
  return lines.join("\n");
}

export async function runReviewCommand(args: string[]): Promise<void> {
  const dumpDir = getArg(args, "--dump-dir") ?? process.env.LOAM_DUMP_DIR;
  if (!dumpDir) {
    console.error("Error: LOAM_DUMP_DIR is not configured");
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  const approveId = getArg(args, "--approve");
  const rejectId = getArg(args, "--reject");
  const list = args.includes("--list") || (!approveId && !rejectId);
  const limitRaw = getArg(args, "--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;

  // Approve action
  if (approveId) {
    const moved = await findAndMoveResult(dumpDir, approveId, "approved");
    if (moved) {
      console.log(`[loam review] Approved: ${approveId}`);
    } else {
      console.error(`[loam review] Result not found: ${approveId}`);
      process.exitCode = 1;
    }
    return;
  }

  // Reject action
  if (rejectId) {
    const moved = await findAndMoveResult(dumpDir, rejectId, "rejected");
    if (moved) {
      console.log(`[loam review] Rejected: ${rejectId}`);
    } else {
      console.error(`[loam review] Result not found: ${rejectId}`);
      process.exitCode = 1;
    }
    return;
  }

  // List action (default)
  if (list) {
    const results = await listPendingItems(dumpDir, repo, limit);

    if (results.length === 0) {
      console.log("No pending results to review.");
      console.log("  Run: loam distill --distiller @loamlog/distiller-issue-draft --llm <provider/model>");
      return;
    }

    let totalItems = 0;
    for (const { items, repo: r } of results) {
      console.log(`\n${r}/pending/ (${items.length} items)`);
      console.log(formatReviewTable(items));
      totalItems += items.length;
    }

    console.log(`\n${totalItems} pending result(s). Review with:`);
    console.log("  loam review --approve <id>");
    console.log("  loam review --reject <id>");
  }
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
