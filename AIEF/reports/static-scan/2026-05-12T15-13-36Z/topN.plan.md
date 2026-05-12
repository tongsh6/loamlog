# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/cli/src/m0-e2e.test.ts:134:12 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/cli/src/show.ts:79:15 | lint, score 175 | fix_or_document |
| 3 | biome | low | packages/cli/src/show.ts:108:16 | lint, score 175 | fix_or_document |
| 4 | biome | low | packages/distill/src/aggregator.ts:179:57 | lint, score 175 | fix_or_document |
| 5 | biome | low | packages/distill/src/augment.ts:86:47 | lint, score 175 | fix_or_document |
