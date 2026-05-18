# Aggregator Type Boundary Repair Plan

## Problem to solve

`TopicAggregator` computes its exact identity hash with `distiller_id`, but its
second-pass semantic merge compares only normalized titles. That can merge assets
from different `candidate_type` or `distiller_id` when two asset lines mention
the same topic.

For Loamlog's current Cross-Asset Dogfooding work, this is unsafe: a
`practice-pitfall`, `decision-rationale`, `idea-seed`, or `follow-up-work-item`
may share a topic while representing a different reusable asset. Merging them at
the aggregator layer loses type-specific meaning and lets confidence decide which
asset line survives.

## Target state

`TopicAggregator` may merge semantically similar assets only inside the same
asset line: same `candidate_type` and same `distiller_id`. Cross-type duplicate
topics should remain separate refined assets for human review or a future
explicit cross-type arbitration policy.

## Boundary

In scope:

- Add a regression test proving same-title assets from different candidate types
  are not merged.
- Add a regression test proving same-title assets from different distillers are
  not merged.
- Keep existing same-distiller same-type semantic merging behavior.
- Update task progress and project ledger after verification.

Out of scope:

- Build a cross-type duplicate arbitration policy.
- Change representative asset distiller prompts or payload schemas.
- Change sink, approval, audit, or asset store contracts.
- Run a real dogfooding batch.

## DAG split

```text
A. Task record
  -> B. Regression tests
  -> C. Aggregator merge boundary fix
  -> D. Focused/full verification + AI completion gate
  -> E. Code review and ledger update
```

### A. Task record

- input: project ledger, engineering principles, aggregator code
- output: this plan and constraints
- failure impact: boundary fix lacks design intent
- acceptance: task directory records problem, target, boundary, DAG

### B. Regression tests

- input: existing aggregator tests
- output: tests for cross-type and cross-distiller same-title assets
- dependencies: A
- failure impact: current bug remains only implicit
- acceptance: tests fail before the implementation fix and pass after

### C. Aggregator merge boundary fix

- input: `TopicAggregator` second-pass semantic merge
- output: semantic merge considers type/distiller compatibility before title
- dependencies: B
- failure impact: unrelated asset lines may keep collapsing
- acceptance: same-type same-distiller merge still works; different type or
  distiller assets stay separate

### D. Verification

- input: changed code and docs
- output: focused tests, full tests/build, static scan reports
- dependencies: C
- failure impact: task incomplete under project quality rules
- acceptance: `pnpm run test`, `pnpm run build`, `pnpm run ai:complete`, Top N
  handling, and rerun evidence

### E. Code review and ledger update

- input: diff and verification results
- output: review conclusion, fixes if needed, ledger/progress alignment
- dependencies: D
- failure impact: future AI sessions inherit stale status or hidden risk
- acceptance: review checks design-doc compliance, type boundary semantics,
  maintainability, and quality gate artifacts

## Relation to existing architecture

The fix stays inside the smelting/refining boundary where aggregation already
belongs. It preserves provider, distiller, sink, approval, and CLI orthogonality.
It also keeps cross-type duplicate handling explicit: the aggregator should not
silently arbitrate between different asset lines without a dedicated policy.
