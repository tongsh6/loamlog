import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import type { RuleConfig, RuleDefinition } from "./types.js";
import { isRuleDefinition } from "./validators.js";

export function parseRuleConfig(content: string, format?: "yaml" | "json"): RuleConfig {
  if (format === "json") {
    return normalizeRuleConfig(JSON.parse(content));
  }
  if (format === "yaml") {
    return normalizeRuleConfig(YAML.parse(content));
  }

  try {
    return normalizeRuleConfig(JSON.parse(content));
  } catch {
    return normalizeRuleConfig(YAML.parse(content));
  }
}

export async function loadRuleConfigFromFile(filePath: string | URL): Promise<RuleConfig> {
  const resolvedPath = typeof filePath === "string" ? filePath : fileURLToPath(filePath);
  const content = await fs.readFile(resolvedPath, "utf8");
  const ext = path.extname(resolvedPath).toLowerCase();
  const format = ext === ".yaml" || ext === ".yml" ? "yaml" : ext === ".json" ? "json" : undefined;
  return parseRuleConfig(content, format);
}

export function normalizeRuleConfig(input: unknown): RuleConfig {
  if (!input || typeof input !== "object") {
    return { rules: [] };
  }

  const candidate = input as Record<string, unknown>;
  if (Array.isArray(input)) {
    return { rules: validateRules(input) };
  }

  const rules = Array.isArray(candidate.rules) ? validateRules(candidate.rules) : [];
  const metadata = typeof candidate.metadata === "object" ? (candidate.metadata as Record<string, unknown>) : undefined;
  const version = typeof candidate.version === "string" ? candidate.version : undefined;

  return { version, rules, metadata };
}

function validateRules(rawRules: unknown[]): RuleDefinition[] {
  const valid: RuleDefinition[] = [];
  for (const item of rawRules) {
    if (!isRuleDefinition(item)) {
      throw new Error("invalid rule definition");
    }
    valid.push(item);
  }
  return valid;
}
