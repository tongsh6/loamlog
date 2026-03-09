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
  resolveTimeoutMs,
  throwForBadResponse,
  type AnthropicMessageResponse,
  type ProviderFactoryOptions,
} from "./shared.js";

type ProviderMessage = Parameters<LLMProvider["complete"]>[0]["messages"][number];

function splitSystemMessages(messages: ProviderMessage[]): {
  system: string | undefined;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts: string[] = [];
  const nextMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }

    nextMessages.push({
      role: message.role,
      content: message.content,
    });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: nextMessages,
  };
}

export function createAnthropicProvider(
  config: LLMProviderConfig = {},
  options: ProviderFactoryOptions = {},
): LLMProvider {
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const fetchImpl = getFetchImpl(options);
  const baseUrl = normalizeBaseUrl(config.base_url ?? "https://api.anthropic.com");
  const apiKey = requireApiKey("anthropic", config);

  return {
    id: "anthropic",
    async complete(input) {
      const split = splitSystemMessages(input.messages);
      const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: input.max_tokens ?? 4096,
        messages: split.messages,
      };

      if (input.temperature !== undefined) {
        body.temperature = input.temperature;
      }

      const systemPrompt = split.system
        ? input.response_format === "json"
          ? `${split.system}\n\nReturn only valid JSON.`
          : split.system
        : input.response_format === "json"
          ? "Return only valid JSON."
          : undefined;

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      const signal = createTimeoutSignal(timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        if (isTimeoutError(error) || signal.aborted) {
          throw new LLMTimeoutError(`llm request timed out provider=anthropic timeout_ms=${timeoutMs}`, "anthropic");
        }

        throw buildNetworkError("anthropic", error);
      }

      if (!response.ok) {
        await throwForBadResponse("anthropic", response);
      }

      const payload = await parseJsonResponse<AnthropicMessageResponse>("anthropic", response);
      if (!payload.content) {
        throw new LLMResponseFormatError(
          "invalid response from provider=anthropic: missing content array",
          "anthropic",
        );
      }

      return {
        content: extractTextContent(payload.content, "anthropic"),
        tokens: {
          input: payload.usage?.input_tokens ?? 0,
          output: payload.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
