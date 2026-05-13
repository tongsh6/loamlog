# 代表性资产萃取器与插件底座 | Representative Asset Distillers and Plugin Substrate

> 状态：活跃设计，2026-05-13
>
> 目的：把下一阶段 dogfooding 从旧的 `issue-draft / prd-draft / pitfall-card` 文档形态，调整为更贴近 Loamlog 愿景的代表性 AI 协作资产验证。

## 1. 要解决的问题

Loamlog 不是 `knowledge-card` 工具，也不是 `issue-draft` 生成器，更不是 OpenCode 插件。

它的核心价值是：

> 从本机多个 AI 工具会话中持续捕获原始交互，把其中容易被遗忘的想法、经验、判断和后续动作，转成可追溯、可 review、可复用、可反馈的资产。

当前要解决的问题不是“再多做几种固定文档”，而是：

- 用户在推进当前任务时，会顺手产生想法、经验、判断和后续动作；
- 这些内容当下没有时间整理，事后容易遗忘；
- 现有 AI 工具会话保存了原始材料，但缺少顺手的资产化流程；
- Loamlog 需要证明它可以用可插拔萃取器，把这些材料稳定转为可复用资产；
- 首批自研萃取器只是验证流程和插件底座，不是定义 Loamlog 的资产上限。

## 2. 目标状态

Loamlog 的资产生命周期保持为：

```text
SessionArtifact
  -> EvidenceSpan
  -> DistillResultDraft
  -> AssetCandidate
  -> ReviewDecision
  -> Delivery
  -> Feedback
```

平台应该固定的是资产外壳和生命周期，而不是固定世界上有哪些资产类型：

- `evidence` 必填，并且能回链到 `session_id` / `message_id`；
- `lineage` 能说明 distiller、版本、模型和输入来源；
- review 状态、质量评分、delivery 和 feedback 由平台统一管理；
- distiller 只产出候选资产，不直接修改 GitHub、Notion、台账或外部系统；
- asset payload 由插件定义，核心流程不写死 `idea-seed`、`practice-pitfall` 等枚举。

首批代表性 distiller 只用于验证这个目标状态。

## 3. 首批代表性萃取器

首批选择 4 个 distiller，覆盖 AI 工具使用过程中最容易遗失的四类内容：

- 想到什么；
- 学到什么；
- 为什么这么选；
- 接下来做什么。

| Distiller | 核心问题 | 代表人群 | 资产价值 |
|---|---|---|---|
| `idea-seed` | 做事过程中冒出了什么想法？ | 产品构建者、创业者、内容创作者、研究者 | 捕获还没来得及展开的想法、机会、假设、选题 |
| `practice-pitfall` | 这次学到了什么，踩了什么坑？ | 工程师、AI power user、运营自动化使用者 | 沉淀经验、踩坑、修法、可复用工作方式 |
| `decision-rationale` | 为什么选择或暂缓某个方向？ | 技术负责人、产品负责人、独立开发者 | 保存取舍、约束、反对理由和 revisit trigger |
| `follow-up-work-item` | 会话之后应该继续做什么？ | 所有 AI 工具用户 | 把会话转成待办、验证任务、文档更新、review action 或候选 issue |

### 3.1 `idea-seed`

用途：

- 抓取会话中“现在先记一下，之后可能有价值”的想法；
- 允许想法很粗糙，但必须有上下文和 evidence；
- 同时适用于产品、内容、研究、商业、工程机会。

建议 payload：

```ts
{
  idea: string;
  context: string;
  why_now?: string;
  potential_value?: string;
  target_audience?: string;
  uncertainty?: string;
  next_probe?: string;
}
```

质量门槛：

- 不能只是普通总结，必须包含一个后续可展开的 seed；
- 必须说明它从什么对话上下文中出现；
- 不要求立即可执行，但要能被 review 后放入 idea inbox。

### 3.2 `practice-pitfall`

用途：

- 捕获一次 AI 协作中形成的经验、踩坑、修法和预防方式；
- 比 `knowledge-card` 更偏实践复用，不追求百科式解释。

建议 payload：

```ts
{
  situation: string;
  pitfall_or_practice: string;
  symptom?: string;
  root_cause?: string;
  fix_or_pattern: string;
  prevention?: string;
  reusable_scope: string;
}
```

质量门槛：

- 必须能回答“下次遇到类似情况怎么更快处理”；
- 工程机制类结论要标记是否有代码、测试、日志或官方文档支撑；
- 不能把单纯聊天摘要包装成经验卡。

### 3.3 `decision-rationale`

用途：

- 保存会话中出现的方向判断、优先级排序、暂缓原因和边界；
- 让后续 AI 或人类接手时知道“为什么不是另一条路”。

建议 payload：

```ts
{
  decision: string;
  context: string;
  options_considered?: string[];
  rationale: string;
  tradeoffs?: string[];
  constraints?: string[];
  revisit_trigger?: string;
}
```

质量门槛：

- 必须包含明确 decision 或 deferral；
- 必须有理由，不只记录结论；
- 路线图级判断可以建议 sink 到 ledger 或 decision log，但仍由 review / delivery 执行。

