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

## Release Process | 发布流程

### Core Packages | 核心包
Currently handled manually via `pnpm publish` within each package directory after a release branch is merged into `master`.
目前在发布分支合并入 `master` 后，通过在各包目录下手动运行 `pnpm publish` 处理。

### OpenCode Plugin (`opencode-loamlog`) | OpenCode 插件
The OpenCode plugin has a dedicated CI/CD pipeline:
OpenCode 插件拥有独立的 CI/CD 流水线：

1. **Automation | 自动化**: Uses GitHub Actions for NPM publishing. 使用 GitHub Actions 进行 NPM 发布。
2. **Trigger | 触发机制**:
   - **Tag | 标签**: Pushing a tag like `opencode-loamlog@v0.2.x` triggers an automatic publish. 推送如 `opencode-loamlog@v0.2.x` 的标签会触发自动发布。
   - **Manual | 手动**: Run the "Publish OpenCode Plugin" workflow in GitHub Actions. 在 GitHub Actions 中手动运行 "Publish OpenCode Plugin" 工作流。
3. **Secret | 密钥**: Requires `NPM_TOKEN` in GitHub Secrets. 需要在 GitHub Secrets 中配置 `NPM_TOKEN`。

---

## Testing

New behavior must come with tests. The test suite is run with:

```bash
pnpm run test        # all packages
pnpm run typecheck   # TypeScript check
```

Pre-existing test failures that are unrelated to your change are acceptable — note them in your PR.
