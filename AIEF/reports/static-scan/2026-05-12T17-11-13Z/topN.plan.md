# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/evaluation-harness/src/index.ts:2:8 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/evaluation-harness/src/metrics.ts:1:8 | lint, score 175 | fix_or_document |
| 3 | biome | low | packages/pipeline/src/index.test.ts:3:34 | lint, score 175 | fix_or_document |
| 4 | biome | low | packages/pipeline/src/index.test.ts:152:40 | lint, score 175 | fix_or_document |
| 5 | biome | low | packages/pipeline/src/index.ts:63:33 | lint, score 175 | fix_or_document |
