# Knowledge Card 中文复验评分表

> 批次：2026-05-12 zh rerun / 模型：LM Studio openai/gpt-oss-120b / dump：/private/tmp/loamlog-dogfood-zh-2026-05-12
> 产出：9 sessions processed，10 cards produced，qualityPassed 10/10

## Card 1：在多层级配置系统中区分全局、项目、工作流和本地覆盖

- ID：04b03d8e-ae85-4453-adec-1840c8a3f1dd
- 类型：knowledge-card
- 置信度：0.92
- 分类：configuration
- Tags：configuration, configuration, elixir, umbrella, agent-runtime, profile

### 摘要
使用四层（global → project → work → local）配置结构，可同时满足团队规范与个人实验需求。

### 场景
Elixir/Phoenix Umbrella 项目（如 ai-novel-studio）的 agent runtime 需要在不同粒度上控制行为、权限和预算。

### 问题
缺乏统一的配置层级导致同一设置在不同上下文中冲突或难以覆盖，例如全局安全策略与作者个人偏好混杂。

### 原因
项目代码只实现了单一配置文件，未区分全局、项目、工作流和本地四种作用域，导致配置合并逻辑不明确。

### 做法
引入四层级配置模型：
1. **global_author_profile** – 团队统一的安全/预算规则；
2. **project_profile** – 单个作品或仓库的风格、约束；
3. **work_profile** – 当前创作会话的临时参数；
4. **local_session_override** – 开发者本地的实验性覆盖。
在加载配置时按优先级 `local > work > project > global` 合并，并提供统一的查询 API。

### 边界
不适用于需要实时动态权限变更的场景；若业务对单次请求的安全检查极其严格，仍需在运行时额外校验。

### 详情
在 ai-novel-studio 的 v3 设计中，引入四层配置可以让团队统一规则（global）与作品特有需求（project）共存，同时支持作者在一次创作会话（work）以及本地调试时的临时覆盖（local）。这种层级化解决了单一配置文件导致的冲突问题，并通过明确的合并顺序避免意外覆盖。

### Evidence
- session=rollout-2026-05-02T16-12-58-019de7bf-777c-7b62-99de-f1db67ff195f / message=codex-11
  - Claude Code 有 managed / user / project / local 多级配置，适合团队共享规则和个人偏好并存。官方文档说明 project 配置可以提交到仓库，local 配置用于个人覆盖，优先级也明确。
- session=rollout-2026-05-02T16-12-58-019de7bf-777c-7b62-99de-f1db67ff195f / message=codex-19
  - 缺“类似 managed/user/project/local 的配置层级产品化”。

### 评分
- 分数：4/5
- 理由：结构完整，包含场景、问题、原因、做法和边界，中文输出符合项目偏好；但 evidence 到 `global/project/work/local` 命名有一定再加工，不是完全由原文直接支撑。

## Card 2：Elixir 时间戳转换错误导致1970年时间

- ID：1c530492-3ccb-4444-a5f9-dd80deb92245
- 类型：knowledge-card
- 置信度：1
- 分类：debugging
- Tags：debugging, elixir, datetime, timestamp, insight, architecture, llm, dialogue, slot-validation, design-insight, system-time, os-time

### 摘要
使用 `System.system_time(:millisecond)` 时不要再用 `DateTime.from_unix(..., :millisecond)`，因为前者返回的是单调递增的系统时间而非 Unix 时间戳。

### 场景
在 Elixir 项目中记录日志或生成 ISO8601 时间戳时，从 `System.system_time(:millisecond)` 直接转换为 DateTime 会产生错误的1970年时间。

### 问题
日志中的所有时间戳都显示为 1970-01-21，导致无法追踪真实事件顺序。

### 原因
`System.system_time/1` 返回的是自系统启动以来的单调递增计数，而 `DateTime.from_unix/2` 的第二参数表示输入值的单位；代码先把毫秒除以 1000 得到秒，再告诉函数它是毫秒，导致再次被除以 1000。

### 做法
直接使用 `DateTime.utc_now() |> DateTime.to_iso8601()` 获取当前 UTC 时间，或改为 `System.os_time(:millisecond) |> DateTime.from_unix!(:millisecond)`。

