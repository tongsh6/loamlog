# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-12T15-13-36Z
- Profile: fast
- Top N: 5
- Findings: 101
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

1. [low] biome packages/cli/src/m0-e2e.test.ts:134:12 - Unexpected any. Specify a different type.
2. [low] biome packages/cli/src/show.ts:79:15 - Change to an optional chain.
3. [low] biome packages/cli/src/show.ts:108:16 - Change to an optional chain.
4. [low] biome packages/distill/src/aggregator.ts:179:57 - Unexpected any. Specify a different type.
5. [low] biome packages/distill/src/augment.ts:86:47 - This parameter is unused.

## Rerun Comparison

- Previous run: `2026-05-12T15-10-56Z`
- Fixed: 5
- Still present: 0
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
