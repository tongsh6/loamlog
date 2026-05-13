# Representative Asset Distillers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build five representative AI collaboration asset distillers as ordinary plugins: `idea-seed`, `practice-pitfall`, `decision-rationale`, `follow-up-work-item`, and `skill-candidate`.

**Architecture:** Add one focused workspace package, `@loamlog/distiller-representative-assets`, with five default-export distiller entrypoints and shared prompt/parse/evidence helpers. The existing distill engine and registry stay generic; CLI built-in resolution only maps package specifiers to the new entrypoint files.

**Tech Stack:** TypeScript, pnpm workspaces, Node test runner, `@loamlog/core`, `@loamlog/distiller-sdk`, existing `loam distill` CLI path.

---

## File Structure

- Create `packages/distillers/representative-assets/package.json`
  - Workspace package metadata and exports for five subpath distillers.
- Create `packages/distillers/representative-assets/tsconfig.json`
  - Standard distiller package TypeScript config.
- Create `packages/distillers/representative-assets/src/shared.ts`
  - Shared JSON extraction, prompt rendering, evidence validation, confidence normalization, and result helpers.
- Create `packages/distillers/representative-assets/src/shared.test.ts`
  - Unit tests for shared parsing and evidence behavior.
- Create `packages/distillers/representative-assets/src/idea-seed.ts`
  - `@loamlog/distiller-idea-seed` plugin entrypoint.
- Create `packages/distillers/representative-assets/src/idea-seed.test.ts`
  - Mocked LLM tests for `idea-seed`.
- Create `packages/distillers/representative-assets/src/practice-pitfall.ts`
  - `@loamlog/distiller-practice-pitfall` plugin entrypoint.
- Create `packages/distillers/representative-assets/src/practice-pitfall.test.ts`
  - Mocked LLM tests for `practice-pitfall`.
- Create `packages/distillers/representative-assets/src/decision-rationale.ts`
  - `@loamlog/distiller-decision-rationale` plugin entrypoint.
- Create `packages/distillers/representative-assets/src/decision-rationale.test.ts`
  - Mocked LLM tests for `decision-rationale`.
- Create `packages/distillers/representative-assets/src/follow-up-work-item.ts`
  - `@loamlog/distiller-follow-up-work-item` plugin entrypoint.
- Create `packages/distillers/representative-assets/src/follow-up-work-item.test.ts`
  - Mocked LLM tests for `follow-up-work-item`.
- Create `packages/distillers/representative-assets/src/skill-candidate.ts`
  - `@loamlog/distiller-skill-candidate` plugin entrypoint.
- Create `packages/distillers/representative-assets/src/skill-candidate.test.ts`
  - Mocked LLM tests for `skill-candidate`.
- Modify `packages/cli/src/distill.ts`
  - Add built-in entry paths and specifier normalization for the five new distillers.
- Modify `packages/cli/src/distill.test.ts`
  - Add tests that prove the CLI recognizes new built-in specifiers.
- Modify `package.json`
  - Add the new representative distiller package to `build` and `typecheck`.
- Modify `packages/cli/package.json`
  - Add workspace dependency on `@loamlog/distiller-representative-assets`.
- Modify `docs/project-ledger.md`
  - Record implementation status and any remaining gaps after verification.

## Shared Payload Contracts

Use these exact `type` values:

- `idea-seed`
- `practice-pitfall`
- `decision-rationale`
- `follow-up-work-item`
- `skill-candidate`

Use these exact plugin ids:

- `@loamlog/distiller-idea-seed`
- `@loamlog/distiller-practice-pitfall`
- `@loamlog/distiller-decision-rationale`
- `@loamlog/distiller-follow-up-work-item`
- `@loamlog/distiller-skill-candidate`

All five distillers must reject LLM items without valid evidence refs. Do not add fallback evidence from the first message.

## Task 1: Shared Package And Helpers

**Files:**
- Create: `packages/distillers/representative-assets/package.json`
- Create: `packages/distillers/representative-assets/tsconfig.json`
- Create: `packages/distillers/representative-assets/src/shared.ts`
- Create: `packages/distillers/representative-assets/src/shared.test.ts`

- [ ] **Step 1: Write shared helper tests**

Create `packages/distillers/representative-assets/src/shared.test.ts` with tests for:

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SessionArtifact } from "@loamlog/core";
import { buildSessionPrompt, collectEvidence, extractJsonArray, normalizeConfidence } from "./shared.js";

