# Plan — Large Session Shard-Map-Reduce

## 目标 | Goal

实现大 session 自动分片蒸馏：超出模型上下文窗口 80% 的 session 自动切分为重叠分片，并行 Map 蒸馏，Reduce 合并产出。

## 设计文档 | Design Doc

`AIEF/openspec/large-session-shard-map-reduce.md`

## 执行步骤 | Execution Steps

### Step 1: LLM Provider 接口增加 contextWindow（节点 A）

- `LLMProvider` 接口增加 `contextWindow?: number` 字段
- 各 provider（lmstudio, openai, anthropic, deepseek, ollama）声明各自的 contextWindow
- `llm.route()` 返回的 model 信息包含 contextWindow
- **验收**: 所有 provider 有默认 contextWindow；build 通过；现有测试不破

### Step 2: check_size 节点（节点 B）

- 新增函数 `shouldShard(artifact, contextWindow): boolean`
- 比较 `estimatePromptTokens(artifact)` vs `contextWindow * 0.8`
- contextWindow 不可用时回退到消息数阈值（>200 条）
- **验收**: unit test 覆盖三种场景（应该分片、不应分片、contextWindow 缺失的回退）

### Step 3: shard 逻辑（节点 C）

- 新增函数 `shardSession(artifact, shardSize, overlapSize): SessionArtifact[]`
- 每片固定消息数，相邻片重叠 20%
- 每个分片是独立的虚拟 SessionArtifact，保持 meta/context 不变
- **验收**: 999 消息 session→~23 片；重叠区消息确实在相邻片中；边界的最后一片正确截断

### Step 4: 并行 Map（节点 D）

- 在 DAG runner 中实现并行 Map：分片数组 → distiller.run() 并行调用
- 并行度可配置（默认 3），单分片失败不影响其他分片
- **验收**: 并行调用实际并行执行；单分片异常不影响其他分片

### Step 5: Reduce 节点（节点 E）

- 结构化合并（代码层）：同 title 去重、同 evidence 去重、跨分片 confidence 提升
- LLM 语义合并：处理代码层无法判断的合并决策
- Reduce 失败回退到不合并（所有分片产出直接作为结果）
- **验收**: 同 title 产出合并；同 evidence 去重；跨分片独立发现的 confidence 提升

### Step 6: 集成到现有 DAG（节点 F）

- `createDistillDAG()` 增加条件分支：小 session 原路径，大 session 分片路径
- 新 DAG 结构: `query → check_and_route → (原路径 | shard → map → reduce) → process → deliver`
- 现有 `loam distill` CLI 不变
- **验收**: 160 现有测试全绿 + 新增分片 DAG 测试；小 session 路径不受影响

## 不在此批次做的 | Deferred

- Collapse（递归压缩）阶段——第一版 Map → Reduce 在 99% 场景够用
- 优先级分片（头尾先处理、中间后处理）
- 跨 session 分片合并
