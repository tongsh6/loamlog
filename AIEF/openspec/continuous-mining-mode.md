# Continuous Mining Mode — 持续挖矿模式

> **Status:** Design | 设计中
>
> 将 Loamlog 的触发管道从"信号驱动"改为支持"持续处理"模式，实现"池子持续增长 → 处理持续运转"的挖矿作业系统。

## 要解决什么问题 | Problem to Solve

### 现状

触发管道（`@loamlog/trigger`）已接入 daemon，每次 session 捕获完成后自动调用 `intelligence.enqueue()`。但管道的处理逻辑是**信号驱动**的——只有当 session 内容命中预定义的关键词（`fatal`、`timeout`、`值得提`、`issue` 等）时，才触发蒸馏。

这导致了两个问题：

**问题 1：大部分 session 不会被自动处理。** 狗粮验证中 1304 个 session 被采集，但触发管道只对命中关键词的极少数 session 触发蒸馏。用户只能手动运行 `loam distill`，这违背了"持续挖矿"的基本定义——传送带在转，但选矿厂等人工按开关。

**问题 2：关键词过滤与 distiller 的职责重叠。** 触发管道用关键词预判"这个 session 值不值得蒸馏"，但 distiller 的 system prompt 中已经有 `Prefer no result over weakly supported results` 来做同样的判断。分拣层和萃取层在做双重过滤，且分拣层的规则（硬编码关键词）远比萃取层（LLM 语义判断）粗糙。

### 根因

触发管道的设计哲学来自"实时告警"场景（检测到 `fatal` 立即生成问题报告），但 Loamlog 的核心场景是"挖矿"——对所有原料进行加工，由萃取层决定有没有产出，而不是在分拣层就丢弃。

## 目标状态 | Target State

触发管道新增 `continuous`（持续处理）模式。在该模式下：

1. **每一条新捕获的 session 自动进入处理队列**，不做关键词过滤
2. **分拣层只负责调度**（何时处理、批量大小、优先级），不负责价值判断
3. **价值判断完全交给 distiller**——由 LLM 在蒸馏过程中决定"是否有足够信号产出资产"
4. **已处理标记机制**确保同一 session 不会被重复蒸馏（现有 state KV 已具备）
5. **信号驱动模式保留**，作为可选的优化路径（高频 session 先处理），但不作为唯一路径

### 用户故事

> 小北启动 daemon 后，不需要再记着手动运行 `loam distill`。每次他和 AI 的对话结束，系统自动将这段对话送入蒸馏管道。有价值的对话自动产出 Issue 草稿/知识卡片，没价值的自动跳过标记"已处理"。小北每隔几天查看结果，批准/驳回，仅此而已。

## 边界 | Boundary

### 做什么

| 项 | 说明 |
|----|------|
| 在 `TriggeredIntelligenceConfig` 中新增 `mode: "signal" | "continuous"` | 默认 `"signal"`，保持向后兼容 |
| 在 continuous 模式下，`enqueue()` 跳过关键词匹配，所有 signal 直接入队 | 理由：分拣不做价值判断 |
| 在 continuous 模式下，为每个 signal 生成 `continuous:capture` 理由标签 | 保持 batch 的 triggerReasons 模型不变 |
| daemon 启动时可选执行 backfill：直接调用 engine.run() 处理存量，**绕过 trigger 内存队列** | 存量 1300+ session 不能全推进内存队列 |
| CLI 增加 `loam distill --all-unprocessed` 手动回填命令 | 不依赖 daemon 也能一次性处理存量 |
| continuous 模式下不使用 `rateLimit.maxPending` 做降级决策 | 用户期望所有 session 都被处理，不应偷偷跳过 |

### 不做什么

| 项 | 原因 |
|----|------|
| 不删除 signal 模式 | 高频信号实时告警场景仍有价值（如 `fatal` 立即生成 pitfall） |
| 不改变 DAG 管道结构 | 4 节点 DAG（query → distill → process → deliver）不变 |
| 不改变 distiller 接口 | `DistillerPlugin.run()` 签名不变 |
| 不改变 sink 投递逻辑 | 审批门禁和 evidence 检查不变 |
| 不改变 state KV 的已处理标记机制 | 已有 `markProcessed()` 确保不重复蒸馏 |
| 不在分拣层做任何价值判断 | 不做内容评分、不做信号提取、不做优先级排序（第一版） |
| 不做复杂的优先级队列 | 第一版用 FIFO 队列，后续可加优先级 |
| 不做跨 session 合并蒸馏 | 那是另一个 distiller 的设计问题 |
| 不做 LLM 预算管理或 token 配额 | 那是切面层的事，不在本次范围 |

