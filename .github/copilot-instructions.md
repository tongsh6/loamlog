# GitHub Copilot Instructions for Loamlog

## Quality Gate (Mandatory)

After completing any code implementation, run the static scan gate:

```bash
pnpm run ai:complete              # Fast profile (typecheck + lint + audit)
pnpm run ai:complete:security     # Security profile (adds Gitleaks + Semgrep)
```

Reports are saved to `AIEF/reports/static-scan/<run-id>/`.

## Top N Remediation

Default `TOP_N=5`. After the scan:
1. Fix actionable findings
2. Mark unfixable ones as `deferred`, `false_positive`, `not_actionable`, or `failed` in `topN.results.md`
3. Rerun `pnpm run ai:complete` and reference the latest report

## Code is NOT complete without

- [ ] `pnpm run ai:complete` report exists
- [ ] `topN.results.md` has handling status for each Top N item
- [ ] Rerun verification completed
- [ ] Final response references the latest scan report path

## Project Conventions

- Communication: Chinese
- Code, commands, commits: English
- Package manager: pnpm
- Test runner: Node.js native test runner (`node --import tsx --test`)
- Read `AGENTS.md` and `AIEF/context/tech/engineering-principles.md` before designing
