# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-18T16-45-54Z
- Profile: fast
- Top N: 5
- Findings: 2
- Selected Top N: 2
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

1. [low] biome packages/distill/src/dag-runner.test.ts:512:7 - Forbidden non-null assertion.
2. [low] biome packages/distill/src/dag-runner.test.ts:514:47 - Forbidden non-null assertion.

## Rerun Comparison

- Previous run: `2026-05-18T16-35-26Z`
- Fixed: 0
- Still present: 0
- New findings (not in previous Top N): 2

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
