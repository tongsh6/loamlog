# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/rules/src/index.test.ts:4:8 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/sanitizer/src/index.ts:2:10 | lint, score 175 | fix_or_document |
| 3 | biome | low | packages/sanitizer/src/index.ts:231:70 | lint, score 175 | fix_or_document |
| 4 | biome | low | packages/sanitizer/src/index.ts:256:6 | lint, score 175 | fix_or_document |
| 5 | biome | low | packages/sanitizer/src/index.ts:282:100 | lint, score 175 | fix_or_document |
