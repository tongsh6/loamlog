# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-12T15-15-31Z
- Profile: fast
- Top N: 5
- Findings: 96
- Selected Top N: 5
- Blocking findings: 0
- Required tool failures: 0
- Optional skipped tools: 0

## Required Tool Results

- typescript: exit 0
- biome: exit 0
- pnpm-audit: exit 0

## Optional Tool Results

- none

## Top N

1. [low] biome packages/distill/src/dag-runner.ts:217:8 - This variable totalProduced is unused.
2. [low] biome packages/distill/src/dag-runner.ts:217:4 - This let declares a variable that is only assigned once.
3. [low] biome packages/distill/src/dag-runner.ts:222:10 - This variable allowExt is unused.
4. [low] biome packages/distill/src/dag-runner.ts:223:10 - This variable hasFileSink is unused.
5. [low] biome packages/distill/src/store.ts:15:13 - This private class member is defined but never used.

## Rerun Comparison

- Previous run: `2026-05-12T15-13-36Z`
- Fixed: 5
- Still present: 0
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
