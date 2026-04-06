# @loamlog/rules

可配置的规则引擎，支持 YAML/JSON 规则 DSL，覆盖信号、评分、必要性、过滤、执行策略，并输出命中解释与决策。

## 核心能力
- 规则类型：`signal` / `scoring` / `necessity` / `filter` / `execution`
- 条件表达：`all` / `any` / `not` 组合，字段后缀比较（`_gte`、`_lt`、`_includes`、`_in` 等）
- 优先级覆盖：`priority` 数字越大越高
- 解释输出：命中规则的 `reasons`、`outcome`、`scoreDelta`
- 热更新：无需改代码即可重新加载配置

## 快速上手
```ts
import { createRuleEngine, loadRuleConfigFromFile } from "@loamlog/rules";

const config = await loadRuleConfigFromFile(new URL("./default.rules.yaml", import.meta.url));
const engine = createRuleEngine(config);

const decision = engine.evaluate({
  id: "c1",
  signal_type: "architecture_gap",
  metrics: { impact: 0.8, urgency: 0.7, frequency: 3, confidence: 0.72, effort: 0.4 },
  flags: { affects_core_pipeline: true },
});

console.log(decision.ruleHits);       // 命中规则 + 解释
console.log(decision.score);          // 评分
console.log(decision.necessity);      // must_do / should_do / nice_to_have
console.log(decision.filtered);       // 是否被过滤
console.log(decision.allowExecution); // 是否进入执行流
```

## 规则配置示例
`packages/rules/src/default.rules.yaml` 提供可直接编辑的默认规则（>=5 条）：
```yaml
- id: repeated_architecture_gap
  type: signal
  priority: 80
  when:
    signal_type: architecture_gap
    frequency_gte: 3
  then:
    add_signal: architecture_gap.repeat
    mark_as_candidate: true
```

更多示例请查看 `default.rules.yaml`。
