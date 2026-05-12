import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

interface DistillEvidence {
  session_id?: string;
  message_id?: string;
  excerpt?: string;
}

interface DistillResultRecord {
  id: string;
  fingerprint?: string;
  title?: string;
  summary?: string;
  type?: string;
  confidence?: number;
  tags?: string[];
  distiller_id?: string;
  evidence?: DistillEvidence[];
  payload?: {
    detail?: string;
    category?: string;
    title?: string;
    summary?: string;
    tags?: string[];
    [k: string]: unknown;
  };
  verification?: {
    status?: string;
    mining_score?: number;
    reason?: string;
  };
  render?: { markdown?: string };
}

interface ShowOptions {
  dumpDir: string;
  idPrefix: string;
  json: boolean;
}

const SUBDIRS = ["pending", "approved", "rejected"] as const;

async function listDistillRepos(dumpDir: string): Promise<string[]> {
  const root = path.join(dumpDir, "distill");
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function findCardByPrefix(
  dumpDir: string,
  idPrefix: string,
): Promise<{ record: DistillResultRecord; filePath: string; repo: string; status: string } | undefined> {
  const repos = await listDistillRepos(dumpDir);
  const matches: Array<{ record: DistillResultRecord; filePath: string; repo: string; status: string }> = [];

  for (const repo of repos) {
    for (const status of SUBDIRS) {
      const dir = path.join(dumpDir, "distill", repo, status);
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".json")) continue;
        if (!e.name.startsWith(idPrefix)) continue;
        const filePath = path.join(dir, e.name);
        try {
          const text = await readFile(filePath, "utf8");
          const record = JSON.parse(text) as DistillResultRecord;
          if (record.id?.startsWith(idPrefix)) {
            matches.push({ record, filePath, repo, status });
          }
        } catch {
          continue;
        }
      }
    }
  }

  if (matches.length === 0) return undefined;
  if (matches.length > 1) {
    throw new Error(
      `ambiguous id prefix '${idPrefix}' — matched ${matches.length}: ${matches
        .map((m) => m.record.id.slice(0, 12))
        .join(", ")}`,
    );
  }
  return matches[0];
}

export function renderCardMarkdown(
  record: DistillResultRecord,
  meta: { filePath: string; repo: string; status: string },
): string {
  const lines: string[] = [];
  const title = record.title ?? record.payload?.title ?? "(untitled)";
  const summary = record.summary ?? record.payload?.summary ?? "";
  const detail = record.payload?.detail;
  const tags = record.tags?.length ? record.tags.join(", ") : "—";
  const conf = typeof record.confidence === "number" ? record.confidence.toFixed(2) : "—";
  const category = record.payload?.category ? ` · category: \`${record.payload.category}\`` : "";
  const ver = record.verification;

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `- **id**: \`${record.id}\` · **status**: ${meta.status} · **repo**: ${meta.repo}`,
  );
  lines.push(`- **type**: ${record.type ?? "?"} · **confidence**: ${conf}${category}`);
  lines.push(`- **distiller**: \`${record.distiller_id ?? "?"}\``);
  if (ver) {
    const score = typeof ver.mining_score === "number" ? ver.mining_score.toFixed(2) : "?";
    lines.push(`- **verification**: \`${ver.status ?? "?"}\` (mining_score: ${score})${ver.reason ? ` — ${ver.reason}` : ""}`);
  }
  lines.push(`- **tags**: ${tags}`);
  lines.push("");

  if (summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(summary);
    lines.push("");
  }

  if (detail) {
    lines.push("## Detail");
    lines.push("");
    lines.push(detail);
    lines.push("");
  }

  const evidence = record.evidence ?? [];
  lines.push(`## Evidence (${evidence.length})`);
  lines.push("");
  if (evidence.length === 0) {
    lines.push("_(no evidence)_");
    lines.push("");
  } else {
    for (let i = 0; i < evidence.length; i++) {
      const e = evidence[i];
      const sid = (e.session_id ?? "?").slice(0, 12);
      const mid = (e.message_id ?? "?").slice(0, 12);
      lines.push(`**[${i + 1}]** session \`${sid}\` · msg \`${mid}\``);
      lines.push("");
      const excerpt = (e.excerpt ?? "").replace(/\r?\n/g, " ").trim();
      if (excerpt) {
        lines.push(`> ${excerpt.length > 600 ? `${excerpt.slice(0, 600)}…` : excerpt}`);
        lines.push("");
      }
    }
  }

  lines.push("## Source");
  lines.push("");
  lines.push(`- file: \`${meta.filePath}\``);
  if (record.fingerprint) {
    lines.push(`- fingerprint: \`${record.fingerprint}\``);
  }
  lines.push("");

  return lines.join("\n");
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

export async function runShowCommand(args: string[]): Promise<void> {
  // Positional id-prefix is the first non-flag arg
  const idPrefix = args.find((a) => !a.startsWith("--") && a !== getArg(args, "--dump-dir"));
  if (!idPrefix) {
    console.error("Usage: loam show <id-prefix> [--dump-dir <path>] [--json]");
    process.exitCode = 1;
    return;
  }

  const dumpDir = getArg(args, "--dump-dir") ?? process.env.LOAM_DUMP_DIR;
  if (!dumpDir) {
    console.error("Error: LOAM_DUMP_DIR is not configured. Set env or pass --dump-dir");
    process.exitCode = 1;
    return;
  }

  const json = args.includes("--json");
  const opts: ShowOptions = { dumpDir, idPrefix, json };

  let match: Awaited<ReturnType<typeof findCardByPrefix>>;
  try {
    match = await findCardByPrefix(opts.dumpDir, opts.idPrefix);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (!match) {
    console.error(`No distill result matches id prefix '${idPrefix}'.`);
    console.error(`Tip: loam list --distill --pending --limit 50`);
    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(JSON.stringify(match.record, null, 2));
    return;
  }

  console.log(renderCardMarkdown(match.record, match));
}
