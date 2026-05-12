# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-12T15-18-50Z
- Profile: fast
- Top N: 5
- Findings: 86
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

1. [low] biome packages/distillers/issue-draft/src/parse.ts:11:7 - Change to an optional chain.
2. [low] biome packages/distillers/knowledge-card/src/index.ts:104:6 - Change to an optional chain.
3. [low] biome packages/distillers/pitfall-card/src/index.ts:58:7 - Change to an optional chain.
4. [low] biome packages/distillers/prd-draft/src/index.ts:79:7 - Change to an optional chain.
5. [low] biome packages/evaluation-harness/src/baseline.ts:1:8 - All these imports are only used as types.

## Rerun Comparison

- Previous run: `2026-05-12T15-16-54Z`
- Fixed: 5
- Still present: 0
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
