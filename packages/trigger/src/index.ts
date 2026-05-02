import type {
  AICConfig,
  CaptureRequest,
  DistillEngine,
  ProcessingMode,
  SessionSnapshot,
  TriggeredIntelligenceConfig,
} from "@loamlog/core";
import { createDistillEngine } from "@loamlog/distill";

type Logger = (message: string) => void;

export interface TriggerSignal {
  capture: CaptureRequest;
  snapshot?: SessionSnapshot;
  snapshotPath?: string;
}

export interface TriggeredBatch {
  batchId: string;
  batchKey: string;
  sessionIds: string[];
  triggerReasons: string[];
  triggerScore: number;
  processingMode: ProcessingMode;
  size: number;
}

interface TriggeredTask extends TriggerSignal {
  triggerReason: string[];
  triggerScore: number;
  processingMode: ProcessingMode;
  batchKey: string;
  batchId?: string;
}

type DistillRunner = (batch: TriggeredBatch) => Promise<void>;

export interface TriggeredIntelligencePipeline {
  enqueue(signal: TriggerSignal): void;
  flush(): Promise<void>;
  stop(): void;
}

export interface TriggeredIntelligenceOptions {
  dumpDir?: string;
  config?: TriggeredIntelligenceConfig;
  logger?: Logger;
  loadDistillConfig?: () => Promise<AICConfig | undefined>;
  runDistill?: DistillRunner;
  onBatch?: (batch: TriggeredBatch) => void;
  now?: () => number;
}

interface FrequencyState {
  timestamps: number[];
  pending: Array<{ signal: TriggerSignal; timestamp: number }>;
}

interface ResolvedIntelligenceConfig {
  enabled: boolean;
  mode: "signal" | "continuous";
  processingMode: ProcessingMode;
  thresholds: {
    frequency: { windowMs: number; threshold: number };
    severityKeywords: string[];
    semanticKeywords: string[];
    manualTriggers: string[];
  };
  batch: { maxSize: number; maxWaitMs: number };
  rateLimit: { maxPending: number };
  distill: {
    enabled: boolean;
    distillers?: Array<string | { plugin: string; config: Record<string, unknown> }>;
    sinks?: Array<string | { plugin: string; config: Record<string, unknown> }>;
    llm?: AICConfig["llm"];
  };
}

const DEFAULT_CONFIG: ResolvedIntelligenceConfig = {
  enabled: true,
  mode: "signal",
  processingMode: "full",
  thresholds: {
    frequency: { windowMs: 5 * 60 * 1000, threshold: 3 },
    severityKeywords: ["fatal", "timeout", "denied", "rollback"],
    semanticKeywords: ["值得提", "issue", "模板", "template", "后续可抽象", "abstract"],
    manualTriggers: ["manual.", "manual/", "force.intel", "trigger.intel"],
  },
  batch: { maxSize: 8, maxWaitMs: 1500 },
  rateLimit: { maxPending: 50 },
  distill: { enabled: true },
};

function mergeConfig(config?: TriggeredIntelligenceConfig): ResolvedIntelligenceConfig {
  return {
    enabled: config?.enabled !== false,
    mode: config?.mode ?? DEFAULT_CONFIG.mode,
    processingMode: config?.processing_mode ?? DEFAULT_CONFIG.processingMode,
    thresholds: {
      frequency: {
        windowMs: config?.thresholds?.frequency?.window_ms ?? DEFAULT_CONFIG.thresholds.frequency.windowMs,
        threshold: config?.thresholds?.frequency?.threshold ?? DEFAULT_CONFIG.thresholds.frequency.threshold,
      },
      severityKeywords: config?.thresholds?.severity_keywords ?? DEFAULT_CONFIG.thresholds.severityKeywords,
      semanticKeywords: config?.thresholds?.semantic_keywords ?? DEFAULT_CONFIG.thresholds.semanticKeywords,
      manualTriggers: config?.thresholds?.manual_triggers ?? DEFAULT_CONFIG.thresholds.manualTriggers,
    },
    batch: {
      maxSize: config?.batch?.max_size ?? DEFAULT_CONFIG.batch.maxSize,
      maxWaitMs: config?.batch?.max_wait_ms ?? DEFAULT_CONFIG.batch.maxWaitMs,
    },
    rateLimit: {
      maxPending: config?.rate_limit?.max_pending ?? DEFAULT_CONFIG.rateLimit.maxPending,
    },
    distill: {
      enabled: config?.distill?.enabled !== false,
      distillers: config?.distill?.distillers,
      sinks: config?.distill?.sinks,
      llm: config?.distill?.llm,
    },
  };
}

function collectSnapshotText(snapshot?: SessionSnapshot): string {
  if (!snapshot) {
    return "";
  }

  const parts: string[] = [];
  for (const message of snapshot.messages) {
    if (message.content) {
      parts.push(message.content);
    }
    for (const part of message.parts ?? []) {
      if (part.type === "text" && typeof part.text === "string") {
        parts.push(part.text);
      }
      if (part.type === "reasoning" && typeof part.text === "string") {
        parts.push(part.text);
      }
      if (part.type === "tool" && typeof part.error === "string") {
        parts.push(part.error);
      }
      if (part.type === "tool" && typeof part.output === "string") {
        parts.push(part.output);
      }
    }
  }
  return parts.join("\n").toLowerCase();
}

