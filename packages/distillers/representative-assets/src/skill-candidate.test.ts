import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./skill-candidate.js";

describe("skill-candidate distiller", () => {
	test("returns skill candidate assets with valid evidence", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				skill_name: "Chinese-first project docs",
				trigger: "When writing Loamlog design or planning docs",
				capability: "Keep prose Chinese-first while preserving code identifiers in English.",
				workflow_steps: ["Write Chinese body text", "Keep commands and identifiers in English", "Check for English drift before commit"],
				promotion_target: "codex_skill",
				confidence: 0.91,
				evidence_refs: [{ message_id: "msg_1", excerpt: "文档写着写着就变成英文了" }],
			},
		]));

		assert.equal(factory().id, "@loamlog/distiller-skill-candidate");
		assert.equal(outputs.length, 1);
		assert.equal(outputs[0].type, "skill-candidate");
		assert.deepEqual(outputs[0].payload.workflow_steps, [
			"Write Chinese body text",
			"Keep commands and identifiers in English",
			"Check for English drift before commit",
		]);
	});

	test("drops skill candidates with invalid promotion target", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				skill_name: "Bad target",
				trigger: "When target is invalid",
				capability: "Reject invalid enum values.",
				workflow_steps: ["Check target"],
				promotion_target: "marketplace",
				evidence_refs: [{ message_id: "msg_1", excerpt: "文档写着写着就变成英文了" }],
			},
		]));

		assert.equal(outputs.length, 0);
	});

	test("drops one-off command skill candidates", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				skill_name: "git_push_branch",
				trigger: "When a branch needs pushing",
				capability: "Run a normal git push command.",
				workflow_steps: ["Run git status", "Run git push"],
				promotion_target: "runbook",
				evidence_refs: [{ message_id: "msg_1", excerpt: "文档写着写着就变成英文了" }],
			},
		]));

		assert.equal(outputs.length, 0);
	});
});

function makeRunInput(items: unknown[]) {
	return {
		artifactStore: {
			async *getUnprocessed() { yield makeArtifact(); },
			query() { return emptyArtifacts(); },
		},
		llm: {
			route() {
				return {
					model: "fake-model",
					provider: {
						id: "mock",
						async complete() {
							return { content: JSON.stringify(items), tokens: { input: 10, output: 10 } };
						},
					},
				};
			},
		},
		state: {
			async get() { return undefined; },
			async set() { return; },
			async update() { return; },
			async markProcessed() { return; },
		},
	};
}

function makeArtifact(): SessionArtifact {
	return {
		schema_version: "1.0",
		meta: {
			session_id: "ses_skill_1",
			captured_at: "2026-05-13T00:00:00.000Z",
			capture_trigger: "session.idle",
			loam_version: "0.1.0",
			provider: "opencode",
		},
		context: { cwd: "/tmp", worktree: "/tmp" },
		time_range: {
			start: "2026-05-13T00:00:00.000Z",
			end: "2026-05-13T00:00:01.000Z",
		},
		session: {},
		messages: [
			{
				id: "msg_1",
				role: "user",
				timestamp: "2026-05-13T00:00:00.000Z",
				content: "文档写着写着就变成英文了。",
			},
		],
		redacted: { patterns_applied: [], redacted_count: 0 },
	};
}

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
	yield* [];
}
