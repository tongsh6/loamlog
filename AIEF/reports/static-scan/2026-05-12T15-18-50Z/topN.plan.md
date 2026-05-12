# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/distillers/issue-draft/src/parse.ts:11:7 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/distillers/knowledge-card/src/index.ts:104:6 | lint, score 175 | fix_or_document |
| 3 | biome | low | packages/distillers/pitfall-card/src/index.ts:58:7 | lint, score 175 | fix_or_document |
| 4 | biome | low | packages/distillers/prd-draft/src/index.ts:79:7 | lint, score 175 | fix_or_document |
| 5 | biome | low | packages/evaluation-harness/src/baseline.ts:1:8 | lint, score 175 | fix_or_document |
