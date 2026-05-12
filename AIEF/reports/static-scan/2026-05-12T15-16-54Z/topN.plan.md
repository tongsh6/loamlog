# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/distill/src/store.ts:44:35 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/distill/src/store.ts:57:12 | lint, score 175 | fix_or_document |
| 3 | biome | low | packages/distill/src/store.ts:58:41 | lint, score 175 | fix_or_document |
| 4 | biome | low | packages/distill/src/store.ts:65:12 | lint, score 175 | fix_or_document |
| 5 | biome | low | packages/distill/src/verifier/git-gap.test.ts:6:8 | lint, score 175 | fix_or_document |
