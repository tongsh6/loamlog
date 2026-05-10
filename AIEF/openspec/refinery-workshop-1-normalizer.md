# Refinery Workshop 1: Crushing (Normalizer) — 破碎车间设计文档

> **Workshop Role:** Physical Prep / 物理加工
> **Goal:** 将原矿 (Raw Session) 转化为高质量的粗矿 (Normalized Session)，提升信息密度。

## 1. 需求定义 (Requirements)

### 1.1 业务背景
AI 编程工具（如 Claude Code, OpenCode）生成的原始会话日志包含大量非业务信号（如冗长的 `npm test` 失败堆栈、数百行的工具调用输出、AI 的推理思考过程）。直接将这些数据喂给萃取引擎会导致：
1. **Token 浪费**：无效信息占比超过 60%，推高 API 成本。
2. **信号稀释**：LLM 在长文本中容易丢失关键 Bug 信号。
3. **幻觉增加**：冗余的工具输出可能包含与当前问题无关的历史错误，干扰判断。

### 1.2 核心功能
- **噪音剔除**：自动识别并压缩冗长的工具调用输出（Tool Outputs）。
- **推理隔离**：将 AI 的 `reasoning` 片段剥离，避免其主观逻辑干扰萃取。
- **上下文对齐**：统一所有 Provider 的元数据格式（Repo, Branch, Commit）。
- **语言检测**：识别会话的主要语言，为后续 Prompt 提供引导。

---

## 2. 验收场景 (Acceptance Scenarios)

| 场景 | 输入特征 | 预期结果 (验收点) |
| :--- | :--- | :--- |
| **冗长工具调用** | 一个包含 5000 字符 `npm test` 输出的 Tool Call | 输出摘要为 "tool:npm test output: [failure excerpt...]"，长度 < 300 字符。 |
| **推理密集型会话** | 包含 2000 字符 `thought` 字段的对话 | `reasoning` 字段被独立提取，`text` 字段仅保留最终回复。 |
| **多 Provider 混用** | 来自 Claude Code 和 OpenCode 的不同格式数据 | 输出统一的 `NormalizedSession` 结构，元数据字段一致。 |
| **性能基准** | 处理 1MB 原始 JSON 日志 | 处理时间 < 100ms（纯 CPU 运算，不调用 LLM）。 |
| **Token 节省** | 一个标准的开发修复 Session | 与原始数据相比，Token 数下降 ≥ 30%。 |

---

## 3. 业务约束 (Business Constraints)

- **宁可误放，不可误杀**：正常化阶段不应删除任何可能包含“代码变更”或“错误关键字”的核心文本。
- **架构正交性**：Normalizer 必须作为 DAG 中的独立节点，不与具体的 Distiller 逻辑耦合。
- **零外部依赖**：处理过程必须是纯内存/同步运算，不得依赖网络请求。
- **向后兼容**：不实现 Normalizer 的旧版 Distiller 应能继续消费原始数据。

---

## 4. 技术方案 (Technical Plan)

### 4.1 数据模型
```typescript
interface NormalizedSession {
  header: SessionHeader;    // 统一的元数据
  messages: NormalizedMessage[]; // 清洗后的消息流
  stats: SessionStats;      // 聚合后的统计信息（消息数、工具数、字符数）
}
```

### 4.2 破碎逻辑 (Crushing Rules)
1. **Tool Output 压缩**：
   - 保留工具名称。
   - 若输出 > 300 字符，保留前 150 字符和后 150 字符，中间以 `[...]` 替代。
   - 优先保留包含 `Error`, `Exception`, `Failed` 等关键字的片段。
2. **Reasoning 提取**：
   - 将 `parts[type=reasoning]` 移动到 `NormalizedMessage.reasoning` 字段。
   - 主文本流只保留用户的 Input 和 Assistant 的 Final Content。
3. **文本合并**：
   - 将同一消息中的多个 Text Parts 合并为一个连续的 `text` 字段。

### 4.3 流程集成
在 `packages/distill/src/dag-runner.ts` 的 `run_distiller` 节点前插入一个 `normalization` 逻辑。

```typescript
// 伪代码流程
const rawArtifact = await artifactStore.get(sessionId);
const normalized = normalizer.process(rawArtifact);
const result = await distiller.run({ normalized, ... });
```

---

## 5. 风险与规避 (Risks)

- **风险 1：过度截断导致关键错误信息丢失。**
  - **规避**：引入 `maxToolSummaryChars` 可配置项，默认为 300，极端情况下 Distiller 可申请原始数据。
- **风险 2：不同 Provider 的 Parts 结构差异。**
  - **规避**：在 `packages/providers` 层实现基线 Normalizer Adapter，处理特定 Provider 的怪癖。
