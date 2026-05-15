import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LLMProvider, LLMRouter, NormalizedSession } from "@loamlog/core";
import {
	SIGNAL_CLASSIFIER_OUTPUT_SCHEMA,
	buildSignalClassifierPrompt,
	classifySignals,
	normalizeSignalClassifierOutput,
} from "./signal-classifier.js";

function makeNormalizedSession(): NormalizedSession {
	return {
		header: {
			session_id: "ses_signal_1",
			repo_path: "/repo/loamlog",
			provider: "claude-code",
			captured_at: "2026-05-15T00:00:00.000Z",
		},
		messages: [
			{
				id: "msg_user",
				role: "user",
				timestamp: "2026-05-15T00:00:00.000Z",
				text: "Add a follow-up command to review stored signals.",
			},
			{
				id: "msg_assistant",
				role: "assistant",
				timestamp: "2026-05-15T00:00:01.000Z",
				text: "I will inspect files and edit the implementation.",
			},
		],
		stats: {
			total_messages: 2,
			tool_calls: 0,
			raw_chars: 120,
			normalized_chars: 120,
		},
	};
}

describe("signal classifier schema", () => {
	test("declares a strict object schema with platform enums", () => {
		assert.equal(SIGNAL_CLASSIFIER_OUTPUT_SCHEMA.type, "object");
		const signals = SIGNAL_CLASSIFIER_OUTPUT_SCHEMA.properties?.signals;
		assert.equal(typeof signals, "object");
		assert.ok(JSON.stringify(SIGNAL_CLASSIFIER_OUTPUT_SCHEMA).includes("task_delta"));
		assert.ok(JSON.stringify(SIGNAL_CLASSIFIER_OUTPUT_SCHEMA).includes("process_log"));
	});

	test("builds a prompt from normalized session messages", () => {
		const prompt = buildSignalClassifierPrompt(makeNormalizedSession());

		assert.ok(prompt.includes("session_id: ses_signal_1"));
		assert.ok(prompt.includes("[msg_user] (user) Add a follow-up command"));
		assert.ok(prompt.includes("allowed_kinds:"));
		assert.ok(prompt.includes("allowed_tags:"));
	});
});

describe("signal classifier normalization", () => {
	test("normalizes valid classifier output into Signal nodes", () => {
		const output = JSON.stringify({
			signals: [
				{
					scope: "message",
					kind: "task_delta",
					tags: ["created", "future_action"],
					raw_tags: ["follow_up"],
					actor: "user",
					temporal_state: "future",
					confidence: 0.87,
					evidence_refs: [
						{
							message_id: "msg_user",
							excerpt: "Add a follow-up command",
							position: { start: 0, end: 23 },
						},
					],
					promotion_hints: [
						{
							target_distiller: "@loamlog/distiller-follow-up-work-item",
							eligibility: "eligible",
							reason: "future task delta from user",
						},
					],
				},
			],
		});

		const result = normalizeSignalClassifierOutput(
			output,
			makeNormalizedSession(),
			{
				now: "2026-05-15T01:00:00.000Z",
				classifier: { model: "test-model" },
			},
		);

		assert.equal(result.rejected.length, 0);
		assert.equal(result.signals.length, 1);
		const signal = result.signals[0];
		assert.equal(signal.id.startsWith("sig-"), true);
		assert.equal(signal.kind, "task_delta");
		assert.deepEqual(signal.tags, ["created"]);
		assert.deepEqual(signal.raw_tags, ["future_action", "follow_up"]);
		assert.equal(signal.review_status, "accepted");
		assert.equal(signal.spans[0].session_id, "ses_signal_1");
		assert.equal(signal.spans[0].message_id, "msg_user");
		assert.equal(signal.classifier.model, "test-model");
		assert.equal(signal.raw_model_output !== undefined, true);
	});

	test("rejects classifier items without valid evidence", () => {
		const output = JSON.stringify({
			signals: [
				{
					scope: "message",
					kind: "task_delta",
					tags: ["created"],
					actor: "user",
					temporal_state: "future",
					confidence: 0.9,
					evidence_refs: [{ message_id: "missing", excerpt: "not found" }],
					promotion_hints: [],
				},
			],
		});

		const result = normalizeSignalClassifierOutput(output, makeNormalizedSession());

		assert.equal(result.signals.length, 0);
		assert.equal(result.rejected.length, 1);
		assert.equal(result.rejected[0].reason, "no_valid_evidence");
	});

	test("classifies through the LLM router and normalizes the response", async () => {
		let routed = false;
		let requestedFormat: string | undefined;
		const provider: LLMProvider = {
			id: "mock",
			async complete(input) {
				requestedFormat = input.response_format;
				return {
					content: JSON.stringify({
						signals: [
							{
								scope: "message",
								kind: "noise",
								tags: ["process_log"],
								actor: "assistant",
								temporal_state: "in_progress",
								confidence: 0.91,
								evidence_refs: [
									{
										message_id: "msg_assistant",
										excerpt: "inspect files and edit",
									},
								],
								promotion_hints: [],
							},
						],
					}),
					tokens: { input: 1, output: 1 },
				};
			},
		};
		const llm: LLMRouter = {
			route(request) {
				routed = request.task === "classify" && request.budget === "cheap";
				return { provider, model: "mock-model" };
			},
			getDefaultContextWindow() {
				return undefined;
			},
		};

		const result = await classifySignals(makeNormalizedSession(), llm);

		assert.equal(routed, true);
		assert.equal(requestedFormat, "json");
		assert.equal(result.signals.length, 1);
		assert.equal(result.signals[0].kind, "noise");
		assert.equal(result.signals[0].review_status, "ignored");
		assert.equal(result.signals[0].classifier.model, "mock-model");
	});
});
