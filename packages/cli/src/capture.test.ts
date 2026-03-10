import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseCaptureArgs, runCaptureCommand } from "./capture.js";

describe("capture cli helpers", () => {
  test("parseCaptureArgs reads required flags", () => {
    const parsed = parseCaptureArgs([
      "--provider",
      "claude-code",
      "--session-id",
      "cb5675db-83fd-4282-9afc-65f911d6fb68",
      "--dump-dir",
      "/tmp/loamlog",
    ]);

    assert.equal(parsed.provider, "claude-code");
    assert.equal(parsed.sessionId, "cb5675db-83fd-4282-9afc-65f911d6fb68");
    assert.equal(parsed.dumpDir, "/tmp/loamlog");
    assert.equal(parsed.trigger, "manual.capture");
  });

  test("runCaptureCommand forwards payload to processCaptureRequest", async () => {
    const logs: string[] = [];
    const calls: Array<Record<string, unknown>> = [];

    await runCaptureCommand(
      ["--provider", "claude-code", "--session-id", "session-123", "--dump-dir", "/tmp/loamlog"],
      {
        now: () => new Date("2026-03-10T00:00:00.000Z"),
        logger(message) {
          logs.push(message);
        },
        createProviders() {
          return { "claude-code": { id: "claude-code", async pullSession() { throw new Error("should not pull in test"); } } };
        },
        async processCapture(payload, options) {
          calls.push({ payload, options });
          return {
            accepted: true,
            session_id: payload.session_id,
            snapshot_path: "/tmp/loamlog/repos/demo/sessions/demo.json",
          };
        },
      },
    );

    const payload = calls[0]?.payload as { session_id: string; provider: string; trigger: string; captured_at: string };
    assert.equal(payload.session_id, "session-123");
    assert.equal(payload.provider, "claude-code");
    assert.equal(payload.trigger, "manual.capture");
    assert.equal(payload.captured_at, "2026-03-10T00:00:00.000Z");
    assert.equal(logs.some((message) => message.includes("snapshot saved")), true);
  });
});
