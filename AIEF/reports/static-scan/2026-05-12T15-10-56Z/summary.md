# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-12T15-10-56Z
- Profile: fast
- Top N: 5
- Findings: 107
- Selected Top N: 5
- Blocking findings: 0
- Required tool failures: 1
- Optional skipped tools: 0

## Required Tool Results

- typescript: exit 0
- biome: exit 1
- pnpm-audit: exit 0

## Optional Tool Results

- none

## Top N

1. [medium] biome skills/dev-browser/src/index.ts:266:11 - This callback passed to forEach() iterable method should not return a value.
2. [medium] biome skills/dev-browser/src/index.ts:273:13 - This callback passed to forEach() iterable method should not return a value.
3. [medium] biome skills/dev-browser/src/snapshot/__tests__/snapshot.test.ts:39:7 - eval() exposes to security risks and performance issues.
4. [low] biome packages/cli/src/list.ts:343:9 - This variable sinceTs is unused.
5. [low] biome packages/cli/src/m0-e2e.test.ts:126:12 - Unexpected any. Specify a different type.

## Rerun Comparison

- Previous run: `2026-05-12T15-09-11Z`
- Fixed: 5
- Still present: 0
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
