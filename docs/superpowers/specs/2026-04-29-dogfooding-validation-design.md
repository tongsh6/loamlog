# 设计文档：Loamlog 狗粮验证阶段

## 目的

通过自己日常使用 loamlog，验证第一条产品闭环（AI 对话 → 结构化证据 → 本地 Issue 草稿）是否证明了真实价值，为"是否进入 Stage 2 自动化"提供数据支撑。

## 背景

- v0.4.0 已完成 Milestone A（sanitizer / trigger / evaluation-harness）
- M4（多数据源）Claude Code provider 主路径已落地
- 第一条闭环已实现但**未被真实使用验证过**
- 距离上次功能交付已约 6 周，期间主要是文档同步
- 用户日常使用 5 个 AI 工具（OpenCode、Claude Code、Codex、Gemini CLI、Copilot）
- 当前只有 OpenCode（较完整）和 Claude Code（主路径落地）两个 provider

## 策略

**被动采集 + 定期检查**：daemon 后台无人值守运行，定期用 CLI 工具查看采集和蒸馏结果，人工评估质量。

## 工作拆分

### 线 1：`loam list` 命令（~150 行）

让"定期检查"有工具可用，不再手动翻 `$LOAM_DUMP_DIR` 目录。

**命令接口**：

```
loam list                    # 列出最近会话（默认20条）
loam list --repo <name>      # 按仓库过滤
loam list --since 7d         # 最近7天
loam list --distill          # 列出蒸馏结果
loam list --pending          # 只列出待处理的 pending 结果
loam list --limit <n>        # 最多显示条数（默认 20）
loam list --json             # JSON 格式输出
```

**实现要点**：

- 读取 `$LOAM_DUMP_DIR/repos/<repo>/sessions/` 下的 snapshot JSON
- 只解析 `meta` / `redacted` 等顶层字段，不加载完整 messages
- 默认 repo 从当前目录 git remote 推断
- 时间倒序排列
- 放在 `packages/cli/src/list.ts`

### 线 2：Gemini CLI Provider（~400 行）

从 `~/.gemini/tmp/<project_hash>/chats/session-*.json` 自动发现和采集 Gemini CLI 会话。

**数据格式**：Gemini CLI `ConversationRecord` JSON，含 messages（user/gemini/info/error/warning）、toolCalls、thoughts、tokens。

**类型映射**：

| Gemini CLI | Loamlog |
|-----------|---------|
| `msg.type: "user"` | `role: "user"` |
| `msg.type: "gemini"` | `role: "assistant"` |
| `msg.type: "info"/"error"/"warning"` | `role: "system"` |
| `msg.content.parts[].text` | `content` + `parts[type:"text"]` |
| `msg.thoughts[].text` | `parts[type:"reasoning"]` |
| `msg.toolCalls[]` | `parts[type:"tool"]` + `tools[]` |
| `msg.tokens` | 保留在 `session` 元数据中 |

**Watcher 模式**（复用 Claude Code provider 模式）：

1. 启动时扫描 `~/.gemini/tmp/*/chats/session-*.json`，记录已知文件
2. 定期轮询，发现新文件或 mtime 变更时启动 idle 计时器
3. 文件 mtime 超过 `idleMs`（默认 30s）未变化，视为会话结束
4. 读取 session JSON → 解析为 `PulledSessionPayload` → POST `/capture` 给 daemon

**文件结构**：

```
packages/providers/gemini-cli/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts            # SessionProvider + startWatcher 导出
    └── index.test.ts       # fixture 驱动的单元测试
```

**集成点**：

- CLI `providers.ts` 注册 `gemini-cli` 条目
- CLI `index.ts` 在 daemon 启动时创建 watcher（模式与 claude-code 一致）

**测试**：

- 使用 fixture JSON 文件（完整 Gemini CLI session）
- 验证消息角色映射、工具调用解析、thoughts 映射
- 验证边界：空 session、无 toolCalls、无 thoughts

### 线 3：立即开始采集（零代码）

- 设置 `LOAM_DUMP_DIR=~/loamlog-archive`
- 启动 daemon：`loam daemon --providers opencode,claude-code`
- 安装 OpenCode 插件（已有 npm 包 `opencode-loamlog`）
- Gemini CLI provider 完成后加上 `,gemini-cli`

## 验证计划

### 阶段 1：采集跑通（第 1-3 天）

- daemon 启动后 48 小时内稳定运行
- 每个 provider 至少成功采集 3 个 session
- `loam list` 能正确展示采集结果
- `$LOAM_DUMP_DIR` 下按 repo 正确分桶

### 阶段 2：蒸馏质量评估（第 4-10 天）

- 累积至少 10-15 个 session 快照，覆盖不同工作类型
- 手动跑 `loam distill --distiller @loamlog/distiller-issue-draft`
- 人工评分（1-5）评估每条 Issue 草稿的标题准确性、上下文完整度、可操作性

### 阶段 3：决策（第 10-14 天）

| 评估维度 | 达标信号 | 未达标信号 |
|---------|---------|-----------|
| 蒸馏质量 | ≥60% 的草稿评分 ≥3/5 | 多数草稿不可用 |
| 采集覆盖 | 日常工具都能稳定采集 | provider 频繁出错或漏会话 |
| 工作流摩擦 | daemon 无感知运行 | 需要频繁手动干预 |

**可能结论**：

- 质量过关 → M5.1（GitHub sink）
- 质量问题 → 投入 evaluation-harness + prompt 调优
- 采集问题 → 修 provider bug
- 覆盖不足 → 加 Codex/Copilot provider

## 不做的事

- 不做自动化定时蒸馏（保持手动可控）
- 不做 GitHub API / Notion 外部发布
- 不做仪表盘/Web UI
- 不做 loam review/approve 审批流
- 不在本次加 Codex/Copilot provider（等验证完 Gemini CLI 模式后再决策）

## 风险

- Gemini CLI session 格式可能随版本变化，需要关注上游变更
- 如果日常 AI 工具使用量不足，可能需要更长时间积累足够的评估样本
- OpenCode 依赖本地 HTTP API + 插件转发，如果 OpenCode 未运行则无数据