describe("representative asset shared helpers", () => {
  test("extractJsonArray reads fenced JSON arrays", () => {
    const parsed = extractJsonArray("```json\n[{\"title\":\"A\"}]\n```");
    assert.deepEqual(parsed, [{ title: "A" }]);
  });

  test("normalizeConfidence clamps invalid values", () => {
    assert.equal(normalizeConfidence(undefined), 0.7);
    assert.equal(normalizeConfidence(3), 1);
    assert.equal(normalizeConfidence(-1), 0);
  });

  test("collectEvidence drops invalid message refs without fallback", () => {
    const artifact = makeArtifact();
    const evidence = collectEvidence(artifact, [{ message_id: "missing", excerpt: "not here" }]);
    assert.equal(evidence.length, 0);
  });

  test("buildSessionPrompt includes message ids and roles", () => {
    const prompt = buildSessionPrompt(makeArtifact());
    assert.match(prompt, /session_id: ses_rep_1/);
    assert.match(prompt, /\[msg_1\] \(user\)/);
  });
});

function makeArtifact(): SessionArtifact {
  return {
    schema_version: "1.0",
    meta: {
      session_id: "ses_rep_1",
      captured_at: "2026-05-13T00:00:00.000Z",
      capture_trigger: "session.idle",
      loam_version: "0.1.0",
      provider: "opencode",
    },
    context: { cwd: "/tmp", worktree: "/tmp" },
    time_range: {
      start: "2026-05-13T00:00:00.000Z",
      end: "2026-05-13T00:00:01.000Z",
    },
    session: {},
    messages: [
      {
        id: "msg_1",
        role: "user",
        timestamp: "2026-05-13T00:00:00.000Z",
        content: "We should capture ideas while working with AI tools.",
      },
    ],
    redacted: { patterns_applied: [], redacted_count: 0 },
  };
}
```

- [ ] **Step 2: Run the failing helper tests**

Run:

```bash
node --import tsx --test packages/distillers/representative-assets/src/shared.test.ts
```

Expected: fail because `shared.ts` does not exist.

- [ ] **Step 3: Add package scaffold and helper implementation**

Create `package.json`:

```json
{
  "name": "@loamlog/distiller-representative-assets",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/idea-seed.js",
  "types": "dist/idea-seed.d.ts",
  "exports": {
    "./idea-seed": {
      "types": "./dist/idea-seed.d.ts",
      "import": "./dist/idea-seed.js"
    },
    "./practice-pitfall": {
      "types": "./dist/practice-pitfall.d.ts",
      "import": "./dist/practice-pitfall.js"
    },
    "./decision-rationale": {
      "types": "./dist/decision-rationale.d.ts",
      "import": "./dist/decision-rationale.js"
    },
    "./follow-up-work-item": {
      "types": "./dist/follow-up-work-item.d.ts",
      "import": "./dist/follow-up-work-item.js"
    },
    "./skill-candidate": {
      "types": "./dist/skill-candidate.d.ts",
      "import": "./dist/skill-candidate.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@loamlog/core": "workspace:*",
    "@loamlog/distiller-sdk": "workspace:*"
  }
}
```

Create `tsconfig.json` matching existing distiller packages:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

Create `shared.ts` with:

```ts
import type { DistillEvidenceDraft, SessionArtifact } from "@loamlog/core";
import { createEvidence } from "@loamlog/distiller-sdk";

export interface LlmEvidenceRef {
  message_id: string;
  excerpt: string;
}

export function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function buildSessionPrompt(artifact: SessionArtifact): string {
  const chunks = artifact.messages.map((message) => {
    const text = (message.content ?? "").slice(0, 1200);
    return `[${message.id}] (${message.role}) ${text}`;
  });

  return [
    `session_id: ${artifact.meta.session_id}`,
    `provider: ${artifact.meta.provider}`,
    `captured_at: ${artifact.meta.captured_at}`,
    "messages:",
    ...chunks,
  ].join("\n");
}

export function extractJsonArray(content: string): unknown[] {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const json = fenced?.[1]?.trim() ?? trimmed;
  const parsed = JSON.parse(json) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

export function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.7;
  }
  return Math.max(0, Math.min(1, value));
}

