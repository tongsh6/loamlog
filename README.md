# Loamlog

**Turn every AI interaction into a compounding asset.**

**English** | [中文](./README.zh.md)

> Like sediment building up over time — your AI conversations accumulate into layers of reusable knowledge.

Loamlog is a standalone platform that automatically captures sessions from AI coding tools (OpenCode, Claude Code, Cursor, ...) and transforms them into structured, reusable assets — issue drafts, PRD drafts, knowledge cards, and more — through a pluggable distill engine with multi-model routing.

---

## Why Loamlog?

Most AI interactions are one-time consumption. You get an answer, close the tab, and the context evaporates.

Loamlog breaks this pattern across three layers:

| Gap | Problem | Loamlog's Answer |
|-----|---------|-----------------|
| **Capture** | Manual export misses data; streaming updates break file-based capture | Daemon-based automatic capture via provider adapters |
| **Organization** | Artifacts scattered, no repo/branch/commit context | Snapshot archive bucketed by repo, with full trace metadata |
| **Transformation** | No pipeline from conversations to issues, PRDs, or knowledge | Pluggable distill engine with LLM routing and evidence backlinks |

---

## Architecture

```
AI Tools          Capture Layer        Distill Engine       Sinks
─────────────     ─────────────────    ─────────────────    ──────────
OpenCode     ──►  loam daemon       ►  LLM Router        ►  file
Claude Code  ──►  JSON snapshot        multi-model           github*
Cursor*      ──►  redaction            multi-distiller       notion*
             ──►  repo context

                                    (* = planned)
```

**Core principles:**
- **Providers pluggable** — `ProviderAdapter` interface; any AI tool can be a data source
- **Models pluggable** — `LLMRouter` dispatches to OpenAI / Anthropic / DeepSeek / Ollama / ...
- **Distillers pluggable** — `DistillerPlugin` interface; anyone can write an extractor
- **Sinks pluggable** — `SinkPlugin` interface; local file, GitHub, Notion, ...
- **Evidence required** — `DistillResult` must link back to `session_id` + `message_id` + source text

---

## Current Direction

As of 2026-03-13, Loamlog has completed **Milestone A: Trust Infrastructure**, adding three critical capabilities:

- **Sanitization Gateway** — sensitive data redaction before AI processing
- **Triggered Intelligence Pipeline** — threshold-based, async, rate-limited distill
- **Evaluation Harness** — quality metrics for distill accuracy

The main product question is now: "Is the first flow stable enough to justify Stage 2 automation?"

- **Shipped today** — capture, archive, redaction, trigger, evidence-backed distill, evaluation, and file-based local output
- **Current product focus** — stabilize the first killer flow: `AI conversation -> structured evidence -> local issue draft`
- **Planned next** — MCP Exposure Layer design (Milestone B) and GitHub API sink (Stage 2)

---

## Project Structure

```
loamlog/
├── packages/
│   ├── core/               # Core types & interface contracts
│   ├── archive/            # Unified storage (write / redact / fingerprint)
│   ├── sanitizer/          # Log sanitization gateway (Milestone A)
│   ├── trigger/            # Triggered intelligence pipeline (Milestone A)
│   ├── evaluation-harness/ # Quality evaluation framework (Milestone A)
│   ├── providers/
│   │   ├── opencode/       # OpenCode data source adapter
│   │   └── claude-code/    # Claude Code transcript adapter
│   ├── distill/            # Distill engine + LLM router
│   ├── distillers/         # Built-in distillers
│   ├── sinks/              # Output adapters
│   └── cli/                # CLI entry point (loam)
└── plugins/
    └── opencode/           # Thin OpenCode bridge plugin (event forwarding only)
```

---

## Current Status

| Milestone | Goal | Status |
|-----------|------|--------|
| M0 | Validate OpenCode event/payload pipeline | ✅ Completed |
| M1 | Capture layer MVP — auto-archive sessions | ✅ Completed |
| M2 | Distill platform MVP — pitfall-card distiller | ✅ Completed |
| M3 | Multi-model LLM routing | ✅ Completed |
| **Milestone A** | **Trust Infrastructure** — sanitization, trigger, evaluation | ✅ **Completed** |
| M4 | Multi-source providers (Claude Code, ...) | ◐ Landed in repo, needs follow-up hardening |
| M5 | Ecosystem — sinks, approve flow, more distillers | ⏳ Planned |

