import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  });
});
