import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssetCandidate,
  AuditRecord,
  DistillResult,
  DistillResultDraft,
  DistillerPlugin,
  LLMRouter,
  QualityReport,
  SessionArtifact,
} from "@loamlog/core";
import {
  approvalGate,
  createAuditRecord,
  auditRecordDelivered,
  auditRecordFailed,
  mapDistillResultToCandidate,
  validateAssetCandidate,
} from "@loamlog/core";
import type { DAGDefinition, ExecutionReport, PipelineNode } from "@loamlog/pipeline";
import { executeDAG, validateDAG } from "@loamlog/pipeline";
import { createArtifactQueryClient } from "./query.js";
import type { DistillerStateKV } from "@loamlog/core";
import { injectMetadata } from "./metadata.js";
import { runSinks, type ConfiguredSink } from "./sink-runner.js";
import { mapDistiller, reduceResults, shouldShard, shardSession } from "./shard.js";
import { detectLanguage, withLanguageRouter, withSessionAugmentation } from "./augment.js";
import { writeProcessJournal } from "./journal.js";
import { createSingleArtifactStore } from "./query.js";

export interface DistillDAGOptions {
  distiller: DistillerPlugin;
  distillerConfig?: Record<string, unknown>;
  llm: LLMRouter;
  /** Model context window in tokens. Enables automatic sharding for large sessions. */
  contextWindow?: number;
  state: DistillerStateKV;
  sinks: ConfiguredSink[];
  dumpDir: string;
  repo?: string;
  since?: string;
  until?: string;
  session_ids?: string[];
  /** Allow delivery to external sinks (e.g. GitHub). Default: false. */
  allowExternal?: boolean;
}

export interface DistillDAGResult {
  report: ExecutionReport;
  results: DistillResult[];
  candidates: AssetCandidate[];
  qualityReports: QualityReport[];
  audit: AuditRecord[];
  skipped: number;
  errors: Array<{ message: string; session_id?: string }>;
  artifactsProcessed: number;
}

interface DistillAccumulator {
  results: DistillResult[];
  candidates: AssetCandidate[];
  qualityReports: QualityReport[];
  audit: AuditRecord[];
  skipped: number;
  errors: Array<{ message: string; session_id?: string }>;
  artifactsProcessed: number;
}

/**
 * Create a DAG definition for the distill pipeline.
 *
 * DAG shape:
 *   query_artifacts -> run_distiller -> process_results -> deliver_to_sinks
 *
 * Phase 3 (asset graph): process_results maps DistillResult → AssetCandidate
 * and runs validateAssetCandidate().
 *
 * Phase 4 (approval gate): deliver_to_sinks runs approvalGate(),
 * generates AuditRecords, and writes them to distill/{repo}/audit/.
 * Local file sink always delivers; external sinks require approval.
 */
interface ProcessSessionResult {
  drafts: DistillResultDraft[];
  error?: string;
}

interface ProcessSessionContext {
  distiller: DistillerPlugin;
  llm: LLMRouter;
  state: DistillerStateKV;
  distillerConfig?: Record<string, unknown>;
  dumpDir: string;
  repo: string;
  contextWindow?: number;
  artifactStore: ReturnType<typeof createArtifactQueryClient>;
}

/**
 * Process a single session artifact through the distiller.
 *
 * Encapsulates language detection, sharding decision, and distiller invocation.
 * Cross-cutting concerns (language injection, sharding) are handled here so the
 * DAG node stays a thin orchestration loop.
 */
