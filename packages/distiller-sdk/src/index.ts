import type {
  ArtifactQueryClient,
  DistillResultDraft,
  DistillerContext,
  DistillerPlugin,
  DistillerStateKV,
  DistillerRunInput,
  JSONSchema7,
  PrefilterResult,
  SessionArtifact,
} from "@loamlog/core";

interface DefineDistillerSpec<TPayload = Record<string, unknown>> {
  id: string;
  name: string;
  version: string;
  supported_types: string[];
  configSchema?: JSONSchema7;
  payloadSchema?: Record<string, JSONSchema7>;
  prefilter?(artifact: SessionArtifact): import("@loamlog/core").PrefilterResult;
  initialize?(ctx: DistillerContext): Promise<void>;
  run(input: DistillerRunInput): Promise<DistillResultDraft<TPayload>[]>;
  teardown?(): Promise<void>;
}

function createNamespacedState(
  state: DistillerStateKV,
  distillerId: string,
): DistillerStateKV {
  return {
    get<V>(key: string): Promise<V | undefined> {
      return state.get<V>(`${distillerId}:${key}`);
    },
    set<V>(key: string, value: V): Promise<void> {
      return state.set(`${distillerId}:${key}`, value);
    },
    update<V>(key: string, fn: (current: V | undefined) => V): Promise<void> {
      return state.update(`${distillerId}:${key}`, fn);
    },
    markProcessed(
      targetDistillerId: string,
      sessionIds: string[],
    ): Promise<void> {
      return state.markProcessed(targetDistillerId, sessionIds);
    },
  };
}

function createTrackingArtifactStore(
  artifactStore: ArtifactQueryClient,
  processedSessionIds: Set<string>,
): ArtifactQueryClient {
  return {
    async *getUnprocessed(distillerId: string, limit?: number) {
      for await (const artifact of artifactStore.getUnprocessed(
        distillerId,
        limit,
      )) {
        processedSessionIds.add(artifact.meta.session_id);
        yield artifact;
      }
    },
    query: artifactStore.query.bind(artifactStore),
  };
}

export function defineDistiller<TPayload = Record<string, unknown>>(
  spec: DefineDistillerSpec<TPayload>,
): DistillerPlugin {
  return {
    id: spec.id,
    name: spec.name,
    version: spec.version,
    supported_types: spec.supported_types,
    configSchema: spec.configSchema,
    payloadSchema: spec.payloadSchema,
    prefilter: spec.prefilter,

    async initialize(ctx: DistillerContext): Promise<void> {
      if (spec.initialize) {
        await spec.initialize(ctx);
      }
    },

    async run(input: DistillerRunInput): Promise<DistillResultDraft[]> {
      const processedSessionIds = new Set<string>();
      const trackingStore = createTrackingArtifactStore(
        input.artifactStore,
        processedSessionIds,
      );
      const namespacedState = createNamespacedState(input.state, spec.id);

      let results: DistillResultDraft<TPayload>[];
      try {
        results = (await spec.run({
          ...input,
          artifactStore: trackingStore,
          state: namespacedState,
          distiller_id: spec.id,
          distiller_version: spec.version,
        })) as DistillResultDraft<TPayload>[];
      } finally {
        // Always mark sessions as processed, even when spec.run() throws.
        // Without this, a failing session is retried on every restart and
        // blocks the entire pipeline (distill → crash → restart → same session).
        // catch markProcessed errors separately so they don't replace the
        // original error from spec.run().
        if (processedSessionIds.size > 0) {
          try {
            await input.state.markProcessed(
              spec.id,
              Array.from(processedSessionIds),
            );
          } catch (markError) {
            console.error(
              `[distiller-sdk] markProcessed failed for ${spec.id}:`,
              markError,
            );
          }
        }
      }

      return results as DistillResultDraft[];
    },

    async teardown(): Promise<void> {
      if (spec.teardown) {
        await spec.teardown();
      }
    },
  };
}

/**
 * Build a session context header for the distill prompt.
 *
 * Session context is automatically injected by the engine via provider
 * wrapping (see augment.ts). Distillers do not need to call this manually.
 *
 * This utility is provided for distiller authors who want explicit control
 * over how context is rendered, or who need a different format than the
 * engine default.
 *
 * @returns A markdown-style header block to prepend to the distill prompt.
 */
export function buildSessionContext(artifact: SessionArtifact): string {
  const parts: string[] = [];
  const ctx = artifact.context;

  if (ctx.repo) parts.push(`repo: ${ctx.repo}`);
  if (ctx.branch) parts.push(`branch: ${ctx.branch}`);
  if (ctx.commit) parts.push(`commit: ${ctx.commit.slice(0, 8)}`);
  parts.push(`provider: ${artifact.meta.provider}`);
  parts.push(`captured_at: ${artifact.meta.captured_at}`);

  return `## Session Context\n${parts.join("\n")}\n`;
}

export function createEvidence(
  artifact: SessionArtifact,
  message: SessionArtifact["messages"][number],
  excerpt: string,
): DistillResultDraft["evidence"][number] {
  return {
    session_id: artifact.meta.session_id,
    message_id: message.id,
    excerpt,
  };
}

export interface DefaultPrefilterOptions {
	/** Minimum number of total messages. Default 2. */
	minMessages?: number;
	/** Minimum number of user-role messages. Default 1. */
	minUserMessages?: number;
	/** Minimum total characters across all message content. Default 100. */
	minTotalChars?: number;
}

/**
 * Create a default pre-LLM filter.
 *
 * Rules are deliberately conservative — the goal is to skip sessions that
 * are almost certainly noise, not to make semantic judgments. A session
 * that passes this filter may still produce zero results from the LLM.
 *
 * Rules:
 * 1. Total messages >= minMessages (default 2)
 * 2. At least one user-role message
 * 3. Total text content >= minTotalChars (default 100)
 * 4. At least one message has text content (not pure tool calls)
 */
export function createDefaultPrefilter(
	options: DefaultPrefilterOptions = {},
): (artifact: SessionArtifact) => PrefilterResult {
	const minMessages = options.minMessages ?? 2;
	const minUserMessages = options.minUserMessages ?? 1;
	const minTotalChars = options.minTotalChars ?? 100;

	return (artifact: SessionArtifact): PrefilterResult => {
		if (artifact.messages.length < minMessages) {
			return {
				pass: false,
				reason: `session too short: ${artifact.messages.length} msgs (min ${minMessages})`,
			};
		}

		const userCount = artifact.messages.filter((m) => m.role === "user").length;
		if (userCount < minUserMessages) {
			return {
				pass: false,
				reason: `no user messages: ${userCount} user msgs (min ${minUserMessages})`,
			};
		}

		let totalChars = 0;
		let hasTextContent = false;
		for (const msg of artifact.messages) {
			const text = msg.content ?? "";
			totalChars += text.length;
			if (text.trim().length > 0) hasTextContent = true;
		}
		if (totalChars < minTotalChars) {
			return {
				pass: false,
				reason: `content too short: ${totalChars} chars (min ${minTotalChars})`,
			};
		}

		if (!hasTextContent) {
			return {
				pass: false,
				reason: "no text content in any message",
			};
		}

		return { pass: true };
	};
}
