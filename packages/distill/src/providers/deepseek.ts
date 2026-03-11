import type { LLMProvider, LLMProviderConfig } from "@loamlog/core";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import type { ProviderFactoryOptions } from "./shared.js";

export function createDeepSeekProvider(
  config: LLMProviderConfig = {},
  options: ProviderFactoryOptions = {},
): LLMProvider {
  return createOpenAICompatibleProvider(
    {
      id: "deepseek",
      defaultBaseUrl: "https://api.deepseek.com",
      requireApiKey: true,
      supportsJsonResponseFormat: true,
    },
    config,
    options,
  );
}
