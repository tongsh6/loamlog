import {
  getEffectiveSignalClassification,
  type AssetStore,
  type DistillEvidenceDraft,
  type DistillerPlugin,
  type Signal,
  type SignalConsumption,
  type SignalConsumptionResult,
  type SignalConsumptionRule,
  type SessionArtifact,
} from "@loamlog/core";

export interface SignalRouteMatch {
  signal: Signal;
  rule: SignalConsumptionRule;
  reason: string;
}

export interface SignalRoutingOptions {
  includePending?: boolean;
  sessionId?: string;
}

export function selectSignalsForDistiller(
  signals: Signal[],
  distiller: Pick<DistillerPlugin, "id" | "consumes_signals">,
  options: SignalRoutingOptions = {},
): SignalRouteMatch[] {
  const rules = distiller.consumes_signals ?? [];
  if (rules.length === 0) return [];

  const matches: SignalRouteMatch[] = [];
  const seen = new Set<string>();

  for (const signal of signals) {
    if (
      options.sessionId &&
      !signal.spans.some((span) => span.session_id === options.sessionId)
    ) {
      continue;
    }
    if (!isReviewStatusRoutable(signal, options)) continue;
    if (hasIneligiblePromotionHint(signal, distiller.id)) continue;

    for (const rule of rules) {
      const reason = matchSignalRule(signal, rule);
      if (!reason) continue;
      if (!seen.has(signal.id)) {
        matches.push({ signal, rule, reason });
        seen.add(signal.id);
      }
      break;
    }
  }

  return matches;
}

export async function listSignalsForDistiller(
  store: AssetStore,
  distiller: Pick<DistillerPlugin, "id" | "consumes_signals">,
  options: SignalRoutingOptions = {},
): Promise<SignalRouteMatch[]> {
  const statuses = options.includePending
    ? (["accepted", "pending"] as const)
    : (["accepted"] as const);
  const signals = await store.listSignals({
    session_id: options.sessionId,
    status: [...statuses],
  });
  return selectSignalsForDistiller(signals, distiller, options);
}

export function scopeArtifactToSignals(
  artifact: SessionArtifact,
  signals: Signal[],
): SessionArtifact {
  if (signals.length === 0) return artifact;
  const messageIds = new Set(
    signals.flatMap((signal) =>
      signal.spans
        .filter((span) => span.session_id === artifact.meta.session_id)
        .map((span) => span.message_id),
    ),
  );
  if (messageIds.size === 0) return artifact;

  return {
    ...artifact,
    messages: artifact.messages.filter((message) => messageIds.has(message.id)),
    tools: artifact.tools?.filter((tool) => messageIds.has(tool.message_id)),
  };
}

export function selectSignalsForEvidence(
  signals: Signal[],
  evidence: DistillEvidenceDraft[],
): Signal[] {
  if (signals.length === 0 || evidence.length === 0) return [];
  const evidenceMessages = new Set(
    evidence.map((item) => `${item.session_id}:${item.message_id}`),
  );
  return signals.filter((signal) =>
    signal.spans.some((span) =>
      evidenceMessages.has(`${span.session_id}:${span.message_id}`),
    ),
  );
}

export async function recordSignalConsumptions(
  store: AssetStore,
  distiller: Pick<DistillerPlugin, "id" | "version">,
  signals: Signal[],
  result: SignalConsumptionResult,
  options: {
    assetId?: string;
    reason?: string;
    createdAt?: string;
  } = {},
): Promise<void> {
  const createdAt = options.createdAt ?? new Date().toISOString();
  for (const signal of signals) {
    const consumption: SignalConsumption = {
      signal_id: signal.id,
      distiller_id: distiller.id,
      distiller_version: distiller.version,
      result,
      asset_id: options.assetId,
      reason: options.reason,
      created_at: createdAt,
    };
    await store.recordSignalConsumption(consumption);
  }
}

function isReviewStatusRoutable(
  signal: Signal,
  options: SignalRoutingOptions,
): boolean {
  if (signal.review_status === "accepted") return true;
  if (signal.review_status === "pending" && options.includePending) return true;
  return false;
}

function hasIneligiblePromotionHint(
  signal: Signal,
  distillerId: string,
): boolean {
  return signal.promotion_hints.some(
    (hint) =>
      hint.target_distiller === distillerId &&
      hint.eligibility === "ineligible",
  );
}

function matchSignalRule(
  signal: Signal,
  rule: SignalConsumptionRule,
): string | undefined {
  const effective = getEffectiveSignalClassification(signal);
  if (effective.kind !== rule.kind) return undefined;
  if (
    rule.min_confidence !== undefined &&
    effective.confidence < rule.min_confidence
  ) {
    return undefined;
  }
  if (rule.tags && !rule.tags.every((tag) => effective.tags.includes(tag))) {
    return undefined;
  }
  if (rule.allowed_actors && !rule.allowed_actors.includes(effective.actor)) {
    return undefined;
  }
  if (
    rule.allowed_temporal_states &&
    !rule.allowed_temporal_states.includes(effective.temporal_state)
  ) {
    return undefined;
  }
  return `matched ${rule.kind}`;
}