function buildSignature(signal: TriggerSignal, text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim().slice(0, 160);
  return `${signal.capture.provider}:${signal.capture.trigger}:${normalized}`;
}

function findKeywordHits(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function computeScore(reasons: string[]): number {
  let score = 0;
  for (const reason of reasons) {
    if (reason.startsWith("manual")) {
      score += 3;
    } else if (reason.startsWith("severity")) {
      score += 2;
    } else if (reason.startsWith("frequency")) {
      score += 2;
    } else {
      score += 1;
    }
  }
  return score === 0 ? 1 : score;
}

function shouldProcessInFull(config: ResolvedIntelligenceConfig, queueSize: number): boolean {
  if (config.processingMode === "summary-only") {
    return false;
  }
  if (!config.distill.enabled) {
    return false;
  }
  if (queueSize >= config.rateLimit.maxPending) {
    return false;
  }
  return true;
}

function createDefaultDistillRunner(
  resolvedConfig: ResolvedIntelligenceConfig,
  options: { dumpDir?: string; logger: Logger; loadDistillConfig?: () => Promise<AICConfig | undefined> },
): DistillRunner {
  let engine: DistillEngine | undefined;
  let cachedConfig: AICConfig | undefined;

  return async (batch: TriggeredBatch) => {
    if (batch.processingMode === "summary-only") {
      options.logger(`[intel] batch ${batch.batchId} summary-only skip deep analysis size=${batch.size}`);
      return;
    }

    if (!options.dumpDir) {
      options.logger("[intel] skip distill: missing dumpDir");
      return;
    }

    if (!options.loadDistillConfig) {
      options.logger("[intel] skip distill: no distill config loader");
      return;
    }

    try {
      if (!cachedConfig) {
        const loaded = await options.loadDistillConfig();
        if (!loaded) {
          options.logger("[intel] skip distill: loader returned empty config");
          return;
        }

        cachedConfig = {
          ...loaded,
          dump_dir: loaded.dump_dir ?? options.dumpDir,
          distillers: resolvedConfig.distill.distillers ?? loaded.distillers,
          sinks: resolvedConfig.distill.sinks ?? loaded.sinks,
          llm: resolvedConfig.distill.llm ?? loaded.llm,
        };
      }

      if (!engine) {
        engine = createDistillEngine({
          dumpDir: options.dumpDir,
          config: cachedConfig,
        });
        await engine.loadFromConfig(cachedConfig);
      }

      await engine.run({
        session_ids: batch.sessionIds,
      });
      options.logger(`[intel] batch ${batch.batchId} processed sessions=${batch.sessionIds.length}`);
    } catch (error) {
      options.logger(`[intel] distill failed for batch ${batch.batchId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

export interface BackfillOptions {
  dumpDir: string;
  logger: Logger;
  loadDistillConfig: () => Promise<AICConfig | undefined>;
}

export interface BackfillResult {
  totalProcessed: number;
  totalProduced: number;
  totalSkipped: number;
  totalErrors: number;
}

/**
 * Process all unprocessed sessions in the archive.
 *
 * Designed for daemon startup backfill and manual CLI --all-unprocessed.
 * Uses engine.run() directly without the trigger's in-memory queue,
 * streaming artifacts one at a time via AsyncIterable.
 */
export async function backfillUnprocessed(options: BackfillOptions): Promise<BackfillResult> {
  const { dumpDir, logger, loadDistillConfig } = options;

  const loaded = await loadDistillConfig();
  if (!loaded) {
    logger("[backfill] skip: no distill config");
    return { totalProcessed: 0, totalProduced: 0, totalSkipped: 0, totalErrors: 0 };
  }

  const config: AICConfig = {
    ...loaded,
    dump_dir: loaded.dump_dir ?? dumpDir,
  };

  const engine = createDistillEngine({ dumpDir, config });
  await engine.loadFromConfig(config);

  const reports = await engine.run({});

  let totalProcessed = 0;
  let totalProduced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const report of reports) {
    totalProcessed += report.artifacts_processed;
    totalProduced += report.results_produced;
    totalSkipped += report.results_skipped;
    totalErrors += report.errors.length;
    logger(
      `[backfill] ${report.distiller_id}: processed=${report.artifacts_processed} produced=${report.results_produced} skipped=${report.results_skipped} errors=${report.errors.length}`,
    );
  }

  return { totalProcessed, totalProduced, totalSkipped, totalErrors };
}

export function createTriggeredIntelligencePipeline(options: TriggeredIntelligenceOptions = {}): TriggeredIntelligencePipeline {
  const resolvedConfig = mergeConfig(options.config);
  const logger: Logger = options.logger ?? ((message) => console.log(message));
  const now = options.now ?? Date.now;
  const runDistill =
    options.runDistill ??
    createDefaultDistillRunner(resolvedConfig, {
      dumpDir: options.dumpDir,
      logger,
      loadDistillConfig: options.loadDistillConfig,
    });

  const queue: TriggeredTask[] = [];
  const frequencyState = new Map<string, FrequencyState>();
  let timer: NodeJS.Timeout | undefined;
  let flushing = false;

  function scheduleFlush(): void {
    if (timer || queue.length === 0) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, resolvedConfig.batch.maxWaitMs);
  }

  function enqueueTask(signal: TriggerSignal, reasons: string[], batchKey: string, processingMode: ProcessingMode): void {
    const task: TriggeredTask = {
      ...signal,
      triggerReason: Array.from(new Set(reasons)),
      triggerScore: computeScore(reasons),
      processingMode,
      batchKey,
    };
    queue.push(task);
    if (queue.length >= resolvedConfig.batch.maxSize) {
      void flush();
      return;
    }
    scheduleFlush();
  }

  async function flush(): Promise<void> {
    if (flushing || queue.length === 0) {
      return;
    }
    flushing = true;

    const batchSize = Math.min(queue.length, resolvedConfig.batch.maxSize);
    const tasks = queue.splice(0, batchSize);
    const grouped = new Map<string, TriggeredTask[]>();
    for (const task of tasks) {
      const existing = grouped.get(task.batchKey);
      if (existing) {
        existing.push(task);
      } else {
        grouped.set(task.batchKey, [task]);
      }
    }

    for (const [batchKey, batchTasks] of grouped) {
      const batchId = `${batchKey}-${now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
      const processingMode: ProcessingMode =
        batchTasks.some((task) => task.processingMode === "summary-only") || !shouldProcessInFull(resolvedConfig, queue.length)
          ? "summary-only"
          : "full";
      const sessionIds = Array.from(new Set(batchTasks.map((task) => task.capture.session_id)));
      const reasons = Array.from(new Set(batchTasks.flatMap((task) => task.triggerReason)));
      const triggerScore = Math.max(...batchTasks.map((task) => task.triggerScore));

      for (const task of batchTasks) {
        task.batchId = batchId;
      }

      const batch: TriggeredBatch = {
        batchId,
        batchKey,
        sessionIds,
        triggerReasons: reasons,
        triggerScore,
        processingMode,
        size: batchTasks.length,
      };

      options.onBatch?.(batch);
      try {
        await runDistill(batch);
      } catch (error) {
        logger(`[intel] batch ${batchId} runDistill failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    flushing = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }

  function enqueue(signal: TriggerSignal): void {
    if (!resolvedConfig.enabled) {
      return;
    }

    // Continuous mode: skip keyword matching and text collection.
    // Every captured session is enqueued for distill; the distiller's
    // prompt decides whether the session has enough signal to produce an asset.
    if (resolvedConfig.mode === "continuous") {
      const signature = buildSignature(signal, "");
      // Always enqueue as "full"; flush() may override to "summary-only"
      // at batch level when the queue is overloaded (rate limit gate).
      enqueueTask(signal, ["continuous:capture"], signature, "full");
      return;
    }

    const text = collectSnapshotText(signal.snapshot);
    const signature = buildSignature(signal, text);
    const severityHits = findKeywordHits(text, resolvedConfig.thresholds.severityKeywords);
    const semanticHits = findKeywordHits(text, resolvedConfig.thresholds.semanticKeywords);
    const manualHit = resolvedConfig.thresholds.manualTriggers.some((prefix) =>
      signal.capture.trigger.toLowerCase().startsWith(prefix.toLowerCase()),
    );

    const reasons: string[] = [];
    if (manualHit) {
      reasons.push(`manual:${signal.capture.trigger}`);
    }
    for (const hit of severityHits) {
      reasons.push(`severity:${hit}`);
    }
    for (const hit of semanticHits) {
      reasons.push(`semantic:${hit}`);
    }

    const state = frequencyState.get(signature) ?? { timestamps: [], pending: [] };
    const timestamp = now();
    const windowStart = timestamp - resolvedConfig.thresholds.frequency.windowMs;
    state.timestamps = state.timestamps.filter((value) => value >= windowStart);
    state.pending = state.pending.filter((item) => item.timestamp >= windowStart);
    state.timestamps.push(timestamp);

    const processingMode = shouldProcessInFull(resolvedConfig, queue.length)
      ? "full"
      : ("summary-only" as ProcessingMode);

    if (reasons.length > 0) {
      enqueueTask(signal, reasons, signature, processingMode);
    } else {
      state.pending.push({ signal, timestamp });
      if (state.pending.length >= resolvedConfig.thresholds.frequency.threshold) {
        const released = state.pending.splice(0, state.pending.length);
        const frequencyReason = `frequency:${state.timestamps.length}/${resolvedConfig.thresholds.frequency.windowMs}ms`;
        for (const item of released) {
          enqueueTask(item.signal, [frequencyReason], signature, processingMode);
        }
      }
    }

    frequencyState.set(signature, state);
  }

  function stop(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    queue.splice(0, queue.length);
    frequencyState.clear();
  }

  return {
    enqueue,
    flush,
    stop,
  };
}