export function collectEvidence(
  artifact: SessionArtifact,
  refs: LlmEvidenceRef[] | undefined,
): DistillEvidenceDraft[] {
  if (!refs) return [];
  return refs
    .map((ref) => {
      const message = artifact.messages.find((item) => item.id === ref.message_id);
      if (!message) return undefined;
      return createEvidence(artifact, message, ref.excerpt);
    })
    .filter((item): item is DistillEvidenceDraft => Boolean(item));
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
node --import tsx --test packages/distillers/representative-assets/src/shared.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/distillers/representative-assets
git commit -m "feat: add representative distiller helpers"
```

## Task 2: `idea-seed` Distiller

**Files:**
- Create: `packages/distillers/representative-assets/src/idea-seed.ts`
- Create: `packages/distillers/representative-assets/src/idea-seed.test.ts`

- [ ] **Step 1: Write mocked LLM test**

Test must assert:

- plugin id is `@loamlog/distiller-idea-seed`
- output type is `idea-seed`
- payload includes `idea`, `context`, and `next_probe`
- invalid evidence refs produce zero outputs

- [ ] **Step 2: Run the failing test**

```bash
node --import tsx --test packages/distillers/representative-assets/src/idea-seed.test.ts
```

Expected: fail because `idea-seed.ts` does not exist.

- [ ] **Step 3: Implement the distiller**

Implementation must:

- call `defineDistiller<IdeaSeedPayload>()`
- use `buildSessionPrompt()`
- ask for JSON array only
- parse with `extractJsonArray()`
- validate required string fields
- call `collectEvidence()`
- skip items with empty evidence

Use this payload shape:

```ts
interface IdeaSeedPayload {
  idea: string;
  context: string;
  why_now?: string;
  potential_value?: string;
  target_audience?: string;
  uncertainty?: string;
  next_probe?: string;
}
```

- [ ] **Step 4: Run the test**

```bash
node --import tsx --test packages/distillers/representative-assets/src/idea-seed.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/distillers/representative-assets/src/idea-seed.ts packages/distillers/representative-assets/src/idea-seed.test.ts
git commit -m "feat: add idea seed distiller"
```

## Task 3: `practice-pitfall` Distiller

**Files:**
- Create: `packages/distillers/representative-assets/src/practice-pitfall.ts`
- Create: `packages/distillers/representative-assets/src/practice-pitfall.test.ts`

- [ ] **Step 1: Write mocked LLM test**

Test must assert:

- plugin id is `@loamlog/distiller-practice-pitfall`
- output type is `practice-pitfall`
- payload includes `situation`, `pitfall_or_practice`, `fix_or_pattern`, and `reusable_scope`
- invalid evidence refs produce zero outputs

- [ ] **Step 2: Implement using shared helpers**

Use this payload shape:

```ts
interface PracticePitfallPayload {
  situation: string;
  pitfall_or_practice: string;
  symptom?: string;
  root_cause?: string;
  fix_or_pattern: string;
  prevention?: string;
  reusable_scope: string;
}
```

- [ ] **Step 3: Run the test**

```bash
node --import tsx --test packages/distillers/representative-assets/src/practice-pitfall.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit Task 3**

```bash
git add packages/distillers/representative-assets/src/practice-pitfall.ts packages/distillers/representative-assets/src/practice-pitfall.test.ts
git commit -m "feat: add practice pitfall distiller"
```

## Task 4: Decision And Follow-Up Distillers

**Files:**
- Create: `packages/distillers/representative-assets/src/decision-rationale.ts`
- Create: `packages/distillers/representative-assets/src/decision-rationale.test.ts`
- Create: `packages/distillers/representative-assets/src/follow-up-work-item.ts`
- Create: `packages/distillers/representative-assets/src/follow-up-work-item.test.ts`

- [ ] **Step 1: Write mocked LLM tests**

Decision test must assert:

- plugin id is `@loamlog/distiller-decision-rationale`
- output type is `decision-rationale`
- payload includes `decision`, `context`, and `rationale`

Follow-up test must assert:

- plugin id is `@loamlog/distiller-follow-up-work-item`
- output type is `follow-up-work-item`
- payload includes `action` and `reason`
- `priority_hint` accepts only `p0`, `p1`, or `p2` when present

- [ ] **Step 2: Implement both distillers**

Use these payload shapes:

```ts
interface DecisionRationalePayload {
  decision: string;
  context: string;
  options_considered?: string[];
  rationale: string;
  tradeoffs?: string[];
  constraints?: string[];
  revisit_trigger?: string;
}

interface FollowUpWorkItemPayload {
  action: string;
  reason: string;
  owner_hint?: string;
  priority_hint?: "p0" | "p1" | "p2";
  due_context?: string;
  acceptance?: string[];
  related_assets?: string[];
}
```

- [ ] **Step 3: Run the tests**

```bash
node --import tsx --test packages/distillers/representative-assets/src/decision-rationale.test.ts packages/distillers/representative-assets/src/follow-up-work-item.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit Task 4**

```bash
git add packages/distillers/representative-assets/src/decision-rationale.ts packages/distillers/representative-assets/src/decision-rationale.test.ts packages/distillers/representative-assets/src/follow-up-work-item.ts packages/distillers/representative-assets/src/follow-up-work-item.test.ts
git commit -m "feat: add decision and follow-up distillers"
```

## Task 5: `skill-candidate` Distiller

**Files:**
- Create: `packages/distillers/representative-assets/src/skill-candidate.ts`
- Create: `packages/distillers/representative-assets/src/skill-candidate.test.ts`

- [ ] **Step 1: Write mocked LLM test**

Test must assert:

- plugin id is `@loamlog/distiller-skill-candidate`
- output type is `skill-candidate`
- payload includes `skill_name`, `trigger`, `capability`, and `workflow_steps`
- `promotion_target` accepts only `codex_skill`, `agents_rule`, `prompt_template`, `runbook`, or `project_doc`
- invalid evidence refs produce zero outputs

- [ ] **Step 2: Implement the distiller**

Use this payload shape:

```ts
interface SkillCandidatePayload {
  skill_name: string;
  trigger: string;
  capability: string;
  workflow_steps: string[];
  required_context?: string[];
  inputs?: string[];
  outputs?: string[];
  constraints?: string[];
  negative_cases?: string[];
  promotion_target?: "codex_skill" | "agents_rule" | "prompt_template" | "runbook" | "project_doc";
}
```

- [ ] **Step 3: Run the test**

```bash
node --import tsx --test packages/distillers/representative-assets/src/skill-candidate.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit Task 5**

```bash
git add packages/distillers/representative-assets/src/skill-candidate.ts packages/distillers/representative-assets/src/skill-candidate.test.ts
git commit -m "feat: add skill candidate distiller"
```

## Task 6: CLI Built-In Resolution And Workspace Wiring

**Files:**
- Modify: `packages/cli/src/distill.ts`
- Modify: `packages/cli/src/distill.test.ts`
- Modify: `packages/cli/package.json`
- Modify: `package.json`

- [ ] **Step 1: Add CLI tests**

Add tests proving these specifiers are normalized:

```ts
[
  "@loamlog/distiller-idea-seed",
  "@loamlog/distiller-practice-pitfall",
  "@loamlog/distiller-decision-rationale",
  "@loamlog/distiller-follow-up-work-item",
  "@loamlog/distiller-skill-candidate",
]
```

- [ ] **Step 2: Update built-in maps**

Add entries to `BUILT_IN_PLUGIN_ENTRY_PATHS`:

```ts
"@loamlog/distiller-idea-seed": {
  dist: "../../distillers/representative-assets/dist/idea-seed.js",
  src: "../../distillers/representative-assets/src/idea-seed.ts",
},
```

Repeat with matching filenames for the other four distillers.

- [ ] **Step 3: Update workspace scripts and dependencies**

Add `@loamlog/distiller-representative-assets` to:

- root `build`
- root `typecheck`
- `packages/cli/package.json` dependencies

- [ ] **Step 4: Run CLI and package checks**

```bash
pnpm --filter @loamlog/distiller-representative-assets run build
pnpm --filter @loamlog/cli run typecheck
node --import tsx --test packages/cli/src/distill.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit Task 6**

```bash
git add package.json packages/cli/package.json packages/cli/src/distill.ts packages/cli/src/distill.test.ts
git commit -m "feat: wire representative distillers into cli"
```

## Task 7: Verification And Project Ledger

**Files:**
- Modify: `docs/project-ledger.md`
- Static scan report: `AIEF/reports/static-scan/<run-id>/`

- [ ] **Step 1: Run focused tests**

```bash
node --import tsx --test packages/distillers/representative-assets/src/*.test.ts packages/cli/src/distill.test.ts
```

Expected: pass.

- [ ] **Step 2: Run full tests**

```bash
pnpm run test
```

Expected: all tests pass.

- [ ] **Step 3: Run AI completion gate**

```bash
pnpm run ai:complete
```

Expected: report under `AIEF/reports/static-scan/<run-id>/` with blocking count 0.

- [ ] **Step 4: Update ledger**

Update `docs/project-ledger.md` with:

- new representative distiller implementation status
- test count
- latest static scan report path
- any deferred gaps found during implementation

- [ ] **Step 5: Commit verification evidence**

```bash
git add docs/project-ledger.md AIEF/reports/static-scan/<run-id>
git commit -m "docs: record representative distiller verification"
```

## Self-Review

- Spec coverage: all five representative distillers from `AIEF/openspec/representative-asset-distillers.md` are represented in Tasks 2-5; plugin substrate and CLI wiring are covered in Tasks 1 and 6; verification and ledger updates are covered in Task 7.
- Placeholder scan: no task uses placeholder markers or unspecified edge-case language.
- Type consistency: plugin ids, asset type strings, payload field names, and promotion targets match the design spec.
