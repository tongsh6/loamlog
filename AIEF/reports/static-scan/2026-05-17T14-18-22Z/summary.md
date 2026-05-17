# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-17T14-18-22Z
- Profile: fast
- Top N: 5
- Findings: 41
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

1. [low] biome skills/dev-browser/src/snapshot/browser-script.ts:12:13 - This import is unused.
2. [low] biome skills/dev-browser/src/snapshot/browser-script.ts:29:9 - This variable snapshotDir is unused.
3. [info] biome packages/archive/src/index.ts:301:13 - Unnecessary continue statement
4. [info] biome packages/archive/src/registry.ts:79:11 - Unnecessary continue statement
5. [info] biome packages/cli/src/distill.ts:196:7 - Unnecessary continue statement

## Rerun Comparison

- Previous run: `2026-05-17T14-15-48Z`
- Fixed: 5
- Still present: 0
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
