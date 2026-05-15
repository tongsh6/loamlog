import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  isSignalKind,
  isSignalTag,
  type Logger,
  type Signal,
  type SignalActor,
  type SignalClassification,
  type SignalKind,
  type SignalListFilter,
  type SignalReviewStatus,
  type SignalTag,
  type SignalTemporalState,
} from "@loamlog/core";
import { LocalAssetStore } from "@loamlog/distill";

type SignalSubcommand = "list" | "show" | "review";

interface SignalMatch {
  signal: Signal;
  repo: string;
}

const REVIEW_STATUSES: SignalReviewStatus[] = [
  "accepted",
  "pending",
  "ignored",
  "rejected",
];

const ACTORS: SignalActor[] = ["user", "assistant", "tool", "system", "mixed"];
const TEMPORAL_STATES: SignalTemporalState[] = [
  "future",
  "current",
  "in_progress",
  "completed",
  "obsolete",
  "unknown",
];

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function sanitizeRepo(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function listDistillRepos(dumpDir: string): Promise<string[]> {
  const root = path.join(dumpDir, "distill");
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseKinds(raw: string | undefined): SignalKind[] | undefined {
  const values = parseCsv(raw);
  if (!values) return undefined;
  const invalid = values.filter((value) => !isSignalKind(value));
  if (invalid.length > 0) {
    throw new Error(`invalid --kind value: ${invalid.join(", ")}`);
  }
  return values as SignalKind[];
}

function parseTags(raw: string | undefined): SignalTag[] | undefined {
  const values = parseCsv(raw);
  if (!values) return undefined;
  const invalid = values.filter((value) => !isSignalTag(value));
  if (invalid.length > 0) {
    throw new Error(`invalid --tags value: ${invalid.join(", ")}`);
  }
  return values as SignalTag[];
}

function parseStatuses(raw: string | undefined): SignalReviewStatus[] | undefined {
  const values = parseCsv(raw);
  if (!values) return undefined;
  const invalid = values.filter(
    (value) => !REVIEW_STATUSES.includes(value as SignalReviewStatus),
  );
  if (invalid.length > 0) {
    throw new Error(`invalid --status value: ${invalid.join(", ")}`);
  }
  return values as SignalReviewStatus[];
}

function parseActor(raw: string | undefined): SignalActor | undefined {
  if (!raw) return undefined;
  if (!ACTORS.includes(raw as SignalActor)) {
    throw new Error(`invalid --actor value: ${raw}`);
  }
  return raw as SignalActor;
}

function parseTemporalState(
  raw: string | undefined,
): SignalTemporalState | undefined {
  if (!raw) return undefined;
  if (!TEMPORAL_STATES.includes(raw as SignalTemporalState)) {
    throw new Error(`invalid --temporal-state value: ${raw}`);
  }
  return raw as SignalTemporalState;
}

function parseConfidence(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("--confidence must be a number between 0 and 1");
  }
  return value;
}

function parseLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--limit must be a positive integer");
  }
  return value;
}

async function listStores(
  dumpDir: string,
  repo?: string,
): Promise<Array<{ repo: string; store: LocalAssetStore }>> {
  const repos = repo ? [sanitizeRepo(repo)] : await listDistillRepos(dumpDir);
  return repos.map((repoName) => ({
    repo: repoName,
    store: new LocalAssetStore(dumpDir, repoName, silentLogger),
  }));
}

async function listSignals(
  dumpDir: string,
  repo: string | undefined,
  filter: SignalListFilter,
  limit?: number,
): Promise<SignalMatch[]> {
  const matches: SignalMatch[] = [];
  const stores = await listStores(dumpDir, repo);

  for (const { repo: repoName, store } of stores) {
    const signals = await store.listSignals(filter);
    for (const signal of signals) {
      matches.push({ signal, repo: repoName });
      if (limit !== undefined && matches.length >= limit) {
        return matches;
      }
    }
  }

  return matches;
}

