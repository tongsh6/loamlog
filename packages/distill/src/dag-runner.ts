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
import { resolveOutputLanguage, type OutputLanguage, withLanguageRouter, withSessionAugmentation } from "./augment.js";
import { writeProcessJournal } from "./journal.js";
import { createSingleArtifactStore } from "./query.js";
import { normalizeSession } from "./normalizer.js";
import { GitGapVerifier } from "./verifier/git-gap.js";
import { LogWeaveVerifier } from "./verifier/log-weave.js";
import { TopicAggregator } from "./aggregator.js";
import { LocalAssetStore } from "./store.js";
import { TemporalEvidenceRegistry } from "@loamlog/archive";

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
 * Processing is streaming: each session's drafts are validated, deduped,
 * and delivered to sinks immediately inside run_distiller. This ensures
 * results persist even if later sessions timeout or the process is killed.
 *
 * Nodes 3 & 4 are thin reporting shells that read from the accumulator.
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
	const explicitLanguage = ctx.outputLanguage !== undefined && ctx.outputLanguage !== "auto";
	const lang = resolveOutputLanguage(artifact, ctx.outputLanguage ?? "auto");
	const langRouter = withLanguageRouter(ctx.llm, lang, { explicit: explicitLanguage });

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
			normalized: normalizeSession(artifact),
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

	// ── Node 1: query_artifacts ──
	const queryNode: PipelineNode<Record<string, never>, { ready: boolean }> = {
		id: "query_artifacts",
		async run(_input, ctx) {
			ctx.logger.info(`[dag:query] distiller=${distiller.id} dumpDir=${dumpDir}`);
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
			const assetStore = new LocalAssetStore(dumpDir, effectiveRepo, ctx.logger);
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
						writeProcessJournal(dumpDir, artifact.context.repo ?? effectiveRepo, {
							session_id: artifact.meta.session_id,
							distiller_id: distiller.id,
							processed_at: new Date().toISOString(),
							status: "prefiltered",
							drafts_count: 0,
							error_message: `oversize: ${approxBytes} bytes > --skip-larger-than ${options.skipLargerThan}`,
						}).catch((err) => {
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
						ctx.logger.warn(`[dag:journal] write failed: ${err instanceof Error ? err.message : String(err)}`);
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
						outputLanguage: options.outputLanguage,
					});
				llmProcessedCount += 1;

				// ── Per-session processing (validate → dedup → deliver) ──
				const sessionResults: DistillResult[] = [];
				for (const draft of result.drafts) {
					const validationError = validateDraft(draft);
					if (validationError) {
						acc.errors.push({ message: validationError, session_id: draft.evidence[0]?.session_id });
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
						})
					]);

					// Merge Verification Results: Verified wins over Unverified
					candidate.verification = logRep.status === "verified" ? logRep : gitRep;
					if (logRep.status === "verified") {
						candidate.verification.mining_score = Math.max(gitRep.mining_score, logRep.mining_score);
					}

					const quality = validateAssetCandidate(candidate);

					// Block only rejected (hallucinated) or archived (already done) assets.
					if (candidate.verification.status === "rejected" || candidate.verification.status === "archived") {
						totalSkipped += 1;
						ctx.logger.info(`[dag:smelt] asset skipped: ${candidate.id} status=${candidate.verification.status} reason=${candidate.verification.reason}`);
						continue;
					}

					// Persist to AssetStore (Industrial Base)
					await assetStore.update(candidate.id, candidate);

					sessionResults.push(r);
					acc.results.push(r);
					acc.candidates.push(candidate);
					acc.qualityReports.push(quality);

					if (!quality.passed) {
						ctx.logger.warn(
							`[dag:distill] quality gate failed for ${r.id}: ${quality.checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
						);
					}
				}

				// Persist processed marker so progress survives crashes
				acc.artifactsProcessed += 1;
				await state.markProcessed(distiller.id, [artifact.meta.session_id]);

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

				if (result.error) {
					acc.errors.push({ message: result.error, session_id: artifact.meta.session_id });
				}
			}

			acc.skipped = totalSkipped;
			ctx.logger.info(
				`[dag:distill] verified_candidates=${acc.candidates.length} skipped=${totalSkipped} sessions=${processedSessionIds.size}`,
			);
			return { processedSessionIds: [...processedSessionIds], produced: acc.candidates.length, skipped: totalSkipped };
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
				(c): c is import("@loamlog/core").VerifiedAsset => c.verification !== undefined,
			);
			const refinedAssets = await aggregator.refine(verifiedCandidates, {
				repo_path: repo ?? "_global",
				logger: ctx.logger,
			});

			// Update accumulator results with refined data
			acc.results = refinedAssets.map((asset) => ({
				...asset,
				// Required by DistillResult but not present on RefinedAsset
				distiller_version: distiller.version,
				type: asset.candidate_type,
				// EvidenceSpan[] -> DistillEvidence[] best-effort (legacy sink path)
				evidence: asset.evidence as unknown as DistillResult["evidence"],
			} as unknown as DistillResult));

			ctx.logger.info(
				`[dag:refine] input=${acc.candidates.length} refined=${acc.results.length} qualityPassed=${acc.qualityReports.filter((q) => q.passed).length}/${acc.qualityReports.length}`,
			);
			return { refined: acc.results.length, skipped: acc.skipped, errors: acc.errors.length };
		},
	};

	// ── Node 4: deliver_to_sinks (Sink Workshop) ──
	const sinkNode: PipelineNode<
		Record<string, unknown>,
		{ delivered: number; audit: number }
	> = {
		id: "deliver_to_sinks",
		async run(_input, ctx) {
			if (acc.results.length === 0) {
				return { delivered: 0, audit: 0 };
			}

			const effectiveRepo = repo ?? "_global";
			const knownFingerprints = (await state.get<Record<string, true>>("fingerprints")) ?? {};
			const allowExt = options.allowExternal;
			const hasFileSink = sinks.some((s) => s.plugin.id === "@loamlog/sink-file");

			const approvedResults: DistillResult[] = [];
			const auditRecords: AuditRecord[] = [];

			for (let i = 0; i < acc.results.length; i++) {
				const r = acc.results[i];
				const candidate = acc.candidates.find(c => c.id === r.id) || acc.candidates[i]; // Fallback to index if ID changed during aggregation
				// QualityReport has no `name` — match by index (parallel to candidates)
				const quality = acc.qualityReports[i] ?? acc.qualityReports[acc.qualityReports.length - 1];

				const decision = {
					candidate_id: candidate.id,
					decision: "approved" as const,
					decided_at: new Date().toISOString(),
				};

				if (allowExt === undefined) {
					approvedResults.push(r);
				} else {
					const approval = approvalGate(candidate, decision, quality, { allowExternal: allowExt });
					if (approval.allowed) {
						approvedResults.push(r);
					} else if (approval.requires_explicit_optin && hasFileSink) {
						approvedResults.push(r);
					} else {
						ctx.logger.warn(`[dag:sink] blocked: ${r.id} reason=${approval.reason}`);
					}
				}

				const audit = createAuditRecord(candidate, decision, quality, sinks[0]?.plugin.id ?? "unknown");
				auditRecords.push(audit);
			}

			if (approvedResults.length > 0) {
				const sinkReports = await runSinks(sinks, approvedResults, {
					dump_dir: dumpDir,
					repo: effectiveRepo,
				});

				let deliveredCount = 0;
				for (const report of sinkReports) {
					deliveredCount += report.delivered;
					for (const e of report.errors ?? []) {
						acc.errors.push({ message: e.error });
					}
				}

				const finalAudit = auditRecords.map((a, idx) => {
					if (idx < deliveredCount) return auditRecordDelivered(a);
					return auditRecordFailed(a, `delivery failed: ${sinkReports[idx]?.errors?.[0]?.error ?? "unknown"}`);
				});

				await writeAuditRecords(dumpDir, effectiveRepo, finalAudit);
				acc.audit.push(...finalAudit);

				// Only now persist fingerprints for published assets
				for (const r of approvedResults) {
					knownFingerprints[r.fingerprint] = true;
				}
				await state.set("fingerprints", knownFingerprints);
			}

			ctx.logger.info(`[dag:sink] delivered=${approvedResults.length} audit=${acc.audit.length}`);
			return { delivered: approvedResults.length, audit: acc.audit.length };
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
