# 狗粮验证记录 — Phase 2: Knowledge Card

> 日期：2026-05-04
> Loamlog 版本：v0.6.0
> Distiller：@loamlog/distiller-knowledge-card v0.2.0（改进后）
> LLM：LM Studio `qwen/qwen3.6-35b-a3b`（本地，`http://127.0.0.1:1234`）
> 验证结果归档：`~/loamlog-archive/distill/`

## 验证目标

用 knowledge-card distiller（验证难度最低的萃取器）验证第一条产品闭环：
AI 对话 → 结构化证据 → 本地 Knowledge Card。

Phase 1 已验证采集链路（1304 sessions, 72h+ 无崩溃），Phase 2 聚焦蒸馏链路。

## 核心改进：噪声过滤（v0.1.0 → v0.2.0）

### 问题诊断

v0.1.0 产出了大量噪音：3 个 session → 20 条 card，大部分是同一洞察的变体重复。

根因：
- LLM 有"讨好倾向"——prompt 说"提取知识"，模型会尽量找东西输出
- 没有代码层硬约束——parse 只检查 title + summary 非空
- 去重只检查完全相同标题，相似标题不合并

### 改进措施

1. **System prompt 改为 noise-filter-first**
   - "You are a noise filter first, a knowledge extractor second"
   - "Most AI coding sessions contain ZERO reusable knowledge. Returning [] is the correct behavior for >80% of sessions"
   - 明确列出不提取的内容类型（coding style preferences, obvious best practices, session-specific task lists）

2. **代码层硬约束**
   - `detail` ≥ 60 字符（`MIN_DETAIL_LENGTH`）
   - `confidence` ≥ 0.5（`MIN_CONFIDENCE`）
   - `title` ≥ 5 字符（`MIN_TITLE_LENGTH`）

3. **Session 内相似去重**
   - Jaccard 相似度 ≥ 0.7 的标题合并去重

4. **每 session 上限 5 条**（`MAX_CARDS_PER_SESSION`），按 confidence 降序取前 5

### 改进效果

| 指标 | v0.1.0 | v0.2.0 | 变化 |
|------|--------|--------|------|
| 输入 session | 3 | 3 | - |
| 产出 card | 20 | **2** | **-90%** |
| 噪音率（重复/模糊） | ~90% | ~0% | 消除 |

## 蒸馏结果

### 成功产出的 Knowledge Card

**Card 1: Git Provider Merge Conflict Detection API Limitations & Fixes**
- Confidence: 0.90
- Category: debugging
- Summary: GitHub 和 GitLab 的 diff/compare API 不会检测合并冲突；需要使用 test-merge 端点或临时 MR 工作流
- 质量评价: ★★★（3/3 直接可用）—— 具体 API 名称、端点路径、替代方案都明确

**Card 2: AI Coding Drift Prevention: Pre/Post Gates for Desktop/UI Fidelity**
- Confidence: 0.85
- Category: pattern
- Summary: 在 AI 辅助开发中实现 pre-implementation 约束文档和 post-implementation 构建门禁以防止桌面端架构漂移
- 质量评价: ★★（2/3 可用但需编辑）—— 洞察准确但表述稍长

### 验证指标

| 指标 | 当前状态 | 目标 | 达成？ |
|------|---------|------|--------|
| 知识卡片总数 | 2 | ≥10 | ❌ 未达成 |
| 评分 ≥2/3 比例 | 100% (2/2) | ≥60% | ✅ 初步达标（样本太少） |
| 平均置信度 | 0.875 | - | 良好 |

## 发现的瓶颈

### 瓶颈 1: LM Studio 处理大 session 超时

- Session `078a49cd`（650+ messages）→ 每个分片 5 分钟超时
- Session `639cb63a` → 同样超时
- 根因：本地 35B 模型处理 300+ msg 的分片需要 >5 分钟
- 影响：大 session 无法有效蒸馏，但大 session 恰恰最可能包含有价值洞察

### 瓶颈 2: DAG 串行处理阻塞后续产出

- DAG 的 `run_distiller` 节点是串行循环（for-await）
- 一个 session 超时/卡住，后续 session 的结果都不会写入 pending 目录
- 结果：进程被 kill 后，已处理 session 的结果全部丢失

### 瓶颈 3: 没有快速 LLM 后备

- DeepSeek API 未配置（无 API Key）
- OpenAI/Anthropic 也未配置
- 只能依赖本地 LM Studio，无法加速批量处理

## 结论

### 已证明

1. ✅ **噪声过滤是有效的** — 90% 噪音消除，产出质量从"一堆重复"提升到"每条都可操作"
2. ✅ **knowledge-card 是比 issue-draft 更易验证的萃取类型** — LLM 任务更简单，验证标准更清晰
3. ✅ **采集基础设施成熟** — 2004 sessions 已归档，覆盖 8 repos

### 未证明

1. ❌ **规模化产出能力** — 仅 2 条卡片，未达 ≥10 条目标
2. ❌ **用户价值** — 尚未验证用户是否会在实际工作中复用这些 knowledge card
3. ❌ **大 session 蒸馏** — 本地模型超时问题未解决

### Go/No-Go 决策

**暂不做出 Go/No-Go 决策**。噪声过滤已证明有效，但样本量不足。建议：

1. 配置 DeepSeek API（低成本、快速）来完成 ≥10 条的规模化验证
2. 或者：接受 LM Studio 慢速，每天运行蒸馏，1-2 周内自然累积到 10 条
3. 达到 10 条后再做最终决策

## 下一步建议

1. **配置远程 API** — DeepSeek（推荐，便宜快速）或 OpenAI key，消除 LM Studio 瓶颈
2. **改进 DAG runner** — 每个 session 的结果即时写入 pending（streaming write），而非等全部结束后统一写入
3. **添加 `--max-sessions` CLI 选项** — 限制处理 session 数量，避免被大 session 卡住
4. **继续累积样本** — 每天 `loam distill --since 1d`，自然增长

## 关键命令参考

```bash
# 查看未处理数量
loam distill --distiller @loamlog/distiller-knowledge-card --dry-run --all-unprocessed

# 运行蒸馏（LM Studio，适合小 session）
loam distill \
  --distiller @loamlog/distiller-knowledge-card \
  --llm lmstudio/qwen/qwen3.6-35b-a3b \
  --llm-timeout-ms 300000 \
  --since "2026-05-01T10:00:00Z" \
  --until "2026-05-01T22:00:00Z"

# 运行蒸馏（DeepSeek，推荐规模化使用）
loam distill \
  --distiller @loamlog/distiller-knowledge-card \
  --llm deepseek/deepseek-chat \
  --since 1d

# 查看结果
loam list --distill --pending
```
