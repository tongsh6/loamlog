# 当前焦点 | Current Focus

## 状态总览 | Status Summary

截至 2026-03-13，Loamlog 已完成 **Milestone A：可信底盘**，新增了三个关键基础设施：
As of 2026-03-13, Loamlog has completed **Milestone A: Trust Infrastructure**, adding three critical capabilities:

1. **Sanitization Gateway** — 日志脱敏硬前置层，确保敏感数据在进入 AI 处理前被安全脱敏
   Log sanitization gateway ensuring sensitive data is redacted before AI processing

2. **Triggered Intelligence Pipeline** — 阈值触发、异步批处理、性能隔离的智能萃取管道
   Threshold-based, async, rate-limited intelligence pipeline for efficient distill

3. **Evaluation Harness** — 质量评估框架，验证萃取准确性与行动建议质量
   Quality evaluation framework validating distill accuracy and action suggestions

同时，`claude-code` provider 的主路径实现也已进入仓库，说明"多源 provider 抽象是否成立"这个问题已经拿到初步工程答案。
The main `claude-code` provider path has also landed in the repository, which means the project already has an initial engineering answer for whether the multi-source provider abstraction works.

## 当前产品问题 | Current Product Question

当前最重要的问题不再是“能不能把第一条价值闭环做出来”，而是：这条已经合并到 `develop` 的闭环，是否真的会被用户持续使用，并且值得进入下一阶段自动化与产品化。
The highest-priority question is no longer whether the first high-value loop can be built, but whether the loop now merged into `develop` will produce sustained user value and justify the next phase of automation.

```text
AI conversation -> structured evidence -> local issue draft
```

## 当前活跃议题 | Current Active Threads

- `#5` — umbrella：zero-config discovery 方向
- `#9` / `#10` / `#11` — 作为后续 discovery 研究与规格拆分
- `#6` — Auto-Skill Generation，保留为 later-stage idea

当前已不再有围绕首条 issue-draft MVP 的活跃实现 issue；该闭环已完成并合并。
There are no longer active implementation issues for the first issue-draft MVP loop; that loop is complete and merged.

## 已关闭议题 | Closed Topic

- `#1` OpenCode plugin reload bug：源码与 npm 发布版本 `opencode-loamlog@0.2.3` 已对齐，因此按“已修复并已发布”关闭
- `#7` umbrella：AI 对话自动生成 GitHub Issue，已通过 PR #27 合并到 `develop`
- `#12`：issue-draft distiller MVP，已完成并关闭
- `#13`：file sink 输出 `.json` + `.md`，已完成并关闭
- `#14`：issue-draft 用法文档，已完成并关闭

## 近期非目标 | Near-Term Non-Goals

当前焦点下，以下内容不进入第一条产品闭环的实现范围：

- GitHub API 自动创建 issue
- approval / review workflow
- 多 session 合并 distill
- repo-specific template mapping
- discovery / auto-skill 等中长期主题抢占当前主线

## 下一阶段判断点 | Next-Phase Decision Points

在当前 MVP 已合并后，下一阶段的判断重点是：

- issue-draft 输出是否足够稳定、可复用、可读
- 用户是否真的会把本地 `.md` 草稿复制进 GitHub
- 是否已经值得推进 Stage 2 的自动化项（例如 GitHub API sink）

### `#5` umbrella

在以下子项全部完成后关闭：

- `#9` 完成
- `#10` 完成
- `#11` 完成
