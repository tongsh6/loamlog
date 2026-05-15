import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getEffectiveSignalClassification,
  validateSignal,
  type AssetLineage,
  type AssetStore,
  type Logger,
  type Signal,
  type SignalConsumption,
  type SignalListFilter,
  type SignalReviewDecision,
  type VerifiedAsset,
} from "@loamlog/core";

interface StateHistoryEntry {
  timestamp: string;
  workshop: string;
  action: string;
  prev_status?: string;
}

interface StoredAsset extends VerifiedAsset {
  workshop?: string;
  state_history?: StateHistoryEntry[];
}

/**
 * File-based implementation of the Refinery Asset Store.
 * Assets are stored as individual JSON files in {dumpDir}/distill/{repo}/assets/{id}.json.
 */
export class LocalAssetStore implements AssetStore {
  private assetDir: string;
  private signalDir: string;
  private consumptionPath: string;

  constructor(
    dumpDir: string,
    public repoPath: string,
    _logger: Logger,
  ) {
    const safeRepo = (repoPath || "_global").replace(/[^a-zA-Z0-9._-]/g, "_");
    const graphDir = path.join(dumpDir, "distill", safeRepo);
    this.assetDir = path.join(graphDir, "assets");
    this.signalDir = path.join(graphDir, "signals");
    this.consumptionPath = path.join(graphDir, "signal_consumptions.json");
  }

  private async ensureAssetDir() {
    await mkdir(this.assetDir, { recursive: true });
  }

  private async ensureSignalDir() {
    await mkdir(this.signalDir, { recursive: true });
  }

  private async ensureGraphDir() {
    await mkdir(path.dirname(this.consumptionPath), { recursive: true });
  }

  private signalPath(signalId: string): string {
    return path.join(this.signalDir, `${encodeURIComponent(signalId)}.json`);
  }

  async get(assetId: string): Promise<VerifiedAsset | undefined> {
    const filePath = path.join(this.assetDir, `${assetId}.json`);
    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }

  async update(assetId: string, update: Partial<VerifiedAsset>): Promise<void> {
    await this.ensureAssetDir();
    const filePath = path.join(this.assetDir, `${assetId}.json`);

    let current = (await this.get(assetId)) as StoredAsset | undefined;

    if (current) {
      // Logic for merging updates and recording state history
      const action = update.verification?.status || "updated";
      const workshop = (update as Partial<StoredAsset>).workshop || "refinery";

      const historyEntry = {
        timestamp: new Date().toISOString(),
        workshop,
        action,
        prev_status: current.verification?.status,
      };

      current = {
        ...current,
        ...update,
        verification: update.verification ?? current.verification,
        state_history: [...(current.state_history || []), historyEntry],
      };
    } else {
      // New asset ingestion
      current = {
        ...update,
        id: assetId,
        state_history: [
          {
            timestamp: new Date().toISOString(),
            workshop: "ingestion",
            action: "created",
          },
        ],
      } as StoredAsset;
    }

    await writeFile(filePath, JSON.stringify(current, null, 2), "utf8");
  }

  async list(filter?: { status?: string[] }): Promise<VerifiedAsset[]> {
    await this.ensureAssetDir();
    try {
      const files = await readdir(this.assetDir);
      const assets: VerifiedAsset[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const asset = await this.get(path.basename(file, ".json"));
        if (asset) {
          if (
            !filter?.status ||
            filter.status.includes(asset.verification?.status ?? "")
          ) {
            assets.push(asset);
          }
        }
      }
      return assets;
    } catch {
      return [];
    }
  }

  async putSignal(signal: Signal): Promise<void> {
    await this.ensureSignalDir();
    const existing = await this.getSignal(signal.id);
    const next = existing?.reviewed_classification
      ? applyEffectiveClassification({
          ...existing,
          ...signal,
          review_status: existing.review_status,
          reviewed_classification: existing.reviewed_classification,
          updated_at: new Date().toISOString(),
        })
      : applyEffectiveClassification(signal);
    assertValidSignal(next);

    await writeFile(
      this.signalPath(signal.id),
      JSON.stringify(next, null, 2),
      "utf8",
    );
  }

  async listSignals(filter: SignalListFilter = {}): Promise<Signal[]> {
    await this.ensureSignalDir();
    try {
      const files = await readdir(this.signalDir);
      const signals: Signal[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await readFile(path.join(this.signalDir, file), "utf8");
        const signal = JSON.parse(content) as Signal;
        if (matchesSignalFilter(signal, filter)) {
          signals.push(signal);
        }
      }

      return signals.sort(compareSignalsForReview);
    } catch {
      return [];
    }
  }

  async getSignal(signalId: string): Promise<Signal | undefined> {
    try {
      const content = await readFile(this.signalPath(signalId), "utf8");
      return JSON.parse(content) as Signal;
    } catch {
      return undefined;
    }
  }

