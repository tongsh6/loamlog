# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-05-11

### Refinery Pipeline — Industrial Mining Architecture

This release transforms loamlog's architecture from a linear "capture → distill" pipeline into an industrial four-workshop refinery: **Crushing (Normalizer) → Beneficiation (Distiller) → Smelting (Verifier) → Refining (Aggregator)**.

**Tracking issue:** [#56](https://github.com/tongsh6/loamlog/issues/56)

### Added

- **Refinery Pipeline (VS-01~04)** — four-workshop architecture in `packages/distill`:
  - **Normalizer** (`normalizer.ts`): noise stripping, context injection, reasoning isolation
  - **Verifier** (`verifier/git-gap.ts` + `log-weave.ts`): dual-check evidence verification against real Git history
  - **Aggregator** (`aggregator.ts`): cross-session semantic clustering with token-Jaccard merging
  - **Foundations** (`store.ts` + `registry.ts`): persistent asset store and temporal evidence index
- **DAG runtime** (`dag-runner.ts`): typed 4-node pipeline (query → distill → process → deliver) as the default distill mode
- **Knowledge-card distiller v0.2** — noise-filter-first prompt that reduced false positives by 90% (3 sessions: 20 cards → 2 cards)
- **Large-session shard/map-reduce** (`shard.ts`): automatic sharding for sessions exceeding model context window
- **Issue-draft v2** — parts data, multi-output, target_repo support
- **Pre-LLM filter framework** — engine-level noise gate applied before any LLM call
- **Processing journal** — per-session visible trace for every distilled session
- **`loam show <id>`** — human-readable card detail (title, summary, detail, evidence excerpts, verification status)
- **`loam list --format md`** — render all pending cards as markdown for review
- **`--max-sessions` / `--skip-larger-than`** — CLI flags for controlling distill batch size
- **Continuous mining mode** — daemon `--backfill-on-startup` for processing all unprocessed sessions
- **OpenCode/Codex/Gemini-CLI watchers** — active file-system watchers for all 4 providers

### Changed

- DAG is the default distill mode (`--legacy` to opt out)
- Asset graph quality gate (`validateAssetCandidate`) integrated into DAG pipeline
- Approval gate (4-layer checks) + audit trail integrated into sink delivery
- Sinks (`file`, `github`, `notion`) require evidence before delivery
- CLI distill help updated with all new flags

### Fixed

- **Compile regression** — `pnpm -r build` was broken on develop (3 TS errors: refine typing, QualityReport.name)
- **Session snapshot duplication** — `getUnprocessed` now coalesces by session_id (2090 snapshots → 49 unique, matching reality)
- **`--max-sessions` cap bug** — cap now counts LLM-completed sessions, not prefilter/oversize skips
- **Aggregator under-merge** — 12 verified assets (4 Tauri, 2 traceability duplicates) now correctly collapsed to 7 refined
- Streaming per-session sink delivery prevents data loss on downstream timeouts
- Per-session error resilience — one session's LLM failure no longer kills the entire DAG

### Governance

- **Project ledger** (`docs/project-ledger.md` §0): authoritative Product Gate — code closed ✅ / product validation pending ⚠️
- `AIEF/openspec/current-focus.md` now links to ledger §0 to prevent drift
- **Dogfooding Phase 1**: 1,304 sessions across 4 providers, 72h+ daemon uptime
- **Dogfooding Phase 2**: 12 verified → 10 refined knowledge-cards, 0 errors, LM Studio `gpt-oss-120b`
- **GitHub issue cleanup**: #15, #16, #17, #19, #21 closed (superseded by refinery work)

---

## [0.5.0] - 2026-04-30

### Multi-Provider Active Collection + loam list CLI

This release adds active file-system watchers for all 4 AI tools and a `loam list` command for browsing sessions.

### Added

- **`loam list` command** — browse captured sessions and distill results with filtering (`--repo`, `--since`, `--distill`, `--pending`, `--json`)
- **Gemini CLI provider** (`@loamlog/provider-gemini-cli`) — file-system watcher for `~/.gemini/tmp/*/chats/session-*.json`
- **Codex CLI provider** (`@loamlog/provider-codex`) — JSONL session parser + file watcher for `~/.codex/sessions/`
- **OpenCode SQLite watcher** — active session discovery via `opencode.db`, no plugin required

### Changed

- All 4 providers (opencode, claude-code, gemini-cli, codex) now use active watcher-based collection
- `loam list` no longer infers repo from current directory; `--repo` flag is explicit

### Fixed

- Suppressed Node.js SQLite experimental warning in `loam` CLI wrapper

## [0.4.0] - 2026-03-13

### Milestone A: Trust Infrastructure ✅

This release completes **Milestone A: Trust Infrastructure**, adding three critical foundational capabilities to Loamlog.

### Added

#### 1. Sanitization Gateway (`@loamlog/sanitizer`)
- **Issue**: #26
- **PR**: #39
- **Features**:
  - Pre-processing log sanitization before AI analysis
  - Sensitive data pattern recognition (API keys, tokens, emails, phone numbers)
  - Semantic placeholder replacement (e.g., `sk-***` → `[API_KEY:OPENAI]`)
  - Audit summary generation (count, type distribution, risk level)
  - Support for structured content redaction (JSON, YAML, HTTP headers, Shell, Markdown)

#### 2. Triggered Intelligence Pipeline (`@loamlog/trigger`)
- **Issue**: #22
- **PR**: #41
- **Features**:
  - Threshold-based triggering (frequency, severity, semantic, manual)
  - Asynchronous batch processing with configurable batch size and wait time
  - Performance isolation and rate limiting (max pending: 50)
  - Degradation and circuit breaker mechanisms
  - Decoupled from CLI for reusability

#### 3. Evaluation Harness (`@loamlog/evaluation-harness`)
- **Issue**: #23
- **PR**: #37
- **Features**:
  - Quality evaluation framework for signal extraction
  - Issue draft quality assessment
  - Support for comparing different rule/prompt/model versions
  - Baseline metrics and reporting
  - MVP sample dataset included

### Changed

- Updated README.md and README.zh.md with Milestone A documentation
- Updated AIEF business documentation (current-focus.md, roadmap.md)
- Project structure now includes three new packages in packages/

### Technical Details

- All three packages follow the modular, pluggable architecture
- Each package has complete TypeScript types and test coverage
- Integrated into the monorepo workspace configuration
- CLI updated to support new packages

### Migration Notes

No breaking changes. Existing functionality remains unchanged. New features are additive.

## [0.3.0] - Previous Release

- Multi-model LLM routing (M3)
- Multi-source providers (Claude Code)
- Core capture, archive, distill functionality

---

[0.4.0]: https://github.com/tongsh6/loamlog/compare/v0.3.0...v0.4.0
