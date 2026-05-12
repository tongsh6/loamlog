# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | medium | skills/dev-browser/src/index.ts:266:11 | lint, score 475 | fix_or_document |
| 2 | biome | medium | skills/dev-browser/src/index.ts:273:13 | lint, score 475 | fix_or_document |
| 3 | biome | medium | skills/dev-browser/src/snapshot/__tests__/snapshot.test.ts:39:7 | lint, score 475 | fix_or_document |
| 4 | biome | low | packages/cli/src/list.ts:343:9 | lint, score 175 | fix_or_document |
| 5 | biome | low | packages/cli/src/m0-e2e.test.ts:126:12 | lint, score 175 | fix_or_document |