  async reviewSignal(
    signalId: string,
    decision: SignalReviewDecision,
  ): Promise<Signal> {
    const current = await this.getSignal(signalId);
    if (!current) {
      throw new Error(`Signal not found: ${signalId}`);
    }

    const classification =
      decision.classification ?? getEffectiveSignalClassification(current);
    const reviewed_classification = {
      ...classification,
      reviewer: decision.reviewer,
      reviewed_at: decision.reviewed_at ?? new Date().toISOString(),
      note: decision.note,
    };
    const next = applyEffectiveClassification({
      ...current,
      review_status: decision.review_status,
      reviewed_classification,
      notes: decision.note ?? current.notes,
      updated_at: reviewed_classification.reviewed_at,
    });
    assertValidSignal(next);

    await this.ensureSignalDir();
    await writeFile(
      this.signalPath(signalId),
      JSON.stringify(next, null, 2),
      "utf8",
    );
    return next;
  }

  async recordSignalConsumption(consumption: SignalConsumption): Promise<void> {
    await this.ensureGraphDir();
    const consumptions = await this.readConsumptions();
    const deduped = consumptions.filter(
      (item) =>
        !(
          item.signal_id === consumption.signal_id &&
          item.distiller_id === consumption.distiller_id &&
          item.distiller_version === consumption.distiller_version &&
          item.asset_id === consumption.asset_id
        ),
    );
    deduped.push(consumption);
    await writeFile(
      this.consumptionPath,
      JSON.stringify(deduped, null, 2),
      "utf8",
    );
  }

  async listSignalConsumptions(
    signalId?: string,
  ): Promise<SignalConsumption[]> {
    const consumptions = await this.readConsumptions();
    return signalId
      ? consumptions.filter((item) => item.signal_id === signalId)
      : consumptions;
  }

  async getLineage(id: string): Promise<AssetLineage> {
    const [asset, signal, consumptions, assets] = await Promise.all([
      this.get(id),
      this.getSignal(id),
      this.readConsumptions(),
      this.list(),
    ]);
    const relatedConsumptions = signal
      ? consumptions.filter((item) => item.signal_id === id)
      : consumptions.filter((item) => item.asset_id === id);
    const producedAssets = relatedConsumptions
      .map((item) => assets.find((candidate) => candidate.id === item.asset_id))
      .filter((item): item is VerifiedAsset => Boolean(item));

    return {
      asset,
      signal:
        signal ??
        asset?.signals.find((candidateSignal) => candidateSignal.id === id),
      signal_consumptions: relatedConsumptions,
      produced_assets: producedAssets,
    };
  }

  private async readConsumptions(): Promise<SignalConsumption[]> {
    try {
      const content = await readFile(this.consumptionPath, "utf8");
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? (parsed as SignalConsumption[]) : [];
    } catch {
      return [];
    }
  }
}

function applyEffectiveClassification(signal: Signal): Signal {
  const effective = getEffectiveSignalClassification(signal);
  return {
    ...signal,
    kind: effective.kind,
    tags: effective.tags,
    actor: effective.actor,
    temporal_state: effective.temporal_state,
    confidence: effective.confidence,
  };
}

function assertValidSignal(signal: Signal): void {
  const report = validateSignal(signal);
  if (report.passed) return;
  const reasons = report.checks
    .filter((check) => !check.passed)
    .map((check) => check.reason ?? check.name)
    .join("; ");
  throw new Error(`Invalid signal ${signal.id}: ${reasons}`);
}

function matchesSignalFilter(
  signal: Signal,
  filter: SignalListFilter,
): boolean {
  if (filter.session_id) {
    const hasSession = signal.spans.some(
      (span) => span.session_id === filter.session_id,
    );
    if (!hasSession) return false;
  }
  if (filter.kind && !filter.kind.includes(signal.kind)) return false;
  if (filter.status && !filter.status.includes(signal.review_status)) {
    return false;
  }
  if (filter.promotable) {
    const hasPromotion = signal.promotion_hints.some(
      (hint) => hint.eligibility === "eligible",
    );
    if (!hasPromotion) return false;
  }
  if (filter.distiller_id) {
    const targetsDistiller = signal.promotion_hints.some(
      (hint) => hint.target_distiller === filter.distiller_id,
    );
    if (!targetsDistiller) return false;
  }
  return true;
}

function compareSignalsForReview(a: Signal, b: Signal): number {
  const statusRank = new Map([
    ["pending", 0],
    ["accepted", 1],
    ["ignored", 2],
    ["rejected", 3],
  ]);
  const byStatus =
    (statusRank.get(a.review_status) ?? 99) -
    (statusRank.get(b.review_status) ?? 99);
  if (byStatus !== 0) return byStatus;
  return b.created_at.localeCompare(a.created_at);
}
