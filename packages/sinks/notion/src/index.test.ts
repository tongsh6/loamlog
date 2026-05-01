import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createNotionSink } from "./index.js";

describe("createNotionSink", () => {
  test("creates a valid SinkPlugin", () => {
    const sink = createNotionSink();
    assert.equal(sink.id, "@loamlog/sink-notion");
    assert.equal(sink.name, "Notion Database Sink");
    assert.equal(typeof sink.deliver, "function");
  });

  test("supports common distiller output types", () => {
    const sink = createNotionSink();
    assert.equal(sink.supports("issue-draft"), true);
    assert.equal(sink.supports("prd-draft"), true);
    assert.equal(sink.supports("knowledge-card"), true);
    assert.equal(sink.supports("pitfall-card"), true);
    assert.equal(sink.supports("unknown-type"), false);
  });

  test("throws when token is missing", async () => {
    const sink = createNotionSink({ databaseId: "test-db" });
    // Clear NOTION_TOKEN for test
    const prev = process.env.NOTION_TOKEN;
    delete process.env.NOTION_TOKEN;
    try {
      await assert.rejects(
        () =>
          sink.deliver({
            results: [
              {
                id: "r1",
                type: "issue-draft",
                title: "Test Issue",
                summary: "A test issue.",
                confidence: 0.8,
                tags: ["test"],
                evidence: [{ session_id: "s1", message_id: "m1", excerpt: "test" }],
                distiller_id: "@test/distiller",
                distiller_version: "0.1.0",
                fingerprint: "abc",
                trace_commands: [],
              },
            ],
            config: {},
          }),
        /requires a token/,
      );
    } finally {
      if (prev) process.env.NOTION_TOKEN = prev;
    }
  });

  test("throws when databaseId is missing", async () => {
    const sink = createNotionSink({ token: "test-token" });
    await assert.rejects(
      () =>
        sink.deliver({
          results: [
            {
              id: "r1",
              type: "issue-draft",
              title: "Test Issue",
              summary: "A test issue.",
              confidence: 0.8,
              tags: ["test"],
              evidence: [{ session_id: "s1", message_id: "m1", excerpt: "test" }],
              distiller_id: "@test/distiller",
              distiller_version: "0.1.0",
              fingerprint: "abc",
              trace_commands: [],
            },
          ],
          config: {},
        }),
      /requires a database ID/,
    );
  });

  test("rejects results without evidence", async () => {
    const sink = createNotionSink({ token: "test-token", databaseId: "test-db", dryRun: true });
    const report = await sink.deliver({
      results: [
        {
          id: "r1",
          type: "issue-draft",
          title: "No Evidence",
          summary: "Missing evidence.",
          confidence: 0.5,
          tags: [],
          evidence: [],
          distiller_id: "@test/distiller",
          distiller_version: "0.1.0",
          fingerprint: "abc",
          trace_commands: [],
        },
      ],
      config: {},
    });
    assert.equal(report.delivered, 0);
    assert.equal(report.failed, 1);
    assert.equal(report.errors?.[0].error.includes("without evidence"), true);
  });

  test("dry run mode does not call Notion API", async () => {
    const sink = createNotionSink({ token: "test-token", databaseId: "test-db", dryRun: true });
    const report = await sink.deliver({
      results: [
        {
          id: "r1",
          type: "prd-draft",
          title: "Dark Mode",
          summary: "Add dark mode support.",
          confidence: 0.9,
          tags: ["prd", "p1_high"],
          evidence: [{ session_id: "s1", message_id: "m1", excerpt: "add dark mode" }],
          distiller_id: "@test/distiller",
          distiller_version: "0.1.0",
          fingerprint: "abc",
          trace_commands: [],
        },
      ],
      config: {},
    });
    assert.equal(report.delivered, 1);
    assert.equal(report.failed, 0);
  });

  test("delivers multiple results in one call", async () => {
    const sink = createNotionSink({ token: "test-token", databaseId: "test-db", dryRun: true });
    const report = await sink.deliver({
      results: [
        {
          id: "r1",
          type: "knowledge-card",
          title: "Card 1",
          summary: "Knowledge card.",
          confidence: 0.8,
          tags: ["insight"],
          evidence: [{ session_id: "s1", message_id: "m1", excerpt: "test" }],
          distiller_id: "@test/distiller",
          distiller_version: "0.1.0",
          fingerprint: "abc1",
          trace_commands: [],
        },
        {
          id: "r2",
          type: "issue-draft",
          title: "Issue 2",
          summary: "Another issue.",
          confidence: 0.7,
          tags: ["bug"],
          evidence: [{ session_id: "s2", message_id: "m2", excerpt: "test" }],
          distiller_id: "@test/distiller",
          distiller_version: "0.1.0",
          fingerprint: "abc2",
          trace_commands: [],
        },
      ],
      config: {},
    });
    assert.equal(report.delivered, 2);
    assert.equal(report.failed, 0);
  });
});
