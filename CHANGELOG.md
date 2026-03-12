# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
