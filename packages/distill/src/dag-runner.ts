import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TemporalEvidenceRegistry } from "@loamlog/archive";
import type {
  AssetCandidate,
  AuditRecord,
  DistillerPlugin,
  DistillerStateKV,
  DistillResult,
  DistillResultDraft,
  LLMRouter,
  QualityReport,
  SessionArtifact,
  Signal,
} from "@loamlog/core";
import {
  approvalGate,
  auditRecordDelivered,
  auditRecordFailed,
  createAuditRecord,
  mapDistillResultToCandidate,
  validateAssetCandidate,
} from "@loamlog/core";
import type {
  DAGDefinition,
  ExecutionReport,
  PipelineNode,
} from "@loamlog/pipeline";
import { executeDAG, validateDAG } from "@loamlog/pipeline";
import { TopicAggregator } from "./aggregator.js";
import {
  type OutputLanguage,
  resolveOutputLanguage,
  withLanguageRouter,
  withSessionAugmentation,
} from "./augment.js";
import { writeProcessJournal } from "./journal.js";
import { injectMetadata } from "./metadata.js";
import { normalizeSession } from "./normalizer.js";
import {
  createArtifactQueryClient,
  createSingleArtifactStore,
} from "./query.js";
import {
  mapDistiller,
  reduceResults,
  shardSession,
  shouldShard,
} from "./shard.js";
import { classifySignals } from "./signal-classifier.js";
import {
  recordSignalConsumptions,
  scopeArtifactToSignals,
  selectSignalsForDistiller,
} from "./signal-routing.js";
import { type ConfiguredSink, runSinks } from "./sink-runner.js";
import { LocalAssetStore } from "./store.js";
import { GitGapVerifier } from "./verifier/git-gap.js";
import { LogWeaveVerifier } from "./verifier/log-weave.js";

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
  /** Stop after this many sessions are pulled from the queue. */
  maxSessions?: number;
  /** Skip sessions whose serialized size in bytes exceeds this threshold. */
  skipLargerThan?: number;
  /** User-facing output language. `auto` follows source-session detection. */
  outputLanguage?: OutputLanguage;
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
  deliveryItems: DeliveryItem[];
  audit: AuditRecord[];
  skipped: number;
  errors: Array<{ message: string; session_id?: string }>;
  artifactsProcessed: number;
}

interface DeliveryItem {
  result: DistillResult;
  candidate: AssetCandidate;
  quality: QualityReport;
}

/**
 * Create a DAG definition for the distill pipeline.
 *
 * DAG shape:
 *   query_artifacts -> run_distiller -> process_results -> deliver_to_sinks
 *
 * Processing is streaming: each session's drafts are validated, deduped,
 * and delivered to sinks immediately inside run_distiller. This ensures
 * results persist even if later sessions timeout or the process is killed.
 *
 * Nodes 3 & 4 are thin reporting shells that read from the accumulator.
 */
interface ProcessSessionResult {
  drafts: DistillResultDraft[];
  error?: string;
  routedSignals?: Signal[];
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
  assetStore: LocalAssetStore;
  outputLanguage?: OutputLanguage;
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
  const normalized = normalizeSession(artifact);
  let runnableArtifact = artifact;
  let routedSignals: Signal[] | undefined;

