import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createOpencodeSessionProvider } from "./index.js";

describe("createOpencodeSessionProvider", () => {
  test("uses custom fetcher", async () => {
    const provider = createOpencodeSessionProvider({
      fetcher: async (sessionId) => ({
        session: { id: sessionId, source: "custom" },
        messages: [
          {
            id: "msg-custom",
            role: "assistant",
            timestamp: "2026-03-02T00:00:00.000Z",
            content: "custom",
          },
        ],
      }),
    });

    const pulled = await provider.pullSession("ses_provider_001");
    assert.equal(pulled.session.id, "ses_provider_001");
    assert.equal(pulled.messages[0]?.content, "custom");
  });

  test("pulls from OpenCode HTTP API and maps session/messages/tools", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.endsWith("/session/ses_http_001")) {
        return new Response(
          JSON.stringify({
            id: "ses_http_001",
            directory: "D:/demo-repo",
            time: {
              created: 1700000000000,
              updated: 1700000002000,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (url.endsWith("/session/ses_http_001/message")) {
        return new Response(
          JSON.stringify([
            {
              info: {
                id: "msg-user-1",
                role: "user",
                time: { created: 1700000000100 },
              },
              parts: [
                {
                  type: "text",
                  text: "My token is sk-abcdefghijklmnopqrstuvwxyz",
                },
              ],
            },
            {
              info: {
                id: "msg-assistant-1",
                role: "assistant",
                time: { created: 1700000001100 },
              },
              parts: [
                {
                  type: "tool",
                  callID: "call-123",
                  tool: "bash",
                  state: {
                    input: { command: "pwd" },
                    output: "D:/demo-repo",
                  },
                },
              ],
            },
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (url.endsWith("/path")) {
        return new Response(
          JSON.stringify({
            directory: "D:/demo-repo",
            worktree: "D:/demo-repo",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (url.endsWith("/vcs")) {
        return new Response(JSON.stringify({ branch: "main" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    };

    const provider = createOpencodeSessionProvider({
      baseUrl: "http://127.0.0.1:4096",
      fetchImpl: mockFetch,
    });

    const pulled = await provider.pullSession("ses_http_001");

    assert.equal(requestedUrls.includes("http://127.0.0.1:4096/session/ses_http_001"), true);
    assert.equal(requestedUrls.includes("http://127.0.0.1:4096/session/ses_http_001/message"), true);
    assert.equal(pulled.messages.length, 2);
    assert.equal(pulled.context?.branch, "main");
    assert.equal(pulled.tools?.[0]?.id, "call-123");
  });
});
