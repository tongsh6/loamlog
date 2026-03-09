import {
  LLMAuthError,
  LLMError,
  LLMResponseFormatError,
  LLMRateLimitError,
  LLMTimeoutError,
  type AICConfig,
  type LLMBudget,
  type LLMProvider,
  type LLMProviderConfig,
  type LLMRouter,
} from "@loamlog/core";
import { createProvider } from "./providers/index.js";

interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

interface RouterRuntimeProvider {
  id: string;
  config: LLMProviderConfig;
  provider: LLMProvider;
}

interface RoutedAttempt {
  id: string;
  provider: LLMProvider;
  model: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const NOOP_LOGGER: Logger = {
  info() {},
  warn() {},
};

const DEFAULT_MODELS: Record<string, Record<LLMBudget, string>> = {
  openai: {
    cheap: "gpt-4o-mini",
    standard: "gpt-4o",
    premium: "gpt-4o",
  },
  deepseek: {
    cheap: "deepseek-chat",
    standard: "deepseek-chat",
    premium: "deepseek-reasoner",
  },
  anthropic: {
    cheap: "claude-3-5-haiku-latest",
    standard: "claude-3-5-sonnet-latest",
    premium: "claude-3-opus-latest",
  },
  ollama: {
    cheap: "llama3.2:3b",
    standard: "llama3.1:8b",
    premium: "llama3.1:70b",
  },
};

function getProviderEntries(config?: AICConfig["llm"]): Array<[string, LLMProviderConfig]> {
  const entries = Object.entries(config?.providers ?? {});
  return entries.length > 0 ? entries : [["openai", {}]];
}

function resolveTimeoutMs(config?: AICConfig["llm"]): number {
  return config?.timeout_ms ?? DEFAULT_TIMEOUT_MS;
}

function resolveModel(providerId: string, providerConfig: LLMProviderConfig, budget: LLMBudget): string {
  return providerConfig.model ?? DEFAULT_MODELS[providerId]?.[budget] ?? DEFAULT_MODELS.openai[budget];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildAttempts(runtimes: RouterRuntimeProvider[], budget: LLMBudget): RoutedAttempt[] {
  return runtimes.map((runtime) => ({
    id: runtime.id,
    provider: runtime.provider,
    model: resolveModel(runtime.id, runtime.config, budget),
  }));
}

function buildFallbackProvider(
  attempts: RoutedAttempt[],
  logger: Logger,
  budget: LLMBudget,
  inputTokens: number,
): LLMProvider {
  return {
    id: attempts[0]?.id ?? "unknown",
    async complete(input) {
      const failures: string[] = [];

      for (let index = 0; index < attempts.length; index += 1) {
        const attempt = attempts[index];

        try {
          return await attempt.provider.complete({
            ...input,
            model: attempt.model,
          });
        } catch (error) {
          if (error instanceof LLMAuthError || error instanceof LLMResponseFormatError) {
            throw error;
          }

          if (error instanceof LLMRateLimitError || error instanceof LLMTimeoutError) {
            failures.push(`${attempt.id}/${attempt.model}: ${toErrorMessage(error)}`);

            const nextAttempt = attempts[index + 1];
            if (nextAttempt) {
              logger.warn(
                `[llm-router] fallback: ${attempt.id}/${attempt.model} -> ${nextAttempt.id}/${nextAttempt.model} reason=${error instanceof Error ? error.name : "unknown"}`,
              );
              continue;
            }

            if (failures.length === 1) {
              throw error;
            }

            throw new LLMError(
              `all providers failed task_budget=${budget} input_tokens=${inputTokens}: ${failures.join("; ")}`,
              attempts[0]?.id ?? attempt.id,
            );
          }

          if (error instanceof LLMError) {
            failures.push(`${attempt.id}/${attempt.model}: ${toErrorMessage(error)}`);

            const nextAttempt = attempts[index + 1];
            if (nextAttempt) {
              logger.warn(
                `[llm-router] fallback: ${attempt.id}/${attempt.model} -> ${nextAttempt.id}/${nextAttempt.model} reason=${error.name}`,
              );
              continue;
            }

            if (failures.length === 1) {
              throw error;
            }

            throw new LLMError(
              `all providers failed task_budget=${budget} input_tokens=${inputTokens}: ${failures.join("; ")}`,
              attempts[0]?.id ?? attempt.id,
            );
          }

          if (failures.length > 0) {
            failures.push(`${attempt.id}/${attempt.model}: ${toErrorMessage(error)}`);
            throw new LLMError(
              `all providers failed task_budget=${budget} input_tokens=${inputTokens}: ${failures.join("; ")}`,
              attempts[0]?.id ?? attempt.id,
            );
          }

          throw error;
        }
      }

      throw new LLMError(`no LLM providers available for budget=${budget}`, attempts[0]?.id ?? "unknown");
    },
  };
}

export function createLLMRouter(
  config?: AICConfig["llm"],
  options?: {
    logger?: Logger;
  },
): LLMRouter {
  const timeoutMs = resolveTimeoutMs(config);
  const logger = options?.logger ?? NOOP_LOGGER;
  const runtimes = getProviderEntries(config).map(([providerId, providerConfig]) => ({
    id: providerId,
    config: providerConfig,
    provider: createProvider(providerId, providerConfig, { timeoutMs }),
  }));

  return {
    route(request) {
      const attempts = buildAttempts(runtimes, request.budget);
      const primary = attempts[0];
      logger.info(
        `[llm-router] route: task=${request.task} budget=${request.budget} input_tokens=${request.input_tokens} -> ${primary.id}/${primary.model}`,
      );

      return {
        provider: buildFallbackProvider(attempts, logger, request.budget, request.input_tokens),
        model: primary.model,
      };
    },
  };
}
