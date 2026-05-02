import type { LLMProvider, LLMProviderConfig } from "@loamlog/core";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import type { ProviderFactoryOptions } from "./shared.js";

export function createLMStudioProvider(
  config: LLMProviderConfig = {},
  factoryOptions: ProviderFactoryOptions = {},
): LLMProvider {
  return createOpenAICompatibleProvider(
    {
      id: "lmstudio",
      defaultBaseUrl: "http://127.0.0.1:1234",
      requireApiKey: false,
      supportsJsonResponseFormat: false,
      defaultContextWindow: 131072,
    },
    config,
    factoryOptions,
  );
}
