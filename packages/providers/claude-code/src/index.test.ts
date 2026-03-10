import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { createClaudeCodeSessionProvider, startClaudeCodeWatcher } from "./index.js";

const fixturePath = new URL("./__fixtures__/main-session.jsonl", import.meta.url);
let tempDir: string | undefined;

afterEach(async () => {
  if (!tempDir) {
    return;
  }

  const target = tempDir;
  tempDir = undefined;
  await rm(target, { recursive: true, force: true });
});

describe("createClaudeCodeSessionProvider", () => {
  test("parses Claude Code project session JSONL", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loamlog-claude-provider-"));
    const projectDir = path.join(tempDir, "-Users-demo-loamlog");
    await mkdir(projectDir, { recursive: true });

    const sessionId = "cb5675db-83fd-4282-9afc-65f911d6fb68";
    const targetFile = path.join(projectDir, `${sessionId}.jsonl`);
    const fixture = await readFile(fixturePath, "utf8");
    await writeFile(targetFile, fixture, "utf8");

    const provider = createClaudeCodeSessionProvider({ projectsDir: tempDir });
    const pulled = await provider.pullSession(sessionId);

    assert.equal(pulled.context?.cwd, "/Users/demo/loamlog");
    assert.equal(pulled.context?.repo, "loamlog");
    assert.equal(pulled.context?.branch, "feature/m4");
    assert.equal(pulled.messages.length, 4);
    assert.equal(pulled.messages[0]?.role, "user");
    assert.equal(pulled.messages[1]?.role, "assistant");
    assert.equal(pulled.messages[1]?.content, "我先看看当前工作区结构。");
    assert.equal(pulled.messages[2]?.parts?.some((part) => part.type === "tool"), true);
    assert.equal(pulled.messages[3]?.content, "工作区在 loamlog 根目录。");
    assert.equal(pulled.tools?.[0]?.id, "toolu_demo_bash");
    assert.equal(pulled.tools?.[0]?.output, "/Users/demo/loamlog");
  });

  test("falls back to toolUseResult stdout when tool_result content is empty", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loamlog-claude-provider-"));
    const projectDir = path.join(tempDir, "-Users-demo-loamlog");
    await mkdir(projectDir, { recursive: true });

    const sessionId = "fallback-session";
    const targetFile = path.join(projectDir, `${sessionId}.jsonl`);
    const fixture = [
      JSON.stringify({
        type: "assistant",
        uuid: "assistant-1",
        timestamp: "2026-03-10T00:00:01.000Z",
        cwd: "/Users/demo/loamlog",
        sessionId,
        gitBranch: "feature/m4",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_stdout", name: "Bash", input: { command: "pwd" } }],
        },
      }),
      JSON.stringify({
        type: "user",
        uuid: "tool-result-1",
        timestamp: "2026-03-10T00:00:02.000Z",
        cwd: "/Users/demo/loamlog",
        sessionId,
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_stdout", content: "", is_error: false }],
        },
        toolUseResult: { stdout: "/Users/demo/loamlog", stderr: "", interrupted: false },
      }),
    ].join("\n");
    await writeFile(targetFile, fixture, "utf8");

    const provider = createClaudeCodeSessionProvider({ projectsDir: tempDir });
    const pulled = await provider.pullSession(sessionId);

    assert.equal(pulled.tools?.[0]?.output, "/Users/demo/loamlog");
  });

  test("ignores an incomplete final JSONL line", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loamlog-claude-provider-"));
    const projectDir = path.join(tempDir, "-Users-demo-loamlog");
    await mkdir(projectDir, { recursive: true });

    const sessionId = "partial-session";
    const targetFile = path.join(projectDir, `${sessionId}.jsonl`);
    const fixture = [
      JSON.stringify({
        type: "user",
        uuid: "user-1",
        timestamp: "2026-03-10T00:00:01.000Z",
        cwd: "/Users/demo/loamlog",
        sessionId,
        message: { role: "user", content: "hello" },
      }),
      '{"type":"assistant","uuid":"broken',
    ].join("\n");
    await writeFile(targetFile, fixture, "utf8");

    const provider = createClaudeCodeSessionProvider({ projectsDir: tempDir });
    const pulled = await provider.pullSession(sessionId);

    assert.equal(pulled.messages.length, 1);
    assert.equal(pulled.messages[0]?.content, "hello");
  });
});

describe("startClaudeCodeWatcher", () => {
  test("emits session ready after file becomes idle", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loamlog-claude-watcher-"));
    const projectDir = path.join(tempDir, "-Users-demo-loamlog");
    await mkdir(projectDir, { recursive: true });

    const fixture = await readFile(fixturePath, "utf8");
    const targetFile = path.join(projectDir, "watch-session.jsonl");
    const events: Array<{ sessionId: string; filePath: string }> = [];

    const watcher = startClaudeCodeWatcher({
      projectsDir: tempDir,
      idleMs: 5_000,
      pollIntervalMs: 100,
      onReady(event) {
        events.push({ sessionId: event.sessionId, filePath: event.filePath });
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    await writeFile(targetFile, fixture, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 5_400));
    watcher.close();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.sessionId, "watch-session");
    assert.equal(events[0]?.filePath, targetFile);
  });

  test("schedules recent sessions on startup", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loamlog-claude-watcher-"));
    const projectsDir = tempDir;
    const projectPath = path.join(projectsDir, "-Users-demo-loamlog");
    const targetFile = path.join(projectPath, "startup-session.jsonl");
    const events: Array<{ sessionId: string; filePath: string }> = [];

    const readDir = async (dirPath: string) => {
      if (dirPath === projectsDir) {
        return [{ name: "-Users-demo-loamlog", isDirectory: () => true, isFile: () => false }];
      }

      if (dirPath === projectPath) {
        return [{ name: "startup-session.jsonl", isDirectory: () => false, isFile: () => true }];
      }

      return [];
    };

    const statFile = async () => ({ mtimeMs: Date.now() - 5_000 });

    const watcher = startClaudeCodeWatcher({
      projectsDir,
      idleMs: 300,
      pollIntervalMs: 100,
      readDir,
      statFile,
      onReady(event) {
        events.push({ sessionId: event.sessionId, filePath: event.filePath });
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 900));
    watcher.close();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.sessionId, "startup-session");
    assert.equal(events[0]?.filePath, targetFile);
  });

});
