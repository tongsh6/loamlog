import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createCodexSessionProvider,
  pullCodexSessionFromFilePath,
} from "./index.js";

function J(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

describe("pullCodexSessionFromFilePath", () => {
  it("parses a Codex session JSONL with user and assistant messages", async () => {
    const tmpDir = path.join(tmpdir(), `loam-codex-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "session.jsonl");

    const lines = `${[
      J({
        type: "session_meta",
        payload: { id: "codex-ses-001", cwd: "/project" },
      }),
      J({
        timestamp: "2026-05-01T10:00:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Refactor the auth module" }],
        },
      }),
      J({
        timestamp: "2026-05-01T10:00:05.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "I'll refactor step by step." },
          ],
        },
      }),
    ].join("\n")}\n`;

    await writeFile(tmpFile, lines, "utf8");

    try {
      const result = await pullCodexSessionFromFilePath(tmpFile);
      assert.equal(result.session.source, "codex");
      assert.equal(result.session.session_id, "codex-ses-001");
      assert.equal(result.messages.length, 2);
      assert.equal(result.messages[0].role, "user");
      assert.equal(result.messages[0].content, "Refactor the auth module");
      assert.equal(result.messages[1].role, "assistant");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles tool calls in Codex session", async () => {
    const tmpDir = path.join(tmpdir(), `loam-codex-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "session-tools.jsonl");

    const lines = `${[
      J({ type: "session_meta", payload: { id: "codex-ses-002" } }),
      J({
        timestamp: "2026-05-01T10:00:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Read package.json" }],
        },
      }),
      J({
        timestamp: "2026-05-01T10:00:03.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call-1",
          name: "read_file",
          arguments: '{"filePath":"/project/package.json"}',
        },
      }),
      J({
        timestamp: "2026-05-01T10:00:04.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call-1",
          output: [{ type: "output_text", text: '{"name":"loamlog"}' }],
        },
      }),
      J({
        timestamp: "2026-05-01T10:00:05.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "The project name is loamlog." },
          ],
        },
      }),
    ].join("\n")}\n`;

    await writeFile(tmpFile, lines, "utf8");

    try {
      const result = await pullCodexSessionFromFilePath(tmpFile);
      assert.equal(result.messages.length, 2);
      assert.ok(result.tools, "should have tools array");
      assert.equal(result.tools.length, 1);
      assert.equal(result.tools[0].name, "read_file");
      assert.ok(
        result.tools[0].output?.includes("loamlog"),
        "tool output should include project name",
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles reasoning messages attached to assistant", async () => {
    const tmpDir = path.join(tmpdir(), `loam-codex-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "session-reasoning.jsonl");

    const lines = `${[
      J({ type: "session_meta", payload: { id: "codex-ses-003" } }),
      J({
        timestamp: "2026-05-01T10:00:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Explain recursion" }],
        },
      }),
      J({
        timestamp: "2026-05-01T10:00:05.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "Recursion is when a function calls itself.",
            },
          ],
        },
      }),
      J({
        timestamp: "2026-05-01T10:00:06.000Z",
        type: "response_item",
        payload: { type: "reasoning", encrypted_content: "thinking-step-1" },
      }),
    ].join("\n")}\n`;

    await writeFile(tmpFile, lines, "utf8");

    try {
      const result = await pullCodexSessionFromFilePath(tmpFile);
      assert.equal(result.messages.length, 2);
      assert.equal(result.messages[0].role, "user");
      assert.equal(result.messages[1].role, "assistant");
      const reasoningPart = result.messages[1].parts?.find(
        (p) => p.type === "reasoning",
      );
      assert.ok(reasoningPart, "should have reasoning part");
      assert.equal(reasoningPart.text, "[encrypted reasoning]");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("skips empty lines and incomplete last-line JSON", async () => {
    const tmpDir = path.join(tmpdir(), `loam-codex-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "session-incomplete.jsonl");

    const lines = [
      J({ type: "session_meta", payload: { id: "codex-ses-004" } }),
      J({
        timestamp: "2026-05-01T10:00:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Hello" }],
        },
      }),
      "",
      J({
        timestamp: "2026-05-01T10:00:05.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hi there" }],
        },
      }),
      '{"timestamp":"2026-05-01T10:00:10.000Z","type":"response_item","payload":{"type":"mess',
    ].join("\n");

    await writeFile(tmpFile, lines, "utf8");

    try {
      const result = await pullCodexSessionFromFilePath(tmpFile);
      assert.equal(result.messages.length, 2);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("createCodexSessionProvider", () => {
  it("returns a provider with id codex", () => {
    const provider = createCodexSessionProvider();
    assert.equal(provider.id, "codex");
  });

  it("throws when session file not found", async () => {
    const provider = createCodexSessionProvider({
      sessionsDir: "/nonexistent/path",
    });
    await assert.rejects(
      () => provider.pullSession("nonexistent-session-id"),
      /session file not found/,
    );
  });
});
