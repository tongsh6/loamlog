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

### 永不做 | Absolute Non-Goals

- 不替代 AI 编程工具本身 / Not a replacement for AI coding tools
- 不做训练数据集生成或模型微调 / No training data generation or fine-tuning
- 不做实时多人协作工作区 / No real-time collaborative workspace

### 阶段性不做 | Deferred (with unlock conditions)

- **自动外发发布**：M2 稳定运行 ≥ 2 周 + evidence 质量评分机制就绪后启动
- **向量检索**：归档会话 ≥ 500 条或用户明确提出跨会话搜索需求后启动
- **Web UI**：M3 完成 + ≥ 3 个外部用户提出需求后启动
- **distiller 市场**：接口向后兼容 ≥ 2 个 minor 版本 + ≥ 3 个社区 distiller 后启动

> 详细解锁条件见 [roadmap.md — 非目标](./roadmap.md#非目标--non-goals)

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
