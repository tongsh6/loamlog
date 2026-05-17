# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | info | packages/cli/src/list.ts:263:7 | lint, score 85 | fix_or_document |
| 2 | biome | info | packages/cli/src/list.ts:330:9 | lint, score 85 | fix_or_document |
| 3 | biome | info | packages/cli/src/list.ts:688:29 | lint, score 85 | fix_or_document |
| 4 | biome | info | packages/cli/src/show.ts:83:11 | lint, score 85 | fix_or_document |
| 5 | biome | info | packages/distill/src/aggregator.ts:32:24 | lint, score 85 | fix_or_document |
