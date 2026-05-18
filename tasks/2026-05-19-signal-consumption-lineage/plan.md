# Signal Consumption Lineage Repair Plan

## Problem to solve

Signal Gate routing narrows representative asset distillers to selected signals,
but the DAG currently attaches every routed signal in the session to every
candidate produced by that distiller. It also records every routed signal as
`produced` whenever any candidate is produced.

That overstates lineage: when one session has multiple routed signals and the
distiller emits a candidate supported by only one message, unrelated signals can
look successfully consumed by that candidate. This weakens review feedback and
the Cross-Asset Dogfooding quality loop because signal-level failures are hidden.

## Target state

Candidate lineage and `SignalConsumption` records should be evidence-scoped:

- A candidate keeps only routed signals whose spans overlap the candidate's
  cited evidence by session and message.
- `produced` consumption is recorded only for those matched signals and points to
  the produced asset id.
- Routed signals with no produced asset after the session are recorded once as
  `skipped`, preserving negative feedback for later review.
- Legacy distillers without `consumes_signals` keep the default synthetic signal
  created by `mapDistillResultToCandidate`.

## Boundary

In scope:

- Add a small reusable signal/evidence overlap helper.
- Update DAG signal assignment and consumption recording.
- Add focused regression tests for multi-signal sessions.
- Update project ledger and task progress after verification.

Out of scope:

- Change signal classifier prompts or schemas.
- Change representative asset payload schemas or prompts.
- Build cross-signal arbitration or review UI.
- Run a real dogfooding batch.

## DAG split

```text
A. Design record
  -> B. Regression tests
  -> C. Signal/evidence overlap helper
  -> D. DAG produced/skipped consumption update
  -> E. Verification, code review, ledger update
```

### A. Design record

- input: project ledger, Signal Gate spec, DAG runner code
- output: this plan
- failure impact: lineage behavior changes without durable context
- acceptance: plan records problem, target, boundary, DAG, architecture relation

### B. Regression tests

- input: existing signal-routed DAG test
- output: tests where two routed signals produce one candidate from one message
- dependencies: A
- failure impact: over-broad consumption remains implicit
- acceptance: before the fix, test would show both signals attached/produced

### C. Signal/evidence overlap helper

- input: `Signal[]` and `DistillEvidenceDraft[]`
- output: matched signals
- dependencies: B
- failure impact: DAG keeps duplicating matching logic
- acceptance: helper filters by session_id + message_id and keeps same-message
  spans even when excerpts are paraphrased

### D. DAG update

- input: routed signals and candidate evidence
- output: precise `candidate.signals` and consumption results
- dependencies: C
- failure impact: signal lineage and feedback remain polluted
- acceptance: produced signals map to the asset id; unconsumed routed signals
  are marked skipped once

### E. Verification and review

- input: changed code and docs
- output: focused tests, full tests/build, static scan reports, review result
- dependencies: D
- failure impact: task incomplete under project quality rules
- acceptance: `pnpm run test`, `pnpm run build`, `pnpm run ai:complete`, Top N
  handling, rerun evidence, and ledger/progress alignment

## Relation to existing architecture

The change stays inside the Signal Gate routing and distill DAG boundary. It
preserves provider, distiller, sink, approval, and store contracts while making
`SessionArtifact -> Signal -> AssetCandidate -> Delivery -> Feedback` lineage
more precise. It also keeps the Signal Gate as the shared routing layer instead
of pushing lineage policy into individual representative asset distillers.