  if ((ctx.distiller.consumes_signals?.length ?? 0) > 0) {
    try {
      const classified = await classifySignals(normalized, ctx.llm);
      const storedSignals: Signal[] = [];
      for (const signal of classified.signals) {
        await ctx.assetStore.putSignal(signal);
        storedSignals.push(
          (await ctx.assetStore.getSignal(signal.id)) ?? signal,
        );
      }

      const matches = selectSignalsForDistiller(storedSignals, ctx.distiller, {
        sessionId: artifact.meta.session_id,
      });
      routedSignals = matches.map((match) => match.signal);
      if (routedSignals.length === 0) {
        return { drafts: [], routedSignals };
      }
      runnableArtifact = scopeArtifactToSignals(artifact, routedSignals);
    } catch (error) {
      return {
        drafts: [],
        error: `signal routing failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const explicitLanguage =
    ctx.outputLanguage !== undefined && ctx.outputLanguage !== "auto";
  const lang = resolveOutputLanguage(
    runnableArtifact,
    ctx.outputLanguage ?? "auto",
  );
  const langRouter = withLanguageRouter(ctx.llm, lang, {
    explicit: explicitLanguage,
  });

  const augmentRouter: LLMRouter = {
    route(request) {
      const result = langRouter.route(request);
      return {
        ...result,
        provider: withSessionAugmentation(result.provider, runnableArtifact),
      };
    },
    getDefaultContextWindow() {
      return langRouter.getDefaultContextWindow();
    },
  };

  if (
    shouldShard({
      artifact: runnableArtifact,
      contextWindow: ctx.contextWindow,
    })
  ) {
    try {
      const shards = shardSession(runnableArtifact, {
        contextWindow: ctx.contextWindow,
      });
      const mapResults = await mapDistiller(
        ctx.distiller,
        {
          llm: augmentRouter,
          state: ctx.state,
          config: ctx.distillerConfig,
          distiller_id: ctx.distiller.id,
          distiller_version: ctx.distiller.version,
          normalized,
          signals: routedSignals,
        },
        shards,
      );
      return { drafts: reduceResults(mapResults), routedSignals };
    } catch (error) {
      return {
        drafts: [],
        error: error instanceof Error ? error.message : String(error),
        routedSignals,
      };
    }
  }

  // Small session: single distiller call
  try {
    const drafts = await ctx.distiller.run({
      artifactStore: createSingleArtifactStore(
        runnableArtifact,
        ctx.artifactStore,
      ),
      llm: augmentRouter,
      state: ctx.state,
      config: ctx.distillerConfig,
      distiller_id: ctx.distiller.id,
      distiller_version: ctx.distiller.version,
      normalized,
      signals: routedSignals,
    });
    return { drafts, routedSignals };
  } catch (error) {
    return {
      drafts: [],
      error: error instanceof Error ? error.message : String(error),
      routedSignals,
    };
  }
}

export function createDistillDAG(
  options: DistillDAGOptions,
  acc: DistillAccumulator,
): DAGDefinition {
  const {
    distiller,
    distillerConfig,
    llm,
    state,
    sinks,
    dumpDir,
    repo,
    since,
    until,
    session_ids,
  } = options;

  const artifactStore = createArtifactQueryClient(
    dumpDir,
    state,
    distiller.id,
    {
      repo,
      since,
      until,
      session_ids,
    },
  );

  // ── Node 1: query_artifacts ──
  const queryNode: PipelineNode<Record<string, never>, { ready: boolean }> = {
    id: "query_artifacts",
    async run(_input, ctx) {
      ctx.logger.info(
        `[dag:query] distiller=${distiller.id} dumpDir=${dumpDir}`,
      );
      return { ready: true };
    },
  };

  // ── Node 2: run_distiller (streaming per-session process + deliver) ──
  // Each session's drafts are validated, deduped, and delivered to sinks
  // immediately so results survive process kills or downstream session timeouts.
  const distillNode: PipelineNode<
    Record<string, unknown>,
    { processedSessionIds: string[]; produced: number; skipped: number }
  > = {
    id: "run_distiller",
    timeoutMs: 0,
    async run(_input, ctx) {
      const processedSessionIds = new Set<string>();
      let progressCount = 0;
      let totalSkipped = 0;
      const effectiveRepo = repo ?? "_global";
      const knownFingerprints =
        (await state.get<Record<string, true>>("fingerprints")) ?? {};

      // ── Initialize Industrial Base (VS-04) ──
      const assetStore = new LocalAssetStore(
        dumpDir,
        effectiveRepo,
        ctx.logger,
      );
      const evidenceRegistry = new TemporalEvidenceRegistry(dumpDir);

      let llmProcessedCount = 0;
      for await (const artifact of artifactStore.getUnprocessed(distiller.id)) {
        // Hard cap: stop accepting new sessions once maxSessions reached.
        // Counts sessions that actually reach (or completed) the LLM stage —
        // prefilter/oversize skips do not count toward the cap.
        if (
          options.maxSessions !== undefined &&
          llmProcessedCount >= options.maxSessions
        ) {
          ctx.logger.info(
            `[dag:distill] max-sessions cap reached: ${options.maxSessions}`,
          );
          break;
        }

        // Skip oversized sessions before any LLM call (saves time + tokens)
        if (options.skipLargerThan !== undefined) {
          const approxBytes = JSON.stringify(artifact).length;
          if (approxBytes > options.skipLargerThan) {
            ctx.logger.warn(
              `[dag:distill] skipping oversized session ${artifact.meta.session_id} (${approxBytes} > ${options.skipLargerThan} bytes)`,
            );
            writeProcessJournal(
              dumpDir,
              artifact.context.repo ?? effectiveRepo,
              {
                session_id: artifact.meta.session_id,
                distiller_id: distiller.id,
                processed_at: new Date().toISOString(),
                status: "prefiltered",
                drafts_count: 0,
                error_message: `oversize: ${approxBytes} bytes > --skip-larger-than ${options.skipLargerThan}`,
              },
            ).catch((err) => {
              ctx.logger.warn(
                `[dag:journal] write failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
            await state.markProcessed(distiller.id, [artifact.meta.session_id]);
            continue;
          }
        }

        processedSessionIds.add(artifact.meta.session_id);
        progressCount += 1;
        if (progressCount % 10 === 0) {
          ctx.logger.info(`[dag:distill] progress=${progressCount} sessions`);
        }

        // ── Layer 1: Pre-LLM filter ──
        const prefilter = distiller.prefilter?.(artifact) ?? { pass: true };
        if (!prefilter.pass) {
          writeProcessJournal(dumpDir, artifact.context.repo ?? effectiveRepo, {
            session_id: artifact.meta.session_id,
            distiller_id: distiller.id,
            processed_at: new Date().toISOString(),
            status: "prefiltered",
            drafts_count: 0,
            error_message: prefilter.reason,
          }).catch((err) => {
            ctx.logger.warn(
              `[dag:journal] write failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
          await state.markProcessed(distiller.id, [artifact.meta.session_id]);
          continue;
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
          assetStore,
          outputLanguage: options.outputLanguage,
        });
        llmProcessedCount += 1;

        // ── Per-session processing (validate → dedup → deliver) ──
        const sessionResults: DistillResult[] = [];
        for (const draft of result.drafts) {
          const validationError = validateDraft(draft);
          if (validationError) {
            acc.errors.push({
              message: validationError,
              session_id: draft.evidence[0]?.session_id,
            });
            continue;
          }

          const sessionId = draft.evidence[0]?.session_id ?? "unknown";
          const r = injectMetadata(draft, distiller, sessionId);

          if (knownFingerprints[r.fingerprint]) {
            totalSkipped += 1;
            continue;
          }

          knownFingerprints[r.fingerprint] = true;
          const candidate = mapDistillResultToCandidate(r);
          if (result.routedSignals && result.routedSignals.length > 0) {
            candidate.signals = result.routedSignals;
          }

          // ── Layer 2: Smelting (Verification) ──
          // Combine multiple verifiers (Mining-aligned)
          const gitVerifier = new GitGapVerifier();
          const logVerifier = new LogWeaveVerifier(evidenceRegistry);

          const [gitRep, logRep] = await Promise.all([
            gitVerifier.verify(candidate, {
              repoPath: artifact.context.worktree,
              capturedAt: artifact.meta.captured_at,
              logger: ctx.logger,
            }),
            logVerifier.verify(candidate, {
              repoPath: artifact.context.worktree,
              capturedAt: artifact.meta.captured_at,
              logger: ctx.logger,
            }),
          ]);

          // Merge Verification Results: Verified wins over Unverified
          candidate.verification =
            logRep.status === "verified" ? logRep : gitRep;
          if (logRep.status === "verified") {
            candidate.verification.mining_score = Math.max(
              gitRep.mining_score,
              logRep.mining_score,
            );
          }

          const quality = validateAssetCandidate(candidate);

          // Block only rejected (hallucinated) or archived (already done) assets.
          if (
            candidate.verification.status === "rejected" ||
            candidate.verification.status === "archived"
          ) {
            totalSkipped += 1;
            ctx.logger.info(
              `[dag:smelt] asset skipped: ${candidate.id} status=${candidate.verification.status} reason=${candidate.verification.reason}`,
            );
            continue;
          }

          // Persist to AssetStore (Industrial Base)
          await assetStore.update(candidate.id, candidate);
          if (result.routedSignals && result.routedSignals.length > 0) {
            await recordSignalConsumptions(
              assetStore,
              distiller,
              result.routedSignals,
              "produced",
              {
                assetId: candidate.id,
                reason: "matched distiller consumes_signals manifest",
              },
            );
          }

          sessionResults.push(r);
          acc.results.push(r);
          acc.candidates.push(candidate);
          acc.qualityReports.push(quality);

          if (!quality.passed) {
            ctx.logger.warn(
              `[dag:distill] quality gate failed for ${r.id}: ${quality.checks
                .filter((c) => !c.passed)
                .map((c) => c.name)
                .join(", ")}`,
            );
          }
        }

        // Persist processed marker so progress survives crashes
        acc.artifactsProcessed += 1;
        await state.markProcessed(distiller.id, [artifact.meta.session_id]);

        if (
          result.routedSignals &&
          result.routedSignals.length > 0 &&
          sessionResults.length === 0
        ) {
          await recordSignalConsumptions(
            assetStore,
            distiller,
            result.routedSignals,
            result.error ? "error" : "skipped",
            {
              reason: result.error ?? "distiller produced no asset",
            },
          );
        }

        writeProcessJournal(dumpDir, artifact.context.repo ?? effectiveRepo, {
          session_id: artifact.meta.session_id,
          distiller_id: distiller.id,
          processed_at: new Date().toISOString(),
          status: result.error
            ? "error"
            : result.drafts.length > 0
              ? "produced"
              : "no_signal",
          drafts_count: result.drafts.length,
          error_message: result.error,
        }).catch((err) => {
          ctx.logger.warn(
            `[dag:journal] write failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });

        if (result.error) {
          acc.errors.push({
            message: result.error,
            session_id: artifact.meta.session_id,
          });
        }
      }

      acc.skipped = totalSkipped;
      ctx.logger.info(
        `[dag:distill] verified_candidates=${acc.candidates.length} skipped=${totalSkipped} sessions=${processedSessionIds.size}`,
      );
      return {
        processedSessionIds: [...processedSessionIds],
        produced: acc.candidates.length,
        skipped: totalSkipped,
      };
    },
  };

