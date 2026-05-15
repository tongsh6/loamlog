# OpenSpec

This directory is the minimal spec layer for the repository's current active change focus.
本目录是当前活跃变更的轻量规格层，用来记录边界清晰、需要后续实现或评审的设计。

- It is intentionally lightweight.
- It lives under `AIEF/` and does not replace the broader `AIEF/context/` knowledge base.
- It should only track the currently active product change that needs a sharp boundary.

Current specs:

- `current-focus.md` — the active product focus, issue structure, non-goals, and close conditions
- `distill-builtins-boundary.md` — the active architecture refactor for built-in distiller/sink ownership and CLI bootstrap behavior
- `issue-draft-module-boundary.md` — internal module split for `@loamlog/distiller-issue-draft` (issue #28)
- `mcp-exposure-layer.md` — boundary spec for Issue #24, defining conservative MCP resource/tool/prompt mapping without committing to full server implementation
- `representative-asset-distillers.md` — boundary spec for representative AI collaboration asset distillers and the plugin substrate
- `signal-gate.md` — boundary spec for the global Signal Gate between `NormalizedSession` and asset distillers / `NormalizedSession` 与资产萃取器之间的全局信号分级门规格
