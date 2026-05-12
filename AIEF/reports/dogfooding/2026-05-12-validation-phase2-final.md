# Dogfooding Phase 2 终版验证报告 — Knowledge Card

> 日期：2026-05-12
> 范围：knowledge-card distiller Phase 2 batch 6
> 运行日志：`/tmp/loam-distill-phase2-batch6.log`
> 人工 review 视图：`/tmp/loam-phase2-batch6-review.md`

## 1. 结论

**Conditional Go / 有条件通过。**

2026-05-11 batch 6 共产出 10 张 knowledge-card 候选卡。人工评分中，6 张达到 `>=3/5`，刚好满足 ledger 设定的 `>=60%` 门槛。

这说明 knowledge-card 方向可以继续推进，但不能解锁外部自动投递，也不能启动 MCP / FTS5 / 增量冶炼等新架构扩面。当前结果只是压线达标，低分卡暴露出质量门禁仍然偏松。

## 2. 门禁结果

| 门禁项 | 目标 | 本次结果 | 状态 |
| :--- | :--- | :--- | :--- |
| review 样本量 | >=10 张卡 | 10 张卡 | 通过 |
| 人工质量评分 | >=60% 的卡达到 >=3/5 | 6/10 = 60% | 压线通过 |
| 运行稳定性 | 无阻断性 batch 错误 | 0 errors | 通过 |
| 外部自动投递准备度 | 高质量、低误导风险 | 未达到 | 阻断 |

## 3. 证据

运行证据：

- `/tmp/loam-distill-phase2-batch6.log`
- 输入：49 个 unique sessions，其中 17 个小于 800KB
- 输出：`processed=12 produced=10 skipped=3 errors=0`
- DAG 节点：`query_artifacts`、`run_distiller`、`process_results`、`deliver_to_sinks` 全部成功
- 运行耗时：212s
- LLM：LM Studio `gpt-oss-120b`

人工 review 证据：

- `/tmp/loam-phase2-batch6-review.md`
- 10 张 knowledge-card 候选卡已逐条人工评分

## 4. 评分标准

| 分数 | 含义 |
| :--- | :--- |
| 5/5 | 完整可复用资产。包含场景、症状、原因、解法、边界和可信证据，基本无需回看原始会话。 |
| 4/5 | 明显可复用，少量编辑即可沉淀。 |
| 3/5 | 有用但不完整，需要补充上下文或编辑后才好用。 |
| 2/5 | 价值较弱，主要是结论、操作笔记或项目碎片，前因后果不足。 |
| 1/5 | 噪声、误导、证据不支撑，或不适合作为 knowledge-card。 |

评分 `>=3/5` 记为通过。

## 5. 人工评分明细

| # | 卡片 | 分数 | 是否通过 | 评审备注 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 用单一 `.env` 文件集中管理服务端口 | 2/5 | 否 | 只有做法，没有把前因后果讲完整；看完不知道为什么这件事重要、什么场景会踩坑，必须回原始会话才能理解价值。 |
| 2 | Loamlog Claude Code provider 监听 `~/.claude/projects/*.jsonl` 并用 30 秒 idle 检测采集 | 2/5 | 否 | 更像 Loamlog 实现说明，不是可复用知识；缺少“为什么用 idle 文件监听”“适用边界和风险”。 |
| 3 | 使用 `git subtree` 合并多个仓库为 monorepo 并保留历史 | 3/5 | 是 | 有明确可复用场景和具体命令，能指导多仓合并；但缺少与 submodule / 直接复制的取舍、冲突与回滚注意事项，证据也偏单薄。 |
| 4 | 统一静态代码扫描闭环及 Top 10 问题排序规则 | 4/5 | 是 | 有明确工程治理价值，能复用于 AI 代码完成门禁；方案包含统一入口、Finding schema、Top N 排序、baseline 和复扫闭环，但还缺少 blocking / deferred 规则和最小落地示例。 |
| 5 | 竖切面（Vertical Slice）任务组织方式 | 4/5 | 是 | 复用价值高，能指导任务拆分和防止 AI 横向大改；层次链路和依赖方向较清楚，但缺少一个具体业务例子和可直接套用的任务模板。 |
| 6 | 在 WebStorm 中通过 Node.js 配置运行 monorepo CLI 项目 | 3/5 | 是 | 具体且已验证，对 WebStorm 调试 monorepo CLI 有用；但适用范围较窄，缺少参数传递、源码调试和 build 前置条件说明，更像工具操作笔记。 |
| 7 | Claude Code 与 v3 统一 agent loop 的对比与可吸收要点 | 3/5 | 是 | 有可复用的 agent host 设计要点，如分层配置、插件生命周期、trace/replay；但强依赖 v3 背景，前因后果不足，更像架构对比摘要，需要重写成通用原则才好用。 |
| 8 | Elixir 中正确格式化时间戳的方法 | 4/5 | 是 | 具体调试知识，说明了时间戳异常的原因和修复方式，跨 Elixir 项目可复用；但还应更严谨地区分 `system_time`、`monotonic_time`、`os_time`，并补充正确 API 参数用法。 |
| 9 | 将 `.claude/` 加入 `.gitignore` 并单独提交 `config-loader` | 1/5 | 否 | evidence 不支撑结论，只引用了 `local-command-caveat`；内容像项目流水账或误抽取，不应沉淀为 knowledge-card。 |
| 10 | Elixir `File.write` 写二进制数据时避免重复 UTF-8 编码 | 2/5 | 否 | 抓到了真实编码坑，但解法和表述不严谨；`:utf8` 不是一概不能用，`IO.binwrite/2` 也不能直接替代 `File.write/3`。这张卡如果不重写，容易误导读者。 |

