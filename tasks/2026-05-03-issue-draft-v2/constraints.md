# Constraints — Issue Draft Distiller V2

## 参考文档 | References

- 设计文档: `AIEF/openspec/issue-draft-v2.md`
- 工程原则: `AIEF/context/tech/engineering-principles.md`
- 相关设计: `AIEF/openspec/continuous-mining-mode.md`, `AIEF/openspec/large-session-shard-map-reduce.md`
- SDK: `packages/distiller-sdk/src/index.ts`
- Issue Draft: `packages/distillers/issue-draft/src/`

## 硬约束 | Hard Constraints

- 不改变 DistillerPlugin 接口
- 不改变 sink 接口
- 无 evidence 的结果不得外发
- 默认开启脱敏
- 遵循设计文档先行原则

## 分支与版本 | Branch & Version

- 分支: `develop`
- 基于 commit: current HEAD
