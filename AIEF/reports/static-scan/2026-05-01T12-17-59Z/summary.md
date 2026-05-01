# Static Scan Summary

- Report: /Users/loong/workspace/code/github/ai/loamlog/AIEF/reports/static-scan/2026-05-01T12-17-59Z
- Profile: fast
- Top N: 5
- Findings: 3
- Selected Top N: 3
- Required tool failures: 3
- Optional skipped tools: 0

## Required Tool Results

- typescript: exit 2
- biome: exit 1
- pnpm-audit: exit 1

## Optional Tool Results

- none

## Top N

1. [high] typescript src/index.ts:25:3 - Property 'update' is missing in type '{ get<V>(key: string): Promise<V | undefined>; set<V>(key: string, value: V): Promise<void>; markProcessed(targetDistillerId: string, sessionIds: string[]): Promise<...>; }' but required in type 'DistillerStateKV'.
2. [high] biome repository - Scanner exited with code 1.
3. [info] pnpm-audit repository - yaml is vulnerable to Stack Overflow via deeply nested YAML collections

## Required Follow-Up

1. Fix actionable Top N findings.
2. Update `topN.results.md` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun `pnpm run ai:complete` and reference the new report in the final AI response.