汇总：

```text
通过：6/10
未通过：4/10
通过率：60%
结论：Conditional Go / 有条件通过
```

## 6. 质量问题

### 问题 1：卡片经常缺少可复用上下文

低分卡往往只有结论，没有交代场景、症状、原因和适用边界。卡 1 是典型例子：做法本身合理，但没有充分说明“多端口硬编码导致 Tauri 启动失败”这一前因后果。

### 问题 2：evidence 支撑不稳定

卡 9 应该在人工 review 前就被拒绝，因为 evidence 摘录完全不能支撑卡片结论。这是产品质量问题，不只是评审口味问题。

### 问题 3：技术正确性门禁不够严格

卡 10 捕捉到了 Elixir 文件编码真实问题，但推荐解法过于绝对，可能误导读者。knowledge-card 不能只因为提到了真实 bug 就通过，解法本身也必须准确。

### 问题 4：部分卡片是实现说明，不是知识资产

卡 2 描述的是 Loamlog Claude Code provider 的当前实现。只有把它改写成“当工具没有可靠 session idle 事件时，可用文件 mtime + idle window 作为采集触发”的通用模式，才具备更强复用价值。

### 问题 5：语言不符合项目默认交流习惯

本批次大量卡片标题和正文为英文。Loamlog 项目级规则要求交流默认中文，代码、命令、标识符保持英文。knowledge-card 作为给人复用的资产，应支持按项目语言偏好输出；当前语言控制不足。

## 7. 后续动作

| 优先级 | 动作 | 产物 | 验收 |
| :--- | :--- | :--- | :--- |
| P0 | 更新项目 ledger，登记本报告结论 | `docs/project-ledger.md` | 产品门禁显示 Conditional Go，并链接本报告 |
| P1 | 修复 shard `reduceResults` 回归 | `packages/distill/src/shard.ts` | `pnpm run test` 全绿 |
| P1 | 收紧 knowledge-card 质量门禁 | prompt / parser / quality gate | 新卡必须包含场景、问题、原因、做法、边界，并有 evidence 支撑 |
| P1 | 增加语言偏好控制 | 配置、CLI 或 distiller config | 可指定输出中文 / 英文 / 跟随输入语言；中文项目默认输出中文 |
| P1 | 在人工 review 前拒绝 evidence 不支撑的卡片 | distiller 或 quality gate 变更 | 类似卡 9 的误抽取被自动阻断 |
| P2 | 再跑一轮小批量 dogfooding | 新 review 报告 | 目标通过率 >=70%，且 1/5、2/5 卡片明显减少 |

## 8. 下一门禁前不做

暂不启动：

- MCP server 实现
- FTS5 或向量检索升级
- 增量冶炼扩展
- GitHub / Notion 自动外部投递
- 新 distiller 扩展

原因：产品闭环只是压线达标。下一步应提升卡片质量、修复测试回归，而不是扩大产品表面积。

## 9. 最终判断

knowledge-card 方向可行，但当前质量仍然脆弱。本批次证明 Loamlog 能从真实 AI 会话中产出有价值的可复用资产，也证明现有质量门禁偏宽。

**下一步最应该做：**修复 `reduceResults`，收紧 knowledge-card 的内容质量、evidence 支撑、技术正确性和语言偏好控制，然后再跑一轮小批量 dogfooding，目标通过率 `>=70%`。
