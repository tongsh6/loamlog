import type { SessionProvider } from "@loamlog/core";
import { createClaudeCodeSessionProvider } from "@loamlog/provider-claude-code";
import { createOpencodeSessionProvider } from "@loamlog/provider-opencode";

const DEFAULT_PROVIDERS = ["opencode"];

export function parseProviderList(raw: string | undefined): string[] {
  if (!raw) {
    return [...DEFAULT_PROVIDERS];
  }

  const providerIds = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (providerIds.length === 0) {
    return [...DEFAULT_PROVIDERS];
  }

  return Array.from(new Set(providerIds));
}

export function createSessionProviders(providerIds: string[]): Record<string, SessionProvider> {
  const providers: Record<string, SessionProvider> = {};

  for (const providerId of providerIds) {
    if (providerId === "opencode") {
      providers[providerId] = createOpencodeSessionProvider();
      continue;
    }

    if (providerId === "claude-code") {
      providers[providerId] = createClaudeCodeSessionProvider();
      continue;
    }

    throw new Error(`unknown provider: ${providerId}`);
  }

  return providers;
}
