# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-17T13-22-23Z
- Profile: fast
- Top N: 5
- Findings: 46
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

1. [low] biome skills/dev-browser/src/relay.ts:50:11 - This interface ExtensionCommandMessage is unused.
2. [low] biome skills/dev-browser/src/snapshot/__tests__/snapshot.test.ts:49:29 - Unexpected any. Specify a different type.
3. [low] biome skills/dev-browser/src/snapshot/__tests__/snapshot.test.ts:107:31 - Unexpected any. Specify a different type.
4. [low] biome skills/dev-browser/src/snapshot/__tests__/snapshot.test.ts:128:12 - Forbidden non-null assertion.
5. [low] biome skills/dev-browser/src/snapshot/__tests__/snapshot.test.ts:129:17 - Forbidden non-null assertion.

## Rerun Comparison

- Previous run: `2026-05-17T13-18-52Z`
- Fixed: 5
- Still present: 0
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
