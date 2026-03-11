import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import sink from "./index.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (!tempDir) {
    return;
  }

  const target = tempDir;
  tempDir = undefined;
  await rm(target, { recursive: true, force: true });
});

describe("sink-file", () => {
  test("writes results into distill pending directory", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-sink-file-"));

    const report = await sink.deliver({
      results: [
        {
          id: "res_1",
          fingerprint: "fp_1",
          distiller_id: "@test/distiller",
          distiller_version: "0.1.0",
          type: "pitfall-card",
          title: "title",
          summary: "summary",
          confidence: 0.8,
          tags: ["pitfall"],
          payload: { ok: true },
          evidence: [
            {
              session_id: "ses_1",
              message_id: "msg_1",
              excerpt: "x",
              trace_command: "loam trace --session ses_1 --message msg_1",
            },
          ],
        },
      ],
      config: {
        dump_dir: tempDir,
        repo: "demo/repo",
      },
    });

    assert.equal(report.delivered, 1);
    assert.equal(report.failed, 0);

    const outputPath = path.join(tempDir, "distill", "demo_repo", "pending", "res_1.json");
    const text = await readFile(outputPath, "utf8");
    assert.equal(text.includes("\"distiller_id\": \"@test/distiller\""), true);

    const markdownPath = path.join(tempDir, "distill", "demo_repo", "pending", "res_1.md");
    await assert.rejects(access(markdownPath));
  });

  test("writes markdown sibling when render.markdown exists", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-sink-file-"));

    const report = await sink.deliver({
      results: [
        {
          id: "res_2",
          fingerprint: "fp_2",
          distiller_id: "@test/distiller",
          distiller_version: "0.1.0",
          type: "issue-draft",
          title: "title",
          summary: "summary",
          confidence: 0.9,
          tags: ["issue-draft"],
          payload: { ok: true },
          evidence: [
            {
              session_id: "ses_2",
              message_id: "msg_2",
              excerpt: "y",
              trace_command: "loam trace --session ses_2 --message msg_2",
            },
          ],
          render: {
            markdown: "## Background\nHello markdown",
          },
        },
      ],
      config: {
        dump_dir: tempDir,
        repo: "demo/repo",
      },
    });

    assert.equal(report.delivered, 1);
    assert.equal(report.failed, 0);

    const jsonPath = path.join(tempDir, "distill", "demo_repo", "pending", "res_2.json");
    const markdownPath = path.join(tempDir, "distill", "demo_repo", "pending", "res_2.md");

    const jsonText = await readFile(jsonPath, "utf8");
    const markdownText = await readFile(markdownPath, "utf8");

    assert.equal(jsonText.includes("\"type\": \"issue-draft\""), true);
    assert.equal(markdownText, "## Background\nHello markdown\n");
  });
});
