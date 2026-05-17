# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-17T14-20-31Z
- Profile: fast
- Top N: 5
- Findings: 34
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

1. [info] biome packages/cli/src/list.ts:263:7 - Unnecessary continue statement
2. [info] biome packages/cli/src/list.ts:330:9 - Unnecessary continue statement
3. [info] biome packages/cli/src/list.ts:688:29 - Template literals are preferred over string concatenation.
4. [info] biome packages/cli/src/show.ts:83:11 - Unnecessary continue statement
5. [info] biome packages/distill/src/aggregator.ts:32:24 - The character doesn't need to be escaped.

## Rerun Comparison

- Previous run: `2026-05-17T14-18-22Z`
- Fixed: 5
- Still present: 0
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
