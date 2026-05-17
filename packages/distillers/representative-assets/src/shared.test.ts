import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import {
	buildSessionPrompt,
	collectEvidence,
	extractJsonArray,
	normalizeConfidence,
	shouldKeepRepresentativeAsset,
} from "./shared.js";

describe("representative asset shared helpers", () => {
	test("extractJsonArray reads fenced JSON arrays", () => {
		const parsed = extractJsonArray("```json\n[{\"title\":\"A\"}]\n```");
		assert.deepEqual(parsed, [{ title: "A" }]);
	});

	test("normalizeConfidence clamps invalid values", () => {
		assert.equal(normalizeConfidence(undefined), 0.7);
		assert.equal(normalizeConfidence(3), 1);
		assert.equal(normalizeConfidence(-1), 0);
	});

	test("collectEvidence drops invalid message refs without fallback", () => {
		const artifact = makeArtifact();
		const evidence = collectEvidence(artifact, [{ message_id: "missing", excerpt: "not here" }]);
		assert.equal(evidence.length, 0);
	});

	test("buildSessionPrompt includes message ids and roles", () => {
		const prompt = buildSessionPrompt(makeArtifact());
		assert.match(prompt, /session_id: ses_rep_1/);
		assert.match(prompt, /\[msg_1\] \(user\)/);
	});

	test("shared post-filter rejects assistant process log evidence", () => {
		const artifact = makeArtifact({
			messages: [
				{
					id: "msg_1",
					role: "assistant",
					timestamp: "2026-05-13T00:00:00.000Z",
					content: "Now I will inspect files and update the implementation.",
				},
			],
		});

		assert.equal(
			shouldKeepRepresentativeAsset({
				type: "follow-up-work-item",
				title: "inspect_files",
				summary: "AI process step",
				payload: {
					action: "Inspect files",
					reason: "The assistant said it would inspect files.",
					acceptance: ["files inspected"],
				},
				evidence: [
					{
						session_id: "ses_rep_1",
						message_id: "msg_1",
						excerpt: "inspect files",
					},
				],
				artifact,
			}),
			false,
		);
	});

	test("shared post-filter requires concrete follow-up acceptance", () => {
		assert.equal(
			shouldKeepRepresentativeAsset({
				type: "follow-up-work-item",
				title: "Implement signal routing",
				summary: "Wire selected signals into representative asset distillers.",
				payload: {
					action: "Implement signal routing",
					reason: "Representative distillers need cleaner inputs.",
				},
				evidence: [
					{
						session_id: "ses_rep_1",
						message_id: "msg_1",
						excerpt: "We should capture ideas",
					},
				],
				artifact: makeArtifact(),
			}),
			false,
		);
	});

	test("shared post-filter rejects one-off command skill candidates", () => {
		assert.equal(
			shouldKeepRepresentativeAsset({
				type: "skill-candidate",
				title: "git_push_branch",
				summary: "Use git push to publish a branch.",
				payload: {
					skill_name: "git_push_branch",
					trigger: "When a branch needs pushing",
					capability: "Run git push.",
					workflow_steps: ["Run git status", "Run git push"],
				},
				evidence: [
					{
						session_id: "ses_rep_1",
						message_id: "msg_1",
						excerpt: "We should capture ideas",
					},
				],
				artifact: makeArtifact(),
			}),
			false,
		);
	});

	test("shared post-filter rejects api-key troubleshooting as idea seeds", () => {
		assert.equal(
			shouldKeepRepresentativeAsset({
				type: "idea-seed",
				title: "DeepSeek provider environment variable",
				summary: "DeepSeek API key is empty, so use this as a future idea.",
				payload: {
					idea: "DeepSeek provider environment variable",
					context: "The API key was not set during a distill run.",
				},
				evidence: [
					{
						session_id: "ses_rep_1",
						message_id: "msg_1",
						excerpt: "DeepSeek API key was not set",
					},
				],
				artifact: makeArtifact({
					messages: [
						{
							id: "msg_1",
							role: "user",
							timestamp: "2026-05-13T00:00:00.000Z",
							content: "DeepSeek API key was not set during the distill run.",
						},
					],
				}),
			}),
			false,
		);
	});

	test("shared post-filter rejects project-internal dogfooding skill candidates", () => {
		assert.equal(
			shouldKeepRepresentativeAsset({
				type: "skill-candidate",
				title: "loamlog_dogfooding_validation_workflow",
				summary: "Turn the Loamlog internal dogfooding validation workflow into a skill.",
				payload: {
					skill_name: "loamlog_dogfooding_validation_workflow",
					trigger: "When Loamlog needs internal product validation",
					capability: "Run the project-internal dogfooding validation flow.",
					workflow_steps: ["Run representative assets", "Review the pending outputs"],
				},
				evidence: [
					{
						session_id: "ses_rep_1",
						message_id: "msg_1",
						excerpt: "Loamlog internal dogfooding validation workflow",
					},
				],
				artifact: makeArtifact({
					messages: [
						{
							id: "msg_1",
							role: "user",
							timestamp: "2026-05-13T00:00:00.000Z",
							content: "Loamlog internal dogfooding validation workflow is specific to this project.",
						},
					],
				}),
			}),
			false,
		);
	});

	test("shared post-filter rejects Chinese CI workflow skill candidates", () => {
		assert.equal(
			shouldKeepRepresentativeAsset({
				type: "skill-candidate",
				title: "CI 工作流集成",
				summary: "把 GitHub Actions 流水线集成做成 skill。",
				payload: {
					skill_name: "CI 工作流集成",
					trigger: "仓库需要 CI 时",
					capability: "添加 GitHub Actions 流水线。",
					workflow_steps: ["创建 workflow 文件", "运行测试"],
				},
				evidence: [
					{
						session_id: "ses_rep_1",
						message_id: "msg_1",
						excerpt: "CI 工作流集成",
					},
				],
				artifact: makeArtifact(),
			}),
			false,
		);
	});
});

function makeArtifact(overrides: Partial<SessionArtifact> = {}): SessionArtifact {
	return {
		schema_version: "1.0",
		meta: {
			session_id: "ses_rep_1",
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
				content: "We should capture ideas while working with AI tools.",
			},
		],
		redacted: { patterns_applied: [], redacted_count: 0 },
		...overrides,
	};
}
