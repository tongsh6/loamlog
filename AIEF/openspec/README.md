# OpenSpec

This directory is the minimal spec layer for the repository's current active change focus.

- It is intentionally lightweight.
- It lives under `AIEF/` and does not replace the broader `AIEF/context/` knowledge base.
- It should only track the currently active product change that needs a sharp boundary.

Current specs:

- `current-focus.md` — the active product focus, issue structure, non-goals, and close conditions
- `distill-builtins-boundary.md` — the active architecture refactor for built-in distiller/sink ownership and CLI bootstrap behavior
- `issue-draft-module-boundary.md` — internal module split for `@loamlog/distiller-issue-draft` (issue #28)