### 边界
仅在需要真实 Unix 时间戳的场景使用；如果业务确实需要单调计数（如性能测量），仍可保留 `system_time` 并自行除以 1000。

### 详情
日志分析发现时间戳全为1970年，是因为代码先把 `System.system_time(:millisecond)` 除以1000得到秒，再用 `DateTime.from_unix(..., :millisecond)` 把秒误当毫秒处理。改为直接使用 `DateTime.utc_now/0` 或 `System.os_time/1` 配合正确的单位即可恢复真实时间。

### Evidence
- session=a26bb6fa-3a4a-4747-898f-fcfb9c748c1a / message=b69a2402-53fc-4915-bcc8-d7197a840d00
  - 所有 10 条记录的时间戳都是 `1970-01-21T13:47:26.xxxZ`，而不是 [PHONE]。根因：`System.system_time(:millisecond)` 获取的是单调递增的系统时间…
- session=a26bb6fa-3a4a-4747-898f-fcfb9c748c1a / message=b69a2402-53fc-4915-bcc8-d7197a840d00
  - 所有 10 条记录的时间戳都是 `1970...` 根因：Router 拦截导致表单化体验…
- session=a26bb6fa-3a4a-4747-898f-fcfb9c748c1a / message=c8c05177-3a90-4071-b5df-ecf9685fde53
  - 工作台充当了用户和 LLM 之间的中间人/表单验证器——先拦截用户的话，提取结构化参数…
- session=a26bb6fa-3a4a-4747-898f-fcfb9c748c1a / message=b69a2402-53fc-4915-bcc8-d7197a840d00
  - `System.system_time(:millisecond)` 获取的是单调递增的系统时间（~1.77 万亿），不是 Unix 时间戳。

### 评分
- 分数：4/5
- 理由：场景、问题、原因、做法和边界完整，技术判断基本可靠；但 evidence 混入了 Router 拦截、表单验证器等无关引用，证据链不够干净。

## Card 3：Loamlog 蒸馏阶段需要有效的 LLM API Key

- ID：233bb7ca-a5f8-4911-80d1-9591f2b6943b
- 类型：knowledge-card
- 置信度：0.88
- 分类：configuration
- Tags：configuration, loamlog, distill, api-key, llm, environment-variable

### 摘要
在使用 Loamlog 将捕获的会话蒸馏为 Issue Draft 时，必须提供可用的 LLM Provider API key，否则蒸馏任务会卡住。

### 场景
项目中希望通过本地或云端大模型（如 DeepSeek、OpenAI、Anthropic）自动生成 Issue 草稿，但缺失或未配置对应的 API Key。

### 问题
蒸馏命令启动后无响应，日志显示 “API keys 为空”，导致整个流水线阻塞。

