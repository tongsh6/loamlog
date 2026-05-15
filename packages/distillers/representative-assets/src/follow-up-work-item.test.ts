import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./follow-up-work-item.js";

describe("follow-up-work-item distiller", () => {
	test("returns follow-up work item assets with valid evidence", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				action: "Implement the representative asset distiller package",
				reason: "The design has been approved and needs a runnable vertical slice.",
				priority_hint: "p0",
				acceptance: ["five distillers run through CLI built-in resolution"],
				confidence: 0.83,
				evidence_refs: [{ message_id: "msg_1", excerpt: "继续推进" }],
			},
		]));

		assert.equal(factory().id, "@loamlog/distiller-follow-up-work-item");
		assert.equal(outputs.length, 1);
		assert.equal(outputs[0].type, "follow-up-work-item");
		assert.equal(outputs[0].payload.priority_hint, "p0");
	});

	test("drops follow-up items with invalid priority hint", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				action: "Unsupported priority",
				reason: "Priority must be bounded.",
				priority_hint: "urgent",
				evidence_refs: [{ message_id: "msg_1", excerpt: "继续推进" }],
			},
		]));

		assert.equal(outputs.length, 0);
	});

	test("drops follow-up items without acceptance criteria", async () => {
		const outputs = await factory().run(makeRunInput([
			{
				action: "Implement a broad roadmap item",
				reason: "The session mentioned it might be useful later.",
				confidence: 0.8,
				evidence_refs: [{ message_id: "msg_1", excerpt: "继续推进" }],
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
			session_id: "ses_follow_1",
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
				content: "继续推进。",
			},
		],
		redacted: { patterns_applied: [], redacted_count: 0 },
	};
}

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
	yield* [];
}
