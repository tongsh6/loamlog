# M2 Distill Platform MVP — Implementation Plan

## Goal

Implement the M2 milestone: Distill SDK + plugin loading + demo distiller (pitfall-card) + file sink + CLI `loam distill` command.

**Success criteria** (from `AIEF/context/business/roadmap.md`):
1. Distiller runs per contract
2. Results include evidence backlinks
3. Local candidate output works (file sink)

---

## Scope & Boundaries

### In scope:
- Expand `@loamlog/core` with M2 type exports
- Expand `@loamlog/archive` with read API (`ArtifactQueryClient`)
- New `packages/distill/` — engine core (registry, state, engine, metadata injector, LLM router, sink runner)
- New `packages/distiller-sdk/` — `defineDistiller` + `createEvidence`
- New `packages/distillers/pitfall-card/` — demo distiller using LLM
- New `packages/sinks/file/` — local file output sink
- CLI `loam distill` command
- Fix pre-existing bug in `daemon.ts:96`
- Workspace config updates (pnpm-workspace.yaml, package.json, tsconfig.json)
- Tests for new packages

### Out of scope:
- Multi-provider LLM routing (M3) — MVP uses single OpenAI-compatible provider
- External sinks (GitHub, Notion) — M5
- `loam list` command
- Markdown transcript output
- Web UI

---

## Phase 0: Fix Pre-existing Issues (~15 min)

### 0.1 Fix daemon.ts line 96 bug

**File**: `packages/cli/src/daemon.ts:95-97`

**Current** (broken — `logger()` returns `void`, outer `logger()` receives `void`):
```typescript
logger(
  logger(`[loam daemon] snapshot saved path=${persisted.jsonPath} redacted_count=${redacted.redacted_count}`),
);
```

**Fix**:
```typescript
logger(`[loam daemon] snapshot saved path=${persisted.jsonPath} redacted_count=${redacted.redacted_count}`);
```

**Verification**: `pnpm run build` succeeds (currently fails on this line).

---

## Phase 1: Expand @loamlog/core with Distill Types (~1h)

### 1.1 Add M2 types to `packages/core/src/index.ts`

Add ALL types from `AIEF/context/tech/contracts.md` that belong in core (type-only, no implementations):

```typescript
// ---- M2: Distill Types ----

// SessionArtifact — distiller input format
// NOTE: SessionArtifact.meta uses `loam_version` while SessionSnapshot.meta uses `aic_version`.
// The engine will map aic_version → loam_version when converting snapshots to artifacts.
export interface SessionArtifact { ... }  // from contracts.md lines 9-47
export type ArtifactPart = ...            // from contracts.md lines 49-53

// DistillResultDraft — returned by distiller.run()
export type DistillResultDraft<T = Record<string, unknown>> = { ... }  // contracts.md lines 65-88

// DistillResult — full type after engine metadata injection
export interface DistillResult<T = Record<string, unknown>> { ... }    // contracts.md lines 100-124

// DistillerPlugin interface
export interface DistillerPlugin { ... }     // contracts.md lines 208-230
export interface DistillerContext { ... }     // contracts.md lines 233-241
export type DistillerFactory = (config?: Record<string, unknown>) => DistillerPlugin  // contracts.md line 202

// DistillerRegistry
export interface DistillerRegistry { ... }   // contracts.md lines 251-265

// DistillEngine
export interface DistillEngine { ... }       // contracts.md lines 275-289
export interface DistillReport { ... }       // contracts.md lines 292-299

// AICConfig
export interface AICConfig { ... }           // contracts.md lines 309-341

// Query & State interfaces
export interface ArtifactQueryClient { ... }  // contracts.md lines 374-384
export interface DistillerStateKV { ... }     // contracts.md lines 388-393

// LLM interfaces
export interface LLMProvider { ... }          // contracts.md lines 420-433
export interface LLMRouter { ... }            // contracts.md lines 435-441

// Sink interfaces
export interface SinkPlugin { ... }           // contracts.md lines 399-408
export interface DeliveryReport { ... }       // contracts.md lines 410-414
```

**Decisions**:
- `configSchema` and `payloadSchema` use `JSONSchema7` type as specified in contracts.md. Add `@types/json-schema` as a devDependency to `@loamlog/core`. Export a re-export alias `type { JSONSchema7 } from 'json-schema'` from core for downstream consumers.
- `SessionArtifact` is a separate type from `SessionSnapshot` — the engine converts between them.

**Verification**: `pnpm --filter @loamlog/core run build` succeeds.

---

## Phase 2: Expand @loamlog/archive with Read API (~1.5h)

