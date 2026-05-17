# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | skills/dev-browser/src/snapshot/browser-script.ts:12:13 | lint, score 175 | fix_or_document |
| 2 | biome | low | skills/dev-browser/src/snapshot/browser-script.ts:29:9 | lint, score 175 | fix_or_document |
| 3 | biome | info | packages/archive/src/index.ts:301:13 | lint, score 85 | fix_or_document |
| 4 | biome | info | packages/archive/src/registry.ts:79:11 | lint, score 85 | fix_or_document |
| 5 | biome | info | packages/cli/src/distill.ts:196:7 | lint, score 85 | fix_or_document |