## 与现有架构的关系 | Relationship with Existing Architecture

### 复用模块

| 模块 | 如何使用 |
|------|----------|
| `@loamlog/trigger` | 在现有 `createTriggeredIntelligencePipeline()` 中新增模式分支 |
| `@loamlog/distill` | 蒸馏引擎不变，`createDefaultDistillRunner()` 已在 trigger 中复用 |
| `@loamlog/core` | `TriggeredIntelligenceConfig` 类型增加 `mode` 字段 |
| `@loamlog/archive` | `readSessionSnapshots()` 用于 backfill 扫描 |
| `packages/cli/src/daemon.ts` | 启动时传 `mode` 参数到 trigger pipeline |

### 修改模块

| 模块 | 改动范围 |
|------|----------|
| `packages/core/src/index.ts` | `TriggeredIntelligenceConfig` 类型增加 `mode` 字段 |
| `packages/trigger/src/index.ts` | `enqueue()` 增加 continuous 模式分支（约 10 行）；新增 `backfill()` 函数（约 30 行） |
| `packages/cli/src/daemon.ts` | `startDaemon()` 增加 backfill 调用（约 5 行） |
| `packages/cli/src/distill.ts` | 新增 `--all-unprocessed` flag（约 20 行） |

### 不影响模块

| 模块 | 原因 |
|------|------|
| 所有 provider 包 | 采集链路不变 |
| 所有 distiller 包 | 蒸馏接口不变 |
| 所有 sink 包 | 投递链路不变 |
| `@loamlog/pipeline` | DAG 执行器不变 |
| `@loamlog/sanitizer` | 脱敏在采集阶段已完成 |
| `@loamlog/archive` | 归档格式不变 |
| `@loamlog/evaluation-harness` | 评估逻辑不变 |

## DAG 拆分

```
A: core types 增加 mode 字段
   -> B: trigger 实现 continuous enqueue
   -> C: trigger 实现 backfill 函数
B + C
   -> D: daemon 接入 continuous mode + 启动 backfill
B
   -> E: CLI 增加 --all-unprocessed flag
D + E
   -> F: 狗粮验证 — 在真实 session 池上运行
```

### 节点 A：Core Types — mode 字段

- **输入**：当前 `TriggeredIntelligenceConfig` 类型定义
- **输出**：增加 `mode?: "signal" | "continuous"` 字段，默认 `"signal"`
- **依赖**：无
- **失败影响**：后续节点无法引用新模式
- **验收**：类型编译通过，现有测试不因新增可选字段而失败

### 节点 B：Trigger — Continuous Enqueue

- **输入**：`enqueue(signal)` 调用
- **输出**：当 `mode === "continuous"` 时，signal 直接入队（跳过 `findKeywordHits`），注明 `continuous:capture` 理由
- **依赖**：A
- **失败影响**：continuous 模式不可用，回退到 signal 模式
- **验收**：
  1. continuous 模式下，任意 session（含无关键词 hit 的）都能入队
  2. signal 模式下行为不变（向后兼容）
  3. `trigger/src/index.test.ts` 新增 3 个 continuous 模式用例

### 节点 C：Trigger — Backfill 函数

- **输入**：`dumpDir`、`distillerId`、state KV
- **输出**：一个新的 `backfillUnprocessed(options)` 导出函数，扫描池中未处理 session，分批入队
- **依赖**：A（类型）、`@loamlog/archive`（扫描快照）、state KV（已处理标记）
- **失败影响**：backfill 不可用，存量 session 仍需手动蒸馏
- **验收**：
  1. 传入 dumpDir 后能返回未处理 session 数量
  2. 使用 `index.json` 快速路径（不逐文件扫描）
  3. 每次回填 batch 大小可配置（默认 8）
  4. 对空池（全部已处理）返回 0

### 节点 D：Daemon 接入

