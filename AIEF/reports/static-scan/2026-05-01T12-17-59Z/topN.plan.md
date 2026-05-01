# Top N Fix Plan

- Profile: fast
- Top N: 5
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
| 1 | typescript | high | src/index.ts:25:3 | type-safety, score 1050, high confidence | fix_or_document |
| 2 | biome | high | repository | scanner-failure, score 850 | fix_or_document |
| 3 | pnpm-audit | info | repository | dependency-security, score 285 | fix_or_document |
