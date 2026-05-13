import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./decision-rationale.js";

describe("decision-rationale distiller", () => {
	test("returns decision rationale assets with valid evidence", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				decision: "Use representative asset distillers instead of document-shaped drafts",
				context: "The product goal is to capture overlooked AI collaboration value.",
				rationale: "Issue and PRD drafts are useful delivery forms but too narrow as product validation categories.",
				confidence: 0.88,
				evidence_refs: [{ message_id: "msg_1", excerpt: "类型还是太局限了" }],
			},
		]));

		assert.equal(factory().id, "@loamlog/distiller-decision-rationale");
		assert.equal(outputs.length, 1);
		assert.equal(outputs[0].type, "decision-rationale");
		assert.equal(outputs[0].payload.rationale, "Issue and PRD drafts are useful delivery forms but too narrow as product validation categories.");
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
			session_id: "ses_decision_1",
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
				content: "你说的类型还是太局限了。",
			},
		],
		redacted: { patterns_applied: [], redacted_count: 0 },
	};
}

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
	yield* [];
}