  // ── Node 3: process_results (Workshop 3: Refining / Aggregation) ──
  const processNode: PipelineNode<
    Record<string, unknown>,
    { refined: number; skipped: number; errors: number }
  > = {
    id: "process_results",
    async run(_input, ctx) {
      const aggregator = new TopicAggregator();
      // All candidates in acc are smelted (verification assigned in run_distiller),
      // so casting to VerifiedAsset[] is safe; filter as belt-and-braces.
      const verifiedCandidates = acc.candidates.filter(
        (c): c is import("@loamlog/core").VerifiedAsset =>
          c.verification !== undefined,
      );
      const inputCount = verifiedCandidates.length;
      const refinedAssets = await aggregator.refine(verifiedCandidates, {
        repo_path: repo ?? "_global",
        logger: ctx.logger,
      });

      acc.deliveryItems = refinedAssets.map((asset) => {
        const result = refinedAssetToDistillResult(asset, distiller.version);
        const candidate: AssetCandidate = asset;
        return {
          result,
          candidate,
          quality: validateAssetCandidate(candidate),
        };
      });
      acc.results = acc.deliveryItems.map((item) => item.result);
      acc.candidates = acc.deliveryItems.map((item) => item.candidate);
      acc.qualityReports = acc.deliveryItems.map((item) => item.quality);

      ctx.logger.info(
        `[dag:refine] input=${inputCount} refined=${acc.results.length} qualityPassed=${acc.qualityReports.filter((q) => q.passed).length}/${acc.qualityReports.length}`,
      );
      return {
        refined: acc.results.length,
        skipped: acc.skipped,
        errors: acc.errors.length,
      };
    },
  };

