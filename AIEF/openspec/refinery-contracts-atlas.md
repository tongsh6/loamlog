# Refinery Contracts Atlas — 炼矿资产契约索引

> **状态：** 设计中 (2026-05-11)
>
> **角色：** 炼矿中心各工序之间的交付契约汇编。本文定义数据在不同加工阶段的“品位标准”和字段定义，是实现前最重要的质量门禁。

---

## 1. CP-00: Asset Ledger Schema (资产账目契约)

### 1.1 核心字段
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `asset_id` | UUID | 账面唯一 ID |
| `identity_hash` | SHA256 | 演进主键 (Repo:Type:Entity) |
| `status` | enum | `DRAFT` -> `VERIFIED` -> `REFINED` |
| `provenance` | array | 原始溯源 (SessionRefs) |
| `audit_log` | array | 加工履历 |

---

## 2. 资产状态图 (State Map)

```text
RAW (Archive) 
  ──[Crushing]──> NORMALIZED (NormalizedSession)
  ──[Distilling]──> CANDIDATE (AssetCandidate)
  ──[Smelting]──> VERIFIED (VerifiedAsset)
  ──[Refining]──> REFINED (RefinedAsset)
```

---

## 2. CP-01: NormalizedSession Contract (破碎交付契约)

### 2.1 核心字段 (Required Fields)

| 字段 | 类型 | 正常化规则 |
| :--- | :--- | :--- |
| `header.session_id` | string | 原始 Session ID 映射 |
| `header.repo_path` | string | 物理 Repo 路径，用于后续冶炼 |
| `header.vcs_context` | object | 含 `branch`, `head_sha`, `remote_url` |
| `messages[].id` | string | 原始消息 ID |
| `messages[].role` | enum | `user`, `assistant`, `system` |
| `messages[].text` | string | **核心**: 聚合后的纯文本内容 |
| `messages[].reasoning` | string | **剥离**: 提取自 reasoning parts |
| `messages[].tool_calls[]` | object | **压缩**: 仅保留 `name` 和 `summary` (max 300 chars) |
| `stats.token_estimate` | number | 初步 Token 预估，用于 Shard 决策 |

### 2.2 负面约束 (Forbidden Semantics)
- 禁止包含超过 500 字符的原始 `tool_output`。
- 禁止丢失任何 `parts[type=file]` 的文件名（内容可剥离）。
- 禁止丢失消息的时间序。

---

## 3. CP-02: AssetCandidate Contract (选矿交付契约)

### 3.1 核心字段 (Required Fields)

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `type` | enum | `issue`, `knowledge`, `pitfall`, `prd` |
| `title` | string | LLM 总结的精炼标题 |
| `summary` | string | 核心信号摘要 |
| `confidence` | number | 0.0 - 1.0 (LLM 信心分) |
| `semantic_topic` | string | **精炼主键**: 用于跨会话聚类的主题词 |
| `source_refs` | array | 引用消息 ID 列表 |
| `evidence_guesses[]` | object | **猜想证据**: `path`, `logic_description`, `guessed_lines` |

### 3.2 验收规则
- `confidence < 0.3` 的 Candidate 应在选矿阶段被静默丢弃。
- 必须包含至少一个 `evidence_guess`，否则标记为无效精矿。

---

## 4. CP-03: VerifiedAsset Contract (冶炼交付契约)

### 4.1 核心字段 (Required Fields)

| 字段 | 类型 | 验证要求 |
| :--- | :--- | :--- |
| `verification_status` | enum | `verified`, `unverified`, `rejected` |
| `evidence_spans[]` | object | **物理证据**: 必须含 `file_path`, `git_hash`, `content` |
| `verifiers_run[]` | string | 执行过的 Verifier 列表 (e.g., `git`, `fs`, `tsc`) |
| `fact_check_report` | string | 记录哪些猜想被证实，哪些被证伪 |
| `score_modifier` | number | 物理验证对信心的修正值 |

### 4.2 负面约束
- 禁止将“未通过路径检查”的资产标记为 `verified`。
- `EvidenceSpan` 中的代码片段必须与磁盘真实内容一致。

---

## 5. CP-04: RefinedAsset Contract (精炼交付契约)

### 5.1 核心字段 (Required Fields)

| 字段 | 类型 | 聚合要求 |
| :--- | :--- | :--- |
| `refined_id` | string | 基于 `semantic_topic` 生成的唯一 ID |
| `contributing_sessions[]` | string | 所有贡献过信号的 Session ID 列表 |
| `merged_content` | object | 合并后的 `title`, `description`, `labels` |
| `version` | number | 该资产的演进版本号 |
| `is_duplicate` | boolean | 是否是之前已发货资产的重复 |

---

## 6. 后续任务

- [ ] 基于 CP-01 实现 `packages/refinery` 的 `Normalizer` 测试用例。
- [ ] 基于 CP-02 重构 `issue-draft` 萃取器的输出逻辑。
- [ ] 针对 CP-03 设计 `Smelting` 阶段的 Git/FS 插件接口。
