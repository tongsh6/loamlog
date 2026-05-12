# Knowledge Card Quality and Output Language Boundary

> Status: Active boundary spec
> Date: 2026-05-12

## Problem

Dogfooding Phase 2 batch 6 reached the minimum product gate (`6/10 = 60%`) but exposed three quality gaps:

- knowledge cards can be too thin: conclusion without scene, problem, cause, solution, and boundary;
- evidence can fail to support the card claim;
- output language can drift to English even when the project default communication language is Chinese.

The current `knowledge-card` prompt is English-first, while the distill runtime only injects Chinese output instructions when a session is detected as strongly Chinese. Mixed sessions and project-level language rules are not represented.

In parallel, `packages/distill/src/shard.ts > reduceResults` has regressed to a fallback that returns all drafts, breaking shard dedup and low-confidence filtering tests.

## Target State

1. `reduceResults` restores its documented map-reduce behavior:
   - deduplicate results that cite the same evidence `message_id`;
   - deduplicate similar titles;
   - drop single-shard low-confidence results;
   - boost confidence for cross-shard agreement.
2. Distill output language becomes explicit and configurable:
   - `auto`: current language detection behavior;
   - `zh`: force user-facing fields to Chinese;
   - `en`: force user-facing fields to English.
3. Loamlog can set output language at runtime without each distiller implementing its own language detection.
4. `knowledge-card` requires fuller cards:
   - scenario / scene;
   - problem or symptom;
   - cause or reason;
   - solution or practice;
   - boundary or caveat.

## Boundary

In scope:

- Add `output_language` to runtime configuration.
- Add `--output-language zh|en|auto` to `loam distill`.
- Route output language through `packages/distill/src/augment.ts` as a cross-cutting LLM provider wrapper.
- Tighten `knowledge-card` prompt and parse-time quality checks.
- Add focused tests for language injection and card quality filtering.

Out of scope:

- MCP implementation.
- External sink auto-delivery.
- Full multilingual localization of CLI output.
- Rewriting all built-in distiller prompts in this slice.
- Vector search / FTS5 / incremental refinery.

## Data Flow

```text
loam.config.ts / CLI flag
  -> AICConfig.distill.output_language
  -> runDistillWithDAG()
  -> runDistillDAG({ outputLanguage })
  -> processSessionArtifact()
  -> withLanguageRouter(router, effectiveLanguage)
  -> provider.complete(system prompt with output-language instruction)
```

`auto` uses the existing `detectLanguage(artifact)` behavior.

Explicit `zh` or `en` overrides auto detection for user-facing fields. Code identifiers, commands, file paths, API names, and JSON enum fields remain in English when appropriate.

## Acceptance

- `pnpm run test` passes.
- `reduceResults` tests for evidence dedup, title dedup, and low-confidence filtering pass.
- A language-injection test proves explicit `zh` adds a Chinese output instruction even for English/mixed input.
- A language-injection test proves explicit `en` adds an English output instruction for Chinese input.
- A knowledge-card test proves thin cards without enough reusable context are filtered.
- `docs/project-ledger.md` continues to point to this quality gate as the next product hardening step.
