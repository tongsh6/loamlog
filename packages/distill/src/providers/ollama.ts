import type { LLMProvider, LLMProviderConfig } from "@loamlog/core";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import type { ProviderFactoryOptions } from "./shared.js";

export function createOllamaProvider(
  config: LLMProviderConfig = {},
  options: ProviderFactoryOptions = {},
): LLMProvider {
  return createOpenAICompatibleProvider(
    {
      id: "ollama",
      defaultBaseUrl: "http://127.0.0.1:11434",
      requireApiKey: false,
      supportsJsonResponseFormat: false,
    },
    config,
    options,
  );
}
