# Representative Field Evidence Gate Plan

## Problem to solve

Representative Assets Batch 1 failed product quality mainly because LLM output expanded beyond cited evidence: owners, due context, target audience, business value, tradeoffs, revisit triggers, acceptance criteria, and similar fields were often invented from weak session text.

The existing shared post-filter already rejects broad classes of noise, but it does not verify whether these high-risk optional fields are directly supported by the cited evidence. That leaves every distiller to rely on prompt compliance for the same cross-cutting evidence-first rule.

## Target state

The representative asset shared post-filter rejects candidates when high-risk payload fields are present but not lexically supported by cited evidence.

This should:

- apply across all five representative asset distillers from one shared module;
- keep strongly supported English and Chinese fields;
- reject unsupported expansions before candidates enter smelting, review, or sinks;
- preserve existing evidence-required behavior and human review flow.

## Boundary

In scope:

- shared post-filter support checks for high-risk payload fields;
- focused regression tests for unsupported optional expansion and supported fields;
- fixture updates where existing positive tests used intentionally short evidence;
- ledger update documenting the quality gate slice.

Out of scope:

- LLM-based semantic judging;
- changing Signal Gate classifier schema;
- changing asset payload schemas;
- running a new real dogfooding batch;
- MCP, dashboard, external delivery, or Auto-Skill work.

## DAG split

```text
A. Design record
  -> B. Shared field support helper
  -> C. Distiller fixture and regression tests
  -> D. Focused/full tests and static gate
  -> E. Ledger update
```

### A. Design record

- input: project ledger, Batch 1 review, representative asset spec
- output: this plan
- failure impact: quality hardening would lack traceable design intent
- acceptance: plan records problem, target, boundary, DAG, and architecture relation

### B. Shared field support helper

- input: payload fields and cited evidence text
- output: boolean keep/reject decision
- dependencies: existing `shouldKeepRepresentativeAsset`
- failure impact: unsupported optional fields keep leaking into assets
- acceptance: high-risk fields are checked in one shared post-filter

### C. Tests

- input: Batch 1 failure modes and existing distiller fixtures
- output: focused tests
- dependencies: B
- failure impact: future prompt/schema edits can weaken evidence-first behavior
- acceptance: unsupported revisit trigger / target audience / acceptance examples are rejected; supported examples pass

### D. Verification

- input: changed code and tests
- output: focused tests, full tests/build, AI completion scan and rerun report
- dependencies: C
- failure impact: implementation is incomplete under the project quality gate
- acceptance: latest scan report and rerun status are referenced in the final response

### E. Ledger update

- input: completed slice
- output: `docs/project-ledger.md` status update
- dependencies: B-D
- failure impact: project state drifts from implementation
- acceptance: ledger records the new field-level evidence gate

## Relation to existing architecture

This keeps evidence-first quality control inside the representative asset shared distiller layer, where all five asset types already share prompt guardrails, duplicate-topic merging, and deterministic post-filters. It does not add central branching in the distill engine or hard-code representative asset types into core workflow.
