# Loamlog

**让每次 AI 交互成为可复利资产。**

> 像沉积物随时间积累——你的 AI 对话逐渐沉淀为可复用的知识层。

Loamlog 是一个独立平台，自动采集来自多种 AI 编程工具（OpenCode、Claude Code、Cursor……）的会话，并通过可插拔的萃取引擎与多模型路由，将原始对话转化为结构化的可复用资产——Issue 草稿、PRD 草稿、知识卡片等。

[English](./README.md) | **中文**

---

## 为什么需要 Loamlog？

绝大多数 AI 对话都是一次性消费：得到答案、关掉标签页，上下文就此蒸发。

Loamlog 从三个层面打破这一模式：

| 痛点 | 问题描述 | Loamlog 的答案 |
|------|----------|---------------|
| **采集** | 手动导出容易遗漏；流式更新导致文件采集不完整 | 基于 daemon 的自动采集，通过 Provider 适配器接入 |
| **归档** | 产物分散，缺乏 repo/branch/commit 上下文 | 按 repo 分桶的快照归档，附带完整追溯元数据 |
| **转化** | 从对话到 Issue、PRD、知识点没有处理管道 | 可插拔萃取引擎，支持 LLM 路由与 evidence 回溯 |

---

## 架构

```
AI 工具           采集层                萃取引擎              输出端
─────────────     ─────────────────    ─────────────────    ──────────
OpenCode     ──►  loam daemon       ►  LLM Router        ►  本地文件
Claude Code  ──►  JSON 快照            多模型                github*
Cursor*      ──►  脱敏处理             多 distiller          notion*
             ──►  repo 上下文

                                    (* = 规划中)
```

**核心原则：**
- **Provider 可插拔** — `ProviderAdapter` 接口；任何 AI 工具均可接入
- **模型可插拔** — `LLMRouter` 统一路由到 OpenAI / Anthropic / DeepSeek / Ollama / ...
- **Distiller 可插拔** — `DistillerPlugin` 接口；任何人都可以编写萃取器
- **Sink 可插拔** — `SinkPlugin` 接口；支持本地文件、GitHub、Notion……
- **Evidence 必填** — `DistillResult` 必须回溯到 `session_id` + `message_id` + 原始文本

---

## 当前方向

截至 2026-03-10，Loamlog 已具备本地优先的 capture、archive、distill 可运行闭环。仓库中也已经包含第二类 provider（`claude-code`）的主路径实现；当前真正要回答的问题，不再只是“抽象能否成立”，而是“第一条让用户立刻感知价值的产品闭环是什么”。

- **今天已具备**：采集、归档、脱敏、evidence-backed distill，以及本地文件输出主路径都已在仓库中存在
- **当前产品焦点**：收敛首个 Killer Flow：`AI conversation -> issue draft`，先做本地 JSON + Markdown 输出，再考虑 GitHub API 自动投递
- **后续基础设施工作**：继续补强多源 provider 与延期的 CLI/docs 项，但不再让它们盖过第一条产品闭环

---

## 目录结构

```
loamlog/
├── packages/
│   ├── core/               # 核心 TypeScript 类型与接口契约
│   ├── archive/            # 统一存储（写入 / 脱敏 / 指纹）
│   ├── providers/
│   │   ├── opencode/       # OpenCode 数据源适配器
│   │   └── claude-code/    # Claude Code transcript 适配器
│   ├── distill/            # 萃取引擎 + LLM 路由
│   ├── distillers/         # 内置 distiller
│   ├── sinks/              # 输出适配器
│   └── cli/                # CLI 入口（loam 命令）
└── plugins/
    └── opencode/           # 薄桥接插件（仅事件转发）
```

---

## 当前状态

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| M0 | 验证 OpenCode 事件与 payload 拉取链路 | ✅ 已完成 |
| M1 | 采集层 MVP — 自动归档会话 | ✅ 已完成 |
| M2 | 萃取层 MVP — pitfall-card distiller | ✅ 已完成 |
| M3 | 多模型 LLM 路由 | ✅ 已完成 |
| M4 | 多数据源接入（Claude Code 等） | ◐ 主路径已落地，需继续补强 |
| M5 | 生态化 — Sink、审批流、更多 distiller | ⏳ 规划中 |

采集管道已可端到端运行：

```
OpenCode 插件 → POST /capture → loam daemon → provider 拉取 → 脱敏 → 原子 JSON 落盘
```

萃取管道现已可端到端运行：

```bash
loam distill --distiller @loamlog/distiller-pitfall-card --llm deepseek/deepseek-chat
```

当前路由器已支持以下 provider/model 组合示例：

```bash
loam distill --llm openai/gpt-4o-mini
loam distill --llm anthropic/claude-3-5-haiku-latest
loam distill --llm deepseek/deepseek-chat
loam distill --llm ollama/llama3.2:3b
```

下一条正在收敛的产品闭环是本地 issue 草稿生成：

```text
AI conversation -> structured evidence -> local issue draft (.json + .md)
```

---

