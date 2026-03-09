import { LLMError, type LLMProvider, type LLMProviderConfig } from "@loamlog/core";
import { createAnthropicProvider } from "./anthropic.js";
import { createDeepSeekProvider } from "./deepseek.js";
import { createOllamaProvider } from "./ollama.js";
import { createOpenAIProvider } from "./openai.js";
import type { ProviderFactoryOptions } from "./shared.js";

export type { ProviderFactoryOptions } from "./shared.js";

export function createProvider(
  providerId: string,
  config: LLMProviderConfig = {},
  options: ProviderFactoryOptions = {},
): LLMProvider {
  switch (providerId) {
    case "openai":
      return createOpenAIProvider(config, options);
    case "deepseek":
      return createDeepSeekProvider(config, options);
    case "anthropic":
      return createAnthropicProvider(config, options);
    case "ollama":
      return createOllamaProvider(config, options);
    default:
      throw new LLMError(`unsupported llm provider '${providerId}'`, providerId);
  }
}