- **输入**：`startDaemon()` 的配置参数
- **输出**：daemon 启动后，读取 mode 配置传入 trigger；若 mode 为 continuous 且配置了启动 backfill，则先执行 backfill 再开始监听
- **依赖**：B、C
- **失败影响**：daemon 仍正常启动，backfill 失败只记日志不阻断采集
- **验收**：
  1. daemon 启动日志中显示当前 mode
  2. backfill 执行日志显示处理数量
  3. backfill 失败不影响 daemon 采集功能

### 节点 E：CLI `--all-unprocessed` flag

- **输入**：`loam distill --all-unprocessed`
- **输出**：扫描池中所有未处理 session，批量蒸馏
- **依赖**：B（复用 trigger backfill 或直接调用 engine.run）
- **失败影响**：不影响现有 `loam distill` 行为
- **验收**：
  1. `loam distill --all-unprocessed` 能处理所有存量未处理 session
  2. `--distiller` 和 `--llm` 参数仍然生效
  3. 支持 `--dry-run` 只打印将要处理的 session 数量

### 节点 F：狗粮验证

- **输入**：开发环境（LM Studio + loamlog-archive 1304 sessions）
- **输出**：狗粮验证报告（≥10 条蒸馏草稿，含评分）
- **依赖**：D、E
- **失败影响**：无法做出 Go/No-Go 决策
- **验收**：同狗粮验证 Phase 2 标准

## 配置示例

```json5
// aic.config.json
{
  "intelligence": {
    "mode": "continuous",        // 新增：持续处理模式
    "enabled": true,
    "backfill_on_startup": true, // 新增：daemon 启动时回填存量
    "distill": {
      "enabled": true,
      "distillers": [
        "@loamlog/distiller-issue-draft",
        "@loamlog/distiller-knowledge-card"
      ],
      "llm": {
        "provider": "lmstudio",
        "model": "qwen/qwen3.6-35b-a3b",
        "timeout_ms": 300000
      }
    }
  }
}
```

## 性能分析 | Performance Analysis

continuous 模式的核心变化是：**从"少量 session 触发蒸馏"变为"全部 session 被蒸馏"**。这带来了六个维度的性能挑战。

### 角度 1：吞吐量 — 系统单位时间能处理多少 session

**现状**。狗粮验证数据：单 session LLM 推理 ~41s（LM Studio 35B），加上 query/persist 开销，单 session 端到端 ~72s。按当前串行处理模型（distiller 的 `for await` 逐条处理），理论最大吞吐量 = 1 个 session / 72s ≈ **1200 个 session / 天**。

1304 个 session 全量处理需要 ~18 小时。但这只是 1 个 distiller。如果用户配置了 4 个 distiller（issue-draft + knowledge-card + prd-draft + pitfall-card），时间翻 4 倍 = ~72 小时。

**瓶颈在 LLM 推理阶段，不在代码逻辑**。但代码有一个可以消除的浪费：

```
当前：trigger flush → engine.run({session_ids: [...]})
  → engine 为每个 distiller 创建 for-await 循环
    → distiller 逐条处理 artifact
      → 每个 artifact 一次 LLM 调用

浪费：同一批 session_ids，不同 distiller 各自扫描一遍 archive
```

`getUnprocessed()` 每次调用都要从 archive 读取并脱敏 snapshot。同一批 session 被 4 个 distiller 处理时，相同的 session 被读取 + 脱敏 4 次。

**建议优化**：batch 内对同一 session 的 snapshot 做一次读取 + 脱敏，多个 distiller 共享 artifact 对象。

**这个优化是否放在第一版？** 不。第一版先跑通链路，确认 1200 session/天的吞吐量是否够用。如果狗粮验证发现需要多 distiller 并行且时间不可接受，再在第二版做 snapshot 缓存。

### 角度 2：延迟 — 从 capture 到产出结果的时间

**现状**。signal 模式下，关键词命中的 session 几乎实时触发蒸馏（`enqueueTask` 立即调用，`maxWaitMs=1500`）。但非关键词 session 依赖频率累计（3 个/5 分钟），在日常使用中几乎不会触发。

**continuous 模式后**。每个 capture 立即入队，延迟由三个因素决定：
1. 队列排队时间（前面有多少 session 在等处理）
2. batch 等待时间（`maxWaitMs=1500`——当前配置下最多等 1.5 秒）
3. LLM 推理时间（~41s LM Studio，云端模型更快）

