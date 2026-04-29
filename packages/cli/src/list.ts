import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

interface ListOptions {
  dumpDir: string;
  repo?: string;
  since?: string;
  distill?: boolean;
  pending?: boolean;
  limit: number;
  json: boolean;
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
}

function sanitizeRepoName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parseDuration(value: string): number {
  const match = value.match(/^(\d+)(h|d|w)$/);
  if (!match) {
    throw new Error(`invalid duration: ${value}; expected format like 24h, 7d, 30d`);
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
  let entries;
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

async function listSessions(
  dumpDir: string,
  opts: ListOptions,
): Promise<SessionSummary[]> {
  const results: SessionSummary[] = [];
  const sinceTs = opts.since ? Date.now() - parseDuration(opts.since) : undefined;

  const repoDirs = opts.repo
    ? [sanitizeRepoName(opts.repo)]
    : await listRepos(dumpDir);

  for (const repoDir of repoDirs) {
    const sessionsDir = path.join(dumpDir, "repos", repoDir, "sessions");
    let entries;
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

      let parsed: { meta?: Record<string, unknown>; messages?: unknown[]; redacted?: Record<string, unknown> };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        continue;
      }

      const meta = parsed.meta;
      if (!meta || typeof meta.session_id !== "string") {
        continue;
      }

      const capturedAt = typeof meta.captured_at === "string" ? meta.captured_at : "";

      if (sinceTs) {
        const capturedTs = Date.parse(capturedAt);
        if (!Number.isNaN(capturedTs) && capturedTs < sinceTs) {
          continue;
        }
      }

      results.push({
        session_id: meta.session_id as string,
        provider: typeof meta.provider === "string" ? (meta.provider as string) : "unknown",
        repo: repoDir,
        captured_at: capturedAt,
        messages_count: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
        redacted_count:
          parsed.redacted && typeof parsed.redacted.redacted_count === "number"
            ? (parsed.redacted.redacted_count as number)
            : 0,
      });
    }
  }

  return results;
}

async function listDistillRepos(dumpDir: string): Promise<string[]> {
  const distillRoot = path.join(dumpDir, "distill");
  let entries;
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

async function listDistillResults(
  dumpDir: string,
  opts: ListOptions,
): Promise<DistillResultSummary[]> {
  const results: DistillResultSummary[] = [];
  const sinceTs = opts.since ? Date.now() - parseDuration(opts.since) : undefined;

  const repoDirs = opts.repo
    ? [sanitizeRepoName(opts.repo)]
    : await listDistillRepos(dumpDir);

  for (const repoDir of repoDirs) {
    const typeDirs = opts.pending ? ["pending"] : ["pending", "approved", "rejected"];

    for (const typeDir of typeDirs) {
      const resultsDir = path.join(dumpDir, "distill", repoDir, typeDir);
      let entries;
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
        };
        try {
          parsed = JSON.parse(text) as typeof parsed;
        } catch {
          continue;
        }

        if (!parsed.id) {
          continue;
        }

        results.push({
          id: parsed.id,
          type: typeof parsed.type === "string" ? parsed.type : "unknown",
          title: typeof parsed.title === "string" ? parsed.title : "(untitled)",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
          distiller_id: typeof parsed.distiller_id === "string" ? parsed.distiller_id : "unknown",
          repo: repoDir,
        });
      }
    }
  }

  return results;
}

function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((header, colIdx) => {
    const maxDataWidth = rows.reduce((max, row) => Math.max(max, (row[colIdx] ?? "").length), 0);
    return Math.max(header.length, maxDataWidth);
  });

  const padRight = (str: string, width: number) => {
    return str + " ".repeat(Math.max(0, width - str.length));
  };

  const separator = colWidths.map((w) => "─".repeat(w)).join("  ");
  const headerLine = headers.map((h, i) => padRight(h, colWidths[i])).join("  ");

  const lines = [headerLine, separator];
  for (const row of rows) {
    lines.push(row.map((cell, i) => padRight(cell, colWidths[i])).join("  "));
  }
  lines.push(separator);

  return lines.join("\n");
}

export async function runListCommand(args: string[]): Promise<void> {
  const dumpDir = getArg(args, "--dump-dir") ?? process.env.LOAM_DUMP_DIR;
  if (!dumpDir) {
    console.error("Error: LOAM_DUMP_DIR is not configured. Set env or pass --dump-dir");
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  const since = getArg(args, "--since");
  const distill = args.includes("--distill");
  const pending = args.includes("--pending");
  const json = args.includes("--json");
  const limitRaw = getArg(args, "--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;

  if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
    console.error(`Error: invalid --limit value: ${limitRaw}`);
    process.exitCode = 1;
    return;
  }

  const opts: ListOptions = {
    dumpDir,
    repo,
    since,
    distill,
    pending,
    limit,
    json,
  };

  if (distill) {
    const results = await listDistillResults(dumpDir, opts);

    if (json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(`No distill results found${repo ? ` in ${repo}` : ""}.\n  Run: loam distill --distiller @loamlog/distiller-issue-draft --llm <provider/model>`);
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

    if (json) {
      console.log(JSON.stringify(sessions, null, 2));
      return;
    }

    if (sessions.length === 0) {
      console.log(`No sessions found${repo ? ` in ${repo}` : ""}.\n  Tip: use --repo <name> to filter, or check daemon is running with: lsof -i :37468`);
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
    console.log(`${sessions.length} sessions${repo ? ` in ${repo}` : ""}${opts.since ? ` (since ${opts.since})` : ""}`);
  }
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  return args[idx + 1];
}
