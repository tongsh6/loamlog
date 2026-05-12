# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-12T15-06-15Z
- Profile: fast
- Top N: 5
- Findings: 118
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

1. [medium] biome packages/distill/src/aggregator.ts:92:65 - The assignment should not be in an expression.
2. [medium] biome packages/distill/src/normalizer.ts:44:11 - Other switch clauses can erroneously access this declaration.
Wrap the declaration in a block to restrict its access to the switch clause.
3. [medium] biome packages/distill/src/normalizer.ts:45:11 - Other switch clauses can erroneously access this declaration.
Wrap the declaration in a block to restrict its access to the switch clause.
4. [medium] biome packages/distill/src/normalizer.ts:48:11 - Other switch clauses can erroneously access this declaration.
Wrap the declaration in a block to restrict its access to the switch clause.
5. [medium] biome packages/distill/src/normalizer.ts:51:11 - Other switch clauses can erroneously access this declaration.
Wrap the declaration in a block to restrict its access to the switch clause.

## Rerun Comparison

- Previous run: `2026-05-01T14-58-24Z`
- Fixed: 0
- Still present: 5
- New findings (not in previous Top N): 5

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
