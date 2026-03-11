import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { LLMAuthError } from "@loamlog/core";
import { createLLMRouter } from "./llm-router.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

const originalFetch = globalThis.fetch;
const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
};

beforeEach(() => {
  process.env.OPENAI_API_KEY = "openai-key";
  process.env.DEEPSEEK_API_KEY = "deepseek-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.DEEPSEEK_API_KEY = originalEnv.DEEPSEEK_API_KEY;
});

describe("llm router", () => {
  test("selects budget-specific default model", () => {
    const router = createLLMRouter({
      providers: {
        deepseek: {},
        openai: {},
      },
    });

    const routed = router.route({
      task: "extract",
      budget: "premium",
      input_tokens: 42,
    });

    assert.equal(routed.provider.id, "deepseek");
    assert.equal(routed.model, "deepseek-reasoner");
  });

  test("falls back on rate limit and logs the fallback", async () => {
    const warnings: string[] = [];

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.openai.com")) {
        return new Response("slow down", { status: 429 });
      }

      if (url.includes("api.deepseek.com")) {
        return jsonResponse({
          choices: [{ message: { content: "fallback-ok" } }],
          usage: { prompt_tokens: 7, completion_tokens: 3 },
        });
      }

      throw new Error(`unexpected url: ${url}`);
    };

    const router = createLLMRouter(
      {
        providers: {
          openai: {},
          deepseek: {},
        },
      },
      {
        logger: {
          info() {},
          warn(message) {
            warnings.push(message);
          },
        },
      },
    );

    const routed = router.route({
      task: "extract",
      budget: "cheap",
      input_tokens: 20,
    });

    const result = await routed.provider.complete({
      model: routed.model,
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(result.content, "fallback-ok");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /fallback: openai\/gpt-4o-mini -> deepseek\/deepseek-chat/);
  });

  test("does not fall back on auth failures", async () => {
    let deepseekCalled = false;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.openai.com")) {
        return new Response("unauthorized", { status: 401 });
      }

      if (url.includes("api.deepseek.com")) {
        deepseekCalled = true;
      }

      return jsonResponse({
        choices: [{ message: { content: "should-not-happen" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    };

    const router = createLLMRouter({
      providers: {
        openai: {},
        deepseek: {},
      },
    });

    const routed = router.route({
      task: "extract",
      budget: "cheap",
      input_tokens: 5,
    });

    await assert.rejects(
      () =>
        routed.provider.complete({
          model: routed.model,
          messages: [{ role: "user", content: "hi" }],
        }),
      LLMAuthError,
    );
    assert.equal(deepseekCalled, false);
  });

  test("falls back on generic provider errors such as upstream 500", async () => {
    const warnings: string[] = [];

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.openai.com")) {
        return new Response("server error", { status: 500 });
      }

      if (url.includes("api.deepseek.com")) {
        return jsonResponse({
          choices: [{ message: { content: "recovered" } }],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        });
      }

      throw new Error(`unexpected url: ${url}`);
    };

    const router = createLLMRouter(
      {
        providers: {
          openai: {},
          deepseek: {},
        },
      },
      {
        logger: {
          info() {},
          warn(message) {
            warnings.push(message);
          },
        },
      },
    );

    const routed = router.route({
      task: "extract",
      budget: "cheap",
      input_tokens: 9,
    });

    const result = await routed.provider.complete({
      model: routed.model,
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(result.content, "recovered");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /reason=LLMError/);
  });
});
