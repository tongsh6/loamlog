import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readArchiveIndex, type ArchiveIndexEntry } from "@loamlog/archive";
import { renderCardMarkdown } from "./show.js";

type OutputFormat = "table" | "json" | "md";

interface ListOptions {
  dumpDir: string;
  repo?: string;
  since?: string;
  distill?: boolean;
  pending?: boolean;
  scan?: boolean;
  limit: number;
  format: OutputFormat;
}

interface ScanReportSummary {
  runId: string;
  profile: string;
  startedAt: string;
  findings: number;
  blocking: number;
  branch: string;
  dirty: boolean;
}

interface SessionSummary {
  session_id: string;
  provider: string;
  repo: string;
  captured_at: string;
  messages_count: number;
  redacted_count: number;
}

interface DistillResultSummary {
  id: string;
  type: string;
  title: string;
  confidence: number;
  distiller_id: string;
  repo: string;
  /** Full record (only populated when --format md is requested). */
  full?: unknown;
  filePath?: string;
  status?: string;
}

interface JournalStats {
  total: number;
  produced: number;
  no_signal: number;
  error: number;
}

function sanitizeRepoName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parseDuration(value: string): number {
  const match = value.match(/^(\d+)(h|d|w)$/);
  if (!match) {
    throw new Error(
      `invalid duration: ${value}; expected format like 24h, 7d, 30d`,
    );
  }

  const num = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "h":
      return num * 60 * 60 * 1000;
    case "d":
      return num * 24 * 60 * 60 * 1000;
    case "w":
      return num * 7 * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`unknown duration unit: ${unit}`);
  }
}

