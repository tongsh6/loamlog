# Top N Fix Results

Every selected finding must end with one of: fixed, deferred, false_positive, not_actionable, failed.

| Rank | Status | Handling | Verification |
|---|---|---|---|
| 1 | fixed | Added the missing `DistillerStateKV.update` namespace proxy in `packages/distiller-sdk/src/index.ts`. | `pnpm run ai:complete` at `2026-05-01T12-19-25Z` showed typecheck exit 0. |
| 2 | fixed | Fixed the scan runner so Biome JSON stdout is parsed as structured findings instead of a scanner failure. | `pnpm run ai:complete` at `2026-05-01T12-19-25Z` produced Biome findings instead of a scanner-failure finding. |
| 3 | fixed | Upgraded `yaml` in `packages/rules/package.json` to `^2.8.3` and refreshed `pnpm-lock.yaml`. | `pnpm run ai:complete` at `2026-05-01T12-19-25Z` showed `pnpm-audit` exit 0. |
