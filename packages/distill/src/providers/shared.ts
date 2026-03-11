import {
  LLMAuthError,
  LLMError,
  LLMRateLimitError,
  LLMResponseFormatError,
  LLMTimeoutError,
  type LLMProviderConfig,
} from "@loamlog/core";

export interface ProviderFactoryOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;

const PROVIDER_API_KEY_ENV: Record<string, string | undefined> = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  ollama: undefined,
};

export function resolveTimeoutMs(timeoutMs?: number): number {
  return timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function resolveProviderApiKey(providerId: string, config: LLMProviderConfig): string | undefined {
  const envName = PROVIDER_API_KEY_ENV[providerId];
  return config.api_key ?? (envName ? process.env[envName] : undefined);
}

export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildNetworkError(providerId: string, error: unknown): LLMError {
  return new LLMError(`llm request failed provider=${providerId}: ${toErrorMessage(error)}`, providerId);
}

export function requireApiKey(providerId: string, config: LLMProviderConfig): string {
  const apiKey = resolveProviderApiKey(providerId, config);
  if (!apiKey) {
    throw new LLMAuthError(
      `missing API key for provider '${providerId}'. Set the matching environment variable or configure llm.providers.${providerId}.api_key`,
      providerId,
    );
  }
  return apiKey;
}

function parseRetryAfterMs(retryAfter: string | null): number | undefined {
  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(retryAfter);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return Math.max(0, timestamp - Date.now());
}

export async function throwForBadResponse(providerId: string, response: Response): Promise<never> {
  const body = (await response.text()).slice(0, 500);
  const message = `llm request failed provider=${providerId} status=${response.status}${body ? ` body=${body}` : ""}`;

  if (response.status === 401 || response.status === 403) {
    throw new LLMAuthError(message, providerId);
  }

  if (response.status === 429) {
    throw new LLMRateLimitError(message, providerId, parseRetryAfterMs(response.headers.get("retry-after")));
  }

  if (response.status === 408 || response.status === 504) {
    throw new LLMTimeoutError(message, providerId);
  }

  throw new LLMError(message, providerId);
}

export async function parseJsonResponse<T>(providerId: string, response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new LLMResponseFormatError(
      `invalid JSON response from provider=${providerId}: ${toErrorMessage(error)}`,
      providerId,
    );
  }
}

export function extractTextContent(content: unknown, providerId: string): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    throw new LLMResponseFormatError(
      `invalid response content from provider=${providerId}: expected string or text parts array`,
      providerId,
    );
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (!part || typeof part !== "object") {
        return "";
      }

      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
    })
    .join("");
}

export function getFetchImpl(options: ProviderFactoryOptions): typeof fetch {
  return options.fetchImpl ?? fetch;
}
