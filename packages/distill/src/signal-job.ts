import type { LLMRouter, Logger, SessionArtifact, Signal } from "@loamlog/core";
import { snapshotToArtifact } from "./query.js";
import { LocalAssetStore } from "./store.js";
import { classifySignals } from "./signal-classifier.js";
import { normalizeSession } from "./normalizer.js";

export interface SignalGateJobResult {
  session_id: string;
  repo: string;
  signals: Signal[];
  rejected_count: number;
}

export interface RunSignalGateForArtifactInput {
  artifact: SessionArtifact;
  dumpDir: string;
  llm: LLMRouter;
  logger?: Logger;
  repo?: string;
}

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

export async function runSignalGateForArtifact(
  input: RunSignalGateForArtifactInput,
): Promise<SignalGateJobResult> {
  const repo = input.repo ?? input.artifact.context.repo ?? "_global";
  const store = new LocalAssetStore(
    input.dumpDir,
    repo,
    input.logger ?? silentLogger,
  );
  const classified = await classifySignals(
    normalizeSession(input.artifact),
    input.llm,
  );
  const signals: Signal[] = [];

  for (const signal of classified.signals) {
    await store.putSignal(signal);
    signals.push((await store.getSignal(signal.id)) ?? signal);
  }

  return {
    session_id: input.artifact.meta.session_id,
    repo,
    signals,
    rejected_count: classified.rejected.length,
  };
}

export { snapshotToArtifact };
