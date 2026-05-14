# Representative Assets Batch 1 人工评分

> 日期：2026-05-15  
> 范围：`2026-05-13-representative-assets-batch1.md` 产出的 41 条 pending 资产  
> 方式：人工逐条 review，重点判断资产是否对用户有复用价值，而不是只看模型置信度  
> 结论：**Product Quality No-Go / 执行链路可用，但当前萃取质量不足**

## 1. 评分口径

| 分数 | 含义 |
| ---: | --- |
| 5 | 证据强、当前有价值、可直接复用或转成行动 |
| 4 | 基本可用，有小瑕疵，进入推荐资产 |
| 3 | 有价值但需要改写、补证据或降级，进入待修订池 |
| 2 | 有一点信息，但太泛、过期、类型错或不可执行 |
| 1 | 只有弱信号，通常不进入资产池 |
| 0 | 无用户资产价值、证据不支撑、类型错误、过程日志或已完成事项 |

## 2. 总体结果

| 分数 | 数量 |
| ---: | ---: |
| 4 | 2 |
| 3 | 5 |
| 2 | 2 |
| 1 | 10 |
| 0 | 22 |

统计：

- 总分：37 / 205
- 平均分：0.90 / 5
- `>=3`：7 / 41
- `>=4`：2 / 41
- `0` 分：22 / 41

结论：本批次证明 5 类 distiller 能跑通，但不能证明当前 prompt / taxonomy / review policy 已达到可用资产质量。除少数 `practice-pitfall` 和 `decision-rationale` 外，大多数结果不能进入资产池。

## 3. 按类型统计

| 类型 | 数量 | 总分 | 平均分 | `>=3` | `>=4` | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `follow-up-work-item` | 11 | 3 | 0.27 | 0 | 0 | No-Go |
| `practice-pitfall` | 4 | 10 | 2.50 | 3 | 1 | Conditional |
| `decision-rationale` | 7 | 11 | 1.57 | 2 | 1 | Needs major refinement |
| `idea-seed` | 11 | 8 | 0.73 | 1 | 0 | No-Go |
| `skill-candidate` | 8 | 5 | 0.63 | 1 | 0 | No-Go |

## 4. 逐条评分

### 4.1 `follow-up-work-item`

| ID | 标题 | 分数 | 结论 | 主要原因 |
| --- | --- | ---: | --- | --- |
| `00f0086f` | `draft_design_document` | 0 | reject | 动作壳，不是具体可验收后续行动 |
| `17fd06fb` | `set_environment_variable` | 1 | reject | 有 DeepSeek key 为空的弱信号，但对象、位置、验收标准不清 |
| `2c3e2089` | typecheck 脚本加入缺失 packages | 0 | reject | AI 执行过程步骤，不是用户资产 |
| `43c9a9e3` | 添加 GitHub Actions CI 工作流 | 0 | reject | evidence 显示已完成，被误转成待办 |
| `6999f118` | `create_issue` | 0 | reject | AI 执行过程性信息，且标题是 sink/action 名称 |
| `7aa6145a` | `implement_core_feature_x` | 0 | reject | 占位符任务，证据不支持具体行动 |
| `7df0c9ec` | `conduct_dogfooding_validation` | 0 | reject | AI 上下文收集步骤，被误抽成用户待办 |
| `8f7736e0` | `initiate_golden_user_testing` | 1 | reject | 有真实验证方向弱信号，但过时、泛化，且不是当前待办 |
| `a68caff7` | 工具专属 AI 规则文件 Phase 4 | 1 | reject | 历史计划信号，但 evidence 是 AI 执行过程语句 |
| `a6c1c385` | `refine_provider_prompt_and_error_handling` | 0 | reject_wrong_type | 风险/经验价值可能存在，但不是待办，更像 idea/practice |
| `d231d7f6` | 同步更新已完成计划状态 | 0 | reject | evidence 显示文档漂移已修复，被误转成待办 |

`follow-up-work-item` 定义修正：

- 必须是尚未完成的后续行动；
- 必须有明确对象和最低验收标准；
- 不能抽取 AI 自己正在执行或已经执行的过程步骤；
- 不能承接运行日志、工具动作、sink 动作；
- evidence 显示已完成的事项不得作为后续工作项；
- 风险、经验、设计原则应路由到其他资产类型。

### 4.2 `practice-pitfall`