## 快速上手

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 20 或 [Bun](https://bun.sh/) ≥ 1.0
- [pnpm](https://pnpm.io/) ≥ 9（开发用）
- 已安装并运行 OpenCode（使用 OpenCode Provider 时）

### 安装与构建

```bash
git clone https://github.com/tongsh6/loamlog.git
cd loamlog
pnpm install
pnpm run build
```

### 启动采集 daemon

```bash
# 设置归档目录
export LOAM_DUMP_DIR=~/loamlog-archive

# 启动 daemon（连接 OpenCode 的本地 HTTP API）
loam daemon --providers opencode
```

daemon 默认监听 `http://127.0.0.1:37468`，在 OpenCode 空闲时自动采集会话。

### 安装 OpenCode 插件

`opencode-loamlog` 插件负责将会话空闲事件转发给 `loam` 守护进程。建议全局安装，以便 OpenCode 能够正确识别：

```bash
npm install -g opencode-loamlog
```

将插件添加到全局配置文件 `~/.config/opencode/opencode.json` 中：

```json
{
  "plugins": ["opencode-loamlog@latest"]
}
```

**排查建议：**
- **守护进程地址**：默认连接到 `http://127.0.0.1:37468`。如有需要，可通过环境变量 `LOAM_DAEMON_URL` 覆盖。
- **日志验证**：检查 `/tmp/loamlog-debug.log` 以确认插件初始化和事件捕获状态。

npm: https://www.npmjs.com/package/opencode-loamlog

### 开发工作流

- 分支流转采用 `feature/* -> develop -> master`
- `develop` 是默认 PR 目标分支，`master` 是稳定发布分支
- `develop` 和 `master` 当前都受保护，正常流程需要 PR 且 `Test & Typecheck` 为绿色
- GitHub 已开启已合并分支自动删除

### 浏览归档

`loam list` 已进入规划，但当前尚未实现；现阶段请直接查看磁盘归档目录。

快照按以下结构组织：

```
$LOAM_DUMP_DIR/
└── repos/
    └── my-project/
        └── sessions/
            └── 2026-03-02T00-00-00-000Z-ses_abc123.json
```

---

## 脱敏

快照写入前，敏感数据**默认自动脱敏**：

| 模式 | 替换值 |
|------|--------|
| `sk-...`（OpenAI 密钥） | `[REDACTED:openai-token]` |
| `ghp_...`（GitHub Token） | `[REDACTED:github-token]` |
| `AKIA...`（AWS 密钥） | `[REDACTED:aws-key]` |
| `Bearer ...` 头部 | `[REDACTED:bearer-token]` |
| 含 `auth`、`credentials`、`.env` 的路径 | `[REDACTED:sensitive-path]` |

如需跳过特定模式：

```bash
export LOAM_REDACT_IGNORE="my-safe-pattern;another-pattern"
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LOAM_DUMP_DIR` | — | **必填。** 快照写入目录。未配置则不写入。 |
| `LOAM_REDACT_IGNORE` | — | 分号分隔的正则表达式，指定不脱敏的模式。 |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:4096` | OpenCode HTTP API 基础 URL。 |
| `OPENCODE_SERVER_TOKEN` | — | OpenCode API 鉴权 Bearer Token。 |
| `OPENCODE_DIRECTORY` | — | OpenCode 工作目录提示。 |

---

## 编写自定义 Distiller

本节文档为已发布的 M2 distiller SDK API。

```typescript
// my-distiller/index.ts
import { defineDistiller, createEvidence } from '@loamlog/distiller-sdk'

export default defineDistiller({
  id: '@my-org/find-todos',
  name: 'TODO 提取器',
  version: '1.0.0',
  supported_types: ['todo-item'],

  async run({ artifactStore }) {
    const results = []

    for await (const artifact of artifactStore.getUnprocessed('@my-org/find-todos')) {
      for (const msg of artifact.messages) {
        if (msg.role === 'user' && msg.content?.includes('TODO:')) {
          results.push({
            type: 'todo-item',
            title: '在会话中发现 TODO',
            summary: (msg.content ?? '').slice(0, 80),
            confidence: 1.0,
            tags: ['todo'],
            payload: { raw_text: msg.content },
            evidence: [createEvidence(artifact, msg, msg.content ?? '')],
          })
        }
      }
    }

    return results
  },
})
```

在 `loam.config.ts` 中注册：

```typescript
export default {
  dump_dir: process.env.LOAM_DUMP_DIR,
  distillers: ['./my-distiller'],
}
```

---

## 开发

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm run build

# 运行测试
pnpm run test

# 类型检查
pnpm run typecheck
```

### 包结构

| 包 | 说明 |
|----|------|
| `@loamlog/core` | 核心 TypeScript 类型与接口契约 |
| `@loamlog/archive` | 会话快照写入，支持原子写入与脱敏 |
| `@loamlog/provider-opencode` | 从 OpenCode 本地 HTTP API 拉取会话 |
| `@loamlog/cli` | CLI 入口（`loam` 命令） |
| `@loamlog/plugin-opencode` | 薄桥接插件 — 将 OpenCode 空闲事件转发给 daemon |

---

## 硬性约束

- **插件错误不得导致宿主崩溃** — 所有错误均已捕获并记录日志
- **默认开启脱敏** — Token、密钥、敏感路径自动替换
- **未配置 `LOAM_DUMP_DIR` 不写入** — 必须显式配置
- **无 evidence 不外发** — 没有来源回溯的 `DistillResult` 不得进入外部 Sink
- **第一阶段仅本地文件输出** — 外部 Sink 需显式启用

---

## 路线图

完整里程碑详见 [`AIEF/context/business/roadmap.md`](AIEF/context/business/roadmap.md)。

---

## 贡献

欢迎贡献代码。几条指引：

1. **语言**：代码、标识符、git commit 使用英文；交流语言不限。
2. **Evidence 必填**：Distiller 贡献必须包含 evidence 回溯——没有来源归属的结果不会被接受。
3. **不崩溃宿主**：插件错误必须捕获，绝不能传播并导致父进程崩溃。
4. **测试**：新功能须附带测试。

提交大型改动前请先开 Issue 讨论。

---

## License

MIT

---

*"让每次 AI 交互从一次性消费升级为可复利资产。"*