async function listRepos(dumpDir: string): Promise<string[]> {
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

  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function entryToSummary(entry: ArchiveIndexEntry): SessionSummary {
  return {
    session_id: entry.session_id,
    provider: entry.provider,
    repo: entry.repo,
    captured_at: entry.captured_at,
    messages_count: entry.messages_count,
    redacted_count: entry.redacted_count,
  };
}

async function listSessionsFromIndex(
  dumpDir: string,
  opts: ListOptions,
): Promise<SessionSummary[]> {
  const sinceTs = opts.since
    ? Date.now() - parseDuration(opts.since)
    : undefined;
  const index = await readArchiveIndex(dumpDir);

  const entries = Object.values(index.entries);

  // Sort by captured_at descending (newest first)
  entries.sort((a, b) => b.captured_at.localeCompare(a.captured_at));

  const results: SessionSummary[] = [];
  for (const entry of entries) {
    if (results.length >= opts.limit) {
      break;
    }

    if (opts.repo && entry.repo !== sanitizeRepoName(opts.repo)) {
      continue;
    }

    if (sinceTs) {
      const capturedTs = Date.parse(entry.captured_at);
      if (!Number.isNaN(capturedTs) && capturedTs < sinceTs) {
        continue;
      }
    }

    results.push(entryToSummary(entry));
  }

  return results;
}

async function listSessionsFromScan(
  dumpDir: string,
  opts: ListOptions,
): Promise<SessionSummary[]> {
  const results: SessionSummary[] = [];
  const sinceTs = opts.since
    ? Date.now() - parseDuration(opts.since)
    : undefined;

  const repoDirs = opts.repo
    ? [sanitizeRepoName(opts.repo)]
    : await listRepos(dumpDir);

  for (const repoDir of repoDirs) {
    const sessionsDir = path.join(dumpDir, "repos", repoDir, "sessions");
    let entries: Dirent[];
    try {
      entries = await readdir(sessionsDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const jsonFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort()
      .reverse();

    for (const fileName of jsonFiles) {
      if (results.length >= opts.limit) {
        break;
      }

      const filePath = path.join(sessionsDir, fileName);
      let text: string;
      try {
        text = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      let parsed: {
        meta?: Record<string, unknown>;
        messages?: unknown[];
        redacted?: Record<string, unknown>;
      };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        continue;
      }

      const meta = parsed.meta;
      if (!meta || typeof meta.session_id !== "string") {
        continue;
      }

      const capturedAt =
        typeof meta.captured_at === "string" ? meta.captured_at : "";

      if (sinceTs) {
        const capturedTs = Date.parse(capturedAt);
        if (!Number.isNaN(capturedTs) && capturedTs < sinceTs) {
          continue;
        }
      }

      results.push({
        session_id: meta.session_id as string,
        provider:
          typeof meta.provider === "string"
            ? (meta.provider as string)
            : "unknown",
        repo: repoDir,
        captured_at: capturedAt,
        messages_count: Array.isArray(parsed.messages)
          ? parsed.messages.length
          : 0,
        redacted_count:
          parsed.redacted && typeof parsed.redacted.redacted_count === "number"
            ? (parsed.redacted.redacted_count as number)
            : 0,
      });
    }
  }

  return results;
}

async function countSessionFiles(dumpDir: string): Promise<number> {
  const reposRoot = path.join(dumpDir, "repos");
  let count = 0;
  let repoEntries: Dirent[];
  try {
    repoEntries = await readdir(reposRoot, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const repoEntry of repoEntries) {
    if (!repoEntry.isDirectory()) continue;
    const sessionsDir = path.join(reposRoot, repoEntry.name, "sessions");
    try {
      const sessionEntries = await readdir(sessionsDir, {
        withFileTypes: true,
      });
      count += sessionEntries.filter(
        (e) => e.isFile() && e.name.endsWith(".json"),
      ).length;
    } catch {
      continue;
    }
  }
  return count;
}

async function listSessions(
  dumpDir: string,
  opts: ListOptions,
): Promise<SessionSummary[]> {
  const index = await readArchiveIndex(dumpDir);
  const indexEntries = Object.keys(index.entries).length;
  if (indexEntries > 0) {
    const fileCount = await countSessionFiles(dumpDir);
    if (fileCount <= indexEntries) {
      return listSessionsFromIndex(dumpDir, opts);
    }
  }
  return listSessionsFromScan(dumpDir, opts);
}

async function listDistillRepos(dumpDir: string): Promise<string[]> {
  const distillRoot = path.join(dumpDir, "distill");
  let entries: Dirent[];
  try {
    entries = await readdir(distillRoot, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function readJournalStats(
  dumpDir: string,
  repo?: string,
): Promise<JournalStats> {
  const stats: JournalStats = { total: 0, produced: 0, no_signal: 0, error: 0 };

  const distillRoot = path.join(dumpDir, "distill");
  const repoDirs = repo
    ? [sanitizeRepoName(repo)]
    : await listDistillRepos(dumpDir);

  for (const repoDir of repoDirs) {
    const journalDir = path.join(distillRoot, repoDir, "journal");
    let entries: Dirent[];
    try {
      entries = await readdir(journalDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const text = await readFile(path.join(journalDir, entry.name), "utf8");
        const parsed = JSON.parse(text) as { status?: string };
        stats.total += 1;
        if (parsed.status === "produced") stats.produced += 1;
        else if (parsed.status === "error") stats.error += 1;
        else stats.no_signal += 1;
      } catch {
        continue;
      }
    }
  }

  return stats;
}

async function listDistillResults(
  dumpDir: string,
  opts: ListOptions,
): Promise<DistillResultSummary[]> {
  const results: DistillResultSummary[] = [];
  const sinceTs = opts.since
    ? Date.now() - parseDuration(opts.since)
    : undefined;

  const repoDirs = opts.repo
    ? [sanitizeRepoName(opts.repo)]
    : await listDistillRepos(dumpDir);

  for (const repoDir of repoDirs) {
    const typeDirs = opts.pending
      ? ["pending"]
      : ["pending", "approved", "rejected"];

    for (const typeDir of typeDirs) {
      const resultsDir = path.join(dumpDir, "distill", repoDir, typeDir);
      let entries: Dirent[];
      try {
        entries = await readdir(resultsDir, { withFileTypes: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          continue;
        }
        throw error;
      }

      const jsonFiles = entries
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name)
        .sort()
        .reverse();

      for (const fileName of jsonFiles) {
        if (results.length >= opts.limit) {
          break;
        }

        const filePath = path.join(resultsDir, fileName);
        if (sinceTs !== undefined) {
          try {
            const fileStat = await stat(filePath);
            if (fileStat.mtimeMs < sinceTs) {
              continue;
            }
          } catch {
            continue;
          }
        }

        let text: string;
        try {
          text = await readFile(filePath, "utf8");
        } catch {
          continue;
        }

        let parsed: {
          id?: string;
          type?: string;
          title?: string;
          confidence?: number;
          distiller_id?: string;
          [k: string]: unknown;
        };
        try {
          parsed = JSON.parse(text) as typeof parsed;
        } catch {
          continue;
        }

        if (!parsed.id) {
          continue;
        }

        const includeFull = opts.format === "md" || opts.format === "json";
        results.push({
          id: parsed.id,
          type: typeof parsed.type === "string" ? parsed.type : "unknown",
          title: typeof parsed.title === "string" ? parsed.title : "(untitled)",
          confidence:
            typeof parsed.confidence === "number" ? parsed.confidence : 0,
          distiller_id:
            typeof parsed.distiller_id === "string"
              ? parsed.distiller_id
              : "unknown",
          repo: repoDir,
          full: includeFull ? parsed : undefined,
          filePath: includeFull ? filePath : undefined,
          status: includeFull ? typeDir : undefined,
        });
      }
    }
  }

  return results;
}

export async function listScanReports(
  opts: ListOptions,
  scanBaseDir?: string,
): Promise<ScanReportSummary[]> {
  const scanDir = path.join(scanBaseDir ?? process.cwd(), "AIEF", "reports", "static-scan");
  let entries: Dirent[];
  try {
    entries = await readdir(scanDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const runs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();

  const results: ScanReportSummary[] = [];

  for (const runId of runs) {
    if (results.length >= opts.limit) break;

    const metaPath = path.join(scanDir, runId, "metadata.json");
    let text: string;
    try {
      text = await readFile(metaPath, "utf8");
    } catch {
      continue;
    }

    let meta: {
      profile?: string;
      startedAt?: string;
      git?: { branch?: string; dirty?: boolean };
    };
    try {
      meta = JSON.parse(text) as typeof meta;
    } catch {
      continue;
    }

    // Count findings from normalized file
    let findingsCount = 0;
    let blockingCount = 0;
    try {
      const normPath = path.join(scanDir, runId, "scan.normalized.json");
      const normText = await readFile(normPath, "utf8");
      const norm = JSON.parse(normText) as { findings?: Array<{ rankScore?: number; severity?: string; category?: string; inChangedFile?: boolean }> };
      if (Array.isArray(norm.findings)) {
        findingsCount = norm.findings.length;
        blockingCount = norm.findings.filter(
          (f) =>
            f.severity === "critical" ||
            f.severity === "high" ||
            (f.category === "secret" || f.category === "security") &&
            f.inChangedFile,
        ).length;
      }
    } catch {
      // Best-effort finding count
    }

    results.push({
      runId,
      profile: meta.profile ?? "fast",
      startedAt: meta.startedAt ?? "",
      findings: findingsCount,
      blocking: blockingCount,
      branch: meta.git?.branch ?? "unknown",
      dirty: meta.git?.dirty ?? false,
    });
  }

  return results;
}

function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((header, colIdx) => {
    const maxDataWidth = rows.reduce(
      (max, row) => Math.max(max, (row[colIdx] ?? "").length),
      0,
    );
    return Math.max(header.length, maxDataWidth);
  });

  const padRight = (str: string, width: number) => {
    return str + " ".repeat(Math.max(0, width - str.length));
  };

  const separator = colWidths.map((w) => "─".repeat(w)).join("  ");
  const headerLine = headers
    .map((h, i) => padRight(h, colWidths[i]))
    .join("  ");

  const lines = [headerLine, separator];
  for (const row of rows) {
    lines.push(row.map((cell, i) => padRight(cell, colWidths[i])).join("  "));
  }
  lines.push(separator);

  return lines.join("\n");
}

export async function runListCommand(args: string[]): Promise<void> {
  const scan = args.includes("--scan");
  const formatRaw = getArg(args, "--format");
  const json = args.includes("--json");

  let format: OutputFormat;
  if (formatRaw) {
    if (formatRaw !== "table" && formatRaw !== "json" && formatRaw !== "md") {
      console.error(`Error: invalid --format value: ${formatRaw} (allowed: table, json, md)`);
      process.exitCode = 1;
      return;
    }
    format = formatRaw;
  } else {
    format = json ? "json" : "table";
  }

  const limitRaw = getArg(args, "--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;

  if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
    console.error(`Error: invalid --limit value: ${limitRaw}`);
    process.exitCode = 1;
    return;
  }

  // --scan reads from project directory, does not require LOAM_DUMP_DIR
  if (scan) {
    const opts: ListOptions = { dumpDir: "", limit, format, scan: true };
    const reports = await listScanReports(opts);

    if (format === "json") {
      console.log(JSON.stringify(reports, null, 2));
      return;
    }
    if (format === "md") {
      console.error("Error: --format md is only available with --distill");
      process.exitCode = 1;
      return;
    }

    if (reports.length === 0) {
      console.log("No scan reports found.\n  Run: pnpm run ai:complete");
      return;
    }

    const headers = ["Run ID", "Profile", "Findings", "Blocking", "Branch", "Dirty"];
    const rows = reports.map((r) => [
      r.runId.slice(0, 22),
      r.profile,
      String(r.findings),
      String(r.blocking),
      r.branch.slice(0, 15),
      r.dirty ? "yes" : "no",
    ]);

    console.log(formatTable(headers, rows));
    console.log(`${reports.length} scan reports`);
    return;
  }

  const dumpDir = getArg(args, "--dump-dir") ?? process.env.LOAM_DUMP_DIR;
  if (!dumpDir) {
    console.error(
      "Error: LOAM_DUMP_DIR is not configured. Set env or pass --dump-dir",
    );
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  const since = getArg(args, "--since");
  const distill = args.includes("--distill");
  const pending = args.includes("--pending");

  const opts: ListOptions = {
    dumpDir,
    repo,
    since,
    distill,
    pending,
    scan,
    limit,
    format,
  };

  if (distill) {
    const results = await listDistillResults(dumpDir, opts);
    const journal = await readJournalStats(dumpDir, repo);

    if (format === "json") {
      console.log(JSON.stringify({ results, journal }, null, 2));
      return;
    }

    if (format === "md") {
      console.log(`# Loam distill — ${results.length} ${pending ? "pending" : "all"} results\n`);
      console.log(
        `> Processed ${journal.total} sessions · produced ${journal.produced} · no-signal ${journal.no_signal} · errors ${journal.error}\n`,
      );
      console.log("---\n");
      for (const r of results) {
        if (!r.full) continue;
        console.log(
          renderCardMarkdown(
            r.full as Parameters<typeof renderCardMarkdown>[0],
            {
              filePath: r.filePath ?? "?",
              repo: r.repo,
              status: r.status ?? "?",
            },
          ),
        );
        console.log("---\n");
      }
      return;
    }

    // Show processing journal stats first
    if (journal.total > 0) {
      const pct = (n: number) => journal.total > 0 ? `${((n / journal.total) * 100).toFixed(0)}%` : "0%";
      console.log(`Processed: ${journal.total} sessions`);
      console.log(`  ✓ ${journal.produced} with results (${pct(journal.produced)})`);
      console.log(`  ○ ${journal.no_signal} no signal   (${pct(journal.no_signal)})`);
      if (journal.error > 0) {
        console.log(`  ✗ ${journal.error} errors       (${pct(journal.error)})`);
      }
      console.log("");
    }

    if (results.length === 0) {
      const hint = journal.total === 0
        ? `\n  Run: loam distill --distiller @loamlog/distiller-issue-draft --llm <provider/model>`
        : "";
      console.log(
        `No distill results yet${repo ? ` in ${repo}` : ""}.${hint}`,
      );
      return;
    }

    const headers = ["Result ID", "Type", "Title", "Confidence"];
    const rows = results.map((r) => [
      r.id,
      r.type,
      r.title.length > 50 ? r.title.slice(0, 47) + "..." : r.title,
      r.confidence.toFixed(2),
    ]);

    console.log(formatTable(headers, rows));
    const scope = repo ? ` in ${repo}` : "";
    const mode = pending ? "pending" : "all";
    console.log(`${results.length} ${mode} results${scope}`);
  } else {
    const sessions = await listSessions(dumpDir, opts);

    if (format === "json") {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }
    if (format === "md") {
      console.error("Error: --format md is only available with --distill");
      process.exitCode = 1;
      return;
    }

    if (sessions.length === 0) {
      console.log(
        `No sessions found${repo ? ` in ${repo}` : ""}.\n  Tip: use --repo <name> to filter, or check daemon is running with: lsof -i :37468`,
      );
      return;
    }

    const headers = ["Session", "Provider", "Messages", "Time"];
    const rows = sessions.map((s) => [
      s.session_id.slice(0, 20),
      s.provider,
      String(s.messages_count),
      s.captured_at.slice(0, 16).replace("T", " "),
    ]);

    console.log(formatTable(headers, rows));
    console.log(
      `${sessions.length} sessions${repo ? ` in ${repo}` : ""}${opts.since ? ` (since ${opts.since})` : ""}`,
    );
  }
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  return args[idx + 1];
}
