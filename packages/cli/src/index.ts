#!/usr/bin/env node
import { startDaemon } from "./daemon.js";
import { runDistillCommand } from "./distill.js";

function printUsage(): void {
  console.log("Usage: loam <command> [options]");
  console.log("Commands:");
  console.log("  daemon  [--port <number>] [--dump-dir <path>] [--providers <list>]");
  console.log("  distill [--distiller <id|path>] [--llm <provider/model>] [--llm-timeout-ms <number>] [--dump-dir <path>] [--since <ISO>] [--until <ISO>] [--test-session <path>]");
}

function parsePort(args: string[]): number | undefined {
  const idx = args.indexOf("--port");
  if (idx === -1) {
    return undefined;
  }

  const raw = args[idx + 1];
  if (!raw) {
    throw new Error("--port requires a value");
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("--port must be a positive integer");
  }

  return parsed;
}

function parseDumpDir(args: string[]): string | undefined {
  const idx = args.indexOf("--dump-dir");
  if (idx === -1) {
    return undefined;
  }

  const raw = args[idx + 1];
  if (!raw) {
    throw new Error("--dump-dir requires a value");
  }

  return raw;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === "distill") {
    await runDistillCommand(args);
    return;
  }

  if (command !== "daemon") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const port = parsePort(args);
  const dumpDir = parseDumpDir(args);
  const started = await startDaemon({
    port,
    dumpDir,
  });
  console.log(`[loam daemon] listening on http://${started.host}:${started.port}`);

  const gracefulClose = () => {
    started.server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", gracefulClose);
  process.on("SIGTERM", gracefulClose);
}

void main().catch((error: unknown) => {
  console.error("[loam] fatal error:", error);
  process.exit(1);
});