### 2.1 Add `readSessionSnapshots` to `packages/archive/src/index.ts`

Implement the read side of archive to support `ArtifactQueryClient`:

```typescript
export interface ReadSessionSnapshotsOptions {
  dumpDir: string;
  repo?: string;
  since?: string;   // ISO 8601
  until?: string;    // ISO 8601
  session_ids?: string[];
}

// Returns async iterable of SessionSnapshot (streaming, not all-in-memory)
export async function* readSessionSnapshots(options: ReadSessionSnapshotsOptions): AsyncGenerator<SessionSnapshot>
```

**Implementation details**:
- Scan `{dumpDir}/repos/{repo}/sessions/*.json` (or all repos if `repo` is undefined)
- Also scan `{dumpDir}/_global/sessions/*.json`
- Filter by `since`/`until` using `meta.captured_at`
- Filter by `session_ids` if provided
- Use `node:fs/promises` `readdir` + `readFile`, parse JSON
- Stream one snapshot at a time (AsyncGenerator)

### 2.2 Keep archive package storage-only

- `@loamlog/archive` only handles snapshot IO and filtering.
- `SessionSnapshot -> SessionArtifact` conversion is moved to `@loamlog/distill` (`query.ts`) to keep package boundaries clean.

**Verification**: `pnpm --filter @loamlog/archive run build` succeeds.

---

## Phase 3: New packages/distill/ — Engine Core (~3h)

### 3.1 Package scaffolding

```
packages/distill/
├── package.json       # @loamlog/distill, deps: @loamlog/core, @loamlog/archive
├── tsconfig.json
└── src/
    ├── index.ts       # Public exports
    ├── registry.ts    # DistillerRegistry implementation
    ├── state.ts       # DistillerStateKV implementation (JSON file)
    ├── engine.ts      # DistillEngine implementation
    ├── metadata.ts    # Fingerprint generation + metadata injection
    ├── llm-router.ts  # MVP LLMRouter (single OpenAI-compatible provider)
    ├── sink-runner.ts # Orchestrate sink delivery
    └── query.ts       # ArtifactQueryClient implementation
```

### 3.2 `registry.ts` — DistillerRegistry

```typescript
export function createDistillerRegistry(): DistillerRegistry
```

- `load(specifier, config?)`: Dynamic `import(specifier)`, then:
  1. If default export is `DistillerFactory`, call factory with `config` and register returned plugin
  2. If default export is already `DistillerPlugin`, register directly
  3. Otherwise throw descriptive error (`invalid distiller export`)
- `register(plugin)`: Store by id, validate no duplicates
- `get(id)`, `list()`: Lookup

### 3.3 `state.ts` — DistillerStateKV

```typescript
export function createDistillerStateKV(stateDir: string, distillerId: string): DistillerStateKV
```

- Storage: `{LOAM_DUMP_DIR}/_global/distill_state_{distillerId}.db` (one state file per distiller; MVP internal format is JSON, future migration to SQLite is transparent to consumers)
- Shape: plain KV (no namespace prefix in state layer)
- Atomic write: write to `.tmp` then rename (same pattern as archive)
- `markProcessed`: Store `{ [session_id]: ISO timestamp }`
- `get`/`set`: Generic KV with JSON serialization

### 3.4 `metadata.ts` — Fingerprint + injection

```typescript
export function injectMetadata(draft: DistillResultDraft, distiller: DistillerPlugin, sessionId: string): DistillResult
```

- Generate `id`: UUID v4 (use `crypto.randomUUID()`)
- Generate `fingerprint`: SHA-256 of `distiller.id + sessionId + JSON.stringify(draft.payload)`
- Generate `trace_command` per evidence item by iterating `draft.evidence`:
  `loam trace --session {evidence.session_id} --message {evidence.message_id}`
- Inject `distiller_id`, `distiller_version`

### 3.5 `llm-router.ts` — MVP LLMRouter

```typescript
export function createLLMRouter(config?: AICConfig['llm']): LLMRouter
```

- MVP: Single OpenAI-compatible provider
- Uses `fetch` to call `{base_url}/v1/chat/completions`
- API key from config or `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` env vars
- `route()` returns the single configured provider + model
- Supports `response_format: "json"` with fallback: if provider doesn't support it, parse JSON from text response

### 3.6 `query.ts` — ArtifactQueryClient

```typescript
export function createArtifactQueryClient(dumpDir: string, stateKV: DistillerStateKV, distillerId: string): ArtifactQueryClient
```

