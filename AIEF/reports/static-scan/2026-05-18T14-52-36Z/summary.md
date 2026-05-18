# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-18T14-52-36Z
- Profile: fast
- Top N: 5
- Findings: 0
- Selected Top N: 0
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

No findings selected.

## Rerun Comparison

- Previous run: `2026-05-18T14-52-14Z`
- Fixed: 0
- Still present: 0
- New findings (not in previous Top N): 0

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
