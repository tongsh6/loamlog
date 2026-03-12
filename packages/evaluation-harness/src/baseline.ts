import { EvaluationSample, SamplePrediction, SignalPrediction, ActionPrediction } from "./types.js";

interface BaselineOptions {
  variant: string;
  dropSignalRate?: number;
  dropActionRate?: number;
  flipShouldIssueRate?: number;
  noiseSignalRate?: number;
  dropRedactionRate?: number;
}

export function buildBaselinePredictions(
  samples: EvaluationSample[],
  options: BaselineOptions,
): SamplePrediction[] {
  return samples.map((sample) => {
    const rand = createDeterministicRandom(`${options.variant}:${sample.id}`);
    const {
      dropSignalRate = 0.12,
      dropActionRate = 0.18,
      flipShouldIssueRate = 0.08,
      noiseSignalRate = 0.1,
      dropRedactionRate = 0.15,
    } = options;

    const keepSignal = rand() > dropSignalRate;
    const keepAction = rand() > dropActionRate;

    const expectedSignals = keepSignal ? sample.expected.signals : sample.expected.signals.slice(0, 1);
    const noisySignals =
      rand() < noiseSignalRate
        ? [
            ...expectedSignals,
            {
              key: `noise-${sample.intent}`,
              summary: "Heuristic noise signal",
              category: "noise",
              severity: "low" as const,
              confidence: 0.15,
            },
          ]
        : expectedSignals;

    const issueShouldFlip = rand() < flipShouldIssueRate;
    const predictedIssueShouldIssue = issueShouldFlip ? !sample.expected.issue.shouldIssue : sample.expected.issue.shouldIssue;
    const shortenTitle = sample.expected.issue.title.slice(0, Math.max(12, Math.floor(sample.expected.issue.title.length * 0.65)));
    const predictedActionability = Math.max(
      0,
      Math.min(1, sample.expected.issue.actionability - rand() * 0.25 + rand() * 0.1),
    );

    const detectedTokens = detectSensitiveTokens(sample.rawInput);
    const expectedTokens = sample.expected.redaction.mustRedact;
    const mergedTokens = Array.from(new Set([...expectedTokens, ...detectedTokens]));
    const predictedRedacted = mergedTokens.filter(() => rand() > dropRedactionRate);

    const signalPredictions: SignalPrediction[] = noisySignals.map((signal): SignalPrediction => {
      const confidence =
        typeof (signal as { weight?: number }).weight === "number"
          ? (signal as { weight?: number }).weight
          : 0.75;
      return {
        key: signal.key,
        summary: signal.summary,
        category: signal.category,
        severity: signal.severity,
        confidence,
      };
    });

    const actionPredictions: ActionPrediction[] = (
      keepAction ? sample.expected.actions : sample.expected.actions.slice(0, 1)
    ).map(
      (action): ActionPrediction => ({
        key: action.key,
        label: action.label,
        priority: action.priority,
        confidence: 0.7,
      }),
    );

    return {
      id: sample.id,
      signals: signalPredictions,
      issueDraft: {
        shouldIssue: predictedIssueShouldIssue,
        title: predictedIssueShouldIssue ? shortenTitle : undefined,
        type: sample.expected.issue.type,
        priority: sample.expected.issue.priority,
        actionability: predictedIssueShouldIssue ? predictedActionability : 0,
      },
      actions: actionPredictions,
      knowledge: {
        shouldDistill: sample.expected.knowledge.shouldDistill,
        kind: sample.expected.knowledge.kind,
        scope: sample.expected.knowledge.scope,
      },
      redaction: {
        redacted: predictedRedacted,
        allowed: sample.expected.redaction.shouldKeep,
      },
      sourceRun: "baseline-noisy",
    };
  });
}

function detectSensitiveTokens(raw: string): string[] {
  const tokens = new Set<string>();
  const emailMatches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  emailMatches.forEach((email) => tokens.add(email));

  const keyMatches = raw.match(/sk[-_][a-z0-9-]+/gi) ?? [];
  keyMatches.forEach((key) => tokens.add(key));

  const idMatches = raw.match(/\b(?:user|order|session)[-_]?\d{3,}\b/gi) ?? [];
  idMatches.forEach((id) => tokens.add(id));

  return Array.from(tokens);
}

function createDeterministicRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state ^= state << 13;
    state ^= state >> 7;
    state ^= state << 17;
    return (state >>> 0) / 0xffffffff;
  };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash || 42;
}