| ID | 标题 | 分数 | 结论 | 主要原因 |
| --- | --- | ---: | --- | --- |
| `44197ac6` | 新增包未纳入 build/typecheck 覆盖 | 3 | revise | 有 monorepo 经验价值，但有扩写和路径不准 |
| `90f2a5cc` | Codex output 字段类型假设错误 | 4 | accept | 真 bug、根因、修法清楚，可复用 |
| `9e971afc` | DeepSeek Provider API Key 未设置 | 0 | reject | 只是错误信息，被误包装成经验 |
| `b746b064` | redaction 配置扩展时避免复制主流程 | 3 | revise | 有工程实践价值，但标题泛、证据混入无关项 |

`practice-pitfall` 定义修正：

- 不能把普通错误日志直接升级为经验资产；
- 必须有“症状 -> 根因 -> 修法/预防”的完整证据链；
- 工程机制类结论要避免合理扩写，路径和命令必须可由 evidence 支撑。

### 4.3 `decision-rationale`

| ID | 标题 | 分数 | 结论 | 主要原因 |
| --- | --- | ---: | --- | --- |
| `3b973dbf` | 工具专属 AI 规则文件 Phase 4 | 1 | reject | evidence 只支持“正在编写”，不支持决策理由 |
| `709c2af5` | 启动 dogfooding 验证闭环 | 4 | accept/revise | 决策和理由清楚，但需删无证据指标并更新为 cross-asset |
| `70eda276` | dogfooding 发现转成 openspec 边界规格 | 3 | revise | 有设计治理价值，但标题过宽，备选项和 revisit trigger 无证据 |
| `aeaa1b7f` | 使用 OpenAI 替代 DeepSeek | 1 | reject | 临时 fallback 被升级成 provider 决策 |
| `b8dc4dc8` | 确定项目当前 top3 | 1 | reject | 捕获的是“需要做判断”，不是最终判断 |
| `f8d55288` | 更新 build/typecheck 覆盖新包 | 0 | reject | AI 执行过程性内容，不是用户决策 |
| `fd2e3a29` | CI 工作流集成 | 1 | reject | 只捕获完成状态/执行记录，没有捕获取舍 |

`decision-rationale` 定义修正：

- 必须捕获已经做出的判断、取舍或暂缓理由；
- 不能从“正在做 X”推导出“为什么决定做 X”；
- 不能把临时排障动作升级为决策资产；
- 不能把“需要做判断”当成判断本身；
- options / tradeoffs / revisit_trigger 必须由 evidence 支撑。

### 4.4 `idea-seed`

| ID | 标题 | 分数 | 结论 | 主要原因 |
| --- | --- | ---: | --- | --- |
| `1eb41665` | 组织全员同步会议梳理 top3 | 0 | reject | 用户要求 AI 分析，模型无证据扩写成会议方案 |
| `5839453e` | 优先实现 MCP API 网关与 dogfooding 自动化 | 0 | reject | evidence 只支持读取文档，不支持实现优先级 |
| `5b81d9fa` | DeepSeek provider 环境变量名 | 0 | reject | 配置排障信息被错路由为 idea |
| `5e6dc28a` | 完整设计文档与 API 规范 | 2 | revise | 有文档补强信号，但范围严重扩写 |
| `657f6c91` | 完成 Claude Code dogfooding | 0 | reject_wrong_type | 已完成执行记录，不是未来想法 |
| `69ebae98` | 静态扫描报告进入 Loamlog 资产链路 | 1 | reject/revisit_later | 有一点方向信号，但非当前主线且扩写过多 |
| `6ef66bea` | 系统化记录 dogfooding 结果 | 3 | revise | 真实用户需求，但已部分落地，且证据混杂 |
| `78628d27` | CI 流水线集成 GitHub Actions | 0 | reject | 已完成工程记录被误抽成 idea |
| `c8e3401a` | 启动 dogfooding 闭环 | 0 | reject_wrong_type_completed | 阶段待办且已完成，不是 idea |
| `e19505b3` | issue-candidate / prd-draft distiller | 1 | reject/revisit_later | 旧路线图残留，不是当前方向 |
| `fae8454a` | MCP/Dogfooding 设计文档 | 1 | reject/revise_later | 有文档方向信号，但标题泛化且与当前状态不符 |

`idea-seed` 定义修正：

- 必须是可展开的新想法或机会；
- 不能把用户请求、阶段任务、旧路线图或已完成记录转成 idea；
- 不能从“我去读某设计文档”推导出“应优先实现该设计”；
- 旧 roadmap 项不能机械复活；
- 同一低价值运行故障不应被多个 distiller 重复产出。