async function processSessionArtifact(
  artifact: SessionArtifact,
  ctx: ProcessSessionContext,
): Promise<ProcessSessionResult> {
  const lang = detectLanguage(artifact);
  const langRouter = withLanguageRouter(ctx.llm, lang);

  // Wrap the routed provider to auto-inject session context + language.
  // This is a cross-cutting aspect — individual distillers don't need to
  // handle session context or language themselves. Every distiller call
  // through this path automatically gets both augmentations.
  const augmentRouter: LLMRouter = {
    route(request) {
      const result = langRouter.route(request);
      return {
        ...result,
        provider: withSessionAugmentation(result.provider, artifact),
      };
    },
    getDefaultContextWindow() {
      return langRouter.getDefaultContextWindow();
    },
  };

  if (shouldShard({ artifact, contextWindow: ctx.contextWindow })) {
    try {
      const shards = shardSession(artifact, { contextWindow: ctx.contextWindow });
      const mapResults = await mapDistiller(
        ctx.distiller,
        {
          llm: augmentRouter,
          state: ctx.state,
          config: ctx.distillerConfig,
          distiller_id: ctx.distiller.id,
          distiller_version: ctx.distiller.version,
        },
        shards,
      );
      return { drafts: reduceResults(mapResults) };
    } catch (error) {
      return {
        drafts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Small session: single distiller call
  try {
    const drafts = await ctx.distiller.run({
      artifactStore: createSingleArtifactStore(artifact, ctx.artifactStore),
      llm: augmentRouter,
      state: ctx.state,
      config: ctx.distillerConfig,
      distiller_id: ctx.distiller.id,
      distiller_version: ctx.distiller.version,
    });
    return { drafts };
  } catch (error) {
    return {
      drafts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createDistillDAG(
  options: DistillDAGOptions,
  acc: DistillAccumulator,
): DAGDefinition {
  const { distiller, distillerConfig, llm, state, sinks, dumpDir, repo, since, until, session_ids } =
    options;

  const artifactStore = createArtifactQueryClient(dumpDir, state, distiller.id, {
    repo,
    since,
    until,
    session_ids,
  });

  // ── Node 1: query_artifacts (validate only, no collection) ──
  // Artifacts are streamed directly in Node 2 to avoid loading
  // all session snapshots into memory at once.
  const queryNode: PipelineNode<Record<string, never>, { ready: boolean }> = {
    id: "query_artifacts",
    async run(_input, ctx) {
      ctx.logger.info(`[dag:query] distiller=${distiller.id} dumpDir=${dumpDir}`);
      return { ready: true };
    },
  };

  // ── Node 2: run_distiller (thin loop, delegates to processSessionArtifact) ──
  const distillNode: PipelineNode<
    Record<string, unknown>,
    { drafts: DistillResultDraft[]; processedSessionIds: string[] }
  > = {
    id: "run_distiller",
    timeoutMs: 0,
    async run(_input, ctx) {
      const processedSessionIds = new Set<string>();
      const allDrafts: DistillResultDraft[] = [];
      let progressCount = 0;
      const effectiveRepo = repo ?? "_global";

      for await (const artifact of artifactStore.getUnprocessed(distiller.id)) {
        processedSessionIds.add(artifact.meta.session_id);
        progressCount += 1;
        if (progressCount % 10 === 0) {
          ctx.logger.info(`[dag:distill] progress=${progressCount} sessions`);
        }

        const result = await processSessionArtifact(artifact, {
          distiller,
          llm,
          state,
          distillerConfig,
          dumpDir,
          repo: effectiveRepo,
          contextWindow: options.contextWindow,
          artifactStore,
        });

        allDrafts.push(...result.drafts);

        // Journal: write immediately for real-time observability
        writeProcessJournal(dumpDir, artifact.context.repo ?? effectiveRepo, {
          session_id: artifact.meta.session_id,
          distiller_id: distiller.id,
          processed_at: new Date().toISOString(),
          status: result.error ? "error" : result.drafts.length > 0 ? "produced" : "no_signal",
          drafts_count: result.drafts.length,
          error_message: result.error,
        }).catch((err) => {
          ctx.logger.warn(`[dag:journal] write failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }

      ctx.logger.info(
        `[dag:distill] drafts=${allDrafts.length} sessions=${processedSessionIds.size}`,
      );
      return { drafts: allDrafts, processedSessionIds: [...processedSessionIds] };
    },
  };

  // ── Node 3: process_results (validate + metadata + dedup + asset graph) ──
  const processNode: PipelineNode<
    Record<string, unknown>,
    { results: DistillResult[]; skipped: number; errors: Array<{ message: string; session_id?: string }> }
  > = {
    id: "process_results",
    async run(input, ctx) {
      const upstream = (input as Record<string, unknown>).run_distiller as
        | { drafts: DistillResultDraft[]; processedSessionIds: string[] }
        | undefined;
      const drafts = upstream?.drafts ?? [];
      const processedSessionIds = upstream?.processedSessionIds ?? [];

      if (drafts.length === 0) {
        ctx.logger.info("[dag:process] no drafts to process");
        return { results: [], skipped: 0, errors: [] };
      }

      const knownFingerprints =
        (await state.get<Record<string, true>>("fingerprints")) ?? {};
      const results: DistillResult[] = [];
      const candidates: AssetCandidate[] = [];
      const qualityReports: QualityReport[] = [];
      const errors: Array<{ message: string; session_id?: string }> = [];
      let skipped = 0;

      for (const draft of drafts) {
        const validationError = validateDraft(draft);
        if (validationError) {
          errors.push({ message: validationError, session_id: draft.evidence[0]?.session_id });
          continue;
        }

        const sessionId = draft.evidence[0]?.session_id ?? "unknown";
        const result = injectMetadata(draft, distiller, sessionId);

        if (knownFingerprints[result.fingerprint]) {
          skipped += 1;
          continue;
        }

        knownFingerprints[result.fingerprint] = true;
        results.push(result);

        // Phase 3: Convert to AssetCandidate and run quality gate
        const candidate = mapDistillResultToCandidate(result);
        const quality = validateAssetCandidate(candidate);
        candidates.push(candidate);
        qualityReports.push(quality);

        if (!quality.passed) {
          ctx.logger.warn(
            `[dag:process] quality gate failed for ${result.id}: ${quality.checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
          );
        }
      }

      await state.set("fingerprints", knownFingerprints);
      await state.markProcessed(distiller.id, processedSessionIds);

      // Phase 3: expose asset graph data via accumulator
      acc.results = results;
      acc.candidates = candidates;
      acc.qualityReports = qualityReports;
      acc.skipped = skipped;
      acc.errors = errors;

      ctx.logger.info(
        `[dag:process] results=${results.length} skipped=${skipped} errors=${errors.length} qualityPassed=${qualityReports.filter((q) => q.passed).length}/${qualityReports.length}`,
      );
      return { results, skipped, errors };
    },
  };

  // ── Node 4: deliver_to_sinks (approval gate + audit trail + sink delivery) ──
  const sinkNode: PipelineNode<
    Record<string, unknown>,
    { delivered: number; failed: number; sinkErrors: Array<{ message: string }> }
  > = {
    id: "deliver_to_sinks",
    async run(input, ctx) {
      const upstream = (input as Record<string, unknown>).process_results as
        | { results: DistillResult[]; skipped: number; errors: Array<{ message: string; session_id?: string }> }
        | undefined;
      const results = upstream?.results ?? [];

      if (results.length === 0) {
        ctx.logger.info("[dag:sink] no results to deliver");
        return { delivered: 0, failed: 0, sinkErrors: [] };
      }

      // Phase 4: Run approval gate for each result
      const approvedResults: DistillResult[] = [];
      const auditRecords: AuditRecord[] = [];
      const allowExt = options.allowExternal;
      const hasFileSink = sinks.some((s) => s.plugin.id === "@loamlog/sink-file");

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const candidate = acc.candidates[i];
        const quality = acc.qualityReports[i];

        if (candidate && quality) {
          const decision = { candidate_id: candidate.id, decision: "approved" as const, decided_at: new Date().toISOString() };

          // Only apply external gate when user explicitly sets allowExternal
          if (allowExt === undefined) {
            // No external delivery preference — deliver all (default local-first)
            approvedResults.push(result);
          } else {
            const approval = approvalGate(candidate, decision, quality, { allowExternal: allowExt });

            if (approval.allowed) {
              approvedResults.push(result);
            } else if (approval.requires_explicit_optin && hasFileSink) {
              // External blocked, file sink available — deliver locally
              ctx.logger.info(`[dag:sink] file sink delivery for ${result.id} (external blocked: ${approval.reason})`);
              approvedResults.push(result);
            } else {
              ctx.logger.warn(`[dag:sink] blocked: ${result.id} reason=${approval.reason}`);
            }
          }

          // Generate audit record
          const audit = createAuditRecord(candidate, decision, quality, sinks[0]?.plugin.id ?? "unknown");
          auditRecords.push(audit);
        } else {
          // No candidate/quality data, deliver without gate check
          approvedResults.push(result);
        }
      }

      if (approvedResults.length === 0) {
        ctx.logger.info("[dag:sink] all results blocked by approval gate");
        acc.audit = auditRecords;
        return { delivered: 0, failed: 0, sinkErrors: [] };
      }

      const sinkReports = await runSinks(sinks, approvedResults, {
        dump_dir: dumpDir,
        repo: repo ?? "_global",
      });

      let delivered = 0;
      let failed = 0;
      const sinkErrors: Array<{ message: string }> = [];

      for (const report of sinkReports) {
        delivered += report.delivered;
        failed += report.failed;
        for (const e of report.errors ?? []) {
          sinkErrors.push({ message: e.error });
        }
      }

      // Update audit records with delivery status
      const finalAudit = auditRecords.map((a, idx) => {
        if (idx < delivered) {
          return auditRecordDelivered(a);
        }
        return auditRecordFailed(a, sinkErrors[idx - delivered]?.message ?? "delivery failed");
      });

      // Write audit records to distill/{repo}/audit/
      await writeAuditRecords(dumpDir, repo ?? "_global", finalAudit);

      for (const se of sinkErrors) {
        acc.errors.push({ message: se.message });
      }
      acc.artifactsProcessed = delivered;
      acc.audit = finalAudit;

      ctx.logger.info(`[dag:sink] delivered=${delivered} failed=${failed} audit=${finalAudit.length}`);
      return { delivered, failed, sinkErrors };
    },
  };

  return {
    nodes: [queryNode, distillNode, processNode, sinkNode],
    edges: [
      ["query_artifacts", "run_distiller"],
      ["run_distiller", "process_results"],
      ["process_results", "deliver_to_sinks"],
    ],
  };
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

async function writeAuditRecords(
  dumpDir: string,
  repo: string,
  records: AuditRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const dir = path.join(dumpDir, "distill", repo.replace(/[^a-zA-Z0-9._-]/g, "_"), "audit");
  await mkdir(dir, { recursive: true });

  for (const record of records) {
    const filePath = path.join(dir, `${record.id}.json`);
    await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

/**
 * Run the distill DAG and return a normalized result.
 * This is the DAG-based alternative to DistillEngine.run() for a single distiller.
 */
export async function runDistillDAG(
  options: DistillDAGOptions,
  dagOptions?: { concurrency?: number },
): Promise<DistillDAGResult> {
  const acc: DistillAccumulator = {
    results: [],
    candidates: [],
    qualityReports: [],
    audit: [],
    skipped: 0,
    errors: [],
    artifactsProcessed: 0,
  };

  const dag = createDistillDAG(options, acc);

  const validationErrors = validateDAG(dag);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid distill DAG: ${validationErrors.join("; ")}`);
  }

  const { createExecutionContext } = await import("@loamlog/core");
  const ctx = createExecutionContext();

  const report = await executeDAG(dag, ctx, {
    concurrency: dagOptions?.concurrency,
  });

  return {
    report,
    results: acc.results,
    candidates: acc.candidates,
    qualityReports: acc.qualityReports,
    audit: acc.audit,
    skipped: acc.skipped,
    errors: acc.errors,
    artifactsProcessed: acc.artifactsProcessed,
  };
}
