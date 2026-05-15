# Signal Gate Auto Job Plan

## Problem to solve

`docs/project-ledger.md` lists the post-capture automatic Signal Gate job as the remaining P0 Signal Gate artifact. Current code can classify signals during typed distill runs and through `loam signal rerun`, but regular daemon capture only writes the archive snapshot and does not create Signal nodes unless a later manual command or distiller run happens.

## Target state

After a daemon capture successfully writes a redacted snapshot, Loamlog starts a background Signal Gate job for that captured session. The job normalizes the snapshot, runs the Signal classifier through the configured LLM router, stores signals in `LocalAssetStore`, and logs counts. Capture must still return success when the classifier, model config, or network fails.

## Boundary

This slice does:

- add a reusable one-session Signal Gate job helper in `@loamlog/distill`;
- wire daemon capture to schedule that helper after archive write;
- keep the existing `loam signal rerun` command on the same helper path;
- add focused tests for non-blocking capture and signal persistence.

This slice does not:

- implement retry queues or stale classifier version scanning;
- change SignalKind, tags, prompt, schema, or distiller routing policy;
- run typed representative distillers automatically after Signal Gate;
- change manual capture CLI behavior beyond using the same daemon capture path if a daemon config enables it.

## DAG

```text
A. Capture request
  -> B. Pull provider session
  -> C. Redact and write archive snapshot
  -> D. Schedule Signal Gate job
  -> E. Normalize captured artifact
  -> F. Classify signals
  -> G. Store Signal nodes
  -> H. Log success/failure
```

| Node | Input | Output | Failure impact | Acceptance |
|---|---|---|---|---|
| A | HTTP capture payload | validated request | invalid request rejected | existing daemon tests pass |
| B | provider or pulled payload | raw session | capture fails as before | no provider behavior change |
| C | snapshot | redacted archive file | capture fails as before | snapshot path still returned |
| D | redacted snapshot path | background promise | scheduling errors are logged | capture response remains 202 |
| E | redacted `SessionSnapshot` | `SessionArtifact` + `NormalizedSession` | job failure only | no duplicate normalizer logic |
| F | normalized session + LLM router | signals / rejected items | job failure only | classifier errors are caught |
| G | signals | stored `LocalAssetStore` files | job failure only | manual reviews remain preserved by store |
| H | job result/error | log line | none | logs counts or failure reason |

## Architecture relation

The daemon owns scheduling only. `@loamlog/distill` owns the actual Signal Gate job, because it already owns normalization, classifier execution, LLM routing, and `LocalAssetStore`. This keeps capture/archive separate from classifier internals and avoids duplicating CLI rerun logic.
