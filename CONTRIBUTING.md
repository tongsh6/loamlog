# Contributing to Loamlog

> Communication defaults to Chinese internally; code, identifiers, and git commits must stay in English.

## Branch Strategy (GitFlow)

```
master          ─── stable releases only, protected
develop         ─── integration branch, default PR target
feature/xxx     ─── new features, branch off develop
fix/xxx         ─── bug fixes, branch off develop
hotfix/xxx      ─── urgent production fixes, branch off master
release/x.y.z   ─── release prep, branch off develop
```

### Rules

| Branch | Branch from | Merge into | Direct push |
|--------|------------|------------|-------------|
| `master` | `release/*` or `hotfix/*` | — | ❌ Never |
| `develop` | `master` | — | ❌ Never |
| `feature/*` | `develop` | `develop` | ✅ OK |
| `fix/*` | `develop` | `develop` | ✅ OK |
| `hotfix/*` | `master` | `master` + `develop` | ✅ OK |
| `release/*` | `develop` | `master` + `develop` | ✅ OK |

---

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or fixing tests |
| `chore` | Build, tooling, deps — no production code |
| `perf` | Performance improvement |

### Scopes

Use the affected package or area: `core`, `archive`, `cli`, `provider-opencode`, `plugin-opencode`, `distill`, `deps`, `ci`

### Examples

```
feat(archive): add atomic write with temp-file swap
fix(cli): handle missing LOAM_DUMP_DIR gracefully
docs: add Chinese README
chore(deps): bump typescript to 5.4
test(archive): add redaction edge-case coverage
```

---

## Pull Request Process

1. **Branch naming**: `feature/<short-description>`, `fix/<short-description>`, `hotfix/<short-description>`
2. **Target branch**: Always `develop` (except hotfixes → `master`)
3. **PR title**: Must follow commit convention (e.g., `feat(cli): add list command`)
4. **PR body**: Use the provided template — fill in every section
5. **CI must pass**: All checks green before merge
6. **Squash merge**: Prefer squash merge to keep `develop` history clean

For large changes, open an issue first to discuss approach before writing code.

---

## Development Setup

```bash
git clone https://github.com/tongsh6/loamlog.git
cd loamlog
pnpm install
pnpm run build
pnpm run test
```

---

## Hard Constraints (Non-Negotiable)

- **Plugin errors MUST NOT crash the host tool** — catch everything, log it, continue
- **Redaction ON by default** — never disable redaction in production paths
- **No writes without `LOAM_DUMP_DIR`** — guard every write with this check
- **Evidence required** — `DistillResult` without evidence backlinks will be rejected
- **No `as any` or `@ts-ignore`** — fix the type properly

---

## Testing

New behavior must come with tests. The test suite is run with:

```bash
pnpm run test        # all packages
pnpm run typecheck   # TypeScript check
```

Pre-existing test failures that are unrelated to your change are acceptable — note them in your PR.
