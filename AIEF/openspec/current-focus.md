# Current Focus Spec

## Purpose

Keep the repository aligned around the current product question without pretending unfinished features already exist.

## Shipped Truth

- Capture, archive, redaction, and local file-based distill already exist in the repository
- Multi-model LLM routing already exists
- Claude Code, Gemini CLI, Codex providers all exist — multi-source abstraction validated
- Architecture DAG Blueprint Phase 0-5 integrated — DAG is default distill mode
- Asset graph quality gate (validateAssetCandidate) integrated into DAG pipeline
- Approval gate (4-layer checks) + audit trail integrated into sink delivery
- GitHub sink, Notion sink implemented with evidence-required safety checks
- `loam review` (approve/reject) command with audit records
- CI quality gate (`pnpm run ai:complete`) with Top N ranking
- 160 tests passing, 0 failures (v0.6.0)
- Dogfooding validation is the current active priority

## Active Product Focus

```text
AI conversation -> structured evidence -> local issue draft
```

This means:

- generate a local issue draft from a single session
- keep the first loop local-first
- validate output quality before automating external delivery

This first loop is now implemented and merged into `develop`. The current focus is evaluating whether it is strong enough to justify the next stage.

## Current Active Threads

- `#5` umbrella and `#9/#10/#11` discovery work
- `#6` auto-skill generation

Completed MVP thread:

- `#7` umbrella — closed
- `#12` issue-draft distiller MVP — closed
- `#13` file sink Markdown output — closed
- `#14` post-implementation docs — closed

## Deferred Topics

- multi-session merge distill
- vector retrieval / semantic search (unlock condition: ≥500 archived sessions)
- Web UI (unlock condition: ≥3 external users requesting it)
- Copilot provider (user uses Copilot; evaluate need after dogfooding phase 1)

## Current Priority: Dogfooding Validation

The product loop is implemented but not yet validated with real usage. The dogfooding validation phase answers: **does this loop provide sustained user value?**

Execution guide: `docs/superpowers/specs/2026-04-29-dogfooding-validation-design.md`

Key decision after validation:
- Quality ≥60% at ≥3/5 → proceed to automated GitHub sink delivery
- Quality below threshold → invest in evaluation-harness + prompt tuning
- Provider issues → bug fixes
- Coverage gaps → add Copilot provider

Close `#5` only after:

- `#9` is done
- `#10` is done
- `#11` is done
