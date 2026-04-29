import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { parseRuleConfig } from "./config.js";
import type { RuleConfig } from "./types.js";

export const DEFAULT_RULES_PATH = new URL("./default.rules.yaml", import.meta.url);
export const DEFAULT_RULES_YAML = fs.readFileSync(fileURLToPath(DEFAULT_RULES_PATH), "utf8");
export const DEFAULT_RULE_CONFIG: RuleConfig = parseRuleConfig(DEFAULT_RULES_YAML, "yaml");
