import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./index.js";

describe("knowledge-card distiller", () => {
	test("returns structured knowledge cards from mocked llm response", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_1",
							captured_at: "2026-05-01T00:00:00.000Z",
							capture_trigger: "session.idle",
							loam_version: "0.1.0",
							provider: "opencode",
						},
						context: {
							cwd: "/tmp",
							worktree: "/tmp",
						},
						time_range: {
							start: "2026-05-01T00:00:00.000Z",
							end: "2026-05-01T00:00:01.000Z",
						},
						session: {},
						messages: [
							{
								id: "msg_1",
								role: "user",
								timestamp: "2026-05-01T00:00:00.000Z",
								content: "How do I configure Biome for a monorepo?",
							},
							{
								id: "msg_2",
								role: "assistant",
								timestamp: "2026-05-01T00:00:01.000Z",
								content: "Use biome.json at root and extend per package. Set vcs.enabled=true for git-aware linting.",
							},
						],
						redacted: {
							patterns_applied: [],
							redacted_count: 0,
						},
					};
				},
				query() {
					return emptyArtifacts();
				},
			},
			llm: {
				route() {
					return {
						model: "fake-model",
						provider: {
							id: "mock",
							async complete() {
								return {
									content: JSON.stringify([
										{
											title: "Biome Monorepo Configuration",
											category: "configuration",
											summary: "Use root biome.json with vcs integration for git-aware linting across packages.",
											detail: "Place a single biome.json at the monorepo root. Enable vcs.enabled and useIgnoreFile so Biome respects .gitignore. Each package can extend with its own biome.json for overrides.",
											tags: ["biome", "monorepo", "linting"],
											confidence: 0.85,
											evidence_refs: [
												{ message_id: "msg_2", excerpt: "Use biome.json at root and extend per package" },
											],
										},
									]),
									tokens: { input: 20, output: 30 },
								};
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
		});

		assert.equal(outputs.length, 1);
		assert.equal(outputs[0].type, "knowledge-card");
		assert.equal(outputs[0].payload.category, "configuration");
		assert.deepEqual(outputs[0].payload.tags, ["biome", "monorepo", "linting"]);
		assert.equal(outputs[0].evidence[0].message_id, "msg_2");
	});

	test("deduplicates cards with similar titles", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_2",
							captured_at: "2026-05-01T00:00:00.000Z",
							capture_trigger: "session.idle",
							loam_version: "0.1.0",
							provider: "opencode",
						},
						context: { cwd: "/tmp", worktree: "/tmp" },
						time_range: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-01T00:00:01.000Z" },
						session: {},
						messages: [
							{
								id: "msg_1",
								role: "user",
								timestamp: "2026-05-01T00:00:00.000Z",
								content: "test",
							},
						],
						redacted: { patterns_applied: [], redacted_count: 0 },
					};
				},
				query() { return emptyArtifacts(); },
			},
			llm: {
				route() {
					return {
						model: "fake-model",
						provider: {
							id: "mock",
							async complete() {
								return {
									content: JSON.stringify([
										{
											title: "Using Biome for Linting",
											category: "pattern",
											summary: "First occurrence.",
											detail: "First occurrence detail with enough characters to pass the minimum length requirement for detail field validation.",
											tags: ["test"],
											confidence: 0.8,
											evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
										},
										{
											title: "Using Biome for Code Linting",
											category: "insight",
											summary: "Duplicate with similar title.",
											detail: "Duplicate detail with enough characters to pass the minimum length requirement for detail field validation here.",
											tags: ["dup"],
											confidence: 0.6,
											evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
										},
									]),
									tokens: { input: 10, output: 10 },
								};
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
		});

		// Similar titles (>0.7 Jaccard) should be deduped
		assert.equal(outputs.length, 1);
		assert.equal(outputs[0].title, "Using Biome for Linting");
	});

	test("normalizes unknown categories to insight", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_3",
							captured_at: "2026-05-01T00:00:00.000Z",
							capture_trigger: "session.idle",
							loam_version: "0.1.0",
							provider: "opencode",
						},
						context: { cwd: "/tmp", worktree: "/tmp" },
						time_range: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-01T00:00:01.000Z" },
						session: {},
						messages: [
							{
								id: "msg_1",
								role: "user",
								timestamp: "2026-05-01T00:00:00.000Z",
								content: "test",
							},
						],
						redacted: { patterns_applied: [], redacted_count: 0 },
					};
				},
				query() { return emptyArtifacts(); },
			},
			llm: {
				route() {
					return {
						model: "fake-model",
						provider: {
							id: "mock",
							async complete() {
								return {
									content: JSON.stringify([
										{
											title: "Something unusual",
											category: "random-blah",
											summary: "Test category normalization.",
											detail: "Should become insight. This detail has enough characters to pass the minimum length requirement for the detail field validation.",
											tags: ["misc"],
											confidence: 0.7,
											evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
										},
									]),
									tokens: { input: 10, output: 10 },
								};
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
		});

		assert.equal(outputs.length, 1);
		assert.equal(outputs[0].payload.category, "insight");
	});

	test("filters out cards with detail too short", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_4",
							captured_at: "2026-05-01T00:00:00.000Z",
							capture_trigger: "session.idle",
							loam_version: "0.1.0",
							provider: "opencode",
						},
						context: { cwd: "/tmp", worktree: "/tmp" },
						time_range: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-01T00:00:01.000Z" },
						session: {},
						messages: [
							{
								id: "msg_1",
								role: "user",
								timestamp: "2026-05-01T00:00:00.000Z",
								content: "test",
							},
						],
						redacted: { patterns_applied: [], redacted_count: 0 },
					};
				},
				query() { return emptyArtifacts(); },
			},
			llm: {
				route() {
					return {
						model: "fake-model",
						provider: {
							id: "mock",
							async complete() {
								return {
									content: JSON.stringify([
										{
											title: "Too Short Detail",
											category: "insight",
											summary: "This card has insufficient detail.",
											detail: "Too short.",
											tags: ["test"],
											confidence: 0.8,
											evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
										},
									]),
									tokens: { input: 10, output: 10 },
								};
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
		});

		assert.equal(outputs.length, 0);
	});

	test("caps cards per session and sorts by confidence", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_5",
							captured_at: "2026-05-01T00:00:00.000Z",
							capture_trigger: "session.idle",
							loam_version: "0.1.0",
							provider: "opencode",
						},
						context: { cwd: "/tmp", worktree: "/tmp" },
						time_range: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-01T00:00:01.000Z" },
						session: {},
						messages: [
							{
								id: "msg_1",
								role: "user",
								timestamp: "2026-05-01T00:00:00.000Z",
								content: "test",
							},
						],
						redacted: { patterns_applied: [], redacted_count: 0 },
					};
				},
				query() { return emptyArtifacts(); },
			},
			llm: {
				route() {
					return {
						model: "fake-model",
						provider: {
							id: "mock",
							async complete() {
								const cards = [];
								for (let i = 0; i < 7; i++) {
									cards.push({
										title: `Knowledge Card ${i}`,
										category: "insight",
										summary: `Summary for card ${i}.`,
										detail: `This is a detailed explanation for knowledge card number ${i} with sufficient length to pass validation requirements.`,
										tags: ["test"],
										confidence: 0.5 + i * 0.05,
										evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
									});
								}
								return {
									content: JSON.stringify(cards),
									tokens: { input: 10, output: 10 },
								};
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
		});

		// Should cap at MAX_CARDS_PER_SESSION (5) and be sorted by confidence descending
		assert.equal(outputs.length, 5);
		assert.equal(outputs[0].title, "Knowledge Card 6"); // highest confidence (0.5 + 6*0.05 = 0.80)
		assert.equal(outputs[4].title, "Knowledge Card 2"); // 5th highest (0.5 + 2*0.05 = 0.60)
	});
});

async function* emptyArtifacts(): AsyncGenerator<SessionArtifact> {
	yield* [];
}
