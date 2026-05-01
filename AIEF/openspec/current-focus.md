# Current Focus Spec

## Purpose

Keep the repository aligned around the current product question without pretending unfinished features already exist.

## Shipped Truth

- Capture, archive, redaction, and local file-based distill already exist in the repository
- Multi-model LLM routing already exists
- Claude Code, Gemini CLI, Codex providers all exist — multi-source abstraction validated
- Architecture DAG Blueprint Phase 0-5 code committed (pipeline, asset graph, approval gate)
- Integration of Phase 3-5 modules into product flow is the next engineering priority

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

- GitHub API delivery
- approval/review workflow
- multi-session merge

## Next-Phase Decision Points

- whether users actually reuse the generated local drafts
- whether issue quality is strong enough to justify GitHub API delivery
- whether the next step should be automation, better ranking, or broader discovery work

Close `#5` only after:

- `#9` is done
- `#10` is done
- `#11` is done
