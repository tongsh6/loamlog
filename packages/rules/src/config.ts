import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import type { RuleConfig, RuleDefinition } from "./types.js";

export function parseRuleConfig(content: string, format?: "yaml" | "json"): RuleConfig {
  let parsed: unknown;
  try {
    if (format === "json") {
      parsed = JSON.parse(content);
    } else if (format === "yaml") {
      parsed = YAML.parse(content);
    } else {
      parsed = JSON.parse(content);
    }
  } catch (jsonError) {
    if (format === "json") {
      throw jsonError;
    }
    try {
      parsed = YAML.parse(content);
    } catch (yamlError) {
      throw yamlError;
    }
  }

  return normalizeRuleConfig(parsed);
}

export async function loadRuleConfigFromFile(filePath: string): Promise<RuleConfig> {
  const content = await fs.readFile(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  const format = ext === ".yaml" || ext === ".yml" ? "yaml" : ext === ".json" ? "json" : undefined;
  return parseRuleConfig(content, format);
}

export function normalizeRuleConfig(input: unknown): RuleConfig {
  if (!input || typeof input !== "object") {
    return { rules: [] };
  }

  const candidate = input as Record<string, unknown>;
  if (Array.isArray(input)) {
    return { rules: input as RuleDefinition[] };
  }

  const rules = Array.isArray(candidate.rules) ? (candidate.rules as RuleDefinition[]) : [];
  const metadata = typeof candidate.metadata === "object" ? (candidate.metadata as Record<string, unknown>) : undefined;
  const version = typeof candidate.version === "string" ? candidate.version : undefined;

  return { version, rules, metadata };
}
