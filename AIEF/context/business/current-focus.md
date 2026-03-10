# 当前焦点 | Current Focus

## 状态总览 | Status Summary

截至 2026-03-10，Loamlog 的 capture、archive、redaction、distill、本地 file sink 主路径都已在仓库中存在并可运行。
As of 2026-03-10, the capture, archive, redaction, distill, and local file-sink paths all exist in the repository and are runnable.

同时，`claude-code` provider 的主路径实现也已进入仓库，说明“多源 provider 抽象是否成立”这个问题已经拿到初步工程答案。
The main `claude-code` provider path has also landed in the repository, which means the project already has an initial engineering answer for whether the multi-source provider abstraction works.

## 当前产品问题 | Current Product Question

当前最重要的问题不是继续扩平台，而是验证第一条真正有即时价值的产品闭环：
The highest-priority question is no longer whether to extend the platform, but whether the first high-value user loop is real.

```text
AI conversation -> structured evidence -> local issue draft
```

## 活跃 Issue 结构 | Active Issue Structure

- `#7` — umbrella：AI 对话自动生成 GitHub Issue
- `#12` — issue-draft distiller MVP
- `#13` — file sink 输出 `.json` + `.md`
- `#14` — 实现后的使用文档

- `#5` — umbrella：zero-config discovery 方向
- `#9` / `#10` / `#11` — 作为后续 discovery 研究与规格拆分
- `#6` — Auto-Skill Generation，保留为 later-stage idea

## 已关闭议题 | Closed Topic

- `#1` OpenCode plugin reload bug：源码与 npm 发布版本 `opencode-loamlog@0.2.3` 已对齐，因此按“已修复并已发布”关闭

## 近期非目标 | Near-Term Non-Goals

当前焦点下，以下内容不进入第一条产品闭环的实现范围：

- GitHub API 自动创建 issue
- approval / review workflow
- 多 session 合并 distill
- repo-specific template mapping
- discovery / auto-skill 等中长期主题抢占当前主线

## 关闭条件 | Close Conditions

### `#7` umbrella

在以下子项全部完成后关闭：

- `#12` 完成
- `#13` 完成
- `#14` 完成

### `#5` umbrella

在以下子项全部完成后关闭：

- `#9` 完成
- `#10` 完成
- `#11` 完成
