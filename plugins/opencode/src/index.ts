import type { CaptureRequest } from "@loamlog/core";
import { forwardCaptureEvent } from "./http-client.js";

interface OpenCodeEvent {
  type: string;
  session_id?: string;
  session?: {
    id?: string;
  };
}

interface OpenCodeEventInput {
  event: OpenCodeEvent;
}

interface PluginLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

interface OpenCodePluginContext {
  daemonUrl?: string;
  log?: PluginLogger;
}

interface OpenCodePluginRuntime {
  event(input: OpenCodeEventInput): Promise<void>;
}

const IDLE_EVENTS = new Set(["session.idle", "session.status:idle"]);

function pickSessionId(event: OpenCodeEvent): string | undefined {
  return event.session_id ?? event.session?.id;
}

export default async function createOpenCodeBridgePlugin(
  ctx: OpenCodePluginContext = {},
): Promise<OpenCodePluginRuntime> {
  return {
    async event(input: OpenCodeEventInput): Promise<void> {
      const event = input.event;
      if (!IDLE_EVENTS.has(event.type)) {
        return;
      }

      const sessionId = pickSessionId(event);
      if (!sessionId) {
        ctx.log?.warn?.("[loam plugin] skip idle event without session id");
        return;
      }

      const request: CaptureRequest = {
        session_id: sessionId,
        trigger: event.type,
        captured_at: new Date().toISOString(),
        provider: "opencode",
      };

      try {
        await forwardCaptureEvent({
          request,
          daemonUrl: ctx.daemonUrl,
        });
        ctx.log?.info?.(`[loam plugin] forwarded session_id=${sessionId}`);
      } catch (error) {
        ctx.log?.error?.(`[loam plugin] forward failed: ${String(error)}`);
      }
    },
  };
}
