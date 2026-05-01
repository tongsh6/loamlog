import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { afterEach, describe, test } from "node:test";
import { runReviewCommand } from "./review.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (!tempDir) return;
  const target = tempDir;
  tempDir = undefined;
  await rm(target, { recursive: true, force: true });
});

async function createPendingResult(
  dumpDir: string,
  repo: string,
  resultId: string,
  title: string,
) {
  const pendingDir = path.join(dumpDir, "distill", repo, "pending");
  await mkdir(pendingDir, { recursive: true });

  const result = {
    id: resultId,
    type: "issue-draft",
    title,
    summary: "Test summary",
    confidence: 0.85,
    tags: ["test"],
    distiller_id: "@loamlog/distiller-issue-draft",
    distiller_version: "0.1.0",
    fingerprint: `fp-${resultId}`,
    evidence: [{ session_id: "ses_1", message_id: "msg_1", excerpt: "test", trace_command: "trace" }],
    payload: {},
  };

  await writeFile(
    path.join(pendingDir, `${resultId}.json`),
    JSON.stringify(result, null, 2),
    "utf8",
  );

  // Also write a markdown sibling
  await writeFile(
    path.join(pendingDir, `${resultId}.md`),
    `# ${title}\n\nTest body`,
    "utf8",
  );
}

describe("loam review", () => {
  test("approve moves result from pending to approved", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-review-approve-"));

    await createPendingResult(tempDir, "test-repo", "result-001", "Fix login bug");

    await runReviewCommand(["--dump-dir", tempDir, "--approve", "result-001"]);

    // Verify moved to approved
    const approvedDir = path.join(tempDir, "distill", "test-repo", "approved");
    const files = await readdir(approvedDir);
    assert.ok(files.includes("result-001.json"));
    assert.ok(files.includes("result-001.md"));
  });

  test("reject moves result from pending to rejected", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-review-reject-"));

    await createPendingResult(tempDir, "test-repo", "result-002", "Minor typo");

    await runReviewCommand(["--dump-dir", tempDir, "--reject", "result-002"]);

    const rejectedDir = path.join(tempDir, "distill", "test-repo", "rejected");
    const files = await readdir(rejectedDir);
    assert.ok(files.includes("result-002.json"));
  });

  test("list shows pending items", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-review-list-"));

    await createPendingResult(tempDir, "repo-a", "result-a1", "Issue A1");
    await createPendingResult(tempDir, "repo-a", "result-a2", "Issue A2");
    await createPendingResult(tempDir, "repo-b", "result-b1", "Issue B1");

    // Capture stdout
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => logs.push(args.join(" "));

    try {
      await runReviewCommand(["--dump-dir", tempDir, "--list"]);
    } finally {
      console.log = origLog;
    }

    const output = logs.join("\n");
    assert.ok(output.includes("result-a1"));
    assert.ok(output.includes("result-a2"));
    assert.ok(output.includes("result-b1"));
    assert.ok(output.includes("repo-a"));
    assert.ok(output.includes("repo-b"));
  });

  test("list shows empty message when no pending results", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "loam-review-empty-"));

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => logs.push(args.join(" "));

    try {
      await runReviewCommand(["--dump-dir", tempDir, "--list"]);
    } finally {
      console.log = origLog;
    }

    const output = logs.join("\n");
    assert.ok(output.includes("No pending results"));
  });
});
