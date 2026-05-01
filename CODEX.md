# Codex Instructions for Loamlog

## Mandatory Quality Gate

After any code implementation, run:

```bash
pnpm run ai:complete
```

Scan reports are saved to `AIEF/reports/static-scan/<run-id>/` and include:
- `scan.raw.log` — raw tool outputs
- `scan.normalized.json` — structured findings
- `topN.plan.md` — ranked Top N selection
- `topN.results.md` — handling status per finding
- `rerun.raw.log` — rerun verification output
- `summary.md` — human-readable summary

## Top N Handling

1. Fix actionable Top N findings
2. Mark others as `deferred`, `false_positive`, `not_actionable`, or `failed`
3. Rerun the gate after fixes
4. Reference the latest report in the final response

## Blocking Conditions

- Typecheck errors in changed files
- Critical/high security findings in changed files
- Existing unrelated findings → document, don't block

## Project Setup

- Language: Chinese for communication, English for code
- Package manager: pnpm (install) / bun (runtime)
- Monorepo with pnpm workspaces
- Test: `node --import tsx --test`
- Read `AGENTS.md` before starting work