- Include `snapshotToArtifact(snapshot)` in `query.ts` (owned by distill package): maps `aic_version` -> `loam_version`
- `getUnprocessed`: Read all snapshots via `readSessionSnapshots`, convert with `snapshotToArtifact`, filter out already-processed (check state)
- `query`: Read with filter, convert with `snapshotToArtifact`

### 3.7 `sink-runner.ts`

```typescript
export async function runSinks(sinks: SinkPlugin[], results: DistillResult[], config: Record<string, unknown>): Promise<DeliveryReport[]>
```

### 3.8 `engine.ts` — DistillEngine

```typescript
export function createDistillEngine(options: { dumpDir: string; config: AICConfig }): DistillEngine
```

- `loadFromConfig`: Iterate `config.distillers`, load each via registry
- `run`: For each distiller:
  1. `initialize(ctx)` if defined
  2. Create `ArtifactQueryClient` + `DistillerStateKV` for this distiller
  3. Call `distiller.run({ artifactStore, llm, state, config })`
  4. For each draft result: `injectMetadata` → dedup by fingerprint → collect
  5. `markProcessed` for all processed sessions
  6. `teardown()` if defined
  7. Run sinks on collected results
  8. Return `DistillReport`
- **Error isolation**: Each distiller wrapped in try/catch, errors recorded in report

**Verification**: `pnpm --filter @loamlog/distill run build` succeeds.

---

## Phase 4: New packages/distiller-sdk/ (~1h)

### 4.1 Package scaffolding

```
packages/distiller-sdk/
├── package.json       # @loamlog/distiller-sdk, deps: @loamlog/core
├── tsconfig.json
└── src/
    └── index.ts       # defineDistiller + createEvidence
```

### 4.2 `defineDistiller`

```typescript
export function defineDistiller<TPayload = Record<string, unknown>>(spec: {
  id: string;
  name: string;
  version: string;
  supported_types: string[];
  configSchema?: JSONSchema7;
  payloadSchema?: Record<string, JSONSchema7>;
  initialize?(ctx: DistillerContext): Promise<void>;
  run(input: { artifactStore: ArtifactQueryClient; llm: LLMRouter; state: DistillerStateKV; config?: Record<string, unknown> }): Promise<DistillResultDraft<TPayload>[]>;
  teardown?(): Promise<void>;
}): DistillerPlugin
```

- NOT a thin wrapper. `defineDistiller` implements the following automated behaviors per ADR-009 & contracts.md:
  1. **Auto-inject context**: wraps `run()` to pass `distiller_id` and `distiller_version` into the run context
  2. **Idempotent state management**: automatically updates watermark after successful `run()` — calls `state.markProcessed()` with all session IDs that were iterated via `artifactStore.getUnprocessed()`
  3. **Namespace isolation**: wraps `state` parameter so all keys are auto-prefixed with `{distiller.id}:` before passing to the underlying `DistillerStateKV`
  4. **Lifecycle pass-through**: delegates `initialize()` and `teardown()` to spec if defined
- Third-party developers write only `id`, `supported_types`, and `run` — all boilerplate is handled by the SDK
- Export composition rule for distiller packages:
  - `defineDistiller(...)` returns a `DistillerPlugin`
  - package default export should be a `DistillerFactory`, e.g. `export default (config) => defineDistiller({...configAwareSpec})`
  - registry also accepts direct `DistillerPlugin` default export for backward compatibility with contract examples

### 4.3 `createEvidence`

```typescript
export function createEvidence(
  artifact: SessionArtifact,
  message: SessionArtifact['messages'][number],
  excerpt: string,
): DistillResultDraft['evidence'][number]
```

- Extracts `session_id` from `artifact.meta.session_id`
- Extracts `message_id` from `message.id`
- Returns `{ session_id, message_id, excerpt }`

**Verification**: `pnpm --filter @loamlog/distiller-sdk run build` succeeds.

---

## Phase 5: New packages/distillers/pitfall-card/ (~2h)

### 5.1 Package scaffolding

```
packages/distillers/pitfall-card/
├── package.json       # @loamlog/distiller-pitfall-card, deps: @loamlog/core, @loamlog/distiller-sdk
├── tsconfig.json
└── src/
    └── index.ts       # PitfallCard distiller
```

### 5.2 PitfallCard distiller implementation

