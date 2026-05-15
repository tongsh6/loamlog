import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  type SessionArtifact,
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
import {
  createArtifactQueryClient,
  createDistillerStateKV,
  createLLMRouter,
  LocalAssetStore,
  runSignalGateForArtifact,
  SIGNAL_CLASSIFIER_ID,
} from "@loamlog/distill";
import {
  applyLlmOverride,
  applyLlmTimeoutOverride,
  loadAICConfig,
} from "./distill.js";

type SignalSubcommand = "list" | "show" | "review" | "rerun";

interface SignalMatch {
  signal: Signal;
  repo: string;
}

interface SignalRerunSummary {
  sessions_processed: number;
  signals_produced: number;
  classifier_items_rejected: number;
  errors: Array<{ session_id?: string; message: string }>;
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
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
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

function parseStatuses(
  raw: string | undefined,
): SignalReviewStatus[] | undefined {
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

function parsePositiveInt(
  raw: string | undefined,
  flagName: string,
): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return value;
}

function parseLimit(raw: string | undefined): number | undefined {
  return parsePositiveInt(raw, "--limit");
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

async function queryLatestArtifacts(input: {
  dumpDir: string;
  repo?: string;
  since?: string;
  until?: string;
  sessionIds?: string[];
  limit?: number;
}): Promise<SessionArtifact[]> {
  const state = createDistillerStateKV(input.dumpDir, SIGNAL_CLASSIFIER_ID);
  const artifactStore = createArtifactQueryClient(
    input.dumpDir,
    state,
    SIGNAL_CLASSIFIER_ID,
  );
  const latest = new Map<string, SessionArtifact>();

  for await (const artifact of artifactStore.query({
    repo: input.repo,
    since: input.since,
    until: input.until,
    session_ids: input.sessionIds,
  })) {
    const existing = latest.get(artifact.meta.session_id);
    if (existing && existing.meta.captured_at >= artifact.meta.captured_at) {
      continue;
    }
    latest.set(artifact.meta.session_id, artifact);
  }

  const artifacts = [...latest.values()].sort((a, b) =>
    a.meta.captured_at.localeCompare(b.meta.captured_at),
  );
  return input.limit === undefined
    ? artifacts
    : artifacts.slice(0, input.limit);
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
    excerpt: truncate(
      signal.spans[0]?.excerpt?.replace(/\s+/g, " ").trim() ?? "",
      44,
    ),
  }));

  const idWidth = Math.max(
    8,
    ...rows.map((row) => Math.min(row.id.length, 16)),
  );
  const repoWidth = Math.max(
    4,
    ...rows.map((row) => Math.min(row.repo.length, 18)),
  );
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
  lines.push(
    `- **tags**: ${signal.tags.length > 0 ? signal.tags.map((tag) => `\`${tag}\``).join(", ") : "-"}`,
  );
  lines.push(
    `- **classifier**: \`${signal.classifier.id}@${signal.classifier.version}\` · model \`${signal.classifier.model}\` · prompt \`${signal.classifier.prompt_version}\``,
  );
  lines.push(
    `- **created**: ${signal.created_at} · **updated**: ${signal.updated_at}`,
  );
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
    lines.push(
      `**[${i + 1}]** session \`${span.session_id}\` · msg \`${span.message_id}\``,
    );
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
    console.error(
      "Usage: loam signal show <id-prefix> [--repo <name>] [--dump-dir <path>] [--json] [--debug]",
    );
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  let match: SignalMatch | undefined;
  try {
    match = await findSignalByPrefix(dumpDir, repo, idPrefix);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
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
    console.error(
      "Usage: loam signal review <id-prefix> --status accepted|pending|ignored|rejected [--kind <kind>] [--tags <csv>] [--actor <actor>] [--temporal-state <state>] [--confidence <0..1>] [--reviewer <name>] [--note <text>]",
    );
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  let match: SignalMatch | undefined;
  try {
    match = await findSignalByPrefix(dumpDir, repo, idPrefix);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  if (!match) {
    console.error(`No signal matches id prefix '${idPrefix}'.`);
    process.exitCode = 1;
    return;
  }

  const current =
    match.signal.reviewed_classification ?? match.signal.machine_classification;
  const classification: SignalClassification = {
    kind: parseKinds(getArg(args, "--kind"))?.[0] ?? current.kind,
    tags: parseTags(getArg(args, "--tags")) ?? current.tags,
    actor: parseActor(getArg(args, "--actor")) ?? current.actor,
    temporal_state:
      parseTemporalState(getArg(args, "--temporal-state")) ??
      current.temporal_state,
    confidence:
      parseConfidence(getArg(args, "--confidence")) ?? current.confidence,
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

async function runSignalRerun(
  args: string[],
  dumpDirArg: string | undefined,
): Promise<void> {
  const loaded = await loadAICConfig();
  const withLlm = applyLlmTimeoutOverride(
    applyLlmOverride(loaded, getArg(args, "--llm")),
    parsePositiveInt(getArg(args, "--llm-timeout-ms"), "--llm-timeout-ms"),
  );
  const dumpDir = dumpDirArg ?? withLlm.dump_dir;
  if (!dumpDir) {
    console.error(
      "Error: LOAM_DUMP_DIR is not configured. Set env, pass --dump-dir, or set dump_dir in config",
    );
    process.exitCode = 1;
    return;
  }

  const repo = getArg(args, "--repo");
  const sessionIds = parseCsv(getArg(args, "--session"));
  const limit = parseLimit(getArg(args, "--limit"));
  const artifacts = await queryLatestArtifacts({
    dumpDir,
    repo,
    since: getArg(args, "--since"),
    until: getArg(args, "--until"),
    sessionIds,
    limit,
  });
  const llm = createLLMRouter(withLlm.llm, {
    logger: silentLogger,
  });
  const storeRepo = repo ? sanitizeRepo(repo) : "_global";
  const summary: SignalRerunSummary = {
    sessions_processed: 0,
    signals_produced: 0,
    classifier_items_rejected: 0,
    errors: [],
  };

  for (const artifact of artifacts) {
    try {
      const result = await runSignalGateForArtifact({
        artifact,
        dumpDir,
        llm,
        repo: storeRepo,
        logger: silentLogger,
      });
      summary.sessions_processed += 1;
      summary.signals_produced += result.signals.length;
      summary.classifier_items_rejected += result.rejected_count;
    } catch (error) {
      summary.errors.push({
        session_id: artifact.meta.session_id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(
    `[loam signal] rerun complete: processed=${summary.sessions_processed} signals=${summary.signals_produced} rejected_items=${summary.classifier_items_rejected} errors=${summary.errors.length}`,
  );
  if (summary.errors.length > 0) {
    for (const error of summary.errors) {
      console.log(
        `  [error]${error.session_id ? ` session=${error.session_id}` : ""} ${error.message}`,
      );
    }
  }
}

function printSignalUsage(): void {
  console.log("Usage: loam signal <list|show|review|rerun> [options]");
  console.log("Commands:");
  console.log(
    "  signal list   [--repo <name>] [--kind <csv>] [--status <csv>] [--promotable] [--session <id>] [--distiller <id>] [--limit <n>] [--json] [--dump-dir <path>]",
  );
  console.log(
    "  signal show   <id-prefix> [--repo <name>] [--json] [--debug] [--dump-dir <path>]",
  );
  console.log(
    "  signal review <id-prefix> --status accepted|pending|ignored|rejected [--kind <kind>] [--tags <csv>] [--actor <actor>] [--temporal-state <state>] [--confidence <0..1>] [--reviewer <name>] [--note <text>] [--dump-dir <path>]",
  );
  console.log(
    "  signal rerun  [--repo <name>] [--session <csv>] [--since <ISO>] [--until <ISO>] [--limit <n>] [--llm <provider/model>] [--llm-timeout-ms <n>] [--json] [--dump-dir <path>]",
  );
}

export async function runSignalCommand(args: string[]): Promise<void> {
  const [rawSubcommand = "list", ...rest] = args;
  const subcommand = rawSubcommand as SignalSubcommand;
  if (!["list", "show", "review", "rerun"].includes(subcommand)) {
    printSignalUsage();
    process.exitCode = 1;
    return;
  }

  const dumpDir = getArg(rest, "--dump-dir") ?? process.env.LOAM_DUMP_DIR;
  if (subcommand === "rerun") {
    try {
      await runSignalRerun(rest, dumpDir);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
    return;
  }

  if (!dumpDir) {
    console.error(
      "Error: LOAM_DUMP_DIR is not configured. Set env or pass --dump-dir",
    );
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
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
