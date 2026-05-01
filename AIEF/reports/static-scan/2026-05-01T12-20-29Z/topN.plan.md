# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | medium | packages/distiller-sdk/src/index.test.ts:21:9 | lint, score 475 | fix_or_document |
| 2 | biome | medium | packages/distiller-sdk/src/index.test.ts:24:9 | lint, score 475 | fix_or_document |
| 3 | biome | medium | packages/distillers/pitfall-card/src/index.test.ts:44:9 | lint, score 475 | fix_or_document |
| 4 | biome | medium | packages/evaluation-harness/src/baseline.ts:110:16 | lint, score 475 | fix_or_document |
| 5 | biome | medium | packages/evaluation-harness/src/baseline.ts:113:14 | lint, score 475 | fix_or_document |
