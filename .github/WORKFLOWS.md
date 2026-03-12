# Loamlog GitHub 工作流配置

本目录包含 Loamlog 项目的所有 GitHub Actions 自动化工作流。

## 工作流列表

### 1. Issue Triage (`issue-triage.yml`)
**触发条件**: 新 Issue 创建时

**功能**:
- 自动添加 `status:needs-triage` 标签
- 发送欢迎评论，引导用户查看路线图

### 2. PR Automation (`pr-automation.yml`)
**触发条件**: PR 创建、重新打开、标记为可审查时

**功能**:
- 根据 PR 标题自动添加类型标签 (feat/fix/docs/refactor/chore/security)
- 根据修改的文件自动添加领域标签 (sanitizer/trigger/rules/evaluation/mcp/provider/distill/cli)
- 发送审查清单评论
- 自动请求相关审查者

### 3. Issue Status Sync (`issue-status-sync.yml`)
**触发条件**: Issue 标签变更、分配变更时

**功能**:
- 分配负责人且设置优先级后，自动标记为 `status:ready`
- P0 Issue 被标记时发送高优先级提醒
- 检查 P0/P1 Issue 是否有里程碑

### 4. Milestone Progress (`milestone-progress.yml`)
**触发条件**: 每周一上午 9:00 (手动触发也支持)

**功能**:
- 生成里程碑进度报告
- 统计开放/已完成 Issue 数量
- 计算进度百分比
- 显示截止日期和剩余天数
- 列出准备就绪、进行中、被阻塞的任务
- 自动创建/更新跟踪 Issue

### 5. Release (`release.yml`)
**触发条件**: 推送 v* 标签时

**功能**:
- 运行测试和构建
- 按类型分组生成发布说明 (Features/Bug Fixes/Docs/Refactoring)
- 创建 GitHub Release
- 自动标记预发布版本 (alpha/beta/rc)
- 关闭对应的里程碑

## 标签系统

### 优先级
- `priority:p0` - Critical (红色)
- `priority:p1` - High (橙色)
- `priority:p2` - Medium (黄色)
- `priority:p3` - Low (绿色)

### 类型
- `type:feature` - 新功能
- `type:bug` - Bug 修复
- `type:security` - 安全相关
- `type:docs` - 文档
- `type:refactor` - 重构
- `type:chore` - 维护

### 状态
- `status:needs-triage` - 需要评估
- `status:ready` - 准备就绪
- `status:blocked` - 被阻塞
- `status:design` - 设计阶段
- `status:mvp` - MVP 范围

### 领域
- `area:sanitizer` - 脱敏网关
- `area:trigger` - 触发器管道
- `area:rules` - 规则系统
- `area:evaluation` - 评测框架
- `area:mcp` - MCP 暴露层
- `area:provider` - 数据提供者
- `area:distill` - 萃取引擎
- `area:cli` - CLI 接口

### 里程碑
- `milestone:a` - Milestone A: Trust
- `milestone:b` - Milestone B: Protocol
- `milestone:c` - Milestone C: UX

## 使用指南

### 提交 PR

确保 PR 标题遵循约定：
```
feat: add new sanitizer rule for API keys
fix: resolve race condition in trigger pipeline
docs: update README with new examples
refactor: simplify rule engine logic
security: fix token exposure in logs
```

### Issue 生命周期

1. **创建** → 自动标记 `status:needs-triage`
2. **评估** → 维护者添加优先级和类型标签
3. **分配** → 自动标记 `status:ready`
4. **开始** → 移动到 "In Progress"
5. **审查** → 创建 PR，关联 Issue
6. **完成** → 合并 PR，自动关闭 Issue

### 里程碑管理

1. 在 Issues → Milestones 创建里程碑
2. 为相关 Issue 分配里程碑
3. 每周一自动收到进度报告
4. 发布版本时自动关闭对应里程碑

## 手动触发工作流

前往 Actions 标签页，选择工作流，点击 "Run workflow"。

## 故障排除

### 工作流未运行
- 检查 Actions 是否启用 (Settings → Actions → General)
- 检查是否有权限问题

### 标签未添加
- 确认标签已存在 (Settings → Labels)
- 检查工作流日志

### 里程碑报告未生成
- 手动触发测试: Actions → Milestone Progress → Run workflow
- 检查是否有开放的里程碑

## 自定义

编辑 `.github/workflows/*.yml` 文件来自定义行为。

## 参考

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [GitHub Projects 文档](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