在低负载（队列空）下，端到端延迟 = 1.5s（batch 等待）+ 41s（推理）≈ **43 秒**。

在高负载（队列积压 N 个 session）下，延迟 = N/8 × 41s。如果队列有 100 个 session，最晚入队的要等 ~12 个 batch × 41s ≈ **8 分钟**。

**这是合理的吗？** 对于"挖矿"场景，是的。挖矿不要求实时性——矿工不关心一块矿石是 1 分钟前还是 1 小时前挖出来的。狗粮验证中用户每几天查看一次结果，8 分钟 vs 43 秒的差异不构成用户体验问题。如果未来有实时告警需求，signal 模式仍然保留。

### 角度 3：资源 — CPU、内存、磁盘 I/O

**CPU**。`collectSnapshotText()`（trigger/src/index.ts:122-148）对每个入队 signal 做全量消息拼接 + `toLowerCase()`。在 continuous 模式下，1300 个 session 各做一次，总量不大。`snapshotToArtifact()` + `applySnapshotRedaction()` 才是 CPU 大头——每个 artifact 要遍历整个消息树做脱敏。

**内存**。关键风险点在 trigger 的内存队列：

```typescript
// trigger/src/index.ts:259
const queue: TriggeredTask[] = [];  // ← 无上限！
const frequencyState = new Map<string, FrequencyState>();  // ← 持续增长！
```

continuous 模式下 `frequencyState` 完全不需要（不做关键词匹配），但 `queue` 仍然是风险点。当前 `rateLimit.maxPending=50` 只用来判断 `shouldProcessInFull`，**不限制队列大小**。backfill 如果一次性把 1300 个 session 全推入队列，内存会暴涨。每个 `TriggeredTask` 包含完整的 `CaptureRequest` + `SessionSnapshot`（可能几 MB），1300 个就是几个 GB。

**解决方案**：continuous 模式下 backfill 不使用 trigger 的内存队列。backfill 应直接调用 engine.run()，绕过 enqueue → flush 路径。trigger 队列只处理实时捕获的增量 session（每天几十个），不处理存量回填。

**磁盘 I/O**。State KV 的每次 `markProcessed()` 调用都是一次完整的 JSON 文件读写周期：

```
读 state 文件 → 修改内存 → 写 temp 文件 → copy backup → atomic rename → unlink backup
```

（state.ts:76-101，6 次文件操作/写）

8 个 session 一批，每批写一次 state 文件 = 6 次 I/O。1300 个 session ÷ 8 = 163 批 × 6 = **978 次文件操作**。这个量级在本地 SSD 上不是问题（微秒级完成），但要注意：state 文件有 mutex（30s 超时），如果多个 distiller 同时 `markProcessed`，会产生排队。好在当前设计是每个 distiller 独立的 state 文件 + 独立 mutex，不会互相阻塞。

### 角度 4：可扩展性 — session 数量增长时的系统行为

**关键问题：`getUnprocessed()` 的性能退化**。

```typescript
// query.ts:86-108
async *getUnprocessed(targetDistillerId, limit?) {
  const processed = await getProcessedMap(stateKV, effectiveDistillerId);
  // ↑ 每次调用都读取整个 processed map（JSON 反序列化到内存）
  for await (const snapshot of readSessionSnapshots({...})) {
    if (processed[artifact.meta.session_id]) continue;  // 内存查表
    yield artifact;
  }
}
```

当 processed map 增长到几千个 session_id 时，`getProcessedMap` 每次调用都要把整个 map 加载到内存。但这是个 JSON 文件读取，几千个 key 也就是几十 KB，不成问题。真正可能退化的是 `readSessionSnapshots()` 的全量扫描——但已有 `index.json` 快速路径。

**关键问题：每个 distiller 独立维护 processed map**。如果用户有 4 个 distiller，每个 distiller 的 state 文件中都有独立的 `processed:{distillerId}` map。一个 session 是否有价值可能因 distiller 而异——issue-draft 觉得没价值的 session，knowledge-card 可能觉得有价值。所以独立维护是正确的，不应合并。

**当 session 数量到 10 万级别时**：
- `processed` map 可能到 10 万 key，JSON 文件 ~3MB，每次读取 + 反序列化 ~10ms。仍可接受。
- `readSessionSnapshots()` 索引扫描（index.json）应在 ~100ms 内完成。
- 真正的瓶颈还是 LLM 推理吞吐量——10 万 session 在单模型串行下需要 ~83 天。届时必须引入并行 + 远程 API 扩容。

