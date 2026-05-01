# Tasks — AI 任务留痕与推进约束

本目录用于记录 AI 执行任务时的规划、约束和结果。每次 AI 接手推进任务时，在此创建以 `YYYY-MM-DD-<主题>` 命名的子目录。

This directory records AI task plans, constraints, and results. Each AI execution session creates a subdirectory named `YYYY-MM-DD-<topic>`.

## 目录结构 | Directory Structure

```
tasks/
├── README.md                          # 本文件 | This file
└── YYYY-MM-DD-<topic>/               # 单次任务会话 | One task session
    ├── plan.md                        # 任务执行计划 | Execution plan
    ├── constraints.md                 # 约束条件与参考文档 | Constraints & references
    └── progress.md                    # 执行进度与结果 | Progress & results
```

## 使用规则 | Usage Rules

### 创建任务 | Creating a Task

1. AI 接手推进任务前，先创建 `tasks/YYYY-MM-DD-<topic>/` 目录
2. 写入 `plan.md`：任务目标、步骤、验收标准
3. 写入 `constraints.md`：引用的文档、硬约束、上下文链接
4. 执行过程中更新 `progress.md`

### 文件约定 | File Conventions

- `plan.md` — 做什么、为什么、怎么做、怎么验收。不写代码细节，只写设计决策和步骤。
- `constraints.md` — 引用已有文档（AIEF/）、硬约束（AGENTS.md 中的规则）、当前分支/版本信息。
- `progress.md` — 每完成一个步骤后追加一行：时间戳、做了什么、结果（通过/失败/阻塞）。

### 与 AIEF 的关系 | Relationship to AIEF

- `AIEF/plans/` — 长期架构蓝图与阶段计划（跨会话）
- `tasks/` — 单次 AI 执行会话的任务追踪（会话语义）
- `AIEF/context/` — 项目长期上下文（跨会话参考）
- `AIEF/reports/` — 扫描报告等自动化产出

简言之：`AIEF` 存"是什么"，`tasks` 存"这次做了什么"。
