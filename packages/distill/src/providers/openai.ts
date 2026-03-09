import type { LLMProvider, LLMProviderConfig } from "@loamlog/core";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import type { ProviderFactoryOptions } from "./shared.js";

export function createOpenAIProvider(
  config: LLMProviderConfig = {},
  options: ProviderFactoryOptions = {},
): LLMProvider {
  return createOpenAICompatibleProvider(
    {
      id: "openai",
      defaultBaseUrl: "https://api.openai.com",
      requireApiKey: true,
      supportsJsonResponseFormat: true,
    },
    config,
    options,
  );
}
