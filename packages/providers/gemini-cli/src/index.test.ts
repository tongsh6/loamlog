import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { pullGeminiCliSessionFromFilePath, createGeminiCliSessionProvider } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "__fixtures__", "sample-session.json");

describe("pullGeminiCliSessionFromFilePath", () => {
  it("parses a full Gemini CLI session with messages, toolCalls, and thoughts", async () => {
    const result = await pullGeminiCliSessionFromFilePath(fixturePath);

    assert.equal(result.session.source, "gemini-cli");
    assert.equal(result.session.session_id, "test-session-001");
    assert.ok(result.messages.length >= 4, `expected >= 4 messages, got ${result.messages.length}`);

    // user message
    const userMsg = result.messages.find((m) => m.role === "user");
    assert.ok(userMsg, "should have a user message");
    assert.ok(userMsg.content?.includes("重构"), `user content should mention 重构: ${userMsg.content}`);

    // assistant message with tool call
    const assistantMsg = result.messages.find(
      (m) => m.role === "assistant" && m.parts?.some((p) => p.type === "tool"),
    );
    assert.ok(assistantMsg, "should have an assistant message with tool call");
    assert.ok(
      assistantMsg.parts?.some((p) => p.type === "reasoning"),
      "should have reasoning parts",
    );
    assert.ok(
      assistantMsg.parts?.some((p) => p.type === "tool"),
      "should have tool parts",
    );

    // system message
    const systemMsg = result.messages.find((m) => m.role === "system");
    assert.ok(systemMsg, "should have a system message (info type)");

    // tool calls
    assert.ok(result.tools, "should have tools array");
    assert.ok(result.tools.length >= 1, `expected >= 1 tool, got ${result.tools?.length}`);
    const readFileTool = result.tools.find((t) => t.name === "read_file");
    assert.ok(readFileTool, "should have a read_file tool call");
    assert.ok(readFileTool.output, "read_file tool should have output");

    // context
    assert.ok(result.context?.repo, "should infer a repo from file paths");
    assert.ok(result.time_range?.start, "should have time_range.start");
    assert.ok(result.time_range?.end, "should have time_range.end");
  });

  it("handles a session without toolCalls", async () => {
    const minimalRecord = {
      sessionId: "minimal-session",
      messages: [
        {
          id: "msg-001",
          type: "user",
          timestamp: "2026-04-29T10:00:00.000Z",
          content: { parts: [{ text: "hello" }], role: "user" },
        },
        {
          id: "msg-002",
          type: "gemini",
          timestamp: "2026-04-29T10:00:05.000Z",
          content: { parts: [{ text: "hi there" }], role: "model" },
        },
      ],
    };

    const tmpDir = path.join(os.tmpdir(), `loam-gemini-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "minimal-session.json");
    await writeFile(tmpFile, JSON.stringify(minimalRecord, null, 2));
    try {
      const result = await pullGeminiCliSessionFromFilePath(tmpFile);
      assert.equal(result.messages.length, 2);
      assert.equal(result.messages[0].role, "user");
      assert.equal(result.messages[1].role, "assistant");
      assert.equal(result.tools, undefined);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles a session with error-type message", async () => {
    const errorRecord = {
      sessionId: "error-session",
      messages: [
        {
          id: "msg-001",
          type: "user",
          timestamp: "2026-04-29T10:00:00.000Z",
          content: { parts: [{ text: "do something" }], role: "user" },
        },
        {
          id: "msg-002",
          type: "error",
          timestamp: "2026-04-29T10:00:05.000Z",
          content: { parts: [{ text: "API rate limit exceeded" }], role: "system" },
        },
      ],
    };

    const tmpDir = path.join(os.tmpdir(), `loam-gemini-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, "error-session.json");
    await writeFile(tmpFile, JSON.stringify(errorRecord, null, 2));
    try {
      const result = await pullGeminiCliSessionFromFilePath(tmpFile);
      const errorMsg = result.messages.find((m) => m.role === "system");
      assert.ok(errorMsg, "should map error type to system role");
      assert.ok(errorMsg.content?.includes("rate limit"));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("createGeminiCliSessionProvider", () => {
  it("returns a provider with id gemini-cli", () => {
    const provider = createGeminiCliSessionProvider();
    assert.equal(provider.id, "gemini-cli");
  });

  it("throws when session file not found", async () => {
    const provider = createGeminiCliSessionProvider({
      projectsDir: "/nonexistent/path",
    });
    await assert.rejects(
      () => provider.pullSession("nonexistent-session-id"),
      /session file not found/,
    );
  });
});