### 4.5 `skill-candidate`

| ID | 标题 | 分数 | 结论 | 主要原因 |
| --- | --- | ---: | --- | --- |
| `05e342a6` | Loamlog 会话捕获与蒸馏 dogfooding | 0 | reject | 项目内部一次性 dogfooding 流程，不是可推广 skill |
| `3652ac84` | `dogfooding_validation_workflow` | 0 | reject | Loamlog 内部执行流程，不是跨项目 skill |
| `6376852f` | CI 工作流集成 | 0 | reject | 一次仓库工程任务，不是 AI 协作 skill |
| `73e003e4` | `project_status_analysis` | 3 | revise | 有稳定触发和可复用协作流程；需收窄为 project-ledger 状态分析 runbook |
| `95601b89` | 项目路线图与计划状态自动更新 | 2 | revise | 有台账同步流程价值，但“自动更新”无证据且有误导风险 |
| `b8981370` | `git_push_branch` | 0 | reject | 普通 git 命令动作，不是 skill |
| `d23e9d62` | `codex_provider_bug_fix` | 0 | reject_wrong_type_duplicate | 真实 bug 修复经验，但应由 practice-pitfall 承接 |
| `eb014a27` | Redaction 配置文件实现 | 0 | reject_wrong_type | 具体功能实现步骤，不是 skill |

`skill-candidate` 定义修正：

- 项目内部 runbook 不等于 skill-candidate；
- 单条 shell/git/CLI 操作不能成为 skill-candidate；
- 常规工程任务不能自动升级为 skill-candidate；
- bug 修复案例默认进入 practice/pitfall，不进入 skill-candidate；
- 只有能跨项目复用、触发条件稳定、输入输出明确、边界清晰的流程，才算 skill 候选。

## 5. 主要失败模式

1. **AI 过程日志污染资产池**  
   许多资产来自 assistant 的“Let me read / Now update / Now tackle / 已更新”过程语句。

2. **已完成事项被误转为后续待办或 idea**  
   CI、typecheck、dogfooding、文档修复等已完成内容被反复抽成待办。

3. **动作壳标题过多**  
   `draft_design_document`、`create_issue`、`set_environment_variable`、`git_push_branch` 等没有用户资产价值。

4. **类型路由错误**  
   风险被抽成待办，bug 被抽成 skill，旧待办被抽成 idea，执行记录被抽成 decision。

5. **合理扩写过度**  
   owner、due_context、options、tradeoffs、revisit_trigger、受众和业务价值经常没有 evidence 支撑。

6. **旧路线图残留被机械复活**  
   `issue-candidate / prd-draft`、MCP API 网关、CI 集成等旧方向被重新抽出，和当前主线冲突。

7. **重复资产跨类型出现**  
   DeepSeek key、CI/build/typecheck、dogfooding、Codex provider bug 多次以不同类型重复出现。

## 6. 对萃取器的结论

| Distiller | 结论 | 处理建议 |
| --- | --- | --- |
| `follow-up-work-item` | No-Go | 重写 prompt 和 schema；加入未完成状态、具体对象、验收标准、assistant-process 过滤 |
| `practice-pitfall` | Conditional | 可继续，但要加强完整证据链和反扩写规则 |
| `decision-rationale` | Needs refinement | 要求 explicit decision + rationale evidence，不得从执行状态反推理由 |
| `idea-seed` | No-Go | 重写 taxonomy，明确 idea 与 task / roadmap / done work 的边界 |
| `skill-candidate` | No-Go | 极大收紧 promotion 条件，只保留跨项目稳定流程 |

## 7. 下一步建议

1. 先不要继续扩大样本，也不要接入更多 UI / MCP / 自动执行。
2. 基于本报告重写 5 类 distiller 的 prompt、schema 和 post-filter。
3. 增加通用过滤层：assistant process log、done-state、action-shell、old-roadmap、duplicate-topic、wrong-type。
4. 保留本批次少量正样本作为 golden examples：
   - `90f2a5cc`：Codex provider output 类型假设错误；
   - `709c2af5`：启动 dogfooding 验证闭环；
   - `44197ac6` / `b746b064`：可修订 practice-pitfall；
   - `73e003e4`：可修订 project status analysis runbook。
5. 下一轮 dogfooding 的目标应改为：先让每类资产在 5-10 条样本中达到 `>=3` 比例至少 50%，再讨论扩大样本或产品化。
