# Cited Evidence Gate Hardening Constraints

## References

- `AGENTS.md`: Chinese communication, evidence-first, local-first, static scan gate.
- `AIEF/context/tech/engineering-principles.md`: DRY, orthogonality, deep modules, design docs before code.
- `docs/project-ledger.md`: current gate is Cross-Asset Dogfooding distiller repair and re-review.
- `AIEF/openspec/representative-asset-distillers.md`: representative assets require evidence backlinks and review-first delivery.
- `tasks/2026-05-18-representative-field-evidence-gate/plan.md`: high-risk fields must be supported by cited evidence.

## Hard Constraints

- Do not change core workflow branching for one asset type.
- Do not add new asset schemas or sink behavior.
- Do not weaken evidence-required behavior.
- Do not run external sinks or require network access.
- Run focused tests plus the AI completion static scan gate after code changes.
