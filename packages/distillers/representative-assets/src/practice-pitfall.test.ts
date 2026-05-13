import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./practice-pitfall.js";

describe("practice-pitfall distiller", () => {
	test("returns practice pitfall assets with valid evidence", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				situation: "Reviewing AI-generated documentation",
				pitfall_or_practice: "Keep product design documents Chinese-first in this project.",
				fix_or_pattern: "Use Chinese body text and keep code identifiers in English.",
				reusable_scope: "Loamlog project docs and planning sessions",
				confidence: 0.9,
				evidence_refs: [{ message_id: "msg_1", excerpt: "文档写着写着就变成英文了" }],
			},
		]));

		assert.equal(factory().id, "@loamlog/distiller-practice-pitfall");
		assert.equal(outputs.length, 1);
		assert.equal(outputs[0].type, "practice-pitfall");
		assert.equal(outputs[0].payload.fix_or_pattern, "Use Chinese body text and keep code identifiers in English.");
		assert.equal(outputs[0].evidence[0].message_id, "msg_1");
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
			session_id: "ses_practice_1",
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
