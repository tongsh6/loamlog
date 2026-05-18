# Follow-up Open Work Gate Plan

## Problem to solve

Representative asset Batch 1 marked `follow-up-work-item` as Product Quality No-Go: 11 outputs scored 3/55 total, with 0 items at or above 3/5. The main failure mode was not missing extraction capability. The distiller promoted action-shell names, completed execution records, troubleshooting fragments, and practice/risk material into follow-up work items.

Existing filters already reject missing acceptance criteria, completed state, old roadmap residue, and some action-shell titles. They do not yet require the cited evidence itself to show that work remains future, current, in-progress, pending, or blocked.

## Target state

`follow-up-work-item` candidates should survive only when:

- the payload has action, reason, and concrete acceptance criteria;
- cited evidence contains an explicit open-work signal such as "need to", "next step", "pending", "blocked", "continue", or equivalent Chinese wording;
- completed records, risk/practice observations, generic troubleshooting, and process logs stay out of this asset type.

## Boundary

In scope:

- Add a deterministic open-work evidence gate in the representative asset shared post-filter.
- Tighten the follow-up system prompt to match the deterministic gate.
- Add focused regression tests for English and Chinese evidence.
- Update task progress and the project ledger if verification succeeds.

Out of scope:

- New asset types.
- LLM-based review scoring.
- Cross-type duplicate merging.
- Full dogfooding rerun.
- Signal Gate schema or routing changes.

## DAG split

```text
A. Task record
  -> B. Open-work evidence gate
  -> C. Prompt boundary alignment
  -> D. Focused tests
  -> E. Build/test/static gate
  -> F. Code review
```

### A. Task record

- input: project ledger, Batch 1 review, engineering principles
- output: this plan, constraints, progress log
- failure impact: implementation would violate task traceability rules
- acceptance: task directory has plan / constraints / progress

### B. Open-work evidence gate

- input: cited evidence text and follow-up payload
- output: keep / reject decision
- dependencies: A
- failure impact: low-value follow-up candidates continue entering review
- acceptance: evidence without open-work language is rejected even when the LLM invents an action and acceptance

### C. Prompt boundary alignment

- input: existing follow-up prompt guardrails
- output: prompt explicitly asks for open-work evidence
- dependencies: B
- failure impact: LLM keeps producing candidates the deterministic gate will reject
- acceptance: prompt and post-filter express the same boundary

### D. Focused tests

- input: Batch 1 failure modes and positive examples
- output: regression tests
- dependencies: B/C
- failure impact: future prompt/filter changes can regress the gate silently
- acceptance: tests cover rejected risk/practice evidence, rejected no-open-signal evidence, and accepted Chinese open-work evidence

### E. Build/test/static gate

- input: changed code
- output: passing focused tests, build, AI completion scan report and rerun
- dependencies: D
- failure impact: task incomplete under project quality rules
- acceptance: `pnpm run test`, `pnpm run build`, `pnpm run ai:complete`, Top N handling, and rerun evidence

### F. Code review

- input: diff, tests, reports
- output: review conclusion and any follow-up fixes
- dependencies: E
- failure impact: defects remain hidden behind green tests
- acceptance: review checks design-doc compliance, evidence-first behavior, maintainability, and quality gate artifacts

## Relation to existing architecture

This keeps quality repair inside the representative asset post-filter, where prompt/schema repair v0.4 and common post-filter v0.2-v0.6 already live. It does not add branching to CLI, DAG, Signal Gate, or sinks. The change reinforces the existing `SessionArtifact -> EvidenceSpan -> Signal -> AssetCandidate -> Decision -> Delivery -> Feedback` model by requiring the `EvidenceSpan` to support the asset type before the candidate reaches review.
