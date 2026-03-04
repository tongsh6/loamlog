import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AICConfig } from "@loamlog/core";
import { createDistillEngine } from "@loamlog/distill";

interface DistillArgs {
  distiller?: string;
  llm?: string;
  dumpDir?: string;
  since?: string;
  until?: string;
  testSession?: string;
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  return args[idx + 1];
}

function parseArgs(args: string[]): DistillArgs {
  return {
    distiller: getArg(args, "--distiller"),
    llm: getArg(args, "--llm"),
    dumpDir: getArg(args, "--dump-dir"),
    since: getArg(args, "--since"),
    until: getArg(args, "--until"),
    testSession: getArg(args, "--test-session"),
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

async function loadAICConfig(): Promise<AICConfig> {
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

function applyLlmOverride(config: AICConfig, llm: string | undefined): AICConfig {
  if (!llm) {
    return config;
  }

  const [provider, model] = llm.split("/");
  if (!provider || !model) {
    throw new Error(`invalid --llm format: ${llm}; expected provider/model`);
  }

  return {
    ...config,
    llm: {
      ...config.llm,
      providers: {
        ...(config.llm?.providers ?? {}),
        [provider]: {
          ...(config.llm?.providers?.[provider] ?? {}),
          model,
        },
      },
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

export async function runDistillCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const loaded = await loadAICConfig();
  const withLlm = applyLlmOverride(loaded, parsed.llm);

  const configuredDistillers =
    parsed.distiller
      ? [parsed.distiller]
      : withLlm.distillers.length > 0
        ? withLlm.distillers
        : ["@loamlog/distiller-pitfall-card"];

  const config: AICConfig = {
    ...withLlm,
    distillers: configuredDistillers,
    sinks: withLlm.sinks && withLlm.sinks.length > 0 ? withLlm.sinks : ["@loamlog/sink-file"],
  };

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

  const engine = createDistillEngine({
    dumpDir,
    config,
  });

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
  }

  console.log(
    `[loam distill] Processed ${totalProcessed} sessions, produced ${totalProduced} results, skipped ${totalSkipped}`,
  );
  console.log(`[loam distill] Results written to ${path.join(dumpDir, "distill")}`);

  if (tempDumpDir) {
    await rm(tempDumpDir, { recursive: true, force: true });
  }
}
