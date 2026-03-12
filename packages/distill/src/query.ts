import { readSessionSnapshots, type ReadSessionSnapshotsOptions } from "@loamlog/archive";
import { applySnapshotRedaction } from "@loamlog/core";
import type {
  ArtifactPart,
  ArtifactQueryClient,
  DistillerStateKV,
  SessionArtifact,
  SessionArtifactPart,
  SessionSnapshot,
} from "@loamlog/core";

function mapPart(part: SessionArtifactPart): ArtifactPart | undefined {
  if (part.type === "text" && typeof part.text === "string") {
    return { type: "text", text: part.text };
  }

  if (part.type === "reasoning" && typeof part.text === "string") {
    return { type: "reasoning", text: part.text };
  }

  if (part.type === "tool" && typeof part.name === "string") {
    return {
      type: "tool",
      name: part.name,
      input: part.input,
      output: part.output,
      error: part.error,
    };
  }

  if (part.type === "file" && typeof part.filename === "string" && typeof part.mime === "string") {
    return {
      type: "file",
      filename: part.filename,
      mime: part.mime,
    };
  }

  return undefined;
}

export function snapshotToArtifact(snapshot: SessionSnapshot): SessionArtifact {
  return {
    schema_version: snapshot.schema_version,
    meta: {
      session_id: snapshot.meta.session_id,
      captured_at: snapshot.meta.captured_at,
      capture_trigger: snapshot.meta.capture_trigger,
      loam_version: snapshot.meta.aic_version,
      provider: snapshot.meta.provider,
    },
    context: snapshot.context,
    time_range: snapshot.time_range,
    session: snapshot.session,
    messages: snapshot.messages.map((message: SessionSnapshot["messages"][number]) => ({
      id: message.id,
      role: message.role,
      timestamp: message.timestamp,
      content: message.content,
      parts: message.parts
        ?.map((part: SessionArtifactPart) => mapPart(part))
        .filter((part: ArtifactPart | undefined): part is ArtifactPart => Boolean(part)),
    })),
    tools: snapshot.tools,
    redacted: snapshot.redacted,
  };
}

async function getProcessedMap(stateKV: DistillerStateKV, distillerId: string): Promise<Record<string, string>> {
  const value = await stateKV.get<Record<string, string>>(`processed:${distillerId}`);
  return value ?? {};
}

export function createArtifactQueryClient(
  dumpDir: string,
  stateKV: DistillerStateKV,
  distillerId: string,
  defaultFilter?: {
    repo?: string;
    since?: string;
    until?: string;
    session_ids?: string[];
  },
): ArtifactQueryClient {
  return {
    async *getUnprocessed(targetDistillerId: string, limit?: number): AsyncIterable<SessionArtifact> {
      const effectiveDistillerId = targetDistillerId || distillerId;
      const processed = await getProcessedMap(stateKV, effectiveDistillerId);
      let yielded = 0;

      for await (const snapshot of readSessionSnapshots({
        dumpDir,
        repo: defaultFilter?.repo,
        since: defaultFilter?.since,
        until: defaultFilter?.until,
        session_ids: defaultFilter?.session_ids,
      })) {
        const artifact = snapshotToArtifact(applySnapshotRedaction(snapshot).snapshot);
        if (processed[artifact.meta.session_id]) {
          continue;
        }

        yield artifact;
        yielded += 1;
        if (limit !== undefined && yielded >= limit) {
          return;
        }
      }
    },

    async *query(filter: {
      repo?: string;
      since?: string;
      until?: string;
      session_ids?: string[];
    }): AsyncIterable<SessionArtifact> {
      const options: ReadSessionSnapshotsOptions = {
        dumpDir,
        repo: filter.repo,
        since: filter.since,
        until: filter.until,
        session_ids: filter.session_ids,
      };

      for await (const snapshot of readSessionSnapshots(options)) {
        yield snapshotToArtifact(applySnapshotRedaction(snapshot).snapshot);
      }
    },
  };
}
