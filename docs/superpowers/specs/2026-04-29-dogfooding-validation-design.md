# 设计文档：Loamlog 狗粮验证阶段

## 目的

通过自己日常使用 loamlog，验证第一条产品闭环（AI 对话 → 结构化证据 → 本地 Issue 草稿）是否证明了真实价值，为"是否进入 Stage 2 自动化"提供数据支撑。

## 背景

- v0.6.0 已完成 M0-M5 及 Milestone A，160 个测试全绿
- 4 个 provider：OpenCode、Claude Code、Gemini CLI、Codex
- 5 个 distiller：pitfall-card、issue-draft、knowledge-card、prd-draft + SDK
- 3 个 sink：file、GitHub、Notion
- DAG 管线 + 资产图质量门禁 + 审批流 + 审计追踪均已落地
- **第一条闭环已实现但未被真实使用验证过**
- 用户日常使用 5 个 AI 工具（OpenCode、Claude Code、Codex、Gemini CLI、Copilot）

## 前置条件

以下能力已就绪，无需额外开发：

- [x] `loam list` — 浏览会话和蒸馏结果
- [x] 4 个 provider watcher — OpenCode、Claude Code、Gemini CLI、Codex
- [x] `loam distill` — DAG 默认模式，端到端蒸馏
- [x] `loam review` — 审批/驳回
- [x] 脱敏 — 默认开启
- [x] 质量门禁 — validateAssetCandidate

## 策略

**被动采集 + 定期检查**：daemon 后台无人值守运行，定期用 CLI 工具查看采集和蒸馏结果，人工评估质量。

## 验证计划

### 阶段 1：采集跑通（第 1-3 天）

**目标**：daemon 稳定运行，4 个 provider 正常采集

```bash
# 1. 设置环境变量（追加到 ~/.zshrc 持久化）
export LOAM_DUMP_DIR=~/loamlog-archive
mkdir -p "$LOAM_DUMP_DIR"

# 2. 启动 daemon（4 个 provider）
loam daemon --providers opencode,claude-code,gemini-cli,codex

# 3. 后台运行（tmux/screen 或 nohup）
nohup loam daemon --providers opencode,claude-code,gemini-cli,codex \
  > /tmp/loam-daemon.log 2>&1 &

# 4. 定期检查（每天 1-2 次）
loam list --limit 10
loam list --repo <your-project> --since 24h
```

**验收**：
- [ ] daemon 启动后 48 小时内稳定运行，无崩溃
- [ ] 每个 provider 至少成功采集 3 个 session
- [ ] `loam list` 能正确展示采集结果
- [ ] `$LOAM_DUMP_DIR` 下按 repo 正确分桶

### 阶段 2：蒸馏质量评估（第 4-10 天）

**目标**：累积足够样本，人工评估 distill 质量

```bash
# 1. 查看采集总量
loam list --limit 100

# 2. 对指定 repo 运行蒸馏
loam distill --distiller @loamlog/distiller-issue-draft --llm deepseek/deepseek-chat

# 3. 查看蒸馏结果
loam list --distill --pending
loam list --distill --limit 20

# 4. 阅读每条草稿，按以下标准评分
cat "$LOAM_DUMP_DIR/distill/<repo>/pending/<result-id>.md"
```

**人工评分标准（1-5）**：

| 维度 | 1 分 | 3 分 | 5 分 |
|------|------|------|------|
| 标题准确性 | 与对话内容无关 | 大致相关但不够精确 | 准确概括核心问题 |
| 上下文完整度 | 缺少关键背景 | 有背景但不完整 | 读者无需看原始对话即可理解 |
| 可操作性 | 无法执行 | 模糊但可理解 | 明确、可执行的行动项 |

**验收**：
- [ ] 累积至少 10-15 个 session 快照，覆盖不同工作类型（bug 修复、功能开发、重构、探索）
- [ ] 每条 Issue 草稿完成人工评分
- [ ] 记录评分数据，用于后续 evaluation-harness 校准

### 阶段 3：决策（第 10-14 天）

| 评估维度 | 达标信号 | 未达标信号 |
|---------|---------|-----------|
| 蒸馏质量 | ≥60% 的草稿评分 ≥3/5 | 多数草稿不可用 |
| 采集覆盖 | 日常工具都能稳定采集 | provider 频繁出错或漏会话 |
| 工作流摩擦 | daemon 无感知运行 | 需要频繁手动干预 |

**可能结论**：

- 质量过关 → 进入 M5.1（GitHub sink 自动外发）
- 质量问题 → 投入 evaluation-harness + prompt 调优
- 采集问题 → 修 provider bug
- 覆盖不足 → 加 Copilot provider

## 风险

- Gemini CLI session 格式可能随版本变化，需要关注上游变更
- 如果日常 AI 工具使用量不足，可能需要更长时间积累足够的评估样本
- OpenCode 依赖本地 HTTP API + 插件转发，如果 OpenCode 未运行则无数据
- Copilot 暂无 provider（用户使用的 5 个工具中唯一缺失的），如需覆盖需后续开发
