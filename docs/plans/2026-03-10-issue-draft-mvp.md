# Issue Draft MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first local-first issue-draft flow so a single archived AI session can produce an evidence-backed GitHub-ready draft as `.json` plus `.md`.

**Architecture:** Add one new distiller package for `issue-draft` output and extend the existing file sink to emit Markdown when `render.markdown` exists. Reuse the current `DistillResultDraft`, evidence, CLI distill path, and local pending output conventions without introducing GitHub API delivery.

**Tech Stack:** TypeScript, pnpm workspaces, Bun/Node runtime, existing `@loamlog/distiller-sdk`, existing file sink.

---

### Task 1: Scaffold the issue-draft distiller package

**Files:**
- Create: `packages/distillers/issue-draft/package.json`
- Create: `packages/distillers/issue-draft/tsconfig.json`
- Create: `packages/distillers/issue-draft/src/index.ts`
- Modify: root workspace config files that register package builds, matching existing distiller package patterns

**Step 1: Write the failing test**

Create `packages/distillers/issue-draft/src/index.test.ts` with a test that imports the distiller factory and expects an `issue-draft` result shape from a mocked session.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @loamlog/distiller-issue-draft test`
Expected: FAIL because the package and implementation do not exist yet.

**Step 3: Write minimal implementation**

Follow the structure in `packages/distillers/pitfall-card/src/index.ts` and define:

- `DISTILLER_ID = "@loamlog/distiller-issue-draft"`
- minimal payload fields: `title`, `issue_kind?`, `labels?`
- `render.markdown` as the canonical GitHub-ready body output

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @loamlog/distiller-issue-draft test`
Expected: PASS for the package bootstrap and result shape test.

**Step 5: Commit**

```bash
git add packages/distillers/issue-draft
git commit -m "feat(distiller): scaffold issue-draft package"
```

### Task 2: Add issue-draft parsing and evidence mapping

**Files:**
- Modify: `packages/distillers/issue-draft/src/index.ts`
- Modify: `packages/distillers/issue-draft/src/index.test.ts`

**Step 1: Write the failing test**

Add tests that verify:

- JSON-only LLM output is parsed correctly
- `message_id` references are mapped back to real session messages
- low-quality / missing evidence does not produce a misleading draft

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @loamlog/distiller-issue-draft test`
Expected: FAIL on missing parse/evidence logic.

**Step 3: Write minimal implementation**

Implement:

- prompt builder from a single `SessionArtifact`
- JSON extraction helper
- issue payload parser
- local Markdown renderer from parsed JSON
- evidence creation via `createEvidence(...)`

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @loamlog/distiller-issue-draft test`
Expected: PASS for parsing, rendering, and evidence mapping tests.

**Step 5: Commit**

```bash
git add packages/distillers/issue-draft/src/index.ts packages/distillers/issue-draft/src/index.test.ts
git commit -m "feat(distiller): add issue-draft parsing and evidence mapping"
```

### Task 3: Extend file sink to emit Markdown

**Files:**
- Modify: `packages/sinks/file/src/index.ts`
- Modify: `packages/sinks/file/src/index.test.ts`

**Step 1: Write the failing test**

Add a test that writes a `DistillResult` containing `render.markdown` and expects both `<id>.json` and `<id>.md` in the pending directory.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @loamlog/sink-file test`
Expected: FAIL because only JSON is written today.

**Step 3: Write minimal implementation**

Extend the sink so that:

- JSON behavior remains unchanged
- when `result.render?.markdown` exists, write `<result.id>.md`
- keep atomic temp-file + rename behavior for Markdown too

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @loamlog/sink-file test`
Expected: PASS for JSON-only and JSON+Markdown cases.

**Step 5: Commit**

```bash
git add packages/sinks/file/src/index.ts packages/sinks/file/src/index.test.ts
git commit -m "feat(sink-file): write markdown drafts with distill results"
```

### Task 4: Verify the CLI path end-to-end

**Files:**
- Reuse existing CLI path in `packages/cli/src/distill.ts`
- Add/update tests only if a real gap appears

**Step 1: Write the failing test**

If needed, add a focused CLI test proving `--distiller @loamlog/distiller-issue-draft` can run through the existing distill command path.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @loamlog/cli test`
Expected: FAIL only if the new distiller is not wired correctly through workspace/build resolution.

**Step 3: Write minimal implementation**

Only add the minimum workspace/package wiring needed. Do not add a new CLI command surface for MVP.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @loamlog/cli test`
Expected: PASS with no CLI surface changes.

**Step 5: Commit**

```bash
git add packages/cli
git commit -m "test(cli): verify issue-draft distiller runs through existing path"
```

### Task 5: Update docs after behavior is real

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: any config example files that reference distillers

**Step 1: Write the failing test**

No automated test required; verify docs against the real package name and output paths.

**Step 2: Run verification before editing**

Run: `pnpm run build && pnpm run test`
Expected: PASS before final doc wording is added.

**Step 3: Write minimal documentation**

Document:

- `loam distill --distiller @loamlog/distiller-issue-draft --llm <provider/model>`
- output location of `.json` and `.md`
- local-first scope boundary (not GitHub API creation)

**Step 4: Re-run verification**

Run: `pnpm run build && pnpm run test`
Expected: PASS with docs aligned to shipped behavior.

**Step 5: Commit**

```bash
git add README.md README.zh.md
git commit -m "docs(issue-draft): add local issue-draft usage"
```
