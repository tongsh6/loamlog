# Cited Evidence Gate Hardening Plan

## Problem to solve

The representative asset field evidence gate was designed to reject high-risk payload fields when they are not supported by cited evidence. The current helper builds the evidence text from both the cited excerpt and the full source message. That lets an LLM cite a weak excerpt while borrowing unrelated terms from the same long message to pass field-level support checks.

This weakens the Cross-Asset Dogfooding repair path documented in `docs/project-ledger.md`: invented owners, due context, tradeoffs, revisit triggers, audiences, and acceptance criteria can still enter review if they share a message with supporting words.

## Target state

Representative asset post-filtering distinguishes two evidence scopes:

- cited evidence text: only `DistillEvidenceDraft.excerpt`; used for high-risk field support and follow-up open-work evidence.
- evidence context text: cited excerpt plus source message content; used only for coarse noise filters that need surrounding role/process context.

Representative asset evidence refs must also be anchored in the source message content. Candidates with high-risk optional fields must be supported by anchored cited excerpts, not by uncited sibling text in the same message or by hallucinated excerpt text.

## Boundary

In scope:

- shared representative asset post-filter evidence text split;
- representative asset evidence ref anchoring for cited excerpts;
- focused regression tests for same-message uncited support leakage;
- ledger/task progress update.

Out of scope:

- LLM prompt changes;
- payload schema changes;
- Signal Gate classifier changes;
- real dogfooding batch rerun.

## DAG split

```text
A. Task record
  -> B. Shared evidence scope split
  -> C. Regression tests
  -> D. Focused/full verification + AI completion gate
  -> E. Ledger and progress update
```

### A. Task record

- input: project ledger, field evidence gate plan, shared post-filter code
- output: this plan
- failure impact: quality gate semantic change would be hard to review later
- acceptance: plan states problem, target, boundary, DAG, and architecture relation

### B. Shared evidence scope split

- input: `shouldKeepRepresentativeAsset`
- output: separate cited/context evidence text helpers
- dependencies: A
- failure impact: field support checks keep relying on uncited message text
- acceptance: high-risk fields and follow-up open-work checks read only excerpts

### C. Regression tests

- input: Batch 1 failure mode and current helper behavior
- output: tests proving same-message uncited terms do not support high-risk fields or open follow-up status
- dependencies: B
- failure impact: future refactors can silently relax cited-evidence semantics
- acceptance: focused representative-assets tests fail before B and pass after B

### D. Verification

- input: changed code and docs
- output: focused tests, broader tests/build, `pnpm run ai:complete` reports
- dependencies: C
- failure impact: implementation is incomplete under project quality rules
- acceptance: latest scan report is referenced in final response

### E. Ledger and progress update

- input: completed slice and verification result
- output: `docs/project-ledger.md` and `progress.md` record
- dependencies: D
- failure impact: future AI sessions inherit stale project state
- acceptance: ledger mentions cited-excerpt hardening as part of representative asset quality repair

## Relation to existing architecture

This is a shared distiller-layer quality gate fix. It preserves the existing plugin architecture and avoids adding central distill-engine branching. It strengthens the evidence-first contract already required by the representative asset spec and the earlier field evidence gate plan.
