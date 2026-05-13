# Representative Assets Dogfooding Batch 1

> 日期：2026-05-13  
> 范围：5 类代表性 AI 协作资产萃取器的真实样本冒烟验证  
> 模型：LM Studio `openai/gpt-oss-120b`  
> 临时 dump：`/tmp/loam-representative-dogfood-2026-05-13`  
> 样本：5 个真实 Loamlog 会话快照，provider 均为 `claude-code`

## 1. 一句话结论

本轮代表性资产 dogfooding 的结论是 **Execution Smoke Go / Product Quality Pending**。

5 类新萃取器均能在真实会话上跑通 DAG、quality gate、refine 与本地 file sink，共生成 41 条 pending 资产，且每条资产都有 evidence backlinks；但这还不能视为跨资产产品闭环完成，因为样本只覆盖 `claude-code`，所有结果仍处于人工 review 前的 `pending` 状态，且现有 verifier 对非代码类资产只能给出 `unverified`。

## 2. 样本设置

为避免污染主归档的 distill state，本轮没有直接对 `/Users/loong/loamlog-archive` 运行正式蒸馏，而是复制 5 个真实 Loamlog session 到临时 dump：

| Session | 时间 | 消息数 | 大小 |
| --- | --- | ---: | ---: |
| `64b84096-8211-472b-aa6a-05530eb97438` | 2026-05-01T14:45:41Z | 333 | 1,177,832 bytes |
| `04e8abc1-2a3d-4f21-8b7b-0326f1870ea5` | 2026-05-01T17:50:19Z | 225 | 1,012,536 bytes |
| `dfda27cd-1bc0-4d24-84e6-8e85de7e3b31` | 2026-05-01T19:27:11Z | 20 | 163,493 bytes |
| `d977c8a1-455c-4ac5-b394-d4679a8d7f08` | 2026-05-02T16:32:31Z | 81 | 248,864 bytes |
| `1a12faa5-b73a-4beb-9f21-e2df02a84357` | 2026-05-02T16:50:05Z | 69 | 332,479 bytes |

临时 dump 总大小：`2.8M`。

## 3. 执行命令

每类资产分别运行，便于隔离统计和 review：

```bash
node packages/cli/dist/index.js distill --dump-dir /tmp/loam-representative-dogfood-2026-05-13 --distiller @loamlog/distiller-idea-seed --llm lmstudio/openai/gpt-oss-120b --llm-timeout-ms 120000 --output-language zh --max-sessions 5
node packages/cli/dist/index.js distill --dump-dir /tmp/loam-representative-dogfood-2026-05-13 --distiller @loamlog/distiller-practice-pitfall --llm lmstudio/openai/gpt-oss-120b --llm-timeout-ms 120000 --output-language zh --max-sessions 5
node packages/cli/dist/index.js distill --dump-dir /tmp/loam-representative-dogfood-2026-05-13 --distiller @loamlog/distiller-decision-rationale --llm lmstudio/openai/gpt-oss-120b --llm-timeout-ms 120000 --output-language zh --max-sessions 5
node packages/cli/dist/index.js distill --dump-dir /tmp/loam-representative-dogfood-2026-05-13 --distiller @loamlog/distiller-follow-up-work-item --llm lmstudio/openai/gpt-oss-120b --llm-timeout-ms 120000 --output-language zh --max-sessions 5
node packages/cli/dist/index.js distill --dump-dir /tmp/loam-representative-dogfood-2026-05-13 --distiller @loamlog/distiller-skill-candidate --llm lmstudio/openai/gpt-oss-120b --llm-timeout-ms 120000 --output-language zh --max-sessions 5
```

Review 列表：

```bash
node packages/cli/dist/index.js list --dump-dir /tmp/loam-representative-dogfood-2026-05-13 --distill --pending --format md --limit 100
```

## 4. 运行结果

| Distiller | Processed | Produced | Skipped | Errors | Quality | Runtime |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `idea-seed` | 5 | 11 | 2 | 0 | 13/13 | 104008ms |
| `practice-pitfall` | 5 | 4 | 1 | 0 | 5/5 | 71007ms |
| `decision-rationale` | 5 | 7 | 2 | 0 | 7/7 | 101958ms |
| `follow-up-work-item` | 5 | 11 | 2 | 0 | 12/12 | 101329ms |
| `skill-candidate` | 5 | 8 | 0 | 0 | 9/9 | 120570ms |

