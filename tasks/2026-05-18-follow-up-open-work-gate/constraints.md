# Constraints

## References

- `AGENTS.md` project rules: Chinese communication, design docs before behavior changes, evidence-first, AI completion quality gate.
- `AIEF/context/tech/engineering-principles.md`: DRY, open-closed design, orthogonality, cross-cutting aspects, deep modules, performance awareness.
- `docs/project-ledger.md`: current highest priority is Cross-Asset Dogfooding quality repair, not new platform surface.
- `AIEF/reports/dogfooding/2026-05-15-representative-assets-batch1-review.md`: `follow-up-work-item` No-Go and failure modes.
- `AIEF/openspec/representative-asset-distillers.md`: follow-up assets must be executable or verifiable future work and must stay review-first.

## Hard constraints

- Do not implement MCP, dashboard, external delivery automation, or new asset types.
- Do not move follow-up quality rules into CLI or sinks.
- Do not accept candidates without valid evidence.
- Do not broaden filters so much that valid Chinese project follow-up items such as "继续推进 / 后续验证" are lost.
- Run the AI completion gate and rerun after handling Top N.

## Verification

- Focused tests for `@loamlog/distiller-representative-assets`.
- Full `pnpm run test`.
- Full `pnpm run build`.
- `pnpm run ai:complete`, Top N review, and rerun.
