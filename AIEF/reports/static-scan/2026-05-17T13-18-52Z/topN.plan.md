# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/sinks/github/src/index.test.ts:4:28 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/sinks/github/src/index.ts:123:11 | lint, score 175 | fix_or_document |
| 3 | biome | low | plugins/opencode/src/buffer-manager.ts:89:14 | lint, score 175 | fix_or_document |
| 4 | biome | low | skills/dev-browser/src/client.ts:126:42 | lint, score 175 | fix_or_document |
| 5 | biome | low | skills/dev-browser/src/client.ts:126:61 | lint, score 175 | fix_or_document |
