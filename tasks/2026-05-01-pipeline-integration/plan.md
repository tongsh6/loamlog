# 执行计划：Pipeline 集成与文档同步

**日期**: 2026-05-01  
**分支**: develop  
**版本基线**: v0.5.0 + Phase 3/4/5 代码已完成

## 背景

架构 DAG 蓝图（`AIEF/plans/2026-04-30-architecture-dag-blueprint.md`）的 Phase 3/4/5 代码已通过 3 个 commit 提交到 `develop`：

- `360c99f` — `@loamlog/pipeline` typed DAG executor (Phase 3)
- `2bbfb5e` — asset graph domain types + quality gate (Phase 4)
- `2df3990` — approval gate + audit trail (Phase 5)

但这些模块目前是独立单元，**没有接入实际产品链路**。Distill engine 仍用串行循环，DistillResult 没有经过资产生命周期，file sink 没有经过质量门禁。

## 目标

1. 文档与代码事实同步（蓝图阶段状态、路线图、当前焦点）
2. Pipeline 集成到 distill 流程
3. 资产图模型桥接到 DistillResult 产出
4. 审批门禁接入 file sink 写入路径

## 推进策略

按垂直切片逐层推进，每层保持 `pnpm run test` 全绿：

```
Phase 1 (文档同步)
  └─> Phase 2 (Pipeline 集成)
        └─> Phase 3 (资产图桥接)
              └─> Phase 4 (审批门禁接入)
```

## Phase 1: 文档同步

**目标**: 让文档反映代码已完成的事实

**文件变更**:
- `AIEF/plans/2026-04-30-architecture-dag-blueprint.md` — Phase 3/4/5 状态更新为 ✅
- `AIEF/context/business/roadmap.md` — M5 状态、新增完成项
- `AIEF/context/business/current-focus.md` — 反映新进展

**验收**: 文档中 Phase 3/4/5 不再标记为 "Planned"

## Phase 2: Pipeline 集成

**目标**: distill engine 支持 DAG 执行模式

**方案**:
- 在 `packages/distill/` 新增 `dag-runner.ts`，定义 issue-draft DAG 节点
- DAG 节点：query_artifacts → run_distiller → validate → metadata → dedup → sink
- engine 新增 `runWithDAG()` 方法，与现有 `run()` 并行存在
- 现有 `run()` 保持不变（向后兼容）

**验收**: 
- DAG 模式可执行 issue-draft 端到端链路
- `pnpm run test` 全绿
- 现有 CLI 行为不变

## Phase 3: 资产图桥接

**目标**: DistillResult 产出经过 AssetCandidate 生命周期

**方案**:
- 在 engine 的 draft→result 流程中，调用 `mapDistillResultToCandidate()`
- 调用 `validateAssetCandidate()` 进行质量检查
- 质量不通过的候选进入 `rejected/` 目录
- `DistillReport` 增加 quality 字段

**验收**: 低质候选不会进入 pending/

## Phase 4: 审批门禁接入

**目标**: file sink 写入前经过审批门禁 + 生成审计记录

**方案**:
- file sink 写入前调用 `approvalGate()`（默认本地自动审批）
- 每次写入生成 `AuditRecord`，写入 `distill/{repo}/audit/`
- 本地 file sink 默认 `allowExternal: false` 但不过度阻断

**验收**: 每次 sink 写入有审计记录
