# 会话复盘 2026-03-02 | Session Retrospective 2026-03-02

Session date: 2026-03-02

---

## 1. 本次会话存在的问题 | Problems in This Session

### 1.1 工具是否已安装未事先确认 | Verify Tool Installation Before Creating It

**问题**：在创建 `scripts/aief.mjs` 前未确认 AIEF CLI 是否已全局安装，导致白费一轮创建 → 确认 → 删除的周期。
**Problem**: Created `scripts/aief.mjs` without first confirming whether the AIEF CLI was already globally installed, resulting in a wasted create → confirm → delete cycle.

### 1.2 CJS/ESM 冲突未提前预判 | CJS/ESM Conflict Not Anticipated

**问题**：项目 `package.json` 含 `"type": "module"`，导致 `check-bilingual-docs.js` 报错。需改用 `.cjs` 版本，但此问题在第一次运行时才被发现。
**Problem**: The project `package.json` has `"type": "module"`, causing `check-bilingual-docs.js` to error out. The `.cjs` variant was required, but this was only discovered on first run.

### 1.3 表格列分隔符缺失长期未发现 | Missing Table Column Separator Went Unnoticed

**问题**：`roadmap.md` 的阶段总览表格行分隔符 `|---|---|---|---|` 只有 4 列，而表头有 5 列，格式错误长期存在。
**Problem**: The phase overview table in `roadmap.md` had only 4 column separators (`|---|---|---|---|`) while the header had 5 columns — a formatting bug that existed unnoticed.

### 1.4 `.gitignore` 遗漏 | `.gitignore` Omission

**问题**：`convos/` 目录遗漏加入 `.gitignore`，在第二次提交才被发现并补充。
**Problem**: The `convos/` directory was not added to `.gitignore` initially; this was only caught and fixed in a second commit.

### 1.5 README clone 地址占位符 | README Clone URL Placeholder

**问题**：README.md 初始版本的 `git clone` 地址写成了 `YOUR_USERNAME/loamlog.git` 占位符，应直接使用正确 URL。
**Problem**: The initial README.md used `YOUR_USERNAME/loamlog.git` as a placeholder instead of the actual repository URL.

---

## 2. 可沉淀的经验 | Learnings Worth Keeping

### 2.1 薄桥接 + 独立进程架构

插件只负责事件转发，业务逻辑全部在独立进程中。此模式保证了宿主工具不受插件崩溃影响，且独立进程可独立发布、测试和扩展。
The plugin is responsible only for event forwarding; all business logic lives in a standalone process. This pattern ensures the host tool is insulated from plugin crashes, and the standalone process can be released, tested, and extended independently.

### 2.2 GitFlow 分支策略落地经验

使用 `feature/* → develop → master` 三层模型，每个逻辑任务单独一个 feature 分支。PR 合并后及时删除 feature 分支，保持分支图清晰。
Use a `feature/* → develop → master` three-tier model, with each logical task on its own feature branch. Delete feature branches promptly after merging to keep the graph clean.

### 2.3 非目标需区分"永不做"与"阶段性不做"

文档中的非目标若只写"不做"，缺乏决策背景。区分"永不做（不符合产品定位）"与"阶段性不做（有明确解锁条件）"，可以避免未来出现歧义、误判优先级。
"Non-goals" documented without context lose their meaning over time. Distinguishing "never do (out of scope by design)" from "not now (with explicit unlock criteria)" prevents future ambiguity and misjudged priorities.

### 2.4 双语文档的 CJS/ESM 注意事项

在 `"type": "module"` 的项目中，脚本需使用 `.cjs` 扩展名（或在脚本内部用 `require` + `.cjs`）来保持 CommonJS 兼容，避免运行时 `require is not defined` 错误。
In projects with `"type": "module"`, scripts must use the `.cjs` extension (or be written as CJS with `require`) to remain CommonJS-compatible and avoid runtime `require is not defined` errors.

---

## 3. 可改进之处 | Improvement Areas

### 3.1 工具存在性检查前置

在创建任何脚本/工具前，先执行 `where <tool>` 或 `which <tool>` 检查全局安装状态。
Before creating any script or tool wrapper, run `where <tool>` (Windows) or `which <tool>` (Unix) to check for existing global installations.

### 3.2 新项目启动 checklist 前置执行

每次进入新 session 时，先过一遍「启动 checklist」（见下方），避免重复踩坑。
At the start of each new session, run through the "session start checklist" (see below) to avoid repeated mistakes.

### 3.3 README 模板直接使用真实值

