import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AICConfig, DistillerPlugin, SinkPlugin } from "@loamlog/core";
import { createDistillEngine } from "@loamlog/distill";
import { createLLMRouter } from "@loamlog/distill";
import { createDistillerStateKV } from "@loamlog/distill";
import { createArtifactQueryClient } from "@loamlog/distill";
import { runDistillDAG, type ConfiguredSink } from "@loamlog/distill";
import type { OutputLanguage } from "@loamlog/distill";

interface DistillArgs {
  distiller?: string;
  llm?: string;
  llmTimeoutMs?: number;
  dumpDir?: string;
  since?: string;
  until?: string;
  testSession?: string;
  allUnprocessed?: boolean;
  dryRun?: boolean;
  dag?: boolean;
  legacy?: boolean;
  /** Stop processing after this many sessions are pulled from the queue. */
  maxSessions?: number;
  /** Skip sessions whose serialized size in bytes exceeds this threshold. */
  skipLargerThan?: number;
  /** User-facing output language for distill assets. */
  outputLanguage?: OutputLanguage;
}

type PluginSpec = string | { plugin: string; config: Record<string, unknown> };

type BuiltInModulePathResolver = (specifier: string) => string;

const BUILT_IN_PLUGIN_ENTRY_PATHS = {
  "@loamlog/distiller-pitfall-card": {
    dist: "../../distillers/pitfall-card/dist/index.js",
    src: "../../distillers/pitfall-card/src/index.ts",
  },
  "@loamlog/distiller-issue-draft": {
    dist: "../../distillers/issue-draft/dist/index.js",
    src: "../../distillers/issue-draft/src/index.ts",
  },
  "@loamlog/distiller-knowledge-card": {
    dist: "../../distillers/knowledge-card/dist/index.js",
    src: "../../distillers/knowledge-card/src/index.ts",
  },
  "@loamlog/distiller-prd-draft": {
    dist: "../../distillers/prd-draft/dist/index.js",
    src: "../../distillers/prd-draft/src/index.ts",
  },
  "@loamlog/sink-file": {
    dist: "../../sinks/file/dist/index.js",
    src: "../../sinks/file/src/index.ts",
  },
  "@loamlog/sink-github": {
    dist: "../../sinks/github/dist/index.js",
    src: "../../sinks/github/src/index.ts",
  },
  "@loamlog/sink-notion": {
    dist: "../../sinks/notion/dist/index.js",
    src: "../../sinks/notion/src/index.ts",
  },
} as const;

const BUILT_IN_PLUGIN_SPECIFIERS = new Set<string>([
  "@loamlog/distiller-pitfall-card",
  "@loamlog/distiller-issue-draft",
  "@loamlog/distiller-knowledge-card",
  "@loamlog/distiller-prd-draft",
  "@loamlog/sink-file",
  "@loamlog/sink-github",
  "@loamlog/sink-notion",
]);

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  return args[idx + 1];
}

