# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-01T13-43-39Z
- Profile: fast
- Top N: 5
- Findings: 85
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

1. [medium] biome packages/rules/src/index.test.ts:85:11 - This object defines a then property.
2. [medium] biome packages/rules/src/index.test.ts:92:11 - This object defines a then property.
3. [medium] biome skills/dev-browser/src/client.ts:289:13 - This variable implicitly has the any type.
4. [medium] biome skills/dev-browser/src/client.ts:417:11 - eval() exposes to security risks and performance issues.
5. [medium] biome skills/dev-browser/src/index.ts:266:11 - This callback passed to forEach() iterable method should not return a value.

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
