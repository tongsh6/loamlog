# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | biome | low | packages/distill/src/dag-runner.test.ts:512:7 | lint, score 175 | fix_or_document |
| 2 | biome | low | packages/distill/src/dag-runner.test.ts:514:47 | lint, score 175 | fix_or_document |
