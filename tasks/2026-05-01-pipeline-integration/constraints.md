# 约束条件与参考

**会话日期**: 2026-05-01  
**分支**: develop  
**HEAD**: 2df3990

## 硬约束 (来自 AGENTS.md)

- Plugin errors MUST NOT crash the host tool
- Redaction ON by default
- No writes unless `LOAM_DUMP_DIR` is configured
- No result without evidence enters external sinks
- Phase 1: local file output only

## 工程原则 (来自 AIEF/context/tech/engineering-principles.md)

- DRY：不复制控制流
- 开闭原则：新增能力通过注册表/配置/DAG 节点，不修改中心流程
- 正交性：各层独立建模
- 切面化：日志/重试/超时不应嵌入业务代码
- 深模块：对外窄接口，对内吸收复杂性
- 垂直切片：优先可运行端到端小闭环
- 性能：显式考虑全量扫描、重复调用、幂等

## 关键参考文档

- `AIEF/plans/2026-04-30-architecture-dag-blueprint.md` — 架构蓝图（Phase 状态需更新）
- `AIEF/context/tech/contracts.md` — 核心接口契约
- `AIEF/context/tech/architecture.md` — 总体架构
- `AIEF/context/business/roadmap.md` — 里程碑路线图
- `AIEF/context/business/current-focus.md` — 当前焦点

## 新增模块 API

- `packages/pipeline/src/index.ts` — `PipelineNode`, `DAGDefinition`, `validateDAG()`, `executeDAG()`
- `packages/core/src/index.ts` — `EvidenceSpan`, `Signal`, `AssetCandidate`, `Decision`, `QualityReport`, `mapDistillResultToCandidate()`, `validateAssetCandidate()`, `AuditRecord`, `createAuditRecord()`, `approvalGate()`

## 当前代码路径

- Distill engine: `packages/distill/src/engine.ts` (串行循环)
- File sink: `packages/sinks/file/src/index.ts` (直接写入，无门禁)
- Pipeline: `packages/pipeline/src/index.ts` (未被引用)
