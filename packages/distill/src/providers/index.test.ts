import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { LLMAuthError, LLMRateLimitError, LLMTimeoutError } from "@loamlog/core";
import { createProvider } from "./index.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

afterEach(() => {
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.DEEPSEEK_API_KEY = originalEnv.DEEPSEEK_API_KEY;
  process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
});

describe("llm providers", () => {
  test("openai provider sends chat completions request and parses tokens", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;

    const provider = createProvider(
      "openai",
      { api_key: "openai-key" },
      {
        fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
          seenUrl = String(input);
          seenInit = init;
          return jsonResponse({
            choices: [{ message: { content: "hello" } }],
            usage: { prompt_tokens: 12, completion_tokens: 4 },
          });
        },
      },
    );

    const result = await provider.complete({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      response_format: "json",
    });

    assert.equal(seenUrl, "https://api.openai.com/v1/chat/completions");
    assert.equal(result.content, "hello");
    assert.equal(result.tokens.input, 12);
    assert.equal(result.tokens.output, 4);

    const headers = seenInit?.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer openai-key");

    const body = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;
    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  test("deepseek provider uses default base url", async () => {
    let seenUrl = "";

    const provider = createProvider(
      "deepseek",
      { api_key: "deepseek-key" },
      {
        fetchImpl: async (input: RequestInfo | URL) => {
          seenUrl = String(input);
          return jsonResponse({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          });
        },
      },
    );

    await provider.complete({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(seenUrl, "https://api.deepseek.com/v1/chat/completions");
  });

  test("anthropic provider adapts system prompt and response shape", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;

    const provider = createProvider(
      "anthropic",
      { api_key: "anthropic-key" },
      {
        fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
          seenUrl = String(input);
          seenInit = init;
          return jsonResponse({
            content: [{ type: "text", text: '{"ok":true}' }],
            usage: { input_tokens: 8, output_tokens: 2 },
          });
        },
      },
    );

    const result = await provider.complete({
      model: "claude-3-5-haiku-latest",
      messages: [
        { role: "system", content: "Be precise." },
        { role: "user", content: "Return JSON" },
      ],
      response_format: "json",
    });

    assert.equal(seenUrl, "https://api.anthropic.com/v1/messages");
    assert.equal(result.content, '{"ok":true}');
    assert.equal(result.tokens.input, 8);
    assert.equal(result.tokens.output, 2);

    const headers = seenInit?.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "anthropic-key");
    assert.equal(headers["anthropic-version"], "2023-06-01");

    const body = JSON.parse(String(seenInit?.body)) as {
      system?: string;
      messages: Array<{ role: string; content: string }>;
    };
    assert.match(body.system ?? "", /Return only valid JSON\./);
    assert.deepEqual(body.messages, [{ role: "user", content: "Return JSON" }]);
  });

  test("ollama provider works without api key", async () => {
    let seenHeaders: RequestInit["headers"];

    const provider = createProvider(
      "ollama",
      {},
      {
        fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
          seenHeaders = init?.headers;
          return jsonResponse({
            choices: [{ message: { content: "local" } }],
            usage: { prompt_tokens: 2, completion_tokens: 1 },
          });
        },
      },
    );

    const result = await provider.complete({
      model: "llama3.2:3b",
      messages: [{ role: "user", content: "ping" }],
    });

    assert.equal(result.content, "local");
    const headers = seenHeaders as Record<string, string>;
    assert.equal(headers.authorization, undefined);
  });

  test("missing api key fails fast", () => {
    delete process.env.OPENAI_API_KEY;
    assert.throws(() => createProvider("openai", {}), LLMAuthError);
  });

  test("rate limit responses map to typed error with retry-after", async () => {
    const provider = createProvider(
      "openai",
      { api_key: "openai-key" },
      {
        fetchImpl: async () =>
          new Response("slow down", {
            status: 429,
            headers: { "retry-after": "2" },
          }),
      },
    );

    await assert.rejects(
      () =>
        provider.complete({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
        }),
      (error: unknown) => {
        assert.ok(error instanceof LLMRateLimitError);
        const typedError = error as LLMRateLimitError;
        assert.equal(typedError.retryAfterMs, 2000);
        return true;
      },
    );
  });

  test("timeouts map to LLMTimeoutError", async () => {
    const provider = createProvider(
      "openai",
      { api_key: "openai-key" },
      {
        timeoutMs: 5,
        fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) =>
          await new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener("abort", () => {
              reject(signal.reason ?? new DOMException("Timeout", "TimeoutError"));
            });
          }),
      },
    );

    await assert.rejects(
      () =>
        provider.complete({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
        }),
      LLMTimeoutError,
    );
  });
});
