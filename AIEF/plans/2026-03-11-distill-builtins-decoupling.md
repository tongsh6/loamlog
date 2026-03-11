# Distill Built-ins Decoupling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple `@loamlog/distill` from direct built-in distiller/sink package dependencies while preserving current runtime plugin loading behavior.

**Architecture:** Keep `@loamlog/distill` as the generic dynamic-loading engine and move built-in plugin dependency ownership plus default specifier normalization into `@loamlog/cli`. Do not introduce a second plugin registration model or a new built-ins framework package in this refactor.

**Tech Stack:** TypeScript, pnpm workspaces, dynamic `import()`, existing CLI/config loading and distill registry.

---

### Task 1: Define the new responsibility boundary

**Files:**
- Modify: `packages/distill/package.json`
- Modify: `packages/cli/package.json`
- Review: `AIEF/context/business/decisions.md`

**Step 1: Write the failing expectation**

Capture the intended boundary in tests/comments before code changes:

- `@loamlog/distill` should not own built-in package dependencies
- `@loamlog/cli` should own the built-in distiller/sink availability needed by default CLI execution

**Step 2: Run a baseline verification**

Run: `pnpm run build && pnpm run test && pnpm run typecheck`
Expected: PASS before refactor starts.

**Step 3: Move dependency ownership**

- Remove built-in plugin dependencies from `packages/distill/package.json`
- Add the required built-in packages to `packages/cli/package.json`

**Step 4: Re-run verification**

Run: `pnpm install && pnpm run build`
Expected: build may fail until CLI/bootstrap normalization is updated in later tasks.

### Task 2: Add CLI-side built-in specifier normalization

**Files:**
- Modify: `packages/cli/src/distill.ts`
- Review: `packages/distill/src/engine.ts`
- Review: `packages/distill/src/registry.ts`

**Step 1: Write the failing test**

Add CLI-focused tests proving that when config/defaults reference built-in packages such as `@loamlog/distiller-pitfall-card` and `@loamlog/sink-file`, CLI bootstrapping resolves them into loadable specifiers without requiring `@loamlog/distill` to depend on those packages directly.

**Step 2: Run the focused test to verify it fails**

Run: `node --import tsx --test "packages/cli/src/distill.test.ts"`
Expected: FAIL until normalization/bootstrap logic exists.

**Step 3: Implement minimal normalization**

- Add a small built-in mapping/normalization helper in `packages/cli/src/distill.ts`
- Keep `packages/distill/src/engine.ts` and `packages/distill/src/registry.ts` generic
- Preserve support for three ADR-008 input styles: built-in package name, third-party npm package, local path

**Step 4: Re-run focused tests**

Run: `node --import tsx --test "packages/cli/src/distill.test.ts" "packages/distill/src/index.test.ts"`
Expected: PASS with built-in loading still working and generic engine behavior unchanged.

### Task 3: Preserve runtime loading guarantees

**Files:**
- Modify: `packages/distill/src/index.test.ts`
- Modify: `packages/cli/src/distill.test.ts`
- Modify: `pnpm-lock.yaml`

**Step 1: Strengthen tests**

Ensure the suite covers:

- default CLI execution with built-in distiller/sink
- explicit package-specifier loading for built-ins through the CLI path
- local path plugin loading remains valid

**Step 2: Run tests to verify behavior**

Run: `pnpm run test`
Expected: PASS with no regression to current distill behavior.

**Step 3: Validate build/typecheck**

Run: `pnpm run build && pnpm run typecheck`
Expected: PASS with the new dependency boundary.

### Task 4: Document the architectural rule

**Files:**
- Modify: `AIEF/context/business/decisions.md`
- Modify: `README.md`
- Modify: `README.zh.md`

**Step 1: Document the new rule**

Clarify that:

- `@loamlog/distill` is the generic runtime engine
- `@loamlog/cli` is the built-in/official bootstrap entrypoint
- built-in plugin defaults are owned by CLI, not by the engine package

**Step 2: Re-run docs/build verification**

Run: `pnpm run build && pnpm run test`
Expected: PASS after documentation updates.

### Task 5: Final review and cleanup

**Files:**
- Review: `packages/distill/package.json`
- Review: `packages/cli/package.json`
- Review: `packages/cli/src/distill.ts`
- Review: tests changed in Tasks 2-3

**Step 1: Check architectural result**

Confirm the end state:

- `@loamlog/distill` no longer depends directly on concrete built-in plugins
- `@loamlog/cli` owns built-in plugin availability
- the engine still accepts generic plugin specifiers

**Step 2: Commit in atomic steps**

Suggested split:

- dependency boundary change
- CLI bootstrap normalization + tests
- docs/ADR update

**Step 3: Final verification**

Run: `pnpm run build && pnpm run test && pnpm run typecheck`
Expected: PASS and no behavior regressions.
