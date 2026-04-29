# Issue #24: MCP Exposure Layer Boundary Spec

## Purpose

Define a conservative MCP mapping for Loamlog that exposes current capabilities through `resources / tools / prompts` without pretending the project is ready for a full MCP server rollout.

This spec exists to preserve future protocol optionality while keeping the current product focus intact:

```text
AI conversation -> structured evidence -> local issue draft
```

## Problem

Loamlog already has multiple real capabilities in the repository:

- capture and daemon-based intake
- archive query over local session snapshots
- redaction before snapshot persistence
- distill engine execution
- issue-draft generation
- local file sink output
- triggered intelligence batching
- evaluation-harness metrics

At the same time, the repository also has hard constraints:

- redaction is on by default
- evidence backlinks are required
- Phase 1 remains local-first
- external delivery is explicitly gated
- plugin/runtime errors must not crash the host

Without a boundary spec, future MCP work is likely to overreach in one of two directions:

1. exposing roadmap-only capabilities as if they already exist
2. exposing sensitive/raw internal data too early

## Decision

Loamlog's MCP work for Issue #24 is defined as a **mapping/specification task first**, not an implementation commitment.

The MCP layer should initially be designed around:

- already-implemented, local-first, evidence-backed capabilities
- read-first surfaces before broad execution surfaces
- explicit safety gates around redacted vs raw data
- clear separation between canonical internal contracts and protocol-facing wrappers

The first MCP design pass will define resource/tool/prompt mappings, safety boundaries, and phased scope. It will not implement a production MCP server.

## In Scope

### 1. Canonical MCP Surface Types

The following MCP categories are authorized for the design phase:

| Category | Purpose |
|----------|---------|
| `resources` | Read-only access to local summaries, redacted snapshots, distill outputs, and metrics |
| `tools` | Narrow, auditable local execution surfaces backed by existing CLI/runtime behavior |
| `prompts` | Reusable prompt contracts already embodied in stable built-in distillers |

### 2. Candidate Resource Mapping

The initial design may include the following resource identifiers:

| Resource | Backing Reality | Notes |
|----------|-----------------|-------|
| `loam://sessions` | archive query + redacted snapshots | Read archived session summaries or sanitized session content |
| `loam://distill/results` | file sink outputs + `DistillResult` schema | Read local distill outputs such as issue drafts |
| `loam://evaluation/reports` | evaluation harness reports | Read aggregate quality metrics and per-sample summaries |
| `loam://intelligence/batches` | triggered intelligence pipeline batch metadata | Read status summaries, not control-plane execution |
| `loam://config/summary` | loaded runtime config summary | Read non-sensitive config overview only |

### 3. Candidate Tool Mapping

The initial design may include the following tool identifiers:

| Tool | Backing Reality | Notes |
|------|-----------------|-------|
| `run_distill` | CLI distill path + distill engine | Run built-in distillers against selected artifacts |
| `evaluate_distill` | evaluation harness | Run or request distill quality evaluation |
| `preview_issue_draft` | issue-draft distiller + markdown renderer | Generate local preview output without publishing externally |

The following tool may be described as a later-stage candidate but is not required in the first design pass:

| Tool | Backing Reality | Why Later |
|------|-----------------|-----------|
| `capture_session` | capture/daemon/provider path | Higher-control action; not required for the first MCP surface |

### 4. Candidate Prompt Mapping

The initial design may define the following prompt surface:

| Prompt | Backing Reality | Notes |
|--------|-----------------|-------|
| `issue_draft_prompt` | `@loamlog/distiller-issue-draft` prompt contract | Expose the current issue-draft extraction intent/template |

Prompt surfaces must be grounded in existing built-in distillers rather than speculative future prompt templates.

### 5. Protocol Boundary Rules

The design must preserve the following repository-level constraints:

1. unredacted raw session content is never directly exposed
2. external-facing result surfaces preserve evidence backlinks where applicable
3. secret-bearing config values are never exposed through MCP summaries
4. read-only surfaces come before write-capable surfaces
5. protocol mapping stays decoupled from the generic engine/runtime contracts

### 6. Documentation Outputs

This spec authorizes the creation of a design document or follow-up mapping note that includes:

- canonical resource/tool/prompt names
- the backing internal contract for each mapping
- safety tiering (`summary-safe`, `redacted-only`, `internal-only`)
- phased rollout recommendations (`MVP`, `later`)

## Out of Scope

- implementing a production MCP server
- remote SaaS hosting or multi-tenant deployment
- exposing GitHub/Notion write-back actions
- arbitrary action execution or shell-like execution tools
- bypassing sanitizer/redaction rules
- exposing pre-redaction provider payloads
- redefining internal core contracts only to satisfy MCP ergonomics
- treating markdown render outputs as the system source of truth
- broad client compatibility testing across Claude/Cursor/etc.

## Acceptance

The MCP design work for Issue #24 is complete when:

1. a repository spec exists defining the allowed MCP mapping boundary
2. the spec names the first allowed `resources / tools / prompts`
3. the spec explicitly distinguishes:
   - `summary-safe`
   - `redacted-only`
   - `internal-only`
4. the spec states which capabilities are MVP vs later-phase
5. the spec makes clear that current work is design-only, not full server implementation
6. the spec remains consistent with:
   - core contracts
   - redaction requirements
   - evidence-required constraints
   - local-first phase boundaries

## Notes

- This spec intentionally follows the same narrow-boundary style as other `AIEF/openspec/` files.
- MCP should wrap existing internal capabilities; it should not force premature restructuring of the engine, archive, or distiller runtime.
- If future implementation begins, request/response shapes and auth tiering should be specified in a follow-up design step rather than folded into this boundary spec.