### 3.4 `follow-up-work-item`

用途：

- 提取会话后应该继续推进的动作；
- `issue-draft` 可以是它的 sink 或渲染形态之一，但不是唯一资产本体。

建议 payload：

```ts
{
  action: string;
  reason: string;
  owner_hint?: string;
  priority_hint?: "p0" | "p1" | "p2";
  due_context?: string;
  acceptance?: string[];
  related_assets?: string[];
}
```

质量门槛：

- 必须是后续可执行或可验证的动作；
- 可以是待办、open question、验证任务、文档更新、review action 或候选 issue；
- 不应自动外发到 GitHub / Jira，必须先进入 review。

## 4. 插件底座边界

当前代码已经有最小底座：

- `@loamlog/distiller-sdk` 的 `defineDistiller()`；
- `supported_types`、`payloadSchema`、`prefilter`、`run`；
- 作为插件输出外壳的 `DistillResultDraft`；
- 作为资产图方向的 `AssetCandidate` 和 `Signal`；
- 通过 `createDistillerRegistry()` 动态加载插件。

下一步要加强的是插件契约，不是做 marketplace 或大型框架。

推荐的 plugin manifest 方向：

```ts
{
  id: string;
  version: string;
  asset_family: string;
  asset_type: string;
  produces: string[];
  consumes: string[];
  payload_schema: JSONSchema7;
  evidence_policy: "required";
  review_policy: "human_required" | "auto_allow_local";
  suggested_sinks: string[];
}
```

规则：

- core 不硬编码 `idea-seed`、`practice-pitfall`、`decision-rationale`、`follow-up-work-item`；
- 插件特有字段留在 `payload`；
- 共享检查只负责 evidence、confidence、title、summary、schema、review policy；
- 无效 evidence refs 必须拒绝或丢弃候选资产，不能静默 fallback 到无关 message；
- distiller 可以建议 sinks，但只有 review / delivery 阶段能真正执行 sinks。

## 5. 范围

本阶段做：

- 定义下一阶段 dogfooding 的代表性资产 taxonomy；
- 实现首批 4 个 distiller，且都作为普通插件接入；
- 保持 local-first 和 review-first；
- 增加 schema、evidence validation、代表性提取行为的聚焦测试；
- 用真实本机 AI 工具会话 dogfooding；
- 更新本地 review / report 模板，让每类资产单独评分。

## 6. 非目标

本阶段不做：

- 完整 Dashboard 或 Web UI；
- 外部自动发布；
- plugin marketplace；
- 向量搜索；
- Auto-Skill Generation；
- 替换所有现有 distiller；
- 把首批 4 个 distiller 当成封闭资产宇宙。

## 7. 实施 DAG

```text
A. Contract alignment
  -> B. Shared evidence/schema review policy
  -> C. First vertical slice: idea-seed
  -> D. Second vertical slice: practice-pitfall
  -> E. Decision and follow-up slices
  -> F. Cross-asset dogfooding batch
  -> G. Feedback into ledger, review policy, and page structure
```

节点说明：

- A：输入当前 `DistillResultDraft`、`AssetCandidate`、distiller SDK；输出精确 payload schema 和 manifest 约定。
- B：输入已知 evidence fallback 风险；输出共享 policy 和阻止无效 evidence fallback 的测试。
- C：输入包含产品、内容、研究想法的真实 session；输出 reviewed `idea-seed` 本地资产。
- D：输入包含实现经验或工作流经验的真实 session；输出 reviewed `practice-pitfall` 本地资产。
- E：输入包含取舍和后续动作的 session；输出 reviewed `decision-rationale` 与 `follow-up-work-item` 资产。
- F：输入四个 distiller 和至少一个现有 baseline，例如 `knowledge-card`；输出按资产类型拆分的评分报告。
- G：输入 review 结果和复用观察；输出台账更新、下一步页面优先级和底座缺口。

## 8. 验收标准

- 四个代表性 distiller 都能通过现有 registry / CLI 路径运行，不需要 engine 特判。
- 每条资产都有有效 evidence backlinks。
- 每类资产都有 payload schema 和人类可读 markdown render。
- dogfooding 使用真实本机会话，不只用 synthetic prompt。
- 每类资产单独评分，不能让某个成功资产类型掩盖其他失败类型。
- 至少一条 reviewed asset 被后续任务引用、写入台账，或转成 follow-up work item。
- 发现的底座缺口记录到 `docs/project-ledger.md`，不能伪装成单纯 prompt 问题。

## 9. 与现有 distiller 的关系

- `knowledge-card` 继续作为通用可复用知识 baseline。
- `issue-draft` 继续保留，但更适合作为 `follow-up-work-item` 的 delivery/rendering path，而不是下一阶段代表性资产本体。
- `prd-draft` 暂缓到真实产品规划会话成为主要样本后再验证。
- `pitfall-card` 可以复用或演进为 `practice-pitfall`，取决于它的 payload 和 evidence policy 是否符合本 spec。

关键变化是：

> 从“文档形态资产”转向“用户痛点形态资产”。
