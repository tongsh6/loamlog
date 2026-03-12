# GitHub Projects 看板设置指南

由于 GitHub API 限制，Projects V2 需要通过 Web UI 手动创建。

## 创建步骤

### 1. 创建 Project

1. 访问 https://github.com/tongsh6/loamlog/projects
2. 点击 **"New project"**
3. 选择 **"Board"** 模板
4. 名称：`Loamlog Development Board`
5. 描述：`Loamlog 开发看板 - 按里程碑跟踪 Issue 和 PR 进度`
6. 点击 **Create**

### 2. 配置列（Status Fields）

创建以下列：

| 列名 | 用途 |
|------|------|
| 📥 Backlog | 待规划的 Idea 和需求 |
| 🔍 Needs Triage | 需要初始评估的 Issue |
| 📋 Ready | 已准备好可以开工 |
| 🔄 In Progress | 正在进行中 |
| 👀 In Review | 代码审查中 |
| ✅ Done | 已完成 |
| 🚫 Blocked | 被阻塞/依赖其他任务 |

### 3. 添加自定义字段

在 Project 设置中添加：

#### 单选字段：Priority
- P0 Critical (红色)
- P1 High (橙色)
- P2 Medium (黄色)
- P3 Low (绿色)

#### 单选字段：Milestone
- Milestone A: Trust (粉色)
- Milestone B: Protocol (浅橙色)
- Milestone C: UX (浅黄色)

#### 数字字段：Effort
- 显示名称：预估工作量（天）

#### 数字字段：Actual
- 显示名称：实际工作量（天）

### 4. 添加工作流自动化

在 Project 设置 → Workflow 中启用：

#### 自动化规则 1：Issue 分配给某人时
```
When: Issue is assigned to someone
Then: Move to "🔄 In Progress"
```

#### 自动化规则 2：PR 创建时
```
When: Pull request is opened
Then: Move to "👀 In Review"
Add to project: Loamlog Development Board
```

#### 自动化规则 3：PR 合并时
```
When: Pull request is merged
Then: Move to "✅ Done"
```

#### 自动化规则 4：Issue 关闭时
```
When: Issue is closed
Then: Move to "✅ Done"
```

### 5. 配置视图

创建多个视图：

#### 视图 1：按里程碑分组（默认）
- 分组：Milestone
- 排序：Priority（降序）
- 筛选：状态 != Done

#### 视图 2：按优先级
- 分组：Priority
- 排序：创建时间

#### 视图 3：当前冲刺
- 筛选：Milestone = "Milestone A: Trust"
- 分组：状态

#### 视图 4：已完成
- 筛选：状态 = Done
- 排序：关闭时间（降序）

### 6. 添加 Issue 到 Project

批量添加现有 Issues：

```bash
# 添加所有开放的 Issues
gh issue list --state open --json number | jq -r '.[].number' | while read num; do
  gh project item-add 1 --owner tongsh6 --url "https://github.com/tongsh6/loamlog/issues/$num"
done
```

### 7. 配置权限

1. 进入 Project 设置 → Manage access
2. 添加协作者（Collaborators）
3. 设置权限级别：
   - Admin：可以修改配置
   - Write：可以移动卡片、添加注释
   - Read：只读访问

## 使用工作流

### 每日站会
1. 打开 Project 看板
2. 查看 "🔄 In Progress" 列
3. 检查 "🚫 Blocked" 列的阻塞项
4. 更新卡片状态

### 周会回顾
1. 查看 "✅ Done" 列本周完成的工作
2. 更新 Effort/Actual 字段统计
3. 讨论下周计划（移动 Backlog 到 Ready）

### 里程碑规划
1. 创建新的 Milestone
2. 在 Project 中筛选该 Milestone
3. 确保所有 P0/P1 Issue 都有负责人
4. 检查进度是否符合预期

## 集成

### 与 Issue 标签同步
Project 字段应与 Issue 标签保持同步：
- Priority 字段 ↔ priority:p0/p1/p2/p3 标签
- Milestone 字段 ↔ milestone:a/b/c 标签

### 自动化建议
可以设置 GitHub Actions 在以下情况自动更新 Project：
- Issue 添加标签时更新对应字段
- Issue 分配给某人时移动到 In Progress
- PR 关联 Issue 时同步状态

## 快捷键

- `N`：新建 Issue
- `?`：显示所有快捷键
- `Esc`：关闭弹窗
- 拖拽：移动卡片到不同列
