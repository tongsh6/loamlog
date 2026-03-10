import type { CaptureRequest, SessionProvider } from "@loamlog/core";
import { processCaptureRequest } from "./daemon.js";
import { createSessionProviders } from "./providers.js";

export interface CaptureArgs {
  provider: string;
  sessionId: string;
  dumpDir?: string;
  trigger: string;
}

interface RunCaptureCommandDependencies {
  now?: () => Date;
  logger?: (message: string) => void;
  processCapture?: (
    payload: CaptureRequest,
    options: { dumpDir?: string; logger?: (message: string) => void; sessionProviders?: Record<string, SessionProvider> },
  ) => Promise<{ accepted: boolean; session_id?: string; snapshot_path?: string; error?: string }>;
  createProviders?: (providerIds: string[]) => Record<string, SessionProvider>;
  env?: NodeJS.ProcessEnv;
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }

  return args[idx + 1];
}

export function parseCaptureArgs(args: string[]): CaptureArgs {
  const provider = getArg(args, "--provider");
  const sessionId = getArg(args, "--session-id");
  const dumpDir = getArg(args, "--dump-dir");
  const trigger = getArg(args, "--trigger") ?? "manual.capture";

  if (!provider) {
    throw new Error("--provider requires a value");
  }

  if (!sessionId) {
    throw new Error("--session-id requires a value");
  }

  return { provider, sessionId, dumpDir, trigger };
}

export async function runCaptureCommand(
  args: string[],
  dependencies: RunCaptureCommandDependencies = {},
): Promise<void> {
  const parsed = parseCaptureArgs(args);
  const logger = dependencies.logger ?? ((message: string) => console.log(message));
  const now = dependencies.now ?? (() => new Date());
  const env = dependencies.env ?? process.env;
  const dumpDir = parsed.dumpDir ?? env.LOAM_DUMP_DIR;

  if (!dumpDir) {
    throw new Error("LOAM_DUMP_DIR is not configured; pass --dump-dir or export LOAM_DUMP_DIR");
  }

  const createProviders = dependencies.createProviders ?? createSessionProviders;
  const processCapture = dependencies.processCapture ?? processCaptureRequest;
  const sessionProviders = createProviders([parsed.provider]);

  const result = await processCapture(
    {
      session_id: parsed.sessionId,
      trigger: parsed.trigger,
      captured_at: now().toISOString(),
      provider: parsed.provider,
    },
    {
      dumpDir,
      logger,
      sessionProviders,
    },
  );

  if (!result.accepted) {
    throw new Error(result.error ?? "capture failed");
  }

  logger(`[loam capture] accepted session_id=${parsed.sessionId} provider=${parsed.provider}`);
  if (result.snapshot_path) {
    logger(`[loam capture] snapshot saved path=${result.snapshot_path}`);
  }
}
