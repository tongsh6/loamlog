import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRuleEngine, DEFAULT_RULE_CONFIG, loadRuleConfigFromFile } from "./index.js";

const DEFAULT_RULE_PATH = new URL("./default.rules.yaml", import.meta.url);

describe("rule engine", () => {
  it("loads YAML config and traces hits across rule types", async () => {
    const config = await loadRuleConfigFromFile(DEFAULT_RULE_PATH);
    const engine = createRuleEngine(config);

    const decision = engine.evaluate({
      id: "candidate-1",
      title: "Refactor auth gateway",
      signal_type: "architecture_gap",
      metrics: { frequency: 4, impact: 0.8, urgency: 0.72, confidence: 0.74, effort: 0.3 },
      flags: { affects_core_pipeline: true },
      attributes: { title_duplicates_in_session: 1 },
    });

    const hitIds = decision.ruleHits.map((hit) => hit.id);
    assert.ok(hitIds.includes("repeated_architecture_gap"));
    assert.ok(hitIds.includes("high_value_action_score"));
    assert.ok(hitIds.includes("must_do_if_blocking_pipeline"));
    assert.ok(hitIds.includes("fast_track_blocking"));
    assert.equal(decision.necessity, "must_do");
    assert.equal(decision.filtered, false);
    assert.equal(decision.allowExecution, true);
    assert.equal(decision.score, 1);
  });

  it("drops low confidence candidates and records reason", async () => {
    const engine = createRuleEngine(await loadRuleConfigFromFile(DEFAULT_RULE_PATH));
    const decision = engine.evaluate({
      id: "candidate-2",
      signal_type: "bug",
      metrics: { confidence: 0.3, impact: 0.4, urgency: 0.2 },
      attributes: { title_duplicates_in_session: 1 },
    });

    assert.equal(decision.filtered, true);
    assert.equal(decision.allowExecution, false);
    assert.ok(decision.filterReasons.some((reason) => reason.includes("confidence")));
  });

  it("supports hot reload of rules without code changes", () => {
    const engine = createRuleEngine(DEFAULT_RULE_CONFIG);

    const candidate = {
      id: "candidate-3",
      signal_type: "architecture_gap",
      metrics: { confidence: 0.55, impact: 0.5, urgency: 0.4 },
      attributes: { title_duplicates_in_session: 1 },
    };

    const before = engine.evaluate(candidate);
    assert.equal(before.filtered, false);

    const updated = JSON.parse(JSON.stringify(DEFAULT_RULE_CONFIG));
    updated.rules = updated.rules.map((rule: typeof DEFAULT_RULE_CONFIG.rules[number]) =>
      rule.id === "ignore_low_confidence" ? { ...rule, when: { confidence_lt: 0.6 } } : rule,
    );

    engine.reload(updated);
    const after = engine.evaluate(candidate);
    assert.equal(after.filtered, true);
    assert.equal(after.allowExecution, false);
  });
});