汇总：

- 5/5 distiller 跑通；
- 25 个 session-distiller 组合完成；
- 41 条 pending 资产写入 file sink；
- 46/46 候选通过当前 quality gate；
- 7 条候选在 smelt 阶段被过滤；
- 0 个 distiller error；
- 41/41 pending 资产都有 evidence backlinks；
- 41/41 当前 verification 为 `unverified`，原因是候选没有可被 git-gap 验证的文件路径。

## 5. 类型分布

| 类型 | 数量 | 平均置信度 | Evidence 数范围 |
| --- | ---: | ---: | --- |
| `idea-seed` | 11 | 0.90 | 1-3 |
| `practice-pitfall` | 4 | 0.70 | 1-4 |
| `decision-rationale` | 7 | 0.90 | 1-3 |
| `follow-up-work-item` | 11 | 0.92 | 1-4 |
| `skill-candidate` | 8 | 0.96 | 1-6 |

## 6. 初步人工观察

### 6.1 正向信号

1. **代表性覆盖成立**：5 类资产分别覆盖想法、经验教训、决策理由、后续工作、协作流程沉淀，比 `knowledge-card` 单点更贴近 Loamlog 愿景。
2. **证据硬约束生效**：产出资产均保留 evidence backlinks；无 evidence 的候选没有进入输出。
3. **DAG 过滤有作用**：部分候选被标记为 `archived` 或 `rejected`，例如“已经在 Git 中实现”或“路径不存在疑似幻觉”。
4. **中文输出基本符合偏好**：主体内容为中文，代码、命令、标识符保持英文。
5. **`follow-up-work-item` 价值明显**：对工程负责人最直接，可把历史会话中散落的后续事项拉出来进入 review。

### 6.2 暴露问题

1. **现有 verifier 偏代码路径**：idea、decision、skill 等非代码资产没有文件路径时全部落到 `unverified`，不能说明 evidence 不成立，只说明当前验证器不适配这类资产。
2. **历史会话会产出过期资产**：例如旧的 `issue-candidate / prd-draft`、MCP、CI 等事项仍会被提取。smelt 能过滤一部分已实现项，但不能替代人工判断“当前是否仍有价值”。
3. **`skill-candidate` 边界仍需收紧**：部分候选像 `git_push_branch`、`set_environment_variable`、`create_issue`，更像通用操作或自动化命令，不一定值得成为 Loamlog 资产。
4. **`follow-up-work-item` 会抽出过泛任务**：如 `implement_core_feature_x`，需要在 review 阶段标记为低质量或不可执行。
5. **`practice-pitfall` 数量少但质量线更清楚**：它更依赖明确失败、修复、经验三段证据，后续应宁缺毋滥。

## 7. 当前判断

本轮足以证明：

```text
real sessions -> pluggable distillers -> evidence-backed candidates -> local pending assets
```

这条跨资产执行链路可以跑通。

本轮尚未证明：

```text
multi-provider continuous capture
  -> cross-asset human review
  -> accepted asset store
  -> reuse in later work
  -> feedback back into distillers
```

因此不应把本轮结论升级为平台闭环完成，也不应据此解锁 MCP server、Action Executor、Dashboard 或 Auto-Skill Generation。

## 8. 下一步

1. 为 5 类代表性资产补一份统一人工 review rubric：证据支撑、当前价值、可复用性、可执行性、过期风险。
2. 将 `verification` 扩展为非代码资产也适用的 evidence-support review，而不是只看候选是否含文件路径。
3. 对 `skill-candidate` 增加边界：区分 `runbook`、`codex_skill`、`instruction_rule_candidate`、`too_generic`。
4. 在下一批样本中加入非 `claude-code` provider，至少覆盖 OpenCode 或 Codex。
5. 从 41 条 pending 中人工选出 5-10 条资产，验证它们能否在下一轮实际工作中被引用或转化为下一步任务。