```typescript
import { defineDistiller, createEvidence } from '@loamlog/distiller-sdk'

interface PitfallCardPayload {
  problem: string;
  root_cause: string;
  solution: string;
  prevention: string;
  category: string;
  language?: string;
}

export default defineDistiller<PitfallCardPayload>({
  id: '@loamlog/distiller-pitfall-card',
  name: 'Pitfall Card Extractor',
  version: '0.1.0',
  supported_types: ['pitfall-card'],

  async run({ artifactStore, llm, state }) {
    const results: DistillResultDraft<PitfallCardPayload>[] = [];

    for await (const artifact of artifactStore.getUnprocessed('@loamlog/distiller-pitfall-card')) {
      // Build prompt from artifact messages
      // Include message IDs in prompt so LLM can reference them in evidence
      const prompt = buildPitfallPrompt(artifact);

      // Route to LLM
      const { provider, model } = llm.route({
        task: 'extract',
        budget: 'cheap',
        input_tokens: estimateTokens(prompt),
      });

      // Call LLM
      const response = await provider.complete({
        messages: [
          { role: 'system', content: PITFALL_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        model,
        temperature: 0.3,
        response_format: 'json',
      });

      // Parse response, create results with evidence
      const parsed = parseResponse(response.content);
      for (const pitfall of parsed) {
        results.push({
          type: 'pitfall-card',
          title: pitfall.problem.slice(0, 80),
          summary: `${pitfall.problem} → ${pitfall.solution}`,
          confidence: pitfall.confidence,
          tags: ['pitfall', pitfall.category],
          payload: pitfall,
          evidence: pitfall.evidence_refs.map(ref =>
            createEvidence(artifact, findMessage(artifact, ref.message_id), ref.excerpt)
          ),
        });
      }
    }

    return results;
  },
})
```

**Key design decisions**:
- System prompt instructs LLM to:
  1. Identify pitfalls/errors/bugs from the conversation
  2. Return JSON array with structured pitfall cards
  3. Include `message_id` references for evidence tracing
- Token estimation: simple `content.length / 4` heuristic
- JSON parse fallback: if `response_format: "json"` isn't supported, extract JSON from markdown code block

**Verification**: `pnpm --filter @loamlog/distiller-pitfall-card run build` succeeds.

---

## Phase 6: New packages/sinks/file/ (~1h)

### 6.1 Package scaffolding

```
packages/sinks/file/
├── package.json       # @loamlog/sink-file, deps: @loamlog/core
├── tsconfig.json
└── src/
    └── index.ts       # File sink
```

### 6.2 File sink implementation

```typescript
export default {
  id: '@loamlog/sink-file',
  name: 'File Sink',
  version: '0.1.0',

  supports(resultType: string): boolean {
    return true;  // accepts all types
  },

  async deliver({ results, config }): Promise<DeliveryReport> {
    const dumpDir = config.dump_dir as string;
    // Write each result to:
    // {dumpDir}/distill/{repo}/pending/{result.id}.json
    // Atomic write: tmp → rename
  },
}
```

**Output structure** (from `AIEF/context/tech/architecture.md`):
```
{LOAM_DUMP_DIR}/distill/{repo-name}/pending/{result_id}.json
```

**Verification**: `pnpm --filter @loamlog/sink-file run build` succeeds.

---

## Phase 7: CLI `loam distill` Command (~1h)

### 7.1 Update `packages/cli/src/index.ts`

Add `distill` command alongside `daemon`:

```typescript
if (command === "distill") {
  await runDistillCommand(args);
} else if (command === "daemon") {
  // existing
}
```

### 7.2 New `packages/cli/src/distill.ts`

```typescript
export async function runDistillCommand(args: string[]): Promise<void> {
  // Parse args:
  // --distiller <id>        Filter to specific distiller (optional, default: all)
  // --llm <provider/model>  e.g. "deepseek/deepseek-chat"
  // --dump-dir <path>       Override LOAM_DUMP_DIR
  // --since <ISO>           Process sessions since date
  // --until <ISO>           Process sessions until date
  // --test-session <path>   Run against a single JSON file (dev mode)

  // Load config (loam.config.ts or fallback defaults)
  // Create engine, load distillers, run, report results
}
```

**Output**: Human-readable summary to stdout:
```
[loam distill] Running pitfall-card...
[loam distill] Processed 3 sessions, produced 2 results, skipped 1 (dedup)
[loam distill] Results written to /path/to/distill/repo/pending/
```

**Verification**: `pnpm --filter @loamlog/cli run build` succeeds.

---

## Phase 8: Tests (~2h)

### 8.1 Unit tests for each new package

