# Aggregator Type Boundary Repair Constraints

## References

- `docs/project-ledger.md` — current Product Gate and Cross-Asset Dogfooding
  priority.
- `AIEF/context/tech/engineering-principles.md` — design docs before code,
  orthogonality, deep modules, vertical slices.
- `AIEF/reports/dogfooding/2026-05-15-representative-assets-batch1-review.md`
  — cross-type duplicate topics and wrong-type assets are a known failure mode.
- `packages/distill/src/aggregator.ts` — affected module.

## Hard constraints

- Preserve local-first and evidence-first behavior.
- Do not change sink contracts or external delivery behavior.
- Do not add a broad cross-type arbitration feature in this bug fix.
- Do not collapse different `candidate_type` or `distiller_id` values by title
  similarity alone.
- Run the AI completion gate and rerun after implementation.

## Verification target

- Focused: `node --import tsx --test packages/distill/src/aggregator.test.ts`
- Full: `pnpm run test`
- Build: `pnpm run build`
- Static gate: `pnpm run ai:complete` twice, with Top N handling if findings
  appear.
