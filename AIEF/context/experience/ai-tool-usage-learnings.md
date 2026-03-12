# AI 协作工具使用经验 | AI Collaboration Tool Usage Learnings

记录与 AI 协作过程中关于工具使用和命令发现的经验教训。
Record of learnings about tool usage and command discovery in AI collaboration.

---

## 1. 优先查 CLI 而非直接跳到 API | Check CLI First Before Jumping to API

### 1.1 问题：过度依赖底层 API

**场景**：需要创建 GitHub Project
- ❌ **错误做法**：直接使用 GraphQL API `createProjectV2` mutation
- ✅ **正确做法**：先查 `gh project --help`，发现已有 `gh project create` 命令

**教训**：
- CLI 通常封装了最常用的操作，比 API 更简洁
- 现代 CLI 工具（gh、kubectl、aws-cli 等）都有良好的子命令结构
- **习惯性动作**：遇到任务时，先运行 `gh <command> --help` 查看可用子命令

### 1.2 具体案例：GitHub Project 创建

```bash
# 我的初始思路（过度工程化）
gh api graphql -f query='
  mutation {
    createProjectV2(
      input: {
        ownerId: "MDQ6VXNlcjExNjU3MjM5"
        title: "Loamlog Development Board"
      }
    ) {
      projectV2 { id url }
    }
  }
'

# 实际简单的做法（用户提醒后）
gh project create --owner tongsh6 --title "Loamlog Development Board"
```

**差距分析**：
| 维度 | GraphQL API | CLI 命令 |
|------|-------------|----------|
| 代码量 | 15+ 行 | 1 行 |
| 需要参数 | ownerId（需查询） | owner（直接用户名） |
| 可读性 | 低 | 高 |
| 维护性 | 差（JSON 字符串） | 好 |

---

## 2. 为什么我会忽略 CLI 命令？| Why Did I Overlook the CLI Command?

### 2.1 知识截止与更新滞后

- gh CLI 的 `project` 子命令是相对较新的功能（2022-2023 年引入）
- 训练数据可能不包含最新的 CLI 命令更新
- 更多接触到底层 GraphQL API 的知识

### 2.2 过度工程化思维

**思维模式**：
```
❌ 默认思路：底层 API → 更通用 → 更灵活 → 更好
   GraphQL API → 需要 ownerId → 查 user node_id → 
   需要 repositoryId → 查 repo node_id → 
   构建复杂 mutation

✅ 实际思路：能用简单就别用复杂
   CLI 命令 → 一行搞定
```

**问题**：倾向于使用"底层"、"通用"的解决方案，忽略了更高层、更简洁的封装。

### 2.3 文档查阅不足

- 没有主动运行 `gh project --help` 查看可用命令
- 假设了"必须通过 GraphQL 创建"这个前提
- 如果查看了帮助文档，就会发现 `create` 子命令存在

### 2.4 思维定势

- 之前处理 Projects 都用 GraphQL（因为早期只有这个方式）
- 形成了路径依赖，没有考虑到 CLI 可能已经封装了
- **惯性思维**：以前怎么做，现在就怎么做

---

## 3. 改进模式 | Improved Patterns

### 3.1 工具使用检查清单

遇到新任务时，按此顺序检查：

```
1. 原生 CLI 支持？
   → gh <command> --help
   → 查看是否有直接支持的子命令

2. 社区封装工具？
   → 是否有第三方 CLI 封装
   → 是否有官方扩展

3. 底层 API？
   → REST API
   → GraphQL API
   
4. 自己实现？
   → 最后才考虑
```

### 3.2 CLI 探索命令模板

```bash
# 查看命令结构
gh <command> --help

# 查看子命令
gh <command> <subcommand> --help

# 查看示例（如果有）
gh <command> <subcommand> --help | grep -A 5 "EXAMPLE"
```

### 3.3 实践原则

| 原则 | 说明 |
|------|------|
| **先查能用** | 先找有没有现成的，再考虑自己写 |
| **从高层到低层** | CLI → SDK → API → 自己实现 |
| **承认无知** | 不确定时直接问用户"这个工具有没有 xxx 命令？" |
| **更新假设** | 工具在进化，以前的做法不一定现在还对 |

---

## 4. 对比：API vs CLI 选择指南 | API vs CLI Decision Guide

### 4.1 选择 CLI 的场景

- ✅ 一次性操作
- ✅ 交互式探索
- ✅ 人类可读输出
- ✅ 快速验证想法
- ✅ 不需要复杂逻辑

### 4.2 选择 API 的场景

- ✅ 自动化脚本
- ✅ 批量操作
- ✅ 跨工具集成
- ✅ 需要复杂数据处理
- ✅ CLI 不支持的功能

### 4.3 本案例的决策树

```
创建 GitHub Project
    ↓
是一次性操作？ → 是 → 用 CLI ✅
                ↓ 否
需要自动化？   → 是 → 考虑 API
                ↓ 否
需要批量创建？ → 是 → 考虑 API
                ↓ 否
用 CLI ✅
```

---

## 5. 类似案例警示 | Similar Case Warnings

### 5.1 Docker：docker-compose vs docker compose

```bash
# 旧思维（已弃用）
docker-compose up

# 新方式（内置）
docker compose up
```

### 5.2 kubectl：直接 API 调用 vs kubectl 命令

```bash
# 过度底层
curl -k -H "Authorization: Bearer $TOKEN" \
  https://api-server/api/v1/namespaces/default/pods

# 正确方式
kubectl get pods -n default
```

### 5.3 AWS：aws-cli vs 直接 HTTP API

```bash
# 几乎不会这样做
aws apigateway invoke ...

# 正确方式
aws s3 ls
aws ec2 describe-instances
```

---

## 6. 对 AI 的启示 | Implications for AI

### 6.1 用户提示的价值

- 用户纠正："你应该是可以通过命令创建的..."
- 这暴露了 AI 的知识盲区
- **关键**：AI 应该感谢纠正并记录下来

### 6.2 承认局限性

- "我不知道这个命令"
- "让我查一下..."
- 比假装知道然后给复杂方案更好

### 6.3 经验沉淀

- 将此类经验写入 AIEF
- 下次遇到类似场景时参考
- 形成"工具使用模式"知识库

---

## 7. 执行建议 | Action Items

### 7.1 立即执行

- [x] 更新创建脚本使用简化命令
- [x] 将本经验写入 AIEF

### 7.2 长期习惯

- [ ] 遇到新工具任务时，先 `--help` 再行动
- [ ] 定期更新工具知识（关注 CLI 更新日志）
- [ ] 建立"工具命令速查表"

### 7.3 提示词优化

在 System Prompt 中加入：
```
当涉及 CLI 工具操作时：
1. 先检查是否有高层 CLI 命令
2. 再考虑是否需要底层 API
3. 不确定时询问用户而非假设
```

---

## 8. 总结 | Summary

> **"先查工具能做什么，再决定怎么做"**

而不是：
> **"假设只能这样做，然后去找方法"**

本案例的核心教训：**现代 CLI 工具的封装层级很高，优先使用 CLI，API 作为后备。**

---

*Created: 2026-03-13*
*Context: GitHub Project 创建优化*
*Related: .github/create-project.sh, PROJECTS_SETUP.md*
