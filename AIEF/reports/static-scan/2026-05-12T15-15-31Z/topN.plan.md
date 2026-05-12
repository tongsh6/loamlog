# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/distill/src/dag-runner.ts:217:8 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/distill/src/dag-runner.ts:217:4 | lint, score 175 | fix_or_document |
| 3 | biome | low | packages/distill/src/dag-runner.ts:222:10 | lint, score 175 | fix_or_document |
| 4 | biome | low | packages/distill/src/dag-runner.ts:223:10 | lint, score 175 | fix_or_document |
| 5 | biome | low | packages/distill/src/store.ts:15:13 | lint, score 175 | fix_or_document |