The capture pipeline is fully runnable end-to-end:

```
OpenCode plugin → POST /capture → loam daemon → provider pull → redaction → atomic JSON snapshot
```

The distill pipeline is now runnable end-to-end:

```bash
loam distill --distiller @loamlog/distiller-pitfall-card --llm deepseek/deepseek-chat
```

The current router supports provider/model pairs such as:

```bash
loam distill --llm openai/gpt-4o-mini
loam distill --llm anthropic/claude-3-5-haiku-latest
loam distill --llm deepseek/deepseek-chat
loam distill --llm ollama/llama3.2:3b
```

The next product-facing loop being specified is local issue-draft generation:

```text
AI conversation -> structured evidence -> local issue draft (.json + .md)
```

---

## Quick Start

### Requirements

- [Node.js](https://nodejs.org/) ≥ 20 or [Bun](https://bun.sh/) ≥ 1.0
- [pnpm](https://pnpm.io/) ≥ 9 (development)
- OpenCode installed and running (for the OpenCode provider)

### Install & Build

```bash
git clone https://github.com/tongsh6/loamlog.git
cd loamlog
pnpm install
pnpm run build
```

### Run the capture daemon

```bash
# Set the archive directory
export LOAM_DUMP_DIR=~/loamlog-archive

# Start the daemon (connects to OpenCode's local HTTP API)
loam daemon --providers opencode
```

The daemon listens on `http://127.0.0.1:37468` by default and captures sessions whenever OpenCode becomes idle.

### Install the OpenCode plugin

The `opencode-loamlog` plugin forwards session idle events to the `loam` daemon. Install it globally so OpenCode can discover it:

```bash
npm install -g opencode-loamlog
```

Add the plugin to your global `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["opencode-loamlog@latest"]
}
```

**Troubleshooting:**
- **Daemon URL**: By default, it connects to `http://127.0.0.1:37468`. Override via `LOAM_DAEMON_URL` environment variable if needed.
- **Logs**: Check `/tmp/loamlog-debug.log` to verify initialization and event capture.

npm: https://www.npmjs.com/package/opencode-loamlog

### Development workflow

- Branches follow `feature/* -> develop -> master`
- `develop` is the default PR target; `master` is the stable release branch
- `develop` and `master` are protected; PRs and green `Test & Typecheck` are required in normal flow
- Merged branches are auto-deleted on GitHub

### Browse your archive

`loam list` is planned but not implemented yet. Until then, inspect the archive directly on disk.

Snapshots are organized as:

```
$LOAM_DUMP_DIR/
└── repos/
    └── my-project/
        └── sessions/
            └── 2026-03-02T00-00-00-000Z-ses_abc123.json
```

### Generate a local issue draft

Run the built-in issue-draft distiller explicitly:

```bash
loam distill --distiller @loamlog/distiller-issue-draft --llm deepseek/deepseek-chat
```

Built-in plugin ownership lives in `@loamlog/cli`: the CLI keeps user-facing names (for example `@loamlog/distiller-issue-draft` and `@loamlog/sink-file`) and normalizes them to runtime-loadable file URL specifiers before handing config to the generic distill engine.

If you want to make it part of your default config, add it to `loam.config.ts`:

```ts
export default {
  dump_dir: process.env.LOAM_DUMP_DIR,
  distillers: ["@loamlog/distiller-issue-draft"],
  sinks: ["@loamlog/sink-file"],
};
```

When a draft is produced, Loamlog writes both files into `distill/<repo>/pending/`:

```text
$LOAM_DUMP_DIR/
└── distill/
    └── my-project/
        └── pending/
            ├── <result-id>.json
            └── <result-id>.md
```

The `.json` file contains the full structured result, including evidence and payload. The `.md` file contains the GitHub-ready draft body from `render.markdown`.

Current scope is still local-first: Loamlog writes local draft files, but does not create GitHub issues automatically yet.

---

## Redaction

Sensitive data is redacted **by default** before any snapshot is written:

| Pattern | Replacement |
|---------|-------------|
| `sk-...` (OpenAI keys) | `[REDACTED:openai-token]` |
| `ghp_...` (GitHub tokens) | `[REDACTED:github-token]` |
| `AKIA...` (AWS keys) | `[REDACTED:aws-key]` |
| `Bearer ...` headers | `[REDACTED:bearer-token]` |
| Paths containing `auth`, `credentials`, `.env` | `[REDACTED:sensitive-path]` |

To opt out of specific patterns:

```bash
export LOAM_REDACT_IGNORE="my-safe-pattern;another-pattern"
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOAM_DUMP_DIR` | — | **Required.** Directory where snapshots are written. No writes if unset. |
| `LOAM_REDACT_IGNORE` | — | Semicolon-separated regex patterns to exclude from redaction. |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:4096` | OpenCode HTTP API base URL. |
| `OPENCODE_SERVER_TOKEN` | — | Bearer token for OpenCode API auth. |
| `OPENCODE_DIRECTORY` | — | Working directory hint for OpenCode. |

---

## Writing a Custom Distiller

This section documents the released M2 distiller SDK API.

```typescript
// my-distiller/index.ts
import { defineDistiller, createEvidence } from '@loamlog/distiller-sdk'

export default defineDistiller({
  id: '@my-org/find-todos',
  name: 'TODO Extractor',
  version: '1.0.0',
  supported_types: ['todo-item'],

  async run({ artifactStore }) {
    const results = []

    for await (const artifact of artifactStore.getUnprocessed('@my-org/find-todos')) {
      for (const msg of artifact.messages) {
        if (msg.role === 'user' && msg.content?.includes('TODO:')) {
          results.push({
            type: 'todo-item',
            title: 'Found TODO in session',
            summary: (msg.content ?? '').slice(0, 80),
            confidence: 1.0,
            tags: ['todo'],
            payload: { raw_text: msg.content },
            evidence: [createEvidence(artifact, msg, msg.content ?? '')],
          })
        }
      }
    }

    return results
  },
})
```

Register it in `loam.config.ts`:

```typescript
export default {
  dump_dir: process.env.LOAM_DUMP_DIR,
  distillers: ['./my-distiller'],
}
```

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Typecheck
pnpm run typecheck
```

### Package structure

| Package | Description |
|---------|-------------|
| `@loamlog/core` | Core TypeScript types and interface contracts |
| `@loamlog/archive` | Session snapshot writer with atomic writes and redaction |
| `@loamlog/provider-opencode` | Fetches sessions from OpenCode's local HTTP API |
| `@loamlog/cli` | CLI entry point (`loam` command) |
| `@loamlog/plugin-opencode` | Thin bridge plugin — forwards OpenCode idle events to daemon |

---

## Hard Constraints

- **Plugin errors MUST NOT crash the host tool** — all errors are caught and logged
- **Redaction is ON by default** — tokens, keys, and sensitive paths are auto-replaced
- **No writes without `LOAM_DUMP_DIR`** — explicit opt-in required
- **No external delivery without evidence** — `DistillResult` without evidence backlinks cannot enter external sinks
- **Phase 1: local file output only** — external sinks require explicit opt-in

---

## Roadmap

The unified documentation base directory is `AIEF/`:

- `AIEF/context/` for long-term context, ADRs, roadmap, and retrospectives
- `AIEF/plans/` for execution plans
- `AIEF/openspec/` for the lightweight current-change spec layer

See [`AIEF/context/business/roadmap.md`](AIEF/context/business/roadmap.md) for the full milestone breakdown.

---

## Contributing

Contributions are welcome. A few guidelines:

1. **Language**: Code, identifiers, and git commits in English. Communication in whatever language you prefer.
2. **Evidence required**: Any distiller contribution must include evidence backlinks — results without source attribution won't be accepted.
3. **No host crashes**: Plugin errors must be caught; they must never propagate to crash the parent process.
4. **Tests**: New behavior should come with tests.

Open an issue to discuss before submitting large changes.

---

## License

MIT

---

*"Turn every AI interaction from one-time consumption into compounding assets."*