README 模板中的占位符（如 `YOUR_USERNAME`）应在首次提交前全部替换为真实值，不允许占位符进入 main/master。
All placeholders in README templates (e.g., `YOUR_USERNAME`) must be replaced with real values before the first commit — placeholders must never land on main/master.

### 3.4 Markdown 表格自动验证

在 CI 中加入 Markdown 表格列数校验，防止列不对齐的格式问题静默进入仓库。
Add a Markdown table column-count validator to CI to catch misaligned table columns before they silently enter the repo.

---

## 4. 可沉淀为 Skill | Skills Worth Extracting

### Skill: GitFlow Branch Management

**触发时机 / Trigger**: 任何涉及 feature 开发、修复或文档更新的任务。
**Any**: task involving feature development, bugfix, or documentation update.

**核心步骤 / Core steps**:
1. `git checkout develop && git pull`
2. `git checkout -b feature/<short-description>`
3. 开发 + 提交（atomic commits）
4. `git checkout develop && git merge --no-ff feature/<short-description>`
5. `git checkout master && git merge --no-ff develop`
6. `git push origin develop master`
7. 删除 feature 分支 `git branch -d feature/<short-description>`

### Skill: AIEF Bilingual Document Creation

**触发时机 / Trigger**: 创建任何新的 AIEF 上下文文档。
**Any**: creating a new AIEF context document.

**核心步骤 / Core steps**:
1. 使用 `node AIEF/scripts/new-bilingual-doc.js` 生成双语骨架
2. 中英文内容同步填写
3. 运行 `node AIEF/scripts/check-bilingual-docs.cjs` 验证
4. 更新 `AIEF/context/INDEX.md` 加入新文档索引

---

## 5. 可沉淀为 Template | Templates Worth Keeping

### Template: AIEF 双语文档骨架 | AIEF Bilingual Doc Skeleton

```markdown
# 中文标题 | English Title

Date: YYYY-MM-DD

## 章节一 | Section One

中文内容。
English content.

## 章节二 | Section Two

中文内容。
English content.
```

**使用规则 / Usage rules**:
- 每个 `##` 章节必须同时包含中英文内容
- 使用 `|` 分隔标题中英文，格式：`中文 | English`
- 创建后必须通过 `check-bilingual-docs.cjs` 检查

### Template: ADR（架构决策记录）骨架 | ADR Skeleton

```markdown
## ADR-NNN: 标题 | Title

**状态 / Status**: 已接受 / Accepted  
**日期 / Date**: YYYY-MM-DD

### 背景 | Context
（描述问题背景）
(Describe the problem context)

### 决策 | Decision
（描述做出了什么决定）
(Describe what was decided)

### 理由 | Rationale
（解释为什么这样决定）
(Explain why this decision was made)

### 影响 | Consequences
（正面和负面影响）
(Positive and negative consequences)
```

---

## 6. 可沉淀为 Checklist | Checklists Worth Keeping

### Checklist: 新 Session 启动 | New Session Start

- [ ] 确认当前工作分支（`git branch`）
- [ ] 确认 develop / master 是否最新（`git pull`）
- [ ] 确认目标 AIEF 文档是否需要同步更新
- [ ] 确认需要的 CLI 工具是否已全局安装（`where <tool>`）
- [ ] 确认 `LOAM_DUMP_DIR` 是否已配置（如需 capture）

- [ ] Confirm current working branch (`git branch`)
- [ ] Confirm develop / master is up to date (`git pull`)
- [ ] Confirm whether relevant AIEF docs need updates
- [ ] Confirm required CLI tools are globally installed (`where <tool>`)
- [ ] Confirm `LOAM_DUMP_DIR` is set (if capture is needed)

### Checklist: 文档提交前 | Before Committing Docs

- [ ] 所有占位符（`YOUR_USERNAME`、`TODO`、`TBD`）已替换
- [ ] 双语检查通过：`node AIEF/scripts/check-bilingual-docs.cjs`
- [ ] `AIEF/context/INDEX.md` 已同步新增文档
- [ ] Markdown 表格列数对齐（表头列数 = 分隔行列数）

- [ ] All placeholders (`YOUR_USERNAME`, `TODO`, `TBD`) replaced
- [ ] Bilingual check passes: `node AIEF/scripts/check-bilingual-docs.cjs`
- [ ] New document added to `AIEF/context/INDEX.md`
- [ ] Markdown table column counts are aligned (header = separator row)

### Checklist: Feature 分支合并前 | Before Merging Feature Branch

- [ ] `pnpm run build` 通过 | build passes
- [ ] `pnpm run test` 通过（如有）| tests pass (if applicable)
- [ ] `lsp_diagnostics` 无 error | no LSP errors
- [ ] 双语文档检查通过 | bilingual check passes
- [ ] `.gitignore` 覆盖所有不应提交的目录/文件 | `.gitignore` covers all untracked artifacts

