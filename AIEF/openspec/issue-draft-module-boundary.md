# Issue #28: Distiller Issue-Draft Module Boundary

## Purpose

Define the internal module structure for `@loamlog/distiller-issue-draft` to prevent `index.ts` from accumulating responsibilities while preserving all existing public behavior.

## Problem

The current `packages/distillers/issue-draft/src/index.ts` (306 lines) contains:

- Prompt construction with message chunking and token estimation
- JSON extraction from fenced code blocks or raw text
- Issue kind and label normalization with supported-values validation
- Evidence mapping from LLM refs to core evidence objects with deduplication
- Candidate selection with confidence scoring and tie-breaking
- Markdown rendering with structured sections
- Tag generation based on issue kind and labels
- Final distiller orchestration coordinating all of the above

This concentration makes the file harder to reason about, test in isolation, and extend without side effects.

## Decision

Split the implementation into focused internal modules. `index.ts` becomes a thin orchestration layer that wires dependencies and delegates to specialized modules. No public API changes. No behavioral changes. Only internal organization.

## In Scope

### Allowed Module Split

The following internal modules are authorized:

| Module | Responsibility |
|--------|----------------|
| `prompt.ts` | Build the LLM prompt from session artifact; message chunking; token estimation |
| `parse.ts` | Extract JSON from LLM response (fenced blocks or raw); validate and parse issue drafts |
| `evidence.ts` | Map LLM evidence refs to core evidence objects; validate message existence; deduplicate |
| `select.ts` | Score candidates by confidence and evidence count; apply tie-breaking; select best |
| `render.ts` | Generate markdown output from selected issue draft and evidence; tag generation |
| `types.ts` | Shared internal type definitions (if needed for cross-module types) |
| `constants.ts` | Shared constants like `MAX_MESSAGE_CHARS`, `SUPPORTED_ISSUE_KINDS`, `SYSTEM_PROMPT` |
| `index.ts` | Thin orchestration: wire modules, coordinate flow, expose public distiller factory |

### Preserved Behavior

All of the following must remain identical:

- Public distiller ID: `@loamlog/distiller-issue-draft`
- Exported factory function signature
- `DistillResultDraft` output shape and field values
- Markdown render output format and section order
- Confidence scoring logic (confidence desc, then evidence count desc, then title asc)
- Evidence validation rules (message must exist, excerpt non-empty, deduplication by message_id:excerpt)
- Issue kind normalization (filter to supported set: bug, feature, docs, refactor, chore)
- Label normalization (trim, filter empty, deduplicate)
- Blank title rejection
- Token estimation (ceil(length / 4))
- Message chunking at `MAX_MESSAGE_CHARS`
- JSON extraction from ```json fences or raw text
- System prompt content

### Test Preservation

All existing tests in `index.test.ts` must keep passing after the refactor:

- Valid draft generation with complete payload
- Missing evidence rejection (refs pointing to non-existent messages)
- Best-candidate selection from multiple LLM outputs
- Blank title rejection even with valid evidence
- Deterministic tie-breaking for equal confidence
- Malformed evidence ref handling without throwing

## Out of Scope

- GitHub API delivery or sink changes
- Ranking algorithm improvements
- New distiller output types
- External configuration of supported issue kinds or labels
- Changes to evidence backlink format
- Performance optimizations
- Changes to existing behavior validation tests (must stay green as-is)

## Acceptance

The implementation is complete when:

1. `packages/distillers/issue-draft/src/index.ts` is under 100 lines and contains only orchestration logic
2. All new internal modules exist with single, clear responsibilities
3. `pnpm run build` passes without errors
4. `pnpm run test` passes with all `index.test.ts` tests green
5. `index.test.ts` tests still pass (unchanged or updated to reflect moved logic, no behavior changes)
6. New focused tests may be added for internal modules when they clarify module-level responsibilities
7. Public package exports remain identical

## Notes

- Internal modules are not exported publicly; they are implementation details
- The split should make unit testing individual concerns easier; focused module tests are allowed when they improve clarity, but not required
- Keep imports between internal modules explicit and avoid circular dependencies
- Consider co-locating types with their primary consumer module if only used once; use `types.ts` only for genuinely shared definitions