  // ── Node 4: deliver_to_sinks (Sink Workshop) ──
  const sinkNode: PipelineNode<
    Record<string, unknown>,
    { delivered: number; audit: number }
  > = {
    id: "deliver_to_sinks",
    async run(_input, ctx) {
      if (acc.deliveryItems.length === 0) {
        return { delivered: 0, audit: 0 };
      }

      const effectiveRepo = repo ?? "_global";
      const knownFingerprints =
        (await state.get<Record<string, true>>("fingerprints")) ?? {};
      const allowExt = options.allowExternal;
      const hasFileSink = sinks.some(
        (s) => s.plugin.id === "@loamlog/sink-file",
      );

      const approvedItems: DeliveryItem[] = [];
      const approvedAuditRecords: AuditRecord[] = [];
      const blockedAuditRecords: AuditRecord[] = [];

      for (const item of acc.deliveryItems) {
        const { result: r, candidate, quality } = item;
        const decision = {
          candidate_id: candidate.id,
          decision: "approved" as const,
          decided_at: new Date().toISOString(),
        };

        const audit = createAuditRecord(
          candidate,
          decision,
          quality,
          sinks[0]?.plugin.id ?? "unknown",
        );

        const approveForDelivery = () => {
          approvedItems.push(item);
          approvedAuditRecords.push(audit);
        };

        if (allowExt === undefined) {
          approveForDelivery();
        } else {
          const approval = approvalGate(candidate, decision, quality, {
            allowExternal: allowExt,
          });
          if (approval.allowed) {
            approveForDelivery();
          } else if (approval.requires_explicit_optin && hasFileSink) {
            approveForDelivery();
          } else {
            ctx.logger.warn(
              `[dag:sink] blocked: ${r.id} reason=${approval.reason}`,
            );
            blockedAuditRecords.push(
              auditRecordFailed(audit, approval.reason ?? "approval blocked"),
            );
          }
        }
      }

      let deliveredCount = 0;
      let sinkFinalAudit: AuditRecord[] = [];
      if (approvedItems.length > 0) {
        const sinkReports = await runSinks(
          sinks,
          approvedItems.map((item) => item.result),
          {
            dump_dir: dumpDir,
            repo: effectiveRepo,
          },
        );

        for (const report of sinkReports) {
          deliveredCount += report.delivered;
          for (const e of report.errors ?? []) {
            acc.errors.push({ message: e.error });
          }
        }

        sinkFinalAudit = approvedAuditRecords.map((a, idx) => {
          if (idx < deliveredCount) return auditRecordDelivered(a);
          return auditRecordFailed(
            a,
            `delivery failed: ${sinkReports[idx]?.errors?.[0]?.error ?? "unknown"}`,
          );
        });

        // Only now persist fingerprints for published assets
        for (const { result: r } of approvedItems) {
          knownFingerprints[r.fingerprint] = true;
        }
        await state.set("fingerprints", knownFingerprints);
      }

      const finalAudit = [...blockedAuditRecords, ...sinkFinalAudit];
      await writeAuditRecords(dumpDir, effectiveRepo, finalAudit);
      acc.audit.push(...finalAudit);

      ctx.logger.info(
        `[dag:sink] delivered=${deliveredCount} audit=${acc.audit.length}`,
      );
      return { delivered: deliveredCount, audit: acc.audit.length };
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

function refinedAssetToDistillResult(
  asset: AssetCandidate,
  distillerVersion: string,
): DistillResult {
  return {
    id: asset.id,
    fingerprint: asset.fingerprint,
    distiller_id: asset.distiller_id,
    distiller_version: distillerVersion,
    type: asset.candidate_type,
    title: asset.title,
    summary: asset.summary,
    confidence: asset.confidence,
    tags: asset.tags,
    payload: asset.payload,
    evidence: asset.evidence.map((evidence) => ({
      ...evidence,
      trace_command: `${evidence.session_id}:${evidence.message_id}`,
    })),
    render: asset.render,
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
  const dir = path.join(
    dumpDir,
    "distill",
    repo.replace(/[^a-zA-Z0-9._-]/g, "_"),
    "audit",
  );
  await mkdir(dir, { recursive: true });

  for (const record of records) {
    const filePath = path.join(dir, `${record.id}.json`);
    await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

/**
 * Run the distill DAG and return a normalized result.
 */
export async function runDistillDAG(
  options: DistillDAGOptions,
  dagOptions?: { concurrency?: number },
): Promise<DistillDAGResult> {
  const acc: DistillAccumulator = {
    results: [],
    candidates: [],
    qualityReports: [],
    deliveryItems: [],
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
