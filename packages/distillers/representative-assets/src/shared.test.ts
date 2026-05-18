import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { DistillResultDraft, SessionArtifact } from "@loamlog/core";
import {
  buildSessionPrompt,
  collectEvidence,
  dedupeRepresentativeAssetDrafts,
  extractJsonArray,
  normalizeConfidence,
  shouldKeepRepresentativeAsset,
} from "./shared.js";

describe("representative asset shared helpers", () => {
  test("extractJsonArray reads fenced JSON arrays", () => {
    const parsed = extractJsonArray('```json\n[{"title":"A"}]\n```');
    assert.deepEqual(parsed, [{ title: "A" }]);
  });

  test("normalizeConfidence clamps invalid values", () => {
    assert.equal(normalizeConfidence(undefined), 0.7);
    assert.equal(normalizeConfidence(3), 1);
    assert.equal(normalizeConfidence(-1), 0);
  });

  test("collectEvidence drops invalid message refs without fallback", () => {
    const artifact = makeArtifact();
    const evidence = collectEvidence(artifact, [
      { message_id: "missing", excerpt: "not here" },
    ]);
    assert.equal(evidence.length, 0);
  });

  test("collectEvidence drops excerpts not anchored in the source message", () => {
    const artifact = makeArtifact();
    const evidence = collectEvidence(artifact, [
      {
        message_id: "msg_1",
        excerpt: "invented cited evidence that is not in the message",
      },
    ]);
    assert.equal(evidence.length, 0);
  });

  test("buildSessionPrompt includes message ids and roles", () => {
    const prompt = buildSessionPrompt(makeArtifact());
    assert.match(prompt, /session_id: ses_rep_1/);
    assert.match(prompt, /\[msg_1\] \(user\)/);
  });

  test("dedupes same-topic representative asset candidates", () => {
    const drafts = dedupeRepresentativeAssetDrafts([
      makeDraft({
        title: "Route Signal Gate inputs into typed distillers",
        confidence: 0.72,
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "route signals into representative asset distillers",
          },
        ],
      }),
      makeDraft({
        title: "Signal Gate routing for typed distillers",
        confidence: 0.91,
        tags: ["idea-seed", "signal-gate"],
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_2",
            excerpt: "Signal Gate routing",
          },
        ],
      }),
    ]);

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].title, "Signal Gate routing for typed distillers");
    assert.equal(drafts[0].confidence, 0.91);
    assert.deepEqual(drafts[0].tags, ["idea-seed", "signal-gate"]);
    assert.deepEqual(
      drafts[0].evidence.map((evidence) => evidence.message_id),
      ["msg_1", "msg_2"],
    );
  });

  test("dedupes Chinese candidates with similar titles", () => {
    const drafts = dedupeRepresentativeAssetDrafts([
      makeDraft({
        title: "信号门路由代表性资产",
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "信号门路由代表性资产",
          },
        ],
      }),
      makeDraft({
        title: "信号门路由资产候选",
        confidence: 0.85,
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_2",
            excerpt: "信号门路由资产候选",
          },
        ],
      }),
    ]);

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].title, "信号门路由资产候选");
  });

  test("does not merge distinct representative asset topics", () => {
    const drafts = dedupeRepresentativeAssetDrafts([
      makeDraft({
        title: "Signal Gate routing for typed distillers",
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "Signal Gate routing",
          },
        ],
      }),
      makeDraft({
        title: "Manual review CLI for accepted signals",
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_2",
            excerpt: "Manual review CLI",
          },
        ],
      }),
    ]);

    assert.equal(drafts.length, 2);
  });

  test("does not merge distinct topics from the same long message", () => {
    const drafts = dedupeRepresentativeAssetDrafts([
      makeDraft({
        title: "Signal Gate routing for typed distillers",
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "Signal Gate routing",
          },
        ],
      }),
      makeDraft({
        title: "Manual review CLI for accepted signals",
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "Manual review CLI",
          },
        ],
      }),
    ]);

    assert.equal(drafts.length, 2);
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

  test("shared post-filter rejects follow-up items without open-work evidence", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "follow-up-work-item",
        title: "Refine provider prompt and error handling",
        summary:
          "The evidence describes a provider prompt risk, not a remaining task.",
        payload: {
          action: "Refine provider prompt and error handling",
          reason: "Provider prompt and error handling risks were discussed.",
          acceptance: ["Provider prompt behavior is reviewed"],
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "Provider prompt and error handling risk",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "Provider prompt and error handling risk is a practice/pitfall observation.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter rejects review-only evidence as follow-up work", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "follow-up-work-item",
        title: "Review representative asset quality",
        summary: "The evidence only reports a completed review finding.",
        payload: {
          action: "Review representative asset quality",
          reason: "The manual review showed low quality.",
          acceptance: ["Quality review is completed"],
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "manual review showed Product Quality No-Go",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "The manual review showed Product Quality No-Go for representative assets.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter keeps Chinese follow-up items with explicit open-work evidence", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "follow-up-work-item",
        title: "复评代表性资产小样本",
        summary: "后续需要复评代表性资产，并记录每类 >=3 比例。",
        payload: {
          action: "复评代表性资产小样本",
          reason: "当前代表性资产质量 No-Go，需要验证修复效果。",
          acceptance: ["记录每类资产 >=3 比例", "更新 dogfooding 报告"],
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt:
              "后续需要复评代表性资产小样本，并记录每类资产 >=3 比例，更新 dogfooding 报告。",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "后续需要复评代表性资产小样本，并记录每类资产 >=3 比例，更新 dogfooding 报告。",
            },
          ],
        }),
      }),
      true,
    );
  });

  test("shared post-filter rejects unsupported optional field expansion", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "decision-rationale",
        title: "Defer MCP API gateway implementation",
        summary:
          "Decision: defer MCP API gateway because cross-asset quality is the current constraint.",
        payload: {
          decision: "Defer MCP API gateway implementation",
          context: "MCP API gateway was considered against current priorities.",
          rationale:
            "Defer because cross-asset quality is the current constraint.",
          revisit_trigger: "Revisit when marketplace adoption drops.",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt:
              "Decide to defer MCP API gateway because cross-asset quality is the current constraint.",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "Decide to defer MCP API gateway because cross-asset quality is the current constraint.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter does not support high-risk fields from uncited message text", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "idea-seed",
        title: "Capture ideas from AI sessions",
        summary: "Capture ideas before they are forgotten.",
        payload: {
          idea: "Capture ideas from AI sessions",
          context: "AI sessions contain ideas that can be forgotten.",
          target_audience: "Enterprise admins",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "AI sessions contain ideas that can be forgotten.",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "AI sessions contain ideas that can be forgotten. A separate note mentions enterprise admins for another product track.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter keeps supported optional field details", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "idea-seed",
        title: "Extract idea seeds from recent sessions",
        summary:
          "The user wants to capture ideas before they are forgotten. Next probe: extract idea seeds from three recent sessions.",
        payload: {
          idea: "Extract idea seeds from recent sessions",
          context:
            "AI sessions contain ideas that are lost during current work.",
          next_probe: "Extract idea seeds from three recent sessions.",
          target_audience: "AI power users",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt:
              "AI power users need to capture ideas before they are forgotten. Next probe: extract idea seeds from three recent sessions.",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "AI power users need to capture ideas before they are forgotten. Next probe: extract idea seeds from three recent sessions.",
            },
          ],
        }),
      }),
      true,
    );
  });

  test("shared post-filter requires cited excerpt to state open follow-up work", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "follow-up-work-item",
        title: "Rerun representative asset review",
        summary:
          "The same message mentions a future rerun, but the cited excerpt does not.",
        payload: {
          action: "Rerun representative asset review",
          reason: "The review quality was low.",
          acceptance: ["Review rerun results are recorded"],
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "manual review showed low quality",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "The manual review showed low quality. Next step: rerun representative asset review.",
            },
          ],
        }),
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

  test("shared post-filter rejects routine repo implementation as idea seeds", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "idea-seed",
        title: "CI workflow integration",
        summary: "Add a GitHub Actions CI workflow as a future idea.",
        payload: {
          idea: "CI workflow integration",
          context:
            "The session mentioned adding CI workflow integration to this repo.",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "GitHub Actions CI workflow integration",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "GitHub Actions CI workflow integration is an implementation task.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter rejects dogfooding execution as idea seeds", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "idea-seed",
        title: "启动 dogfooding 闭环",
        summary: "把启动 dogfooding 闭环当成一个 idea。",
        payload: {
          idea: "启动 dogfooding 闭环",
          context: "The session described running a dogfooding batch.",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "启动 dogfooding 闭环",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content: "启动 dogfooding 闭环并运行这一批样本。",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter rejects old roadmap residue as idea seeds", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "idea-seed",
        title: "issue-candidate / prd-draft distiller",
        summary: "Revive the old issue-candidate and prd-draft roadmap item.",
        payload: {
          idea: "issue-candidate / prd-draft distiller",
          context: "The session mentioned an old roadmap item.",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "issue-candidate / prd-draft distiller",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "This is old roadmap residue: issue-candidate / prd-draft distiller.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter rejects stale phase roadmap as follow-up work", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "follow-up-work-item",
        title: "工具专属 AI 规则文件 Phase 4",
        summary: "Continue a historical Phase 4 plan.",
        payload: {
          action: "工具专属 AI 规则文件 Phase 4",
          reason: "Historical plan signal from the session.",
          acceptance: ["Phase 4 plan is restarted"],
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "工具专属 AI 规则文件 Phase 4",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content: "工具专属 AI 规则文件 Phase 4 是历史计划信号。",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter rejects troubleshooting fallback as decision rationale", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "decision-rationale",
        title: "Use OpenAI instead of DeepSeek",
        summary: "Fallback because the DeepSeek API key was empty.",
        payload: {
          decision: "Use OpenAI instead of DeepSeek",
          context: "The provider key was missing during a local run.",
          rationale: "Fallback because the DeepSeek API key was empty.",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "DeepSeek API key empty, fallback to OpenAI",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "DeepSeek API key empty, fallback to OpenAI for this run.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter rejects old roadmap decision without explicit decision language", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "decision-rationale",
        title: "MCP API gateway",
        summary: "The session mentioned MCP API gateway work.",
        payload: {
          decision: "MCP API gateway",
          context: "The session mentioned the old roadmap item.",
          rationale: "The text only says the item exists.",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt: "MCP API gateway",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content: "MCP API gateway is listed in the historical plan.",
            },
          ],
        }),
      }),
      false,
    );
  });

  test("shared post-filter keeps explicit deferral decisions about old roadmap topics", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "decision-rationale",
        title: "Defer MCP API gateway implementation",
        summary:
          "Decision: defer MCP API gateway because cross-asset quality is the current constraint.",
        payload: {
          decision: "Defer MCP API gateway implementation",
          context: "MCP API gateway was considered against current priorities.",
          rationale:
            "Defer because cross-asset quality is the current constraint.",
        },
        evidence: [
          {
            session_id: "ses_rep_1",
            message_id: "msg_1",
            excerpt:
              "Decide to defer MCP API gateway because cross-asset quality is the current constraint.",
          },
        ],
        artifact: makeArtifact({
          messages: [
            {
              id: "msg_1",
              role: "user",
              timestamp: "2026-05-13T00:00:00.000Z",
              content:
                "Decide to defer MCP API gateway because cross-asset quality is the current constraint.",
            },
          ],
        }),
      }),
      true,
    );
  });

  test("shared post-filter rejects project-internal dogfooding skill candidates", () => {
    assert.equal(
      shouldKeepRepresentativeAsset({
        type: "skill-candidate",
        title: "loamlog_dogfooding_validation_workflow",
        summary:
          "Turn the Loamlog internal dogfooding validation workflow into a skill.",
        payload: {
          skill_name: "loamlog_dogfooding_validation_workflow",
          trigger: "When Loamlog needs internal product validation",
          capability: "Run the project-internal dogfooding validation flow.",
          workflow_steps: [
            "Run representative assets",
            "Review the pending outputs",
          ],
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
              content:
                "Loamlog internal dogfooding validation workflow is specific to this project.",
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

function makeDraft(
  overrides: Partial<DistillResultDraft<Record<string, unknown>>> = {},
): DistillResultDraft<Record<string, unknown>> {
  return {
    type: "idea-seed",
    title: "Signal Gate routing",
    summary: "Route classified signals into typed distillers.",
    confidence: 0.7,
    tags: ["idea-seed"],
    payload: { idea: "Signal Gate routing" },
    evidence: [
      {
        session_id: "ses_rep_1",
        message_id: "msg_1",
        excerpt: "Signal Gate routing",
      },
    ],
    ...overrides,
  };
}

function makeArtifact(
  overrides: Partial<SessionArtifact> = {},
): SessionArtifact {
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
