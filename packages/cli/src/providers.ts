import type { SessionProvider } from "@loamlog/core";
import { createClaudeCodeSessionProvider } from "@loamlog/provider-claude-code";
import { createCodexSessionProvider } from "@loamlog/provider-codex";
import { createGeminiCliSessionProvider } from "@loamlog/provider-gemini-cli";
import { createOpencodeSessionProvider } from "@loamlog/provider-opencode";

type ProviderFactory = () => SessionProvider;

const registry = new Map<string, ProviderFactory>([
  ["opencode", createOpencodeSessionProvider],
  ["claude-code", createClaudeCodeSessionProvider],
  ["gemini-cli", createGeminiCliSessionProvider],
  ["codex", createCodexSessionProvider],
]);

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
    const factory = registry.get(providerId);
    if (!factory) {
      throw new Error(`unknown provider: ${providerId}`);
    }
    providers[providerId] = factory();
  }

  return providers;
}