async function findSignalByPrefix(
  dumpDir: string,
  repo: string | undefined,
  idPrefix: string,
): Promise<SignalMatch | undefined> {
  const stores = await listStores(dumpDir, repo);
  const matches: SignalMatch[] = [];

  for (const { repo: repoName, store } of stores) {
    const signals = await store.listSignals();
    for (const signal of signals) {
      if (signal.id.startsWith(idPrefix)) {
        matches.push({ signal, repo: repoName });
      }
    }
  }

  if (matches.length === 0) return undefined;
  if (matches.length > 1) {
    throw new Error(
      `ambiguous signal id prefix '${idPrefix}' matched ${matches.length}: ${matches
        .map((match) => match.signal.id.slice(0, 12))
        .join(", ")}`,
    );
  }
  return matches[0];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0).padStart(3)}%`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatSignalTable(matches: SignalMatch[]): string {
  if (matches.length === 0) return "(none)";

  const rows = matches.map(({ signal, repo }) => ({
    id: signal.id,
    repo,
    status: signal.review_status,
    kind: signal.kind,
    actor: signal.actor,
    state: signal.temporal_state,
    confidence: formatPercent(signal.confidence),
    spans: String(signal.spans.length),
    excerpt: truncate(signal.spans[0]?.excerpt?.replace(/\s+/g, " ").trim() ?? "", 44),
  }));

  const idWidth = Math.max(8, ...rows.map((row) => Math.min(row.id.length, 16)));
  const repoWidth = Math.max(4, ...rows.map((row) => Math.min(row.repo.length, 18)));
  const kindWidth = Math.max(4, ...rows.map((row) => row.kind.length));
  const statusWidth = Math.max(6, ...rows.map((row) => row.status.length));

  const lines = [
    `${"ID".padEnd(idWidth)}  ${"REPO".padEnd(repoWidth)}  ${"STATUS".padEnd(statusWidth)}  ${"KIND".padEnd(kindWidth)}  ACTOR      STATE        CONF  SPAN  EXCERPT`,
    `${"-".repeat(idWidth)}  ${"-".repeat(repoWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(kindWidth)}  ---------  -----------  ----  ----  -------`,
  ];

  for (const row of rows) {
    lines.push(
      `${truncate(row.id, idWidth).padEnd(idWidth)}  ${truncate(row.repo, repoWidth).padEnd(repoWidth)}  ${row.status.padEnd(statusWidth)}  ${row.kind.padEnd(kindWidth)}  ${row.actor.padEnd(9)}  ${row.state.padEnd(11)}  ${row.confidence}  ${row.spans.padStart(4)}  ${row.excerpt}`,
    );
  }

  return lines.join("\n");
}

function renderSignalMarkdown(match: SignalMatch, debug: boolean): string {
  const { signal, repo } = match;
  const lines: string[] = [];

  lines.push(`# Signal ${signal.id}`);
  lines.push("");
  lines.push(`- **repo**: \`${repo}\``);
  lines.push(`- **status**: \`${signal.review_status}\``);
  lines.push(
    `- **classification**: \`${signal.kind}\` · actor \`${signal.actor}\` · temporal \`${signal.temporal_state}\` · confidence ${signal.confidence.toFixed(2)}`,
  );
  lines.push(`- **tags**: ${signal.tags.length > 0 ? signal.tags.map((tag) => `\`${tag}\``).join(", ") : "-"}`);
  lines.push(`- **classifier**: \`${signal.classifier.id}@${signal.classifier.version}\` · model \`${signal.classifier.model}\` · prompt \`${signal.classifier.prompt_version}\``);
  lines.push(`- **created**: ${signal.created_at} · **updated**: ${signal.updated_at}`);
  if (signal.notes) {
    lines.push(`- **notes**: ${signal.notes}`);
  }
  if (signal.reviewed_classification) {
    lines.push(
      `- **reviewed_by**: \`${signal.reviewed_classification.reviewer}\` at ${signal.reviewed_classification.reviewed_at}`,
    );
    if (signal.reviewed_classification.note) {
      lines.push(`- **review_note**: ${signal.reviewed_classification.note}`);
    }
  }
  lines.push("");

  lines.push(`## Evidence (${signal.spans.length})`);
  lines.push("");
  for (let i = 0; i < signal.spans.length; i++) {
    const span = signal.spans[i];
    lines.push(`**[${i + 1}]** session \`${span.session_id}\` · msg \`${span.message_id}\``);
    lines.push("");
    lines.push(`> ${span.excerpt.replace(/\r?\n/g, " ").trim()}`);
    lines.push("");
  }

  lines.push(`## Promotion (${signal.promotion_hints.length})`);
  lines.push("");
  if (signal.promotion_hints.length === 0) {
    lines.push("_(none)_");
    lines.push("");
  } else {
    for (const hint of signal.promotion_hints) {
      lines.push(
        `- \`${hint.target_distiller}\` -> \`${hint.eligibility}\`: ${hint.reason}`,
      );
    }
    lines.push("");
  }

  if (debug) {
    lines.push("## Debug");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(signal, null, 2));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

async function runSignalList(args: string[], dumpDir: string): Promise<void> {
  const repo = getArg(args, "--repo");
  const limit = parseLimit(getArg(args, "--limit"));
  const filter: SignalListFilter = {
    kind: parseKinds(getArg(args, "--kind")),
    status: parseStatuses(getArg(args, "--status")),
    session_id: getArg(args, "--session"),
    distiller_id: getArg(args, "--distiller"),
    promotable: args.includes("--promotable") ? true : undefined,
  };

  const matches = await listSignals(dumpDir, repo, filter, limit);
  if (args.includes("--json")) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  console.log(formatSignalTable(matches));
  console.log(`\n${matches.length} signal(s).`);
}

