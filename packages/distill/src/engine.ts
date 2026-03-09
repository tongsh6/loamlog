import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AICConfig,
  DistillEngine,
  DistillReport,
  DistillResult,
  DistillResultDraft,
  DistillerContext,
  DistillerPlugin,
  SinkPlugin,
} from "@loamlog/core";
import { createLLMRouter } from "./llm-router.js";
import { injectMetadata } from "./metadata.js";
import { createArtifactQueryClient } from "./query.js";
import { createDistillerRegistry } from "./registry.js";
import { runSinks, type ConfiguredSink } from "./sink-runner.js";
import { createDistillerStateKV } from "./state.js";

function resolveImportSpecifier(specifier: string): string {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("..")) {
    return pathToFileURL(path.resolve(specifier)).href;
  }
  return specifier;
}

function isSinkPlugin(value: unknown): value is SinkPlugin {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.supports === "function" &&
    typeof candidate.deliver === "function"
  );
}

async function loadSinkPlugin(specifier: string, config: Record<string, unknown>): Promise<ConfiguredSink> {
  const loaded = (await import(resolveImportSpecifier(specifier))) as { default?: unknown };
  const target = loaded.default;

  const sink = typeof target === "function" ? await target(config) : target;
  if (!isSinkPlugin(sink)) {
    throw new Error(`invalid sink export from ${specifier}`);
  }

  return {
    plugin: sink,
    config,
  };
}

function parseDistillerSpec(
  item: string | { plugin: string; config: Record<string, unknown> },
): { plugin: string; config: Record<string, unknown> } {
  if (typeof item === "string") {
    return {
      plugin: item,
      config: {},
    };
  }

  return {
    plugin: item.plugin,
    config: item.config,
  };
}

function parseSinkSpec(
  item: string | { plugin: string; config: Record<string, unknown> },
): { plugin: string; config: Record<string, unknown> } {
  if (typeof item === "string") {
    return {
      plugin: item,
      config: {},
    };
  }

  return {
    plugin: item.plugin,
    config: item.config,
  };
}

function createLogger(prefix: string): DistillerContext["logger"] {
  return {
    info: (msg: string) => console.log(`[${prefix}] ${msg}`),
    warn: (msg: string) => console.warn(`[${prefix}] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[${prefix}] ${msg}`, err),
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateDraft(draft: DistillResultDraft): string | undefined {
  if (!draft.type || !draft.title || !draft.summary) {
    return "missing required draft fields";
  }

  if (!Array.isArray(draft.evidence) || draft.evidence.length === 0) {
    return "evidence is required";
  }

  return undefined;
}

interface DistillRunOptions {
  distillers?: string[];
  repo?: string;
  since?: string;
  until?: string;
}

export function createDistillEngine(options: { dumpDir: string; config: AICConfig }): DistillEngine {
  const registry = createDistillerRegistry();
  const perDistillerConfig = new Map<string, Record<string, unknown>>();
  const initializedDistillers = new Set<string>();
  let sinkSpecs: ConfiguredSink[] = [];
  let runtimeConfig = options.config;
  let loaded = false;

  return {
    async loadFromConfig(config: AICConfig): Promise<void> {
      runtimeConfig = config;

      for (const item of config.distillers) {
        const spec = parseDistillerSpec(item);
        const plugin = await registry.load(spec.plugin, spec.config);
        perDistillerConfig.set(plugin.id, spec.config);
      }

      sinkSpecs = [];
      for (const item of config.sinks ?? []) {
        const spec = parseSinkSpec(item);
        sinkSpecs.push(await loadSinkPlugin(spec.plugin, spec.config));
      }

      loaded = true;
    },

    async run(runOptions?: DistillRunOptions): Promise<DistillReport[]> {
      if (!loaded) {
        await this.loadFromConfig(runtimeConfig);
      }

      const llm = createLLMRouter(runtimeConfig.llm, {
        logger: createLogger("llm-router"),
      });
      const selected = runOptions?.distillers
        ? registry.list().filter((plugin: DistillerPlugin) => runOptions.distillers?.includes(plugin.id))
        : registry.list();

      const reports: DistillReport[] = [];
      for (const distiller of selected) {
        const startedAt = Date.now();
        const errors: Array<{ message: string; session_id?: string }> = [];
        const processedSessionIds = new Set<string>();
        let resultsProduced = 0;
        let resultsSkipped = 0;

        const state = createDistillerStateKV(options.dumpDir, distiller.id);
        const artifactStore = createArtifactQueryClient(options.dumpDir, state, distiller.id, {
          repo: runOptions?.repo,
          since: runOptions?.since,
          until: runOptions?.until,
        });

        const trackingStore = {
          async *getUnprocessed(targetDistillerId: string, limit?: number) {
            for await (const artifact of artifactStore.getUnprocessed(targetDistillerId, limit)) {
              processedSessionIds.add(artifact.meta.session_id);
              yield artifact;
            }
          },
          query: artifactStore.query.bind(artifactStore),
        };

        try {
          if (!initializedDistillers.has(distiller.id) && distiller.initialize) {
            await distiller.initialize({
              dumpDir: options.dumpDir,
              repo: runOptions?.repo,
              logger: createLogger(`distiller:${distiller.id}`),
            });
            initializedDistillers.add(distiller.id);
          }

          const drafts = await distiller.run({
            artifactStore: trackingStore,
            llm,
            state,
            config: perDistillerConfig.get(distiller.id),
            distiller_id: distiller.id,
            distiller_version: distiller.version,
          });

          const knownFingerprints = (await state.get<Record<string, true>>("fingerprints")) ?? {};
          const results: DistillResult[] = [];

          for (const draft of drafts) {
            const validationError = validateDraft(draft);
            if (validationError) {
              errors.push({ message: validationError, session_id: draft.evidence[0]?.session_id });
              continue;
            }

            const fingerprintSessionId = draft.evidence[0].session_id;
            const result = injectMetadata(draft, distiller, fingerprintSessionId);
            if (knownFingerprints[result.fingerprint]) {
              resultsSkipped += 1;
              continue;
            }

            knownFingerprints[result.fingerprint] = true;
            results.push(result);
          }

          await state.set("fingerprints", knownFingerprints);
          await state.markProcessed(distiller.id, Array.from(processedSessionIds));

          resultsProduced = results.length;
          const sinkReports = await runSinks(sinkSpecs, results, {
            dump_dir: options.dumpDir,
            repo: runOptions?.repo ?? "_global",
          });

          for (const report of sinkReports) {
            for (const sinkError of report.errors ?? []) {
              errors.push({ message: sinkError.error });
            }
          }
        } catch (error) {
          errors.push({ message: toErrorMessage(error) });
        } finally {
          if (distiller.teardown) {
            try {
              await distiller.teardown();
            } catch (error) {
              errors.push({ message: `teardown failed: ${toErrorMessage(error)}` });
            }
          }
        }

        reports.push({
          distiller_id: distiller.id,
          artifacts_processed: processedSessionIds.size,
          results_produced: resultsProduced,
          results_skipped: resultsSkipped,
          errors,
          duration_ms: Date.now() - startedAt,
        });
      }

      return reports;
    },
  };
}
