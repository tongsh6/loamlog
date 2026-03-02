# 项目定义 | Project Specification

## 项目身份 | Identity

- **名称 / Name**: Loamlog (loamlog)
- **一句话定义 / One-liner**: 独立的 AI 协作资产平台，自动沉淀多工具交互并可插拔萃取。
  Independent AI collaboration asset platform with auto-capture and pluggable distillation.
- **核心价值 / Core Value**: 让 AI 交互从“一次性消费”升级为“可复利资产”。
  Turn AI interactions from one-time consumption into compounding assets.
- **项目性质 / Nature**: 独立程序，不依赖某单一工具。
  Standalone program, not coupled to any single tool.

## 问题陈述 | Problem Statement

### 三个断点 | Three Broken Links

1. **采集断点 / Capture Gap**: 手工导出会遗漏，流式增量导致简单监听难以稳定落盘。
   Manual export misses data; streaming updates break naive file-based capture.
2. **组织断点 / Organization Gap**: 数据分散、命名不统一，缺少 repo/branch/commit 上下文。
   Artifacts are fragmented and lack traceable repo context.
3. **转化断点 / Transformation Gap**: 从对话到 issue/PRD/知识卡缺少标准化流水线。
   No standard pipeline from conversations to reusable assets.

### 约束与风险 | Constraints and Risks

- **敏感信息 / Sensitive data**: token、key、内网路径必须默认脱敏。
- **版本变化 / Version drift**: OpenCode 事件和 payload 会变化。
- **性能要求 / Performance**: 高频 message 更新需要缓冲和防抖。
- **可信度 / Trust**: 无证据外发会导致噪声和幻觉问题。

## 解决方案 | Solution

### 第一层：沉淀层 | Layer 1: Capture & Archive

负责事件监听、会话聚合、统一落盘、追溯元信息、默认脱敏。
Handles event listening, session aggregation, unified storage, trace metadata, and default redaction.

### 第二层：萃取层 | Layer 2: Distill Platform

在归档数据上提供 Distill SDK、插件加载和 Sink 投递，方向/过程/结果可插拔。
Provides Distill SDK, plugin loading, and sink delivery on top of archives; what/how/where are all pluggable.

## 非目标 | Non-Goals

- 不是仅做“记录器” / Not just a recorder
- 不是仅绑定 OpenCode / Not OpenCode-only
- 不是默认自动外发 / Not auto-publish by default
- 第一阶段不做向量检索 / No vector search in phase 1

## 成功标准 | Success Criteria

### 沉淀层 MVP | Capture MVP

1. 配置 `LOAM_DUMP_DIR` 后会话可自动归档。
2. 输出按 repo 分桶，含 session_id/时间/repo 上下文。
3. 常见 token/key 脱敏生效。
4. 采集异常不影响宿主工具主流程。

### 萃取层 MVP | Distill MVP

1. Distill SDK 稳定，第三方可按接口开发 distiller。
2. 支持多 distiller 并行与结果合并。
3. 结果必须带 evidence 回链。
4. 默认仅输出本地候选清单。