### 原因
Loamlog 的 distill 子系统在调用 LLM 时会读取环境变量（如 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`），若这些变量未设置或为空，LLM 客户端直接返回错误并停止处理。

### 做法
在运行蒸馏前确保至少一个目标 Provider 的 API Key 已正确导入环境，例如 `export OPENAI_API_KEY=sk-xxxx`；或者使用本地模型（Ollama、LM Studio）时，确认对应的服务已启动且配置文件指向本地端点。

### 边界
仅在需要远程 LLM 进行文本生成时适用；如果完全依赖离线模型且已正确配置本地服务器，则无需 API Key。

### 详情
Loamlog 在蒸馏阶段会调用外部大模型生成 Issue 草稿。用户在会话中发现 DeepSeek、OpenAI、Anthropic 的 key 均为空，导致蒸馏任务卡住。解决方案是提前设置相应的环境变量或切换到本地模型（如 Ollama），确保 LLM 可达。

### Evidence
- session=d977c8a1-455c-4ac5-b394-d4679a8d7f08 / message=da44319a-b0ad-4e87-9ca3-12b92a53aead
  - `需要确定 DeepSeek provider 期望的环境变量名。`
- session=d977c8a1-455c-4ac5-b394-d4679a8d7f08 / message=5c5df55d-20c2-44e0-aa22-8cdef3f27fbf
  - `DeepSeek key 为空。用 OpenAI 试试。`
- session=d977c8a1-455c-4ac5-b394-d4679a8d7f08 / message=77daf25a-13e3-4d27-b066-77c74abe45e2
  - `API keys 为空。让我检查是否可以用本地模型（Ollama/LM Studio）来完成蒸馏。`

### 评分
- 分数：3/5
- 理由：结构完整且可读，但价值偏运行配置 FAQ，复用收益一般；摘要写 Issue Draft，与本批次 knowledge-card distill 语境有轻微错配。

## Card 4：Loamlog 自动捕获 Claude‑Code 会话并进行脱敏

- ID：5094fd05-9a24-4d73-a4ca-f8aa6a4a2d21
- 类型：knowledge-card
- 置信度：0.92
- 分类：pattern
- Tags：pattern, loamlog, claude-code, session-capture, file-watcher, redaction, automation

### 摘要
使用 Loamlog 的 Claude‑Code provider 可通过文件监控自动捕获会话，并在写入快照前自动脱敏 100+ 条敏感信息。

### 场景
在项目中需要对 Claude‑Code（或类似的 AI 编程助手）产生的交互进行完整归档，以便事后审计、复现或生成 Issue 草稿。

### 问题
手动导出会话既繁琐又容易漏掉敏感信息，导致快照泄露 API Key、邮箱等数据。

### 原因
Claude‑Code 将每次对话写入 `~/.claude/projects/` 下的 `.jsonl` 文件；Loamlog 的 provider 通过文件 watcher 检测文件 mtime 并在 idle（默认 30 秒无变动）后触发捕获，内部集成了脱敏网关。

### 做法
启动 Loamlog daemon 或使用 `loam capture --provider claude-code --session-id <id>` 手动捕获；确保 `LOAM_DUMP_DIR` 已指向归档目录，捕获完成后快照会自动写入并在保存前执行脱敏（过滤 API keys、tokens、邮箱等）。

### 边界
仅适用于 Claude‑Code 的 JSONL 会话文件结构；若使用自定义 provider 或修改了默认 idle 时间，需要相应调整 watcher 配置或自行实现脱敏逻辑。

### 详情
在 Loamlog 项目中，Claude‑Code provider 通过监控 `~/.claude/projects/` 下的 `.jsonl` 文件，实现自动捕获会话并在文件空闲 30 秒后写入快照。捕获链路包括 JSONL → Provider 解析 → 脱敏网关 → 原子 JSON 快照，脱敏阶段已成功处理 146 处敏感信息，确保归档安全。

### Evidence
- session=d977c8a1-455c-4ac5-b394-d4679a8d7f08 / message=6e18567a-7c68-43a0-bd0a-7027ba75020e
  - `Loamlog 的 Claude Code provider 通过监控 ~/.claude/projects/ 下的 .jsonl 文件来捕获会话。daemon 模式用 file watcher 检测文件修改时间（mtime）变化，当文件 idle（默认 30 秒无变化）时自动捕获。而 capture 命令可以直接指定 session_id 手动捕获。`
- session=d977c8a1-455c-4ac5-b394-d4679a8d7f08 / message=fbd87bd0-42dc-4312-9deb-20e6a5e8a5dc
  - `捕获了 53 条消息和 29 个工具调用，redacted_count=146 表示脱敏网关自动处理了 146 处敏感数据（API keys、tokens、邮箱等）。`

### 评分
- 分数：4/5
- 理由：内容完整，证据能直接支撑捕获、idle watcher 与脱敏能力，且与 Loamlog 核心价值高度相关；但 `Claude‑Code` 命名格式不够统一，且“100+ 条敏感信息”来自一次样本，不应泛化成稳定能力承诺。

## Card 5：在多模块项目中实现 AI 驱动的静态扫描闭环

- ID：5a302920-5e51-4e28-b914-5663908afd79
- 类型：knowledge-card
- 置信度：0.92
- 分类：pattern
- Tags：pattern, static-analysis, ci, automation, ai-loop, umbrella, baseline

### 摘要
通过统一脚本归一化多个静态分析工具输出，并让 AI 自动执行、排序 Top10 并修复，实现功能实现后的自动质量检查闭环。

### 场景
Elixir/Phoenix Umbrella 项目（含前端 TypeScript/React 与 Rust/Tauri）需要在每次功能实现后自动运行代码扫描并由 AI 处理最严重的问题。

### 问题
单独使用 lint、安全或依赖审计工具会产生大量噪音，AI 难以判断哪些问题是本次改动引入的关键缺陷，导致手工介入成本高且风险漏检。

### 原因
不同工具输出格式不统一，缺少基线对比，且没有自动化的排序与修复流程，使得 AI 只能被动查看报告而无法闭环处理。

### 做法
创建 `scripts/ai_static_scan.sh` 脚本：
1. 串联所有静态分析工具（Credo、Sobelow、Dialyxir、mix_audit、pnpm lint/typecheck、cargo clippy/audit、gitleaks、semgrep）。
2. 将各工具的 JSON/文本输出归一化为统一的 Finding 结构。
3. 与项目基线文件 `baseline.json` 对比，仅保留新增或严重度提升的问题。
4. 按 “新问题 > 高危安全 > 编译/类型错误 > 可修复性” 排序，生成 Top10 报告 (`artifacts/static-scan/top10.md`)。
5. AI 读取报告，自动修复 P0/P1（必要时 P2）并重新运行脚本验证。
6. 最终输出 `report.json` 与残余风险说明。

### 边界
不适用于仅需一次性手工审计的单文件项目；若基线未建立或工具产生大量误报，需要先生成 baseline 并调优规则后再启用此闭环。

### 详情
在多模块 Umbrella 项目中，使用统一脚本把 Credo、Sobelow、Dialyxir 等工具输出归一化为统一 JSON 格式，并与基线对比，只关注本次改动引入的高危问题。AI 读取 Top10 报告自动修复关键缺陷后重新扫描，实现功能实现后的全链路质量闭环，避免历史噪音干扰并提升安全和可靠性。

### Evidence
- session=rollout-2026-04-30T12-12-05-019ddc96-3633-7cf3-9c8c-ef79a9405fac / message=codex-6
  - 对，核心不是“装几个工具”，而是把它做成 **AI 可执行、可判断、可复跑的闭环**。我建议定义一个固定闭环：功能实现 → AI 执行统一静态扫描命令 → 工具输出统一归一化 → 生成 Top 10 严重问题 → AI 优先修复 P0/P1/P2 → 复跑扫描 → 最终报告

### 评分
- 分数：5/5
- 理由：这张卡沉淀的是“多模块项目中 AI 可执行、可判断、可复跑的静态扫描闭环”这一可复用工程模式，而不是 Loamlog 当前仓库的脚本实现说明。它符合 Loamlog 的最终愿景：从本机多工具 AI 会话中提炼跨项目可复用资产；因此不应因与 Loamlog 当前 `ai:complete` 实现路径不同而扣分。

## Card 6：使用竖切面（Vertical Slice）组织跨 Umbrella 应用的端到端任务

- ID：76a1ec33-6c3c-4b3b-98da-86de74410e18
- 类型：knowledge-card
- 置信度：0.92
- 分类：pattern
- Tags：pattern, vertical-slice, umbrella, elixir, phoenix, architecture, dependency-direction

### 摘要
在 Elixir/Phoenix Umbrella 项目中，以业务功能为单位横跨多个 app 完成完整的垂直切片，实现可验证、可测试的交付。

### 场景
在包含 novel_foundation、novel_domain、novel_application、novel_persistence、novel_agent 与 novel_web 的 Umbrella 项目里规划新功能时，需要确保每个任务既遵守依赖方向，又能端到端运行。

### 问题
传统的横向拆分（先建表 → 再写 API → 再做前端）导致交付碎片化、验证成本高，且容易违背 Umbrella 的依赖约束。

### 原因
横向拆分忽视了业务完整性，每个子任务只涉及单一层级，缺少跨层的集成验证，且开发者可能在不同 app 之间随意调用导致依赖违规。

### 做法
采用竖切面（Vertical Slice）方式：每个 slice 围绕一个可感知的业务能力，从 domain 的纯结构与规则、application 用例、persistence/agent 实现、web 路由、frontend UI 到完整测试链路一次性实现。确保在 slice 中只遵循 Umbrella 依赖方向（如 web → application → domain），不跨层直接调用底层 repo 或 agent。

### 边界
当功能仅涉及单一层级且无需端到端验证时，可采用更轻量的实现；若某 slice 的业务复杂度导致一次性完成成本过高，仍可拆分为子 slice，但每个子 slice 必须保持完整的垂直链路。

### 详情
在 Umbrella 项目中，以业务功能为最小交付单元组织工作。每个竖切面从 domain 的结构与规则开始，逐层向上到 application 用例、persistence/agent 实现、web 路由、frontend UI，并配套端到端测试。这样既遵守了严格的依赖方向，又能在每次迭代交付可验证的完整能力，避免横向拆分导致的碎片化和违规调用。

### Evidence
- session=rollout-2026-04-30T10-27-38-019ddc36-965d-7222-865a-68df4a0ca252 / message=codex-4
  - 我理解的“竖切面粒度”是：任务不是按技术层横向拆成…而是按一个可验证的用户/业务能力来组织，每个任务尽量贯穿：Domain → Application Use Case → Persistence/Agent/Web 边界 → API/Channel → Frontend UI → 测试/验证

### 评分
- 分数：5/5
- 理由：高价值工程模式卡，场景、问题、原因、做法和边界完整，evidence 直接支撑“按可验证业务能力组织端到端竖切面”这一核心观点；作为 Loamlog 萃取出的跨项目可复用资产成立。

## Card 7：使用 DecisionTrace 与 ReplayCase 实现完整的会话回放与调试

- ID：a24ce15e-1d16-416f-b19c-814848d5b4a3
- 类型：knowledge-card
- 置信度：0.85
- 分类：debugging
- Tags：debugging, trace, replay, debugging, elixir, session

### 摘要
记录每一步决策及其上下文，提供可视化回放界面，以便审计和问题定位。

### 场景
在小说创作工作台中，需要追溯作者一次对话产生的所有工具调用、状态变更以及最终 TurnResult，用于错误排查或作品审校。

### 问题
现有 trace 只保存高层次的 DialogueFrame，缺少细粒度的决策链和可交互的回放工具，导致难以定位是哪一步工具结果导致不符合预期。

### 原因
实现中没有统一的 DecisionTrace 数据结构，也未提供对应的 UI/CLI 回放命令。

### 做法
定义 **DecisionTrace** 包含：
- 微计划 ID、输入上下文、选中的意图、调用的工具及其结果、权限检查日志。
- 将每一步写入持久化存储（如 ETS 或数据库），并实现 **ReplayCase** 接口，能够按时间顺序重放并在 UI 中高亮当前步骤。
提供 `mix replay --case <id>` 命令或前端调试面板，以便开发者快速定位问题。

### 边界
仅适用于需要审计的创作会话；对实时性能要求极高的场景应可选关闭 trace 记录。

### 详情
Claude Code 已提供完整的 session / replay 机制，ai-novel-studio 在 v3 中已有基础的 trace，但缺少 DecisionTrace 的细粒度和 ReplayCase 的产品化实现。通过引入这两者，可在创作过程中随时回放、审计每一步决策，提升调试效率并满足合规需求。

### Evidence
- session=rollout-2026-05-02T16-12-58-019de7bf-777c-7b62-99de-f1db67ff195f / message=codex-19
  - 缺完整 DecisionTrace / ReplayCase 引擎和 UI/debug 工具
- session=rollout-2026-05-02T16-12-58-019de7bf-777c-7b62-99de-f1db67ff195f / message=codex-13
  - 都有可扩展能力体系…Claude Code 有 session / trace / 配置可持续使用

### 评分
- 分数：4/5
- 理由：方向有价值，结构完整，能沉淀为可复用的 trace/replay 设计资产；但 evidence 只直接支撑“缺 DecisionTrace / ReplayCase 和 UI/debug 工具”，微计划 ID、权限日志、ETS/数据库、`mix replay` 等具体方案存在一定扩写。

## Card 8：使用单一 .env 文件集中管理前后端端口配置

- ID：a4ba5ae7-7eb1-4983-9e3e-d171e03b8a15
- 类型：knowledge-card
- 置信度：0.92
- 分类：pattern
- Tags：pattern, environment-variable, port-configuration, tauri, phoenix, vite, devops

### 摘要
将所有服务端口统一放在 `.env` 中，并让代码通过环境变量读取，避免多处硬编码导致的修改繁琐和错误。

### 场景
在使用 Tauri + Phoenix + Vite 的全栈项目中，需要同时更改前端开发服务器、后端 HTTP/WS 以及测试环境的端口。

### 问题
端口号散落在多个配置文件（vite.config.ts、tauri.conf.json、Phoenix config/*.exs、env.ts 等），每次修改都要手动同步，容易遗漏导致启动失败或健康检查超时。

### 原因
硬编码的端口值没有统一来源，脚本和服务在不同阶段读取不同的常量，导致不一致。

### 做法
创建 `frontend/.env`（或项目根目录）统一定义端口变量，如 `VITE_DEV_PORT=5768`, `PHOENIX_PORT=4657`, `PHOENIX_TEST_PORT=4658`。在所有需要端口的地方改为读取对应环境变量：
- Vite 使用 `process.env.VITE_DEV_PORT`
- Phoenix 配置使用 `System.get_env("PHOENIX_PORT")`
- Tauri 启动前的包装脚本 `dev.sh` 先 `source .env` 并用 `sed` 同步 `tauri.conf.json` 中的 `devUrl` 与 CSP
- 前端代码通过 `import.meta.env.VITE_*` 获取。
这样只修改 `.env` 即可完成全部端口变更。

### 边界
仅适用于可以在运行时或启动脚本阶段读取环境变量的语言/框架；如果某些工具只能接受编译时常量（如部分原生插件），仍需手动配置。

### 详情
在 Tauri+Phoenix 项目中，端口分散导致 `before-tauri-dev.sh` 检测旧端口 4000 超时而终止进程。通过将所有端口集中到 `.env` 并让 Vite、Phoenix 配置、Tauri 启动脚本统一读取，实现单点修改，消除启动错误并提升维护效率。

### Evidence
- session=c73fe295-17c6-4f36-b825-068f50382313 / message=d30d38c9-3d09-4bf7-9784-b9df1a33a074
  - 已完成，改动汇总：... 前端配置修改 ... 现在前后端端口统一为：**前端 5768** / **后端 4657** / **测试 4658**。
- session=c73fe295-17c6-4f36-b825-068f50382313 / message=47e43d49-23d5-4cb9-a1f0-2d5e9fb0f11d
  - `before-tauri-dev.sh` 里还在用旧端口 4000，导致 Tauri 启动失败。
- session=c73fe295-17c6-4f36-b825-068f50382313 / message=380e8fc1-24a8-4c68-979e-8a7674cd48ab
  - 单一来源：`frontend/.env` — 所有端口定义集中在这一处。各文件从 env 读取，不再硬编码端口数字。

### 评分
- 分数：5/5
- 理由：非常实用的工程配置卡，场景明确、问题真实、原因清楚、做法可执行且边界合理；evidence 直接支撑端口硬编码、旧端口导致启动失败、统一 `.env` 作为单一来源等核心结论，具备跨项目复用价值。

## Card 9：Erlang/Elixir File.write 的 :utf8 选项会导致双重 UTF-8 编码

- ID：b108b841-0d70-41f8-ab2d-2e2d970d8b58
- 类型：knowledge-card
- 置信度：0.94
- 分类：debugging
- Tags：debugging, elixir, file-io, encoding, utf8

### 摘要
在写入已经是 UTF‑8 binary 数据时，去掉 `:utf8` 选项，否则会出现中文字符被双重编码而乱码。

### 场景
使用 `File.write(path, binary, [:append, :utf8])` 将 JSON 编码的二进制直接写入文件，导致中文显示为乱码。

### 问题
日志或持久化文件中的中文出现重复字节（如原本 3 字节变成 6），读取后呈现乱码。

### 原因
`File.write/3` 在 `:utf8` 模式下会把 binary 当作 Latin‑1 charlist 再进行 UTF‑8 编码，导致已有的 UTF‑8 数据被再次编码。

### 做法
写入二进制时使用 `[:append]`（或 `[:write]`）而不加 `:utf8`；若需要写入字符列表则保留 `:utf8` 并确保输入是 Unicode 字符串。

### 边界
仅在已经是 UTF‑8 binary 的情况下去掉 `:utf8`，对普通字符串（charlist）仍可使用该选项。

### 详情
分析发现中文乱码源于 `File.write` 使用了 `:utf8` 选项。Erlang 文件驱动在此模式下会把二进制视作 Latin‑1 并再编码为 UTF‑8，导致双重编码。改为不使用 `:utf8` 或改用 `IO.binwrite/2` 可保持原始字节。

### Evidence
- session=a26bb6fa-3a4a-4747-898f-fcfb9c748c1a / message=c8c05177-3a90-4071-b5df-ecf9685fde53
  - `File.write` 的 `:utf8` 模式导致 UTF‑8 二进制被双重编码。Erlang 的文件驱动在 `:utf8` 模式下，会将 binary 先转换为 charlist（Latin‑1）再编码为 UTF‑8，中文字符因此损坏。

### 评分
- 分数：3/5
- 理由：比上一轮同主题卡增加了场景和边界，工程上可参考；但底层机制说明仍需要更精确验证，缺少可复现实验或官方文档支撑，不宜作为高可信技术结论卡。

## Card 10：将 Agent Runtime 拆分为可插件化的 Toolbox Registry 与 Hook 生命周期

- ID：bb0d14f1-0915-4f92-8198-20ec037658ec
- 类型：knowledge-card
- 置信度：0.88
- 分类：pattern
- Tags：pattern, toolbox, hook, plugin, runtime, elixir

### 摘要
通过注册表管理工具能力并在关键点提供 Hook，实现运行时可扩展、可禁用和可授权的插件体系。

### 场景
在 ai-novel-studio 的 v3 设计中，需要让新工具（如风格检查器、情节连贯性检测）能够随时加入或移除，而不改动核心业务代码。

### 问题
当前实现只有硬编码的 ToolRequest/ToolResult 流程，新增工具需修改核心模块并重新编译，缺乏插件化机制。

### 原因
缺少统一的能力注册表和在执行流中插入可自定义 Hook 的设计，导致工具耦合度高。

### 做法
实现 **Capability Toolbox Registry**：
- 每个工具声明唯一 ID、输入/输出 schema、权限等级；
- 注册表在启动时加载，可通过配置启用/禁用。
在 Execution Orchestrator 中加入 **Hook Points**（如 before_tool, after_tool, on_permission_denied），允许外部插件在这些节点插入自定义逻辑。这样新工具只需实现标准接口并注册，即可被系统识别并受权限、预算等统一管控。

### 边界
不适用于需要深度修改核心业务流程的工具；若工具需要改变 Dialogue Planner 的决策模型，应通过扩展微计划（MicroPlan）而非 Hook 实现。

### 详情
Claude Code 已实现类似的 MCP 与 Hook 机制，ai-novel-studio 在 v3 中已有 Toolbox 概念，但缺少注册表与可插拔 Hook。引入这两者后，可在不改动核心代码的前提下动态添加如情感分析、章节结构检查等插件，并统一受 Execution Orchestrator 的权限和预算控制。

### Evidence
- session=rollout-2026-05-02T16-12-58-019de7bf-777c-7b62-99de-f1db67ff195f / message=codex-11
  - Toolbox registry 产品化...工具注册、版本、读写 scope、风险等级、输入输出 schema。
- session=rollout-2026-05-02T16-12-58-019de7bf-777c-7b62-99de-f1db67ff195f / message=codex-13
  - 都有可扩展能力体系…Claude Code 有 MCP、subagents、skills、plug‑in.

### 评分
- 分数：4/5
- 理由：较好的架构模式卡，抓住了工具注册表、生命周期 Hook、权限/预算统一管控等可迁移设计模式，且 evidence 明确支撑 registry、scope、风险等级、schema 和插件能力；但 `before_tool / after_tool / on_permission_denied` 等 Hook 名称属于合理扩写，“当前实现只有硬编码 ToolRequest/ToolResult”也需要更强证据支撑。
