# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-01T12-19-25Z
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

1. [medium] biome packages/archive/src/index.ts - This variable implicitly has the any type.
2. [medium] biome packages/archive/src/index.ts - This variable implicitly has the any type.
3. [medium] biome packages/cli/src/list.ts - This variable implicitly has the any type.
4. [medium] biome packages/cli/src/list.ts - This variable implicitly has the any type.
5. [medium] biome packages/cli/src/list.ts - This variable implicitly has the any type.

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.
