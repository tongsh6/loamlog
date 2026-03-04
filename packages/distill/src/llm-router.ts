import type { AICConfig, LLMProvider, LLMRouter } from "@loamlog/core";

interface ProviderRuntimeConfig {
  id: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveProviderConfig(config?: AICConfig["llm"]): ProviderRuntimeConfig {
  const providers = config?.providers ?? {};
  const knownProviderId = Object.keys(providers)[0] ?? "openai";
  const providerConfig = providers[knownProviderId] ?? {};

  const apiKey =
    providerConfig.api_key ??
    (knownProviderId === "deepseek" ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    throw new Error(`missing API key for provider: ${knownProviderId}`);
  }

  const defaultBaseUrl = knownProviderId === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com";
  const defaultModel = knownProviderId === "deepseek" ? "deepseek-chat" : "gpt-4o-mini";

  return {
    id: knownProviderId,
    model: providerConfig.model ?? defaultModel,
    baseUrl: normalizeBaseUrl(providerConfig.base_url ?? defaultBaseUrl),
    apiKey,
  };
}

function createOpenAICompatibleProvider(runtime: ProviderRuntimeConfig): LLMProvider {
  return {
    id: runtime.id,
    async complete(input: {
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      model: string;
      temperature?: number;
      max_tokens?: number;
      response_format?: "text" | "json";
    }) {
      const body: Record<string, unknown> = {
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.max_tokens,
      };

      if (input.response_format === "json") {
        body.response_format = { type: "json_object" };
      }

      const response = await fetch(`${runtime.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${runtime.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`llm request failed status=${response.status} body=${text.slice(0, 200)}`);
      }

      const payload = (await response.json()) as OpenAIChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content ?? "";
      return {
        content,
        tokens: {
          input: payload.usage?.prompt_tokens ?? 0,
          output: payload.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

export function createLLMRouter(config?: AICConfig["llm"]): LLMRouter {
  const runtime = resolveProviderConfig(config);
  const provider = createOpenAICompatibleProvider(runtime);

  return {
    route() {
      return {
        provider,
        model: runtime.model,
      };
    },
  };
}