function parseOptionalInt(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid ${flagName} value: ${value}`);
  }

  return parsed;
}

function parseOutputLanguage(value: string | undefined): OutputLanguage | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "auto" || value === "zh" || value === "en") {
    return value;
  }
  throw new Error(`invalid --output-language value: ${value}; expected auto, zh, or en`);
}

export function parseArgs(args: string[]): DistillArgs {
  return {
    distiller: getArg(args, "--distiller"),
    llm: getArg(args, "--llm"),
    llmTimeoutMs: parseOptionalInt(getArg(args, "--llm-timeout-ms"), "--llm-timeout-ms"),
    dumpDir: getArg(args, "--dump-dir"),
    since: getArg(args, "--since"),
    until: getArg(args, "--until"),
    testSession: getArg(args, "--test-session"),
    allUnprocessed: args.includes("--all-unprocessed"),
    dryRun: args.includes("--dry-run"),
    dag: args.includes("--dag"),
    legacy: args.includes("--legacy"),
    maxSessions: parseOptionalInt(getArg(args, "--max-sessions"), "--max-sessions"),
    skipLargerThan: parseOptionalInt(getArg(args, "--skip-larger-than"), "--skip-larger-than"),
    outputLanguage: parseOutputLanguage(getArg(args, "--output-language")),
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadConfigFromFile(filePath: string): Promise<AICConfig | undefined> {
  if (!(await exists(filePath))) {
    return undefined;
  }

  if (filePath.endsWith(".json")) {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text) as AICConfig;
  }

  const loaded = (await import(pathToFileURL(filePath).href)) as { default?: unknown };
  if (!loaded.default || typeof loaded.default !== "object") {
    return undefined;
  }

  return loaded.default as AICConfig;
}

export async function loadAICConfig(): Promise<AICConfig> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "loam.config.ts"),
    path.join(cwd, "loam.config.js"),
    path.join(cwd, "aic.config.json"),
  ];

  for (const filePath of candidates) {
    try {
      const loaded = await loadConfigFromFile(filePath);
      if (loaded) {
        return loaded;
      }
    } catch {
      continue;
    }
  }

  return {
    dump_dir: process.env.LOAM_DUMP_DIR,
    distillers: ["@loamlog/distiller-pitfall-card"],
    sinks: ["@loamlog/sink-file"],
  };
}

function resolveBuiltInModulePath(specifier: string): string {
  const entry = BUILT_IN_PLUGIN_ENTRY_PATHS[specifier as keyof typeof BUILT_IN_PLUGIN_ENTRY_PATHS];
  if (!entry) {
    throw new Error(`unsupported built-in plugin specifier: ${specifier}`);
  }

  for (const candidate of [entry.dist, entry.src]) {
    const resolvedPath = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  throw new Error(`unable to resolve built-in module path for ${specifier}`);
}

function normalizePluginSpec(
  item: PluginSpec,
  resolveModulePath: BuiltInModulePathResolver,
): PluginSpec {
  if (typeof item === "string") {
    if (!BUILT_IN_PLUGIN_SPECIFIERS.has(item)) {
      return item;
    }
    return pathToFileURL(resolveModulePath(item)).href;
  }

  if (!BUILT_IN_PLUGIN_SPECIFIERS.has(item.plugin)) {
    return item;
  }

  return {
    ...item,
    plugin: pathToFileURL(resolveModulePath(item.plugin)).href,
  };
}

export function normalizeBuiltInPluginSpecifiers(
  config: AICConfig,
  resolveModulePath: BuiltInModulePathResolver = resolveBuiltInModulePath,
): AICConfig {
  return {
    ...config,
    distillers: config.distillers.map((item) => normalizePluginSpec(item, resolveModulePath)),
    sinks: config.sinks?.map((item) => normalizePluginSpec(item, resolveModulePath)),
  };
}

export function buildRuntimeDistillConfig(
  config: AICConfig,
  distillerOverride: string | undefined,
  resolveModulePath: BuiltInModulePathResolver = resolveBuiltInModulePath,
): AICConfig {
  const configuredDistillers =
    distillerOverride
      ? [distillerOverride]
      : config.distillers.length > 0
        ? config.distillers
        : ["@loamlog/distiller-pitfall-card"];

  const withDefaults: AICConfig = {
    ...config,
    distillers: configuredDistillers,
    sinks: config.sinks && config.sinks.length > 0 ? config.sinks : ["@loamlog/sink-file"],
  };

  return normalizeBuiltInPluginSpecifiers(withDefaults, resolveModulePath);
}

export function applyLlmOverride(config: AICConfig, llm: string | undefined): AICConfig {
  if (!llm) {
    return config;
  }

  const separatorIndex = llm.indexOf("/");
  const provider = separatorIndex >= 0 ? llm.slice(0, separatorIndex) : "";
  const model = separatorIndex >= 0 ? llm.slice(separatorIndex + 1) : "";
  if (!provider || !model) {
    throw new Error(`invalid --llm format: ${llm}; expected provider/model`);
  }

  const existingProviders = config.llm?.providers ?? {};
  const remainingProviders = Object.fromEntries(
    Object.entries(existingProviders).filter(([providerId]) => providerId !== provider),
  );

  return {
    ...config,
    llm: {
      ...config.llm,
      providers: {
        [provider]: {
          ...(existingProviders[provider] ?? {}),
          model,
        },
        ...remainingProviders,
      },
    },
  };
}

export function applyLlmTimeoutOverride(config: AICConfig, timeoutMs: number | undefined): AICConfig {
  if (timeoutMs === undefined) {
    return config;
  }

  return {
    ...config,
    llm: {
      ...config.llm,
      timeout_ms: timeoutMs,
    },
  };
}

async function createTestDumpDir(testSessionPath: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "loam-distill-test-"));
  const sessionsDir = path.join(tempDir, "_global", "sessions");
  await mkdir(sessionsDir, { recursive: true });

  const content = await readFile(testSessionPath, "utf8");
  const targetPath = path.join(sessionsDir, path.basename(testSessionPath));
  await writeFile(targetPath, content, "utf8");

  return tempDir;
}

async function runDryRun(config: AICConfig, dumpDir: string, parsed: DistillArgs): Promise<void> {
  console.log("[loam distill] --dry-run: counting unprocessed sessions...\n");

  let grandTotal = 0;

  for (const item of config.distillers) {
    const spec = typeof item === "string" ? { plugin: item, config: {} } : item;
    const loaded = (await import(spec.plugin)) as { default?: unknown };
    const distiller =
      typeof loaded.default === "function" ? await loaded.default(spec.config) : loaded.default;
    if (!distiller || typeof (distiller as DistillerPlugin).run !== "function") continue;

    const d = distiller as DistillerPlugin;
    const state = createDistillerStateKV(dumpDir, d.id);
    const store = createArtifactQueryClient(dumpDir, state, d.id, {
      since: parsed.since,
      until: parsed.until,
    });

    let count = 0;
    for await (const _ of store.getUnprocessed(d.id)) {
      count++;
    }

    console.log(`  ${d.id}: ${count} unprocessed session(s)`);
    grandTotal += count;
  }

  console.log(`\n  Total: ${grandTotal} unprocessed session(s) across all distillers`);
  console.log("  (dry-run: no distill was executed)");
}

export async function runDistillCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const loaded = await loadAICConfig();
  const withLlm = applyLlmTimeoutOverride(applyLlmOverride(loaded, parsed.llm), parsed.llmTimeoutMs);
  const config = buildRuntimeDistillConfig(withLlm, parsed.distiller);

  let tempDumpDir: string | undefined;
  const dumpDir = parsed.testSession
    ? await createTestDumpDir(parsed.testSession)
    : parsed.dumpDir ?? config.dump_dir ?? process.env.LOAM_DUMP_DIR;

  if (parsed.testSession) {
    tempDumpDir = dumpDir;
  }

  if (!dumpDir) {
    throw new Error("LOAM_DUMP_DIR is not configured; set env or pass --dump-dir");
  }

  config.dump_dir = dumpDir;

  // --all-unprocessed: process all unprocessed sessions regardless of time
  if (parsed.allUnprocessed) {
    console.log("[loam distill] --all-unprocessed mode: processing all unprocessed sessions");
    parsed.since = undefined;
    parsed.until = undefined;
  }

  // --dry-run: count unprocessed sessions without distilling
  if (parsed.dryRun) {
    await runDryRun(config, dumpDir, parsed);
    return;
  }

  if (parsed.legacy) {
    console.log("[loam distill] legacy mode (sequential engine)");
    await runDistillWithEngine(config, dumpDir, parsed);
  } else {
    await runDistillWithDAG(config, dumpDir, parsed);
  }

  if (tempDumpDir) {
    await rm(tempDumpDir, { recursive: true, force: true });
  }
}

async function runDistillWithEngine(
  config: AICConfig,
  dumpDir: string,
  parsed: DistillArgs,
): Promise<void> {
  const engine = createDistillEngine({ dumpDir, config });

  await engine.loadFromConfig(config);
  const reports = await engine.run({
    distillers: parsed.distiller ? [parsed.distiller] : undefined,
    since: parsed.since,
    until: parsed.until,
  });

  let totalProcessed = 0;
  let totalProduced = 0;
  let totalSkipped = 0;
  for (const report of reports) {
    totalProcessed += report.artifacts_processed;
    totalProduced += report.results_produced;
    totalSkipped += report.results_skipped;
    console.log(
      `[loam distill] ${report.distiller_id}: processed=${report.artifacts_processed} produced=${report.results_produced} skipped=${report.results_skipped} errors=${report.errors.length}`,
    );
    for (const err of report.errors) {
      console.log(`  [error] ${err.message}${err.session_id ? ` (session: ${err.session_id.slice(0, 20)})` : ""}`);
    }
  }

  console.log(
    `[loam distill] Processed ${totalProcessed} sessions, produced ${totalProduced} results, skipped ${totalSkipped}`,
  );
  if (totalProduced > 0) {
    console.log(`[loam distill] Results written to ${path.join(dumpDir, "distill")}`);
  }
}

async function runDistillWithDAG(
  config: AICConfig,
  dumpDir: string,
  parsed: DistillArgs,
): Promise<void> {
  console.log("[loam distill] DAG mode enabled");

  // Load sinks
  const sinks: ConfiguredSink[] = [];
  for (const item of config.sinks ?? []) {
    const spec = typeof item === "string" ? { plugin: item, config: {} } : item;
    const loaded = (await import(spec.plugin)) as { default?: unknown };
    const sink = typeof loaded.default === "function" ? await loaded.default(spec.config) : loaded.default;
    if (sink && typeof (sink as SinkPlugin).deliver === "function") {
      sinks.push({ plugin: sink as SinkPlugin, config: spec.config });
    }
  }

  const llm = createLLMRouter(config.llm, {
    logger: { info: () => {}, warn: () => {} },
  });

  // Resolve context window from the configured provider for token-aware sharding
  const contextWindow = llm.getDefaultContextWindow();

  let totalProcessed = 0;
  let totalProduced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalQualityFailed = 0;

  for (const item of config.distillers) {
    const spec = typeof item === "string" ? { plugin: item, config: {} } : item;
    const loaded = (await import(spec.plugin)) as { default?: unknown };
    const distiller = typeof loaded.default === "function" ? await loaded.default(spec.config) : loaded.default;
    if (!distiller || typeof (distiller as DistillerPlugin).run !== "function") {
      console.log(`[loam distill] skipping invalid distiller: ${spec.plugin}`);
      continue;
    }

    const d = distiller as DistillerPlugin;
    const state = createDistillerStateKV(dumpDir, d.id);

    const result = await runDistillDAG({
      distiller: d,
      distillerConfig: spec.config,
      llm,
      state,
      sinks,
      dumpDir,
      contextWindow,
      since: parsed.since,
      until: parsed.until,
      maxSessions: parsed.maxSessions,
      skipLargerThan: parsed.skipLargerThan,
      outputLanguage: parsed.outputLanguage ?? config.distill?.output_language,
    });

    totalProcessed += result.artifactsProcessed;
    totalProduced += result.results.length;
    totalSkipped += result.skipped;
    totalErrors += result.errors.length;
    totalQualityFailed += result.qualityReports.filter((q) => !q.passed).length;

    console.log(
      `[loam distill:DAG] ${d.id}: processed=${result.artifactsProcessed} produced=${result.results.length} skipped=${result.skipped} errors=${result.errors.length} qualityPassed=${result.qualityReports.filter((q) => q.passed).length}/${result.qualityReports.length} audit=${result.audit.length}`,
    );

    // Print DAG node report
    for (const node of result.report.nodes) {
      const statusIcon = node.status === "success" ? "✓" : node.status === "skipped" ? "○" : "✗";
      console.log(
        `  ${statusIcon} ${node.nodeId}: ${node.status} (${node.durationMs}ms)${node.error ? ` — ${node.error}` : ""}`,
      );
    }

    for (const err of result.errors) {
      console.log(`  [error] ${err.message}${err.session_id ? ` (session: ${err.session_id.slice(0, 20)})` : ""}`);
    }
  }

  console.log(
    `[loam distill:DAG] Total: processed=${totalProcessed} produced=${totalProduced} skipped=${totalSkipped} errors=${totalErrors} qualityFailed=${totalQualityFailed}`,
  );
  if (totalProduced > 0) {
    console.log(`[loam distill:DAG] Results written to ${path.join(dumpDir, "distill")}`);
  }
}
