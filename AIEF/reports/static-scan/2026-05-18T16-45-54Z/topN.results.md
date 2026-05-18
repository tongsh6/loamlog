# Top N Fix Results

Compared with previous run. Every selected finding must end with one of: fixed, deferred, false_positive, not_actionable, failed.

| Rank | Status | Handling | Verification |
|---|---|---|---|
| 1 | fixed | Replaced `signalByMessage.get("msg-1")!` with explicit `assert.ok(producedSignal)` before dereferencing. | `node --import tsx --test packages/distill/src/dag-runner.test.ts` passed |
| 2 | fixed | Replaced `signalByMessage.get("msg-2")!` with explicit `assert.ok(skippedSignal)` before dereferencing. | `node --import tsx --test packages/distill/src/dag-runner.test.ts` passed |
