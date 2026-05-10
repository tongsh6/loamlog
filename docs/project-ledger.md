# Project Ledger — Loamlog 事实台账

## 1. 当前阶段目标 (v0.6.0+)

**核心任务**：从“线性采集-蒸馏”向“工业化炼矿中心”架构转型。
**战略重点**：补齐 `Normalizer` (破碎)、`Verifier` (冶炼) 和 `Aggregator` (精炼) 三大缺失环节。

---

## 2. 工序状态台账

| 车间 (工序) | 状态 | 关键组件/证据 | 当前缺口 |
| :--- | :--- | :--- | :--- |
| **破碎 (Normalizer)** | **开发中** | `AIEF/openspec/session-normalizer.md` | 尚未集成进 `distill` 主引擎。 |
| **选矿 (Distiller)** | **已闭环** | `packages/distill`, `issue-draft` V1 | 输出含杂质，缺乏上下文。 |
| **冶炼 (Verifier)** | **缺失** | 仅有 `static-scan-gate.md` 计划 | 缺乏将 AI 猜想与磁盘事实对齐的逻辑。 |
| **精炼 (Aggregator)** | **缺失** | 仅在 `current-focus.md` 中提及 | 无法处理跨会话的信号合并。 |
| **储运 (Sink)** | **已闭环** | `packages/sinks/github`, `notion` | 缺乏验证证据的自动挂载。 |

---

## 3. 关键证据索引

- **架构转型定义**：`AIEF/openspec/refinery-pipeline.md` (2026-05-11)
- **正常化规格**：`AIEF/openspec/session-normalizer.md`
- **最新执行记录**：`tasks/2026-05-01-pipeline-integration/` (DAG 引擎已通)

---

## 4. 下一步 Top 3 优先级

1. **[P0] 炼矿中心管道集成**：在 `distill` 引擎中插入 `Normalizer` 接口，强制降噪。
2. **[P0] 冶炼环节 (Verifier) 原型**：实现第一个能去磁盘检查文件是否存在的 Verifier。
3. **[P1] 跨会话标识符定义**：定义如何判断两个 Session 属于同一“矿脉”。