---

## 7. 可沉淀为最佳实践 | Best Practices Worth Keeping

### BP-001: 插件只做转发，业务逻辑外置

插件层（OpenCode plugin）只负责捕获事件并 POST 到独立进程，不包含任何业务逻辑。好处：插件崩溃不影响宿主；业务逻辑可独立测试；插件可独立发布到市场。
The plugin layer (OpenCode plugin) only captures events and POSTs to a standalone process — no business logic inside. Benefits: plugin crashes don't affect the host; business logic is independently testable; plugin can be published to the marketplace independently.

### BP-002: 非目标需声明解锁条件

文档中的"非目标"分两类：
- **永不做**：不符合产品核心定位，写明原因
- **阶段性不做**：当前阶段不做，但列明解锁里程碑（如"M3 完成后考虑"）

Non-goals fall into two categories:
- **Never**: Out of scope by design — state the reason
- **Not now**: Deferred, with explicit unlock milestone (e.g., "revisit after M3")

### BP-003: 原子提交 + 有意义的 commit message

每个 commit 只做一件事。commit message 格式：`type(scope): what and why`，例如 `docs(adr): add ADR-011 for plugin marketplace split`。
Each commit does exactly one thing. Commit message format: `type(scope): what and why`, e.g., `docs(adr): add ADR-011 for plugin marketplace split`.

### BP-004: README 首次提交前清零占位符

README 模板中的所有占位符必须在首次推送前替换为真实值。可以在 CI 中加入占位符检测（`grep -r "YOUR_USERNAME" README*`）。
All README template placeholders must be replaced with real values before the first push. Consider adding a CI check (`grep -r "YOUR_USERNAME" README*`) to catch leftovers.

### BP-005: CJS/ESM 脚本在 ESM 项目中使用 `.cjs` 扩展名

当项目 `package.json` 含 `"type": "module"` 时，需要以 CJS 运行的脚本必须使用 `.cjs` 扩展名，确保 Node.js 正确识别模块类型。
When a project's `package.json` has `"type": "module"`, scripts that must run as CommonJS must use the `.cjs` extension so Node.js resolves the module type correctly.

---

## 8. 可沉淀为脚本 | Scripts Worth Automating

### Script-001: 新 Session 启动检查脚本 | Session Start Health Check

**目的 / Purpose**: 快速确认工作环境就绪状态。
Quick check of working environment readiness.

```bash
#!/bin/bash
# scripts/session-start-check.sh
echo "=== Session Start Check ==="
echo "Branch: $(git branch --show-current)"
echo "Status: $(git status --short | wc -l) uncommitted file(s)"
echo "LOAM_DUMP_DIR: ${LOAM_DUMP_DIR:-'NOT SET'}"
which aief > /dev/null 2>&1 && echo "AIEF: installed" || echo "AIEF: NOT FOUND"
which loam > /dev/null 2>&1 && echo "loam CLI: installed" || echo "loam CLI: NOT FOUND"
echo "==========================="
```

### Script-002: 文档提交前检查脚本 | Pre-commit Doc Check

**目的 / Purpose**: 一键运行文档质量门禁。
One-command documentation quality gate.

```bash
#!/bin/bash
# scripts/pre-commit-docs.sh
set -e
echo "Running bilingual check..."
node AIEF/scripts/check-bilingual-docs.cjs
echo "Checking for placeholder strings..."
if grep -r "YOUR_USERNAME\|TODO_REPLACE\|PLACEHOLDER" README* 2>/dev/null; then
  echo "ERROR: Placeholder strings found in README files" && exit 1
fi
echo "Checking Markdown table alignment..."
# (future: add markdownlint or custom table column checker)
echo "All doc checks passed."
```

### Script-003: GitFlow 标准合并脚本 | GitFlow Standard Merge

**目的 / Purpose**: 标准化 feature → develop → master 合并流程，避免遗漏步骤。
Standardize the feature → develop → master merge flow to avoid missing steps.

```bash
#!/bin/bash
# scripts/gitflow-merge.sh
BRANCH=$1
if [ -z "$BRANCH" ]; then echo "Usage: $0 <feature-branch>" && exit 1; fi
set -e
git checkout develop && git pull
git merge --no-ff "$BRANCH" -m "Merge $BRANCH into develop"
git checkout master && git pull
git merge --no-ff develop -m "Merge develop into master"
git push origin develop master
git branch -d "$BRANCH"
echo "Done. Merged $BRANCH → develop → master."
```
