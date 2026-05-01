# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-01T12-20-29Z
- Profile: fast
- Top N: 5
- Findings: 86
- Selected Top N: 5
- Required tool failures: 1
- Optional skipped tools: 0

## Required Tool Results

- typescript: exit 0
- biome: exit 1
- pnpm-audit: exit 0

## Optional Tool Results

- none

## Top N

1. [medium] biome packages/distiller-sdk/src/index.test.ts:21:9 - This generator function doesn't contain yield.
2. [medium] biome packages/distiller-sdk/src/index.test.ts:24:9 - This generator function doesn't contain yield.
3. [medium] biome packages/distillers/pitfall-card/src/index.test.ts:44:9 - This generator function doesn't contain yield.
4. [medium] biome packages/evaluation-harness/src/baseline.ts:110:16 - This callback passed to forEach() iterable method should not return a value.
5. [medium] biome packages/evaluation-harness/src/baseline.ts:113:14 - This callback passed to forEach() iterable method should not return a value.

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.
