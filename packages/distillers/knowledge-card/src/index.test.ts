import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import factory from "./index.js";

function reusableContext() {
	return {
		scenario: "A developer is maintaining a real project where this pattern appears during implementation or debugging.",
		problem: "The session contains a repeatable failure mode or decision that can recur in another project.",
		cause: "The issue comes from a specific configuration, workflow, or API behavior rather than a one-off preference.",
		solution: "Apply the concrete practice described by the card and verify it against the cited evidence.",
		boundary: "Use this only when the same toolchain or workflow constraint is present; otherwise re-check the original docs.",
	};
}

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
											...reusableContext(),
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
											...reusableContext(),
											detail: "First occurrence detail with enough characters to pass the minimum length requirement for detail field validation.",
											tags: ["test"],
											confidence: 0.8,
											evidence_refs: [{ message_id: "msg_1", excerpt: "test" }],
										},
										{
											title: "Using Biome for Code Linting",
											category: "insight",
											summary: "Duplicate with similar title.",
											...reusableContext(),
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

	test("deduplicates Chinese cards with similar titles", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_zh_dup",
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
								content: "集中管理服务端口配置。",
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
											title: "集中管理服务端口配置",
											category: "configuration",
											summary: "把服务端口集中到统一配置。",
											...reusableContext(),
											detail: "Use one configuration source for service ports so multiple launch paths do not drift across backend, frontend, and desktop wrappers.",
											tags: ["configuration", "ports"],
											confidence: 0.8,
											evidence_refs: [{ message_id: "msg_1", excerpt: "集中管理服务端口配置。" }],
										},
										{
											title: "集中管理端口配置",
											category: "configuration",
											summary: "把端口集中到统一配置。",
											...reusableContext(),
											detail: "Use one configuration source for ports so multiple launch paths do not drift across backend, frontend, and desktop wrappers.",
											tags: ["configuration", "ports"],
											confidence: 0.7,
											evidence_refs: [{ message_id: "msg_1", excerpt: "集中管理服务端口配置。" }],
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
		assert.equal(outputs[0].title, "集中管理服务端口配置");
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
											...reusableContext(),
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
											...reusableContext(),
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

	test("filters out thin cards without reusable context sections", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_thin",
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
								content: "Centralize service ports in .env.",
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
											title: "Centralize service ports using .env",
											category: "configuration",
											summary: "Put all service ports in a single .env file.",
											detail: "Define backend and frontend ports in .env and have every config file read from it instead of hard-coding numbers across files.",
											tags: ["configuration", "ports"],
											confidence: 0.9,
											evidence_refs: [{ message_id: "msg_1", excerpt: "Centralize service ports in .env." }],
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

	test("filters out cards without valid evidence refs", async () => {
		const plugin = factory();

		const outputs = await plugin.run({
			artifactStore: {
				async *getUnprocessed() {
					yield {
						schema_version: "1.0",
						meta: {
							session_id: "ses_kc_missing_evidence",
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
								content: "Centralize service ports in .env.",
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
											title: "Centralize service ports using .env",
											category: "configuration",
											summary: "Put all service ports in a single .env file.",
											...reusableContext(),
											detail: "Define backend and frontend ports in .env and have every config file read from it instead of hard-coding numbers across files.",
											tags: ["configuration", "ports"],
											confidence: 0.9,
											evidence_refs: [{ message_id: "msg_missing", excerpt: "Centralize service ports in .env." }],
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
										...reusableContext(),
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
