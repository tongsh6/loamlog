#!/usr/bin/env node
import { startDaemon } from "./daemon.js";
import { runCaptureCommand } from "./capture.js";
import { runDistillCommand, loadAICConfig, buildRuntimeDistillConfig, normalizeBuiltInPluginSpecifiers } from "./distill.js";
import { runListCommand } from "./list.js";
import { runReviewCommand } from "./review.js";
import { runShowCommand } from "./show.js";
import { parseProviderList, createSessionProviders } from "./providers.js";
import { pullClaudeCodeSessionFromFilePath, startClaudeCodeWatcher } from "@loamlog/provider-claude-code";
import { pullCodexSessionFromFilePath, startCodexWatcher } from "@loamlog/provider-codex";
import { pullGeminiCliSessionFromFilePath, startGeminiCliWatcher } from "@loamlog/provider-gemini-cli";
import { startOpencodeWatcher } from "@loamlog/provider-opencode";
import { backfillUnprocessed } from "@loamlog/trigger";

function printUsage(): void {
  console.log("Usage: loam <command> [options]");
  console.log("Commands:");
  console.log("  daemon  [--port <number>] [--dump-dir <path>] [--providers <list>] [--backfill-on-startup]");
  console.log("  list    [--repo <name>] [--since <duration>] [--distill] [--pending] [--scan] [--limit <n>] [--format table|json|md] [--json] [--dump-dir <path>]");
  console.log("  show    <id-prefix> [--dump-dir <path>] [--json]");
  console.log("  capture [--provider <name>] [--session-id <id>] [--dump-dir <path>] [--trigger <name>]");
  console.log("  distill [--distiller <id|path>] [--llm <provider/model>] [--llm-timeout-ms <number>] [--dump-dir <path>] [--since <ISO>] [--until <ISO>] [--test-session <path>] [--legacy] [--max-sessions <n>] [--skip-larger-than <bytes>]");
  console.log("  review  [--list] [--repo <name>] [--approve <id> | --reject <id>] [--dump-dir <path>] [--limit <n>]");
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

  if (command === "list") {
    await runListCommand(args);
    return;
  }

  if (command === "show") {
    await runShowCommand(args);
    return;
  }

  if (command === "distill") {
    await runDistillCommand(args);
    return;
  }

  if (command === "review") {
    await runReviewCommand(args);
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

  // --backfill-on-startup: process all unprocessed sessions in the archive
  // before starting the provider watchers. Designed for continuous mining mode.
  if (args.includes("--backfill-on-startup")) {
    console.log("[loam daemon] backfill-on-startup: processing unprocessed sessions...");
    try {
      const loaded = await loadAICConfig();
      // Merge intelligence.distill settings (used by continuous mining mode)
      // into the root-level config so backfill uses the same distiller/LLM config
      // as the real-time trigger pipeline.
      const mergedConfig = {
        ...loaded,
        distillers: loaded.intelligence?.distill?.distillers ?? loaded.distillers,
        sinks: loaded.intelligence?.distill?.sinks ?? loaded.sinks,
        llm: loaded.intelligence?.distill?.llm ?? loaded.llm,
      };
      const config = buildRuntimeDistillConfig(
        normalizeBuiltInPluginSpecifiers(mergedConfig),
        undefined,
      );
      const result = await backfillUnprocessed({
        dumpDir: dumpDir ?? process.env.LOAM_DUMP_DIR ?? "",
        logger: (msg) => console.log(msg),
        loadDistillConfig: async () => config,
      });
      console.log(
        `[loam daemon] backfill complete: processed=${result.totalProcessed} produced=${result.totalProduced} skipped=${result.totalSkipped} errors=${result.totalErrors}`,
      );
    } catch (error) {
      console.error(
        `[loam daemon] backfill failed (daemon continues): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const watchers: Array<{ close(): void }> = [];

  if (providerIds.includes("claude-code")) {
    const watcher = startClaudeCodeWatcher({
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
    });
    watchers.push(watcher);
    console.log("[loam daemon] enabled provider watcher: claude-code");
  }

  if (providerIds.includes("gemini-cli")) {
    const watcher = startGeminiCliWatcher({
      logger(message) {
        console.log(message);
      },
      onReady: async (event) => {
        const pulled = await pullGeminiCliSessionFromFilePath(event.filePath);
        const response = await fetch(`http://${started.host}:${started.port}/capture`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            session_id: event.sessionId,
            trigger: event.trigger,
            captured_at: new Date().toISOString(),
            provider: "gemini-cli",
            pulled,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `[loam gemini-cli] watcher capture failed session_id=${event.sessionId} file_path=${event.filePath} status=${response.status} body=${text}`,
          );
        }
      },
    });
    watchers.push(watcher);
    console.log("[loam daemon] enabled provider watcher: gemini-cli");
  }

  if (providerIds.includes("codex")) {
    const watcher = startCodexWatcher({
      logger(message) {
        console.log(message);
      },
      onReady: async (event) => {
        const pulled = await pullCodexSessionFromFilePath(event.filePath);
        const response = await fetch(`http://${started.host}:${started.port}/capture`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            session_id: event.sessionId,
            trigger: event.trigger,
            captured_at: new Date().toISOString(),
            provider: "codex",
            pulled,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `[loam codex] watcher capture failed session_id=${event.sessionId} file_path=${event.filePath} status=${response.status} body=${text}`,
          );
        }
      },
    });
    watchers.push(watcher);
    console.log("[loam daemon] enabled provider watcher: codex");
  }

  if (providerIds.includes("opencode")) {
    const watcher = startOpencodeWatcher({
      logger(message) {
        console.log(message);
      },
      onReady: async (event) => {
        const response = await fetch(`http://${started.host}:${started.port}/capture`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            session_id: event.sessionId,
            trigger: event.trigger,
            captured_at: new Date().toISOString(),
            provider: "opencode",
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `[loam opencode] watcher capture failed session_id=${event.sessionId} status=${response.status} body=${text}`,
          );
        }
      },
    });
    watchers.push(watcher);
    console.log("[loam daemon] enabled provider watcher: opencode");
  }

  const gracefulClose = () => {
    for (const w of watchers) {
      w.close();
    }
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