### 角度 5：可靠性 — 失败、重试、幂等

**backfill 中断恢复**。backfill 处理 1300 个 session 期间如果 daemon 崩溃：

- State KV 的 `markProcessed()` 在每个 batch 处理后写入，所以**已处理的 batch 不会丢失进度**
- 但 `engine.run()` 内部是一个 distiller 处理完所有 session 后才统一 markProcessed。如果崩溃发生在 engine.run() 中途，**当前批次中部分已蒸馏的 session 状态丢失**——下次 backfill 会重新蒸馏它们

**当前 engine.run() 的行为**（engine.ts 和 dag-runner.ts）：distiller 在自己的 `for await` 循环中逐条处理 artifact，处理完一条后通过 `artifactStore` 的 tracking wrapper 记录。但 `markProcessed()` 是在所有 distiller 处理完毕后统一调用的。这意味着如果崩溃，当前批次的所有 session 都会被重新蒸馏。

**是否需要改进？** 第一版不需要。原因：重蒸馏的代价是重复 LLM 调用 + fingerprint dedup 会丢弃重复产出。fingerprint 是 `sha256(distillerId:sessionId:JSON.stringify(payload))`，同一 session 同一 distiller 产生相同结果时，dedup 直接跳过 sink 投递。所以即使重蒸馏，也不会产生重复的外发资产。唯一代价是多花了一些 LLM 推理时间。

**反压（Backpressure）**。continuous 模式下，如果 LLM 处理速度跟不上 session 捕获速度，队列会积压。当前代码中：

- `rateLimit.maxPending=50` 只在 `shouldProcessInFull()` 中检查——当队列 >= 50 时，新 batch 降级为 `summary-only`（不做 distill）
- 但 continuous 模式下我们不应该偷偷降级——用户期望所有 session 都被处理

**解决方案**：continuous 模式下不使用 `rateLimit.maxPending` 做降级决策。改为：
1. 队列无上限增长（或设一个很大的上限如 10000）
2. 不降级，只是排队等待
3. daemon 日志中定期输出队列深度，让用户知道积压情况

### 角度 6：公平性 — 多 distiller 之间的资源分配

当前 `engine.run()` 按配置顺序串行执行多个 distiller：distiller A 处理完所有 session → distiller B 处理完所有 session。这意味着：

- distiller A 先拿到所有结果，distiller B 要等 A 全部完成
- 本地模型 41s/session，如果 distiller A 处理 1300 个 session 需要 15 小时，distiller B 要 15 小时后才开始

**是否需要在第一版做并行？** 不需要。第一版目标是验证链路，实际场景中：
- 新捕获的增量 session 每天几十个，多个 distiller 串行处理几分钟内完成
- backfill 存量时，用户预期就是"放着让它跑"，串行 vs 并行不影响用户体验

未来需要并行时，可以利用 `packages/pipeline` 的 DAG executor 已有的并发能力。

## 性能决策总结

| 角度 | 第一版策略 | 后续优化 |
|------|-----------|----------|
| 吞吐量 | 串行处理，接受 1200 session/天 | snapshot 跨 distiller 共享、并行 LLM |
| 延迟 | 不要求实时，接受分钟到小时级 | signal 模式保留用于实时场景 |
| 内存 | backfill 绕过 trigger 队列，直接调 engine | 队列上限、流式 backfill |
| 可扩展性 | index.json 快速路径 + state KV 分文件 | SQLite state、分片 archive |
| 可靠性 | fingerprint dedup 兜底防重复产出 | 逐 session 标记已处理、断点续传 |
| 公平性 | 串行 distiller，接受等待 | DAG 并行节点 |

## 非目标的重申

以下不是本次要做的，但值得在未来设计文档中展开：

- **矿石分级（优先级队列）**：第一版 FIFO，后续可引入 trigger score 作为优先级
- **多 distiller 并行调度**：第一版按配置顺序串行，后续可 DAG 并行
- **LLM 预算管理**：跨切面问题，不在 trigger 层解决
- **反馈闭环（evaluation → prompt tuning）**：这是 Top 2 的范畴
