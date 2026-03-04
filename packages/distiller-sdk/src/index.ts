import type {
  ArtifactQueryClient,
  DistillResultDraft,
  DistillerContext,
  DistillerPlugin,
  DistillerStateKV,
  DistillerRunInput,
  JSONSchema7,
  SessionArtifact,
} from "@loamlog/core";

interface DefineDistillerSpec<TPayload = Record<string, unknown>> {
  id: string;
  name: string;
  version: string;
  supported_types: string[];
  configSchema?: JSONSchema7;
  payloadSchema?: Record<string, JSONSchema7>;
  initialize?(ctx: DistillerContext): Promise<void>;
  run(input: DistillerRunInput): Promise<DistillResultDraft<TPayload>[]>;
  teardown?(): Promise<void>;
}

function createNamespacedState(state: DistillerStateKV, distillerId: string): DistillerStateKV {
  return {
    get<V>(key: string): Promise<V | undefined> {
      return state.get<V>(`${distillerId}:${key}`);
    },
    set<V>(key: string, value: V): Promise<void> {
      return state.set(`${distillerId}:${key}`, value);
    },
    markProcessed(targetDistillerId: string, sessionIds: string[]): Promise<void> {
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
      for await (const artifact of artifactStore.getUnprocessed(distillerId, limit)) {
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

    async initialize(ctx: DistillerContext): Promise<void> {
      if (spec.initialize) {
        await spec.initialize(ctx);
      }
    },

    async run(input: DistillerRunInput): Promise<DistillResultDraft[]> {
      const processedSessionIds = new Set<string>();
      const trackingStore = createTrackingArtifactStore(input.artifactStore, processedSessionIds);
      const namespacedState = createNamespacedState(input.state, spec.id);

      const results = await spec.run({
        ...input,
        artifactStore: trackingStore,
        state: namespacedState,
        distiller_id: spec.id,
        distiller_version: spec.version,
      });

      if (processedSessionIds.size > 0) {
        await input.state.markProcessed(spec.id, Array.from(processedSessionIds));
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