async function runSignalShow(args: string[], dumpDir: string): Promise<void> {
  const idPrefix = args.find(
    (arg) =>
      !arg.startsWith("--") &&
      arg !== "show" &&
      arg !== getArg(args, "--dump-dir") &&
      arg !== getArg(args, "--repo"),
  );
  if (!idPrefix) {
    console.error("Usage: loam signal show <id-prefix> [--repo <name>] [--dump-dir <path>] [--json] [--debug]");
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  let match: SignalMatch | undefined;
  try {
    match = await findSignalByPrefix(dumpDir, repo, idPrefix);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (!match) {
    console.error(`No signal matches id prefix '${idPrefix}'.`);
    console.error("Tip: loam signal list --limit 50");
    process.exitCode = 1;
    return;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(match.signal, null, 2));
    return;
  }

  console.log(renderSignalMarkdown(match, args.includes("--debug")));
}

async function runSignalReview(args: string[], dumpDir: string): Promise<void> {
  const idPrefix = args.find(
    (arg) =>
      !arg.startsWith("--") &&
      arg !== "review" &&
      arg !== getArg(args, "--dump-dir") &&
      arg !== getArg(args, "--repo") &&
      arg !== getArg(args, "--status") &&
      arg !== getArg(args, "--kind") &&
      arg !== getArg(args, "--tags") &&
      arg !== getArg(args, "--actor") &&
      arg !== getArg(args, "--temporal-state") &&
      arg !== getArg(args, "--confidence") &&
      arg !== getArg(args, "--reviewer") &&
      arg !== getArg(args, "--note"),
  );
  const rawStatus = getArg(args, "--status");
  const statuses = parseStatuses(rawStatus);

  if (!idPrefix || !statuses || statuses.length !== 1) {
    console.error("Usage: loam signal review <id-prefix> --status accepted|pending|ignored|rejected [--kind <kind>] [--tags <csv>] [--actor <actor>] [--temporal-state <state>] [--confidence <0..1>] [--reviewer <name>] [--note <text>]");
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  let match: SignalMatch | undefined;
  try {
    match = await findSignalByPrefix(dumpDir, repo, idPrefix);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (!match) {
    console.error(`No signal matches id prefix '${idPrefix}'.`);
    process.exitCode = 1;
    return;
  }

  const current = match.signal.reviewed_classification ?? match.signal.machine_classification;
  const classification: SignalClassification = {
    kind: parseKinds(getArg(args, "--kind"))?.[0] ?? current.kind,
    tags: parseTags(getArg(args, "--tags")) ?? current.tags,
    actor: parseActor(getArg(args, "--actor")) ?? current.actor,
    temporal_state:
      parseTemporalState(getArg(args, "--temporal-state")) ??
      current.temporal_state,
    confidence: parseConfidence(getArg(args, "--confidence")) ?? current.confidence,
  };

  const store = new LocalAssetStore(dumpDir, match.repo, silentLogger);
  const reviewed = await store.reviewSignal(match.signal.id, {
    review_status: statuses[0],
    classification,
    reviewer: getArg(args, "--reviewer") ?? "human",
    note: getArg(args, "--note"),
  });

  console.log(
    `[loam signal] Reviewed ${reviewed.id}: ${reviewed.review_status} (${reviewed.kind}, ${reviewed.tags.join(",") || "no-tags"})`,
  );
}

function printSignalUsage(): void {
  console.log("Usage: loam signal <list|show|review> [options]");
  console.log("Commands:");
  console.log("  signal list   [--repo <name>] [--kind <csv>] [--status <csv>] [--promotable] [--session <id>] [--distiller <id>] [--limit <n>] [--json] [--dump-dir <path>]");
  console.log("  signal show   <id-prefix> [--repo <name>] [--json] [--debug] [--dump-dir <path>]");
  console.log("  signal review <id-prefix> --status accepted|pending|ignored|rejected [--kind <kind>] [--tags <csv>] [--actor <actor>] [--temporal-state <state>] [--confidence <0..1>] [--reviewer <name>] [--note <text>] [--dump-dir <path>]");
}

export async function runSignalCommand(args: string[]): Promise<void> {
  const [rawSubcommand = "list", ...rest] = args;
  const subcommand = rawSubcommand as SignalSubcommand;
  if (!["list", "show", "review"].includes(subcommand)) {
    printSignalUsage();
    process.exitCode = 1;
    return;
  }

  const dumpDir = getArg(rest, "--dump-dir") ?? process.env.LOAM_DUMP_DIR;
  if (!dumpDir) {
    console.error("Error: LOAM_DUMP_DIR is not configured. Set env or pass --dump-dir");
    process.exitCode = 1;
    return;
  }

  try {
    if (subcommand === "list") {
      await runSignalList(rest, dumpDir);
      return;
    }
    if (subcommand === "show") {
      await runSignalShow(rest, dumpDir);
      return;
    }
    await runSignalReview(rest, dumpDir);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
