import type { LLMProvider, LLMProviderConfig } from "@loamlog/core";
import { LLMResponseFormatError, LLMTimeoutError } from "@loamlog/core";
import {
  buildNetworkError,
  createTimeoutSignal,
  extractTextContent,
  getFetchImpl,
  isTimeoutError,
  normalizeBaseUrl,
  parseJsonResponse,
  requireApiKey,
  resolveProviderApiKey,
  resolveTimeoutMs,
  throwForBadResponse,
  type OpenAIChatCompletionResponse,
  type ProviderFactoryOptions,
} from "./shared.js";

interface OpenAICompatibleProviderOptions {
  id: string;
  defaultBaseUrl: string;
  requireApiKey: boolean;
  supportsJsonResponseFormat: boolean;
}

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
  config: LLMProviderConfig,
  factoryOptions: ProviderFactoryOptions = {},
): LLMProvider {
  const timeoutMs = resolveTimeoutMs(factoryOptions.timeoutMs);
  const fetchImpl = getFetchImpl(factoryOptions);
  const baseUrl = normalizeBaseUrl(config.base_url ?? options.defaultBaseUrl);
  const apiKey = options.requireApiKey ? requireApiKey(options.id, config) : resolveProviderApiKey(options.id, config);

  return {
    id: options.id,
    async complete(input) {
      const body: Record<string, unknown> = {
        model: input.model,
        messages: input.messages,
      };

      if (input.temperature !== undefined) {
        body.temperature = input.temperature;
      }

      if (input.max_tokens !== undefined) {
        body.max_tokens = input.max_tokens;
      }

      if (options.supportsJsonResponseFormat && input.response_format === "json") {
        body.response_format = { type: "json_object" };
      }

      const headers: Record<string, string> = {
        "content-type": "application/json",
      };

      if (apiKey) {
        headers.authorization = `Bearer ${apiKey}`;
      }

      const signal = createTimeoutSignal(timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        if (isTimeoutError(error) || signal.aborted) {
          throw new LLMTimeoutError(`llm request timed out provider=${options.id} timeout_ms=${timeoutMs}`, options.id);
        }

        throw buildNetworkError(options.id, error);
      }

      if (!response.ok) {
        await throwForBadResponse(options.id, response);
      }

      const payload = await parseJsonResponse<OpenAIChatCompletionResponse>(options.id, response);
      const message = payload.choices?.[0]?.message;
      if (!message || message.content === undefined) {
        throw new LLMResponseFormatError(
          `invalid response from provider=${options.id}: missing choices[0].message.content`,
          options.id,
        );
      }

      return {
        content: extractTextContent(message.content, options.id),
        tokens: {
          input: payload.usage?.prompt_tokens ?? 0,
          output: payload.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}
