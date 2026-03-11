#!/usr/bin/env node
import { startDaemon } from "./daemon.js";
import { runCaptureCommand } from "./capture.js";
import { runDistillCommand } from "./distill.js";
import { parseProviderList, createSessionProviders } from "./providers.js";
import { pullClaudeCodeSessionFromFilePath, startClaudeCodeWatcher } from "@loamlog/provider-claude-code";

function printUsage(): void {
  console.log("Usage: loam <command> [options]");
  console.log("Commands:");
  console.log("  daemon  [--port <number>] [--dump-dir <path>] [--providers <list>]");
  console.log("  capture [--provider <name>] [--session-id <id>] [--dump-dir <path>] [--trigger <name>]");
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

function parseProviders(args: string[]): string[] {
  const idx = args.indexOf("--providers");
  if (idx === -1) {
    return parseProviderList(undefined);
  }

  const raw = args[idx + 1];
  if (!raw) {
    throw new Error("--providers requires a value");
  }

  return parseProviderList(raw);
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

  if (command === "capture") {
    await runCaptureCommand(args);
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
  const providerIds = parseProviders(args);
  const sessionProviders = createSessionProviders(providerIds);
  const started = await startDaemon({
    port,
    dumpDir,
    sessionProviders,
  });
  console.log(`[loam daemon] listening on http://${started.host}:${started.port}`);

  const watcher = providerIds.includes("claude-code")
    ? startClaudeCodeWatcher({
        logger(message) {
          console.log(message);
        },
        onReady: async (event) => {
          const pulled = await pullClaudeCodeSessionFromFilePath(event.filePath);
          const response = await fetch(`http://${started.host}:${started.port}/capture`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              session_id: event.sessionId,
              trigger: event.trigger,
              captured_at: new Date().toISOString(),
              provider: "claude-code",
              pulled,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(
              `[loam claude-code] watcher capture failed session_id=${event.sessionId} file_path=${event.filePath} status=${response.status} body=${text}`,
            );
          }
        },
      })
    : undefined;

  if (watcher) {
    console.log("[loam daemon] enabled provider watcher: claude-code");
  }

  const gracefulClose = () => {
    watcher?.close();
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
