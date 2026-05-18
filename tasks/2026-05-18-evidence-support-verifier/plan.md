# Evidence Support Verifier Plan

## Problem to solve

Representative asset dogfooding is currently Product Quality No-Go. The ledger identifies unsupported expansion, weak evidence, and non-code asset review gaps as major failure modes. Existing smelting verifiers are optimized for implementation gaps and physical logs:

- `GitGapVerifier` can confirm code/file gaps or already-implemented work.
- `LogWeaveVerifier` can confirm physical log matches.
- idea, decision, follow-up, and skill candidates often remain `unverified` even when their cited dialogue evidence clearly supports the candidate.

This leaves the review loop without a deterministic first-pass evidence-support signal for non-code assets.

## Target state

Add a small deterministic `EvidenceSupportVerifier` in `@loamlog/distill` smelting:

- It checks whether candidate title, summary, tags, and payload claims have enough lexical support in cited evidence excerpts.
- It is conservative: it verifies clear support, rejects only structurally evidence-free candidates, and otherwise returns `unverified` with a reason.
- `runDistillDAG` combines it with the existing git/log verifiers so physical logs and git gap decisions still take precedence, while non-code supported assets can become verified.

## Boundary

In scope:

- New verifier module and focused tests.
- DAG smelting merge policy update.
- Minimal docs/ledger status update.

Out of scope:

- LLM-based review scoring.
- New asset types or representative distiller prompt changes.
- MCP, dashboard, external sinks, or broader dogfooding reruns.
- Replacing human review.

## DAG split

```text
A. Design record
  -> B. EvidenceSupportVerifier
  -> C. DAG merge policy
  -> D. Focused tests
  -> E. Build/test/static gate
```

### A. Design record

- input: project ledger and engineering principles
- output: this plan
- failure impact: implementation would violate design-doc-first rule
- acceptance: plan records problem, target, boundary, DAG, architecture relation

### B. EvidenceSupportVerifier

- input: `AssetCandidate.evidence`, title, summary, tags, payload
- output: `VerificationReport`
- dependencies: core verifier contract
- failure impact: unsupported candidates remain unverified
- acceptance: verifies supported English and Chinese claims; does not over-reject weak paraphrases

### C. DAG merge policy

- input: reports from git, log, and evidence-support verifiers
- output: one candidate verification report
- dependencies: B
- failure impact: supported non-code assets stay `unverified`, or git/log semantics regress
- acceptance: rejected/archived git decisions still block; log physical match still wins; evidence-support can verify when git/log are unverified

### D. Focused tests

- input: verifier examples and one DAG scenario
- output: regression coverage
- dependencies: B/C
- failure impact: future verifier changes can silently weaken evidence-first guarantees
- acceptance: tests cover supported, unrelated, and CJK evidence

### E. Build/test/static gate

- input: changed code
- output: passing test/build and AI completion scan report
- dependencies: D
- failure impact: task incomplete by project quality gate
- acceptance: `pnpm run test`, `pnpm run build`, `pnpm run ai:complete`, Top N handling, and rerun evidence

## Relation to existing architecture

This keeps smelting as the owner of verification and avoids pushing evidence scoring into representative distillers or CLI code. It reinforces the existing `SessionArtifact -> EvidenceSpan -> Signal -> AssetCandidate -> Decision -> Delivery -> Feedback` direction by making evidence support explicit at the candidate verification layer.
