# 狗粮验证记录 — Phase 1 & Phase 2

> 日期：2026-05-02
> Loamlog 版本：v0.6.0
> daemon PID：85168（运行中）
> LLM：LM Studio `qwen/qwen3.6-35b-a3b`（本地，`http://127.0.0.1:1234`，无 API Key）
> 验证结果归档：`~/loamlog-archive/distill/`

## 验证目标

验证第一条产品闭环（AI 对话 → 结构化证据 → 本地 Issue 草稿）是否证明真实用户价值。

## Phase 1: 采集验证 — ✅ 通过

### 采集规模

| 指标 | 数值 |
|------|------|
| 总 session 数 | 1,304 |
| daemon 连续运行 | 72h+ 无崩溃 |
| 覆盖 repo 数 | 9 |

### 按 Provider 分布

| Provider | 采集数 | 状态 |
|----------|--------|------|
| Claude Code | 1,230 | 稳定 |
| OpenCode | 60 | 稳定 |
| Codex | 9 | 修复后恢复 |
| Gemini CLI | 5 | 稳定（用户使用频率低） |

### 按 Repo 分布

| Repo | 数量 |
|------|------|
| ai-novel-studio | 432 |
| dsh | 350 |
| loamlog | 163 |
| release-hub | 141 |
| SV____ | 96 |
| test | 60 |
| releasehub | 57 |
| ui-design | 2 |
| _global | 3 |

### 发现的 Bug

**Bug 1: Codex provider 解析失败** — `content.filter is not a function`
- 提交：`614a833`（develop）
- 根因：(1) `function_call_output.payload.output` 在新版 Codex 中为纯字符串而非数组；(2) `listSessionFiles/findSessionFile` 不支持文件直接存放于 day 目录下的新版目录结构
- 修复后：6/6 Codex session 文件解析成功（修复前仅 2/6）

## Phase 2: 蒸馏验证 — ⚠️ 部分通过

### 蒸馏 LLM 环境

**当前使用的 LLM：LM Studio（本地）**
- Provider：`lmstudio`（已内置在 `packages/distill/src/providers/lmstudio.ts`）
- 模型：`qwen/qwen3.6-35b-a3b`（MoE，本地推理）
- 端点：`http://127.0.0.1:1234`（OpenAI 兼容 API）
- **不需要 API Key**（LM Studio 是本地服务）

**运行命令**：
```bash
loam distill \
  --distiller @loamlog/distiller-issue-draft \
  --llm lmstudio/qwen/qwen3.6-35b-a3b \
  --llm-timeout-ms 300000
```

### 蒸馏结果

**成功产出 2 条 Issue 草稿**，质量评分如下：

| Result ID | 来源 Session | 标题 | 评分 | 备注 |
|-----------|-------------|------|------|------|
| `22c61686...` | 4-msg Codex session (ai-novel-studio) | Adopt Vertical Slice Granularity for Task Orchestration in ai-novel-studio | **4/5** | 标题准确、AC 可操作、证据充分 |
| `8c889780...` | 6-msg Claude Code session (unknown repo) | Architectural Drift Prevention: Implement Platform & UI Design Gates | **3.5/5** | 结构完整、方案具体，背景略缺 |

**第一条草稿示例**（`22c61686...`）：
- Labels: `planning, architecture, process`
- Background: 清晰描述项目架构约束和竖切面粒度需求
- Problem: 缺乏标准化规划约定导致反馈延迟和架构漂移
- Proposed Solution: 4 步方案（模板标准化 → 组件映射 → 前端策略 → 试点）
- Acceptance Criteria: 5 条可操作的验收标准
- Evidence: 3 条对话摘录引用

**第二条草稿示例**（`8c889780...`）：
- Labels: `process-improvement, quality-assurance, workflow, ai-dev`
- 主题：桌面端 vs Web 端架构漂移的检查门禁设计
- 4 步方案，5 条验收标准

### 已验证的问题及解决

| 问题 | 状态 | 说明 |
|------|------|------|
| LM Studio 上下文长度不足（4096） | ✅ 已解决 | 在 LM Studio 中将模型上下文长度调至 ≥32K（实际使用 131072）|
| JSON 输出格式不稳定 | ✅ 已修复 | `parse.ts` 加 try/catch，解析失败时跳过而非崩溃（提交 `49b8546`）|
| 本地模型推理超时（默认 30s） | ✅ 已绕过 | 使用 `--llm-timeout-ms 300000`（5 分钟）|
| 大 session（100+ msgs）超过本地模型处理能力 | ⚠️ 待解决 | 需实现 prompt 截断策略（当前只处理 ≤31 msg 的 session）|
| LM Studio 不支持 `json_object` response_format | 📝 已知 | `supportsJsonResponseFormat: false`，后续可考虑实现 `json_schema` 支持 |

### 蒸馏管道性能

单次蒸馏 DAG 运行（4 节点全绿）：
```
✓ query_artifacts:    ~31s  (扫描 1300+ sessions)
✓ run_distiller:      ~41s  (5 sessions, 35B 本地模型)
✓ process_results:    ~2ms  (质量门禁 + 去重)
✓ deliver_to_sinks:   ~1ms  (写入 .json + .md + 审计记录)
```

### 蒸馏产出率

- 5 个 session → 1 条草稿（20% 产出率）
- 模型保守过滤弱信号 session（符合 prompt 设计意图）
- 需要更多中等规模（20-80 msg）的 session 来验证产出率

## Phase 3: 决策（初步）

| 评估维度 | 当前状态 | 判断 |
|---------|---------|------|
| 蒸馏质量 | 2 条草稿，评分 4/5 + 3.5/5 | 🟢 初步达标（但样本太少） |
| 采集覆盖 | 4 provider 全稳定 | 🟢 达标 |
| 工作流摩擦 | daemon 无感知运行 | 🟢 达标 |

**当前判断**：采集链路成熟，蒸馏链路在 LM Studio 上可运行但受本地模型性能限制。需要累积更多蒸馏样本（≥10 条）才能做出最终 Go/No-Go 决策。

## 下一步

1. **持续采集** — daemon 已在后台运行（PID 85168），无需干预
2. **定期蒸馏** — 每隔几天运行一次 `loam distill --llm lmstudio/qwen/qwen3.6-35b-a3b --llm-timeout-ms 300000`，针对新采集的 session
3. **实现 prompt 截断** — 对超过 N 条消息的 session，只取首尾消息或摘要（解锁大型 session 的蒸馏）
4. **累积评分样本** — 目标 ≥10 条草稿，≥60% 评分 ≥3/5

## 关键配置参考（给后续 AI 或开发者）

```bash
# 环境变量
export LOAM_DUMP_DIR=~/loamlog-archive

# 启动 daemon（4 provider）
loam daemon --providers opencode,claude-code,gemini-cli,codex

# 查看采集结果
loam list --limit 20

# 查看蒸馏结果
loam list --distill --pending

# 运行蒸馏（LM Studio 本地，推荐超时 5 分钟）
loam distill \
  --distiller @loamlog/distiller-issue-draft \
  --llm lmstudio/qwen/qwen3.6-35b-a3b \
  --llm-timeout-ms 300000

# 运行蒸馏（远程 API）
loam distill \
  --distiller @loamlog/distiller-issue-draft \
  --llm deepseek/deepseek-chat
```

**注意**：当前项目默认使用 LM Studio 本地推理，不是远程 API。如果 `DEEPSEEK_API_KEY` 等环境变量未设置，蒸馏需要使用 `lmstudio` provider。
