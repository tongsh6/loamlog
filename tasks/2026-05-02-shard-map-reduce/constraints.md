# Constraints — Large Session Shard-Map-Reduce

## 参考文档 | References

- 设计文档: `AIEF/openspec/large-session-shard-map-reduce.md`
- 工程原则: `AIEF/context/tech/engineering-principles.md` — 遵循开闭原则、正交性、深模块、优先垂直切片
- 架构 DAG 蓝图: `AIEF/plans/2026-04-30-architecture-dag-blueprint.md`
- 相关实现: `packages/distill/src/dag-runner.ts`、`packages/distillers/issue-draft/src/index.ts`

## 硬约束 | Hard Constraints

- 插件错误不得导致宿主崩溃
- 默认开启脱敏
- 未配置 `LOAM_DUMP_DIR` 不写入
- 无 evidence 的结果不得外发
- 不改变 distiller 接口
- 不改变 sink 接口
- 小 session 路径 100% 不受影响

## 分支与版本 | Branch & Version

- 分支: `develop`
- 版本: v0.6.0
- 基于 commit: current HEAD

## 上下文 | Context

- continuous-mining-mode 已实现（trigger continuous mode + backfill + CLI flags）
- DAG runner 已修复流式读取和 per-session 错误恢复
- 狗粮验证正在后台运行（PID 22078）
- 当前 160 测试全绿
