# Signal Classifier Rerun CLI Plan

## Problem to solve

`AIEF/openspec/signal-gate.md` defines a manual rerun entry for the Signal Gate classifier, and `docs/project-ledger.md` lists classifier rerun command as a remaining Signal Gate artifact. Current code can classify signals inside `runDistillDAG`, but there is no standalone CLI path for reclassifying archived sessions without running typed distillers.

## Target state

`loam signal rerun` reads archived session snapshots, normalizes them, runs the Signal Gate classifier through the configured LLM router, stores resulting `Signal` nodes in `LocalAssetStore`, and reports processed / produced / rejected / error counts. Manual signal review must remain authoritative when a stored signal is overwritten by the rerun.

## Boundary

This slice does:

- add a manual `loam signal rerun` CLI subcommand;
- support scoped reruns by repo, session, time range, and limit;
- reuse existing config loading, LLM routing, archive querying, normalization, classifier normalization, and `LocalAssetStore.putSignal`.

This slice does not:

- add capture-after automatic Signal Gate jobs;
- change SignalKind, tag, schema, prompt, or distiller routing policy;
- implement classifier-version stale marking beyond enabling explicit reruns;
- run representative asset dogfooding re-review.

## DAG

```text
A. Parse rerun scope
  -> B. Load config and LLM router
  -> C. Query archive snapshots
  -> D. Normalize session
  -> E. Classify signals
  -> F. Store signals
  -> G. Report counts
```

| Node | Input | Output | Failure impact | Acceptance |
|---|---|---|---|---|
| A | CLI args | validated scope | bad args stop before I/O | invalid limit / LLM format rejected |
| B | `loam.config.*`, env, overrides | `LLMRouter` | command exits before archive writes | uses existing distill config helpers |
| C | dump dir and scope | latest matching artifacts | no matching sessions yields zero counts | supports repo/session/since/until/limit |
| D | `SessionArtifact` | `NormalizedSession` | one session failure counted as error | no duplicate normalizer implementation |
| E | normalized session | classifier result | per-session error recorded, next session continues | rejected classifier items counted |
| F | `Signal[]` | persisted signals | per-signal write error counted with session | manual review preserved by store |
| G | counters | human or JSON summary | none | summary includes processed, produced, rejected, errors |

## Architecture relation

The command stays thin: CLI owns argument parsing and reporting; `@loamlog/distill` continues to own normalization, classifier logic, LLM routing, and the local asset store. This keeps Signal Gate as a deep module and avoids duplicating archive or classifier logic in the CLI.