| Package | Test file | Key tests |
|---------|-----------|-----------|
| `core` | `packages/core/src/index.test.ts` | Type smoke tests (ensure exports exist) |
| `archive` | `packages/archive/src/index.test.ts` | `readSessionSnapshots` with mock data, filter behavior (`repo/since/until/session_ids`) |
| `distill` | `packages/distill/src/*.test.ts` | Registry load/register (factory + direct plugin), StateKV get/set/markProcessed, `snapshotToArtifact`, metadata injection (fingerprint determinism, UUID generation, trace_command per evidence), engine run with mock distiller |
| `distiller-sdk` | `packages/distiller-sdk/src/index.test.ts` | `defineDistiller` returns valid plugin, `createEvidence` extracts correct fields |
| `pitfall-card` | `packages/distillers/pitfall-card/src/index.test.ts` | Factory returns valid plugin, mock LLM response → correct output |
| `sink-file` | `packages/sinks/file/src/index.test.ts` | Write results to temp dir, verify file structure |

### 8.2 Integration test

- End-to-end: Load pitfall-card via registry → feed mock artifact → mock LLM → verify output in file sink

**Verification**: `pnpm run test` passes (new + existing tests).

---

## Phase 9: Build Integration & Workspace Config (~30min)

### 9.1 Update `pnpm-workspace.yaml`

Add new package paths:
```yaml
packages:
  - "packages/*"
  - "packages/providers/*"
  - "packages/distillers/*"
  - "packages/sinks/*"
  - "plugins/*"
```

### 9.2 Update root `package.json`

- `workspaces`: Add `"packages/distillers/*"`, `"packages/sinks/*"`
- `build` script: Add new packages in dependency order:
  `core → archive → distiller-sdk → distill → pitfall-card → sink-file → cli`
- `test` script: Include new test paths
- `typecheck` script: Include new packages

### 9.3 Update root `tsconfig.json`

Add references for new packages:
```json
{
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/archive" },
    { "path": "./packages/providers/opencode" },
    { "path": "./packages/distill" },
    { "path": "./packages/distiller-sdk" },
    { "path": "./packages/distillers/pitfall-card" },
    { "path": "./packages/sinks/file" },
    { "path": "./packages/cli" },
    { "path": "./plugins/opencode" }
  ]
}
```

**Verification**: `pnpm install && pnpm run build && pnpm run test` all pass.

---

## Build Order (Dependency Chain)

```
@loamlog/core                    (no deps)
  ↓
@loamlog/archive                 (→ core)
@loamlog/distiller-sdk           (→ core)
  ↓
@loamlog/distill                 (→ core, archive)
  ↓
@loamlog/distiller-pitfall-card  (→ core, distiller-sdk)
@loamlog/sink-file               (→ core)
  ↓
@loamlog/cli                     (→ core, archive, provider-opencode, distill)
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| `meta.aic_version` vs `meta.loam_version` mismatch | `snapshotToArtifact` (in `@loamlog/distill/query.ts`) explicitly maps; comment documents why |
| JSONSchema7 dependency | Use `JSONSchema7` consistently in `configSchema` and `payloadSchema`; add `@types/json-schema` in core |
| LLM JSON mode not supported by all providers | Fallback: parse JSON from markdown code block in response |
| State file concurrency | One state file per distiller + atomic write (`tmp -> rename`); document MVP assumption: no parallel distill runs for same distiller |
| Corrupt snapshot JSON | Skip malformed file, log warning with file path, continue stream |
| Missing LLM API key / provider timeout | Fail fast on init if key missing; timeout and record distiller error without crashing engine |
| Context window overflow for long sessions | Truncate message content to fit within model's context limit; log warning |
| Dynamic import path resolution in Bun | Test with both relative and absolute paths in CI |
| Build script hardcoded in root package.json | Phase 9 updates it to include all new packages |

---

## Hard Constraints Compliance

| Constraint | How addressed |
|------------|--------------|
| Plugin errors MUST NOT crash host | Engine wraps each distiller in try/catch; errors in DistillReport |
| Redaction ON by default | Artifacts come from archive (already redacted) |
| No writes without LOAM_DUMP_DIR | Engine checks dumpDir before running; CLI exits with error if unset |
| No external delivery without evidence | Engine validates evidence array non-empty before passing to sink |
| Phase 1: local file output only | Only file sink implemented; no external sinks |

---

## Estimated Timeline

| Phase | Effort | Cumulative |
|-------|--------|-----------|
| 0: Fix pre-existing | 15min | 15min |
| 1: Core types | 1h | 1h15m |
| 2: Archive read API | 1.5h | 2h45m |
| 3: Distill engine | 3h | 5h45m |
| 4: Distiller SDK | 1h | 6h45m |
| 5: Pitfall-card | 2h | 8h45m |
| 6: File sink | 1h | 9h45m |
| 7: CLI distill | 1h | 10h45m |
| 8: Tests | 2h | 12h45m |
| 9: Build integration | 30min | **~13h** |
