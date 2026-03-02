import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forwardCaptureEvent } from "./http-client.js";

describe("forwardCaptureEvent", () => {
  test("posts capture payload to daemon endpoint", async () => {
    const calls: Array<{ url: string; body: string }> = [];

    await forwardCaptureEvent({
      daemonUrl: "http://127.0.0.1:40000",
      request: {
        session_id: "ses_plugin_001",
        trigger: "session.idle",
        captured_at: new Date().toISOString(),
        provider: "opencode",
      },
      fetchImpl: async (input, init) => {
        calls.push({
          url: String(input),
          body: String(init?.body ?? ""),
        });
        return new Response(null, { status: 202 });
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "http://127.0.0.1:40000/capture");
    assert.equal(calls[0]?.body.includes("ses_plugin_001"), true);
  });
});
