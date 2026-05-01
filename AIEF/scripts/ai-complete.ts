import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type Profile = "fast" | "security" | "ci";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface StaticFinding {
  id: string;
  tool: string;
  ruleId?: string;
  severity: Severity;
  category: string;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  evidence?: string;
  inChangedFile: boolean;
  confidence: number;
  rankScore: number;
}

interface ToolConfig {
  name: string;
  command: string;
  args: string[];
  profiles: Profile[];
  required: boolean;
  parser: "typescript" | "biome" | "pnpm-audit" | "gitleaks" | "semgrep";
  category: string;
}

interface ToolResult {
  name: string;
  command: string;
  required: boolean;
  skipped: boolean;
  skipReason?: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface Args {
  profile: Profile;
  topN: number;
}

const severityWeights: Record<Severity, number> = {
  critical: 1000,
  high: 700,
  medium: 400,
  low: 100,
  info: 10,
};

const categoryWeights: Record<string, number> = {
  secret: 300,
  security: 300,
  "dependency-security": 275,
  "type-safety": 250,
  runtime: 250,
  evidence: 200,
  "scanner-failure": 150,
  lint: 75,
};

const tools: ToolConfig[] = [
  {
    name: "typescript",
    command: "pnpm",
    args: ["run", "typecheck"],
    profiles: ["fast", "security", "ci"],
    required: true,
    parser: "typescript",
    category: "type-safety",
  },
  {
    name: "biome",
    command: "pnpm",
    args: ["exec", "biome", "lint", ".", "--reporter=json"],
    profiles: ["fast", "security", "ci"],
    required: true,
    parser: "biome",
    category: "lint",
  },
  {
    name: "pnpm-audit",
    command: "pnpm",
    args: ["audit", "--audit-level", "moderate", "--json"],
    profiles: ["fast", "security", "ci"],
    required: true,
    parser: "pnpm-audit",
    category: "dependency-security",
  },
  {
    name: "gitleaks",
    command: "gitleaks",
    args: [
      "detect",
      "--source",
      ".",
      "--redact",
      "--report-format",
      "json",
      "--no-banner",
    ],
    profiles: ["security", "ci"],
    required: false,
    parser: "gitleaks",
    category: "secret",
  },
  {
    name: "semgrep",
    command: "semgrep",
    args: [
      "scan",
      "--json",
      "--config",
      "p/typescript",
      "--config",
      "p/secrets",
    ],
    profiles: ["security", "ci"],
    required: false,
    parser: "semgrep",
    category: "security",
  },
];

const args = parseArgs(process.argv.slice(2));
const startedAt = new Date();
const runId = createRunId(startedAt);
const reportDir = path.resolve("AIEF/reports/static-scan", runId);
mkdirSync(reportDir, { recursive: true });

const changedFiles = getChangedFiles();
const git = {
  branch: runGit(["branch", "--show-current"]) || "unknown",
  head: runGit(["rev-parse", "--short", "HEAD"]) || "unknown",
  dirty: changedFiles.length > 0,
};

const selectedTools = tools.filter((tool) =>
  tool.profiles.includes(args.profile),
);
const toolResults = selectedTools.map(runTool);
const findings = toolResults.flatMap((result) => normalizeToolResult(result));
const rankedFindings = rankFindings(findings);
const blockingFindings = rankedFindings.filter(isBlockingFinding);
const selectedTopN = rankedFindings.slice(0, args.topN);
const completedAt = new Date();

  const previousReport = findPreviousReport(runId);
  const comparison = previousReport
    ? compareWithPreviousRun(previousReport, rankedFindings, args.topN)
    : undefined;
writeFileSync(path.join(reportDir, "scan.raw.log"), renderRawLog(toolResults));
writeJson(path.join(reportDir, "scan.normalized.json"), {
  findings: rankedFindings,
});
writeJson(path.join(reportDir, "metadata.json"), {
  runId,
  startedAt: startedAt.toISOString(),
  completedAt: completedAt.toISOString(),
  profile: args.profile,
  topN: args.topN,
  git,
  scope: {
    changedFiles,
    includePatterns: ["packages/**/*.ts", "plugins/**/*.ts", "skills/**/*.ts"],
    excludePatterns: ["**/dist/**", "**/node_modules/**", "AIEF/reports/**"],
  },
  tools: toolResults.map((result) => ({
    name: result.name,
    command: result.command,
    required: result.required,
    skipped: result.skipped,
    skipReason: result.skipReason,
    exitCode: result.exitCode,
  })),
});
writeFileSync(
  path.join(reportDir, "topN.plan.md"),
  renderTopNPlan(args, selectedTopN),
);
writeFileSync(
  path.join(reportDir, "topN.results.md"),
    comparison
      ? renderTopNResultsWithComparison(selectedTopN, comparison)
      : renderTopNResults(selectedTopN),
);
writeFileSync(
  path.join(reportDir, "rerun.raw.log"),
  comparison
    ? `${renderRawLog(toolResults)}\n## Rerun Comparison\nPrevious run: ${comparison.previousRunId}\nFixed: ${comparison.fixed}\nStill present: ${comparison.stillPresent}\nNew: ${comparison.newFindings}\n`
    : "Rerun has not been executed yet. After fixing Top N findings, rerun `pnpm run ai:complete` and reference the new report.\n",
);
writeFileSync(
  path.join(reportDir, "summary.md"),
  renderSummary(args, toolResults, rankedFindings, selectedTopN, reportDir, comparison),
);

  if (comparison) {
    console.log(
      `Rerun comparison: ${comparison.fixed} fixed, ${comparison.stillPresent} still present, ${comparison.newFindings} new`,
    );
  }
console.log(`Static scan report written to ${reportDir}`);
console.log(
  `Findings: ${rankedFindings.length}; Top N selected: ${selectedTopN.length}; blocking: ${blockingFindings.length}`,
);

if (blockingFindings.length > 0) {
  process.exitCode = 1;
}

function parseArgs(rawArgs: string[]): Args {
  const parsed: Partial<Args> = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--profile") {
      parsed.profile = parseProfile(rawArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      parsed.profile = parseProfile(arg.slice("--profile=".length));
      continue;
    }

    if (arg === "--topN" || arg === "--top-n") {
      parsed.topN = parseTopN(rawArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--topN=")) {
      parsed.topN = parseTopN(arg.slice("--topN=".length));
      continue;
    }

    if (arg.startsWith("--top-n=")) {
      parsed.topN = parseTopN(arg.slice("--top-n=".length));
    }
  }

  return {
    profile: parsed.profile ?? parseProfile(process.env.STATIC_SCAN_PROFILE),
    topN: parsed.topN ?? parseTopN(process.env.TOP_N),
  };
}

function parseProfile(value: string | undefined): Profile {
  if (value === "security" || value === "ci") {
    return value;
  }

  return "fast";
}

function parseTopN(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "5", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 5;
  }

  return parsed;
}

function createRunId(date: Date): string {
  const base = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
  let candidate = base;
  let suffix = 2;

  while (existsSync(path.resolve("AIEF/reports/static-scan", candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function runTool(tool: ToolConfig): ToolResult {
  const command = `${tool.command} ${tool.args.join(" ")}`;

  if (!commandExists(tool.command)) {
    return {
      name: tool.name,
      command,
      required: tool.required,
      skipped: true,
      skipReason: `Command not found: ${tool.command}`,
      exitCode: null,
      stdout: "",
      stderr: "",
    };
  }

  const result = spawnSync(tool.command, tool.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });

  return {
    name: tool.name,
    command,
    required: tool.required,
    skipped: false,
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], {
    encoding: "utf8",
  });

  return result.status === 0;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function normalizeToolResult(result: ToolResult): StaticFinding[] {
  if (result.skipped) {
    return [
      createFinding({
        tool: result.name,
        severity: result.required ? "high" : "info",
        category: "scanner-failure",
        message: result.skipReason ?? "Scanner skipped.",
        evidence: result.skipReason,
      }),
    ];
  }

  const output = `${result.stdout}\n${result.stderr}`.trim();
  const structuredOutput = result.stdout.trim() || output;
  let findings: StaticFinding[] = [];

  if (result.name === "typescript") {
    findings = parseTypeScript(output);
  } else if (result.name === "biome") {
    findings = parseBiome(structuredOutput);
  } else if (result.name === "pnpm-audit") {
    findings = parsePnpmAudit(structuredOutput);
  } else if (result.name === "gitleaks") {
    findings = parseGitleaks(structuredOutput);
  } else if (result.name === "semgrep") {
    findings = parseSemgrep(structuredOutput);
  }

  if (result.exitCode !== 0 && findings.length === 0) {
    findings.push(
      createFinding({
        tool: result.name,
        severity: result.required ? "high" : "medium",
        category: "scanner-failure",
        message: `Scanner exited with code ${result.exitCode}.`,
        evidence: truncate(output, 1200),
      }),
    );
  }

  return findings;
}

function parseTypeScript(output: string): StaticFinding[] {
  const findings: StaticFinding[] = [];
  const pattern = /^(.+?\.(?:ts|tsx))\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;

  for (const match of output.matchAll(pattern)) {
    findings.push(
      createFinding({
        tool: "typescript",
        ruleId: match[4],
        severity: "high",
        category: "type-safety",
        file: normalizeFile(match[1]),
        line: Number.parseInt(match[2], 10),
        column: Number.parseInt(match[3], 10),
        message: match[5],
        evidence: match[0],
        confidence: 0.95,
      }),
    );
  }

  return findings;
}

function parseBiome(output: string): StaticFinding[] {
  const data = parseJsonObject(output);
  const diagnostics = Array.isArray(data?.diagnostics) ? data.diagnostics : [];

  return diagnostics.map(
    (diagnostic: Record<string, unknown>, index: number) => {
      const location = asRecord(diagnostic.location);
      const pathValue =
        asString(location?.path) ??
        asString(asRecord(location?.resource)?.path) ??
        asString(diagnostic.file);
      const span = asRecord(location?.span);
      const spanStart = asRecord(span?.start);
      const locationStart = asRecord(location?.start);

      return createFinding({
        tool: "biome",
        ruleId: asString(diagnostic.category),
        severity: mapBiomeSeverity(asString(diagnostic.severity)),
        category: "lint",
        file: pathValue ? normalizeFile(pathValue) : undefined,
        line:
          asNumber(location?.line) ??
          asNumber(locationStart?.line) ??
          asNumber(spanStart?.line),
        column:
          asNumber(location?.column) ??
          asNumber(locationStart?.column) ??
          asNumber(spanStart?.column),
        message:
          asString(diagnostic.description) ??
          asString(diagnostic.message) ??
          `Biome diagnostic ${index + 1}`,
        evidence: truncate(JSON.stringify(diagnostic), 1200),
        confidence: 0.8,
      });
    },
  );
}

function parsePnpmAudit(output: string): StaticFinding[] {
  const data = parseJsonObject(output);
  const findings: StaticFinding[] = [];
  const advisories = asRecord(data?.advisories);

  if (advisories) {
    for (const advisory of Object.values(advisories)) {
      const item = asRecord(advisory);
      findings.push(
        createFinding({
          tool: "pnpm-audit",
          ruleId: asString(item?.id) ?? asString(item?.url),
          severity: mapAuditSeverity(asString(item?.severity)),
          category: "dependency-security",
          message:
            asString(item?.title) ??
            asString(item?.module_name) ??
            "Dependency advisory",
          evidence: truncate(JSON.stringify(item), 1200),
          confidence: 0.85,
        }),
      );
    }
  }

  const vulnerabilities = asRecord(data?.vulnerabilities);

  if (vulnerabilities) {
    for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
      const item = asRecord(vulnerability);
      findings.push(
        createFinding({
          tool: "pnpm-audit",
          ruleId: name,
          severity: mapAuditSeverity(asString(item?.severity)),
          category: "dependency-security",
          message: `${name}: ${asString(item?.name) ?? "dependency vulnerability"}`,
          evidence: truncate(JSON.stringify(item), 1200),
          confidence: 0.85,
        }),
      );
    }
  }

  return findings;
}

function parseGitleaks(output: string): StaticFinding[] {
  const data = parseJsonObject(output);
  const leaks = Array.isArray(data) ? data : [];

  return leaks.map((leak: Record<string, unknown>, index: number) =>
    createFinding({
      tool: "gitleaks",
      ruleId: asString(leak.RuleID),
      severity: "critical",
      category: "secret",
      file: normalizeFile(asString(leak.File) ?? ""),
      line: asNumber(leak.StartLine),
      column: asNumber(leak.StartColumn),
      message: asString(leak.Description) ?? `Potential secret ${index + 1}`,
      evidence: truncate(JSON.stringify(leak), 1200),
      confidence: 0.9,
    }),
  );
}

function parseSemgrep(output: string): StaticFinding[] {
  const data = parseJsonObject(output);
  const results = Array.isArray(data?.results) ? data.results : [];

  return results.map((result: Record<string, unknown>, index: number) => {
    const extra = asRecord(result.extra);
    const start = asRecord(result.start);

    return createFinding({
      tool: "semgrep",
      ruleId: asString(result.check_id),
      severity: mapSemgrepSeverity(asString(extra?.severity)),
      category: "security",
      file: normalizeFile(asString(result.path) ?? ""),
      line: asNumber(start?.line),
      column: asNumber(start?.col),
      message: asString(extra?.message) ?? `Semgrep finding ${index + 1}`,
      evidence: truncate(JSON.stringify(result), 1200),
      confidence: 0.8,
    });
  });
}

function createFinding(input: {
  tool: string;
  ruleId?: string;
  severity: Severity;
  category: string;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  evidence?: string;
  confidence?: number;
}): StaticFinding {
  const file = input.file || undefined;
  const inChangedFile = file ? changedFiles.includes(file) : false;
  const id = [
    input.tool,
    input.ruleId ?? input.category,
    file ?? "repository",
    input.line ?? 0,
    input.column ?? 0,
    hash(input.message),
  ].join(":");

  return {
    id,
    tool: input.tool,
    ruleId: input.ruleId,
    severity: input.severity,
    category: input.category,
    file,
    line: input.line,
    column: input.column,
    message: input.message,
    evidence: input.evidence,
    inChangedFile,
    confidence: input.confidence ?? 0.75,
    rankScore: 0,
  };
}

function rankFindings(findings: StaticFinding[]): StaticFinding[] {
  return findings
    .map((finding) => ({
      ...finding,
      rankScore:
        severityWeights[finding.severity] +
        (categoryWeights[finding.category] ?? 0) +
        (finding.inChangedFile ? 200 : 0) +
        (finding.confidence >= 0.9 ? 100 : 0),
    }))
    .sort((left, right) => {
      const severityDelta =
        severityWeights[right.severity] - severityWeights[left.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      const scoreDelta = right.rankScore - left.rankScore;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      if (left.inChangedFile !== right.inChangedFile) {
        return left.inChangedFile ? -1 : 1;
      }

      return (
        [
          left.tool.localeCompare(right.tool),
          (left.file ?? "").localeCompare(right.file ?? ""),
          (left.line ?? 0) - (right.line ?? 0),
          left.id.localeCompare(right.id),
        ].find((result) => result !== 0) ?? 0
      );
    });
}

function isBlockingFinding(finding: StaticFinding): boolean {
  if (finding.category === "scanner-failure") {
    return finding.severity === "critical" || finding.severity === "high";
  }

  if (
    finding.category === "secret" ||
    finding.category === "security" ||
    finding.category === "dependency-security" ||
    finding.category === "type-safety" ||
    finding.category === "runtime"
  ) {
    return (
      finding.severity === "critical" ||
      finding.severity === "high" ||
      finding.inChangedFile
    );
  }

  if (finding.category === "lint") {
    return (
      finding.inChangedFile &&
      (finding.severity === "critical" ||
        finding.severity === "high" ||
        finding.severity === "medium")
    );
  }

  return false;
}

function renderRawLog(results: ToolResult[]): string {
  return results
    .map((result) =>
      [
        `## ${result.name}`,
        `Command: ${result.command}`,
        `Required: ${result.required ? "yes" : "no"}`,
        `Skipped: ${result.skipped ? "yes" : "no"}`,
        result.skipReason ? `Skip reason: ${result.skipReason}` : undefined,
        `Exit code: ${result.exitCode ?? "n/a"}`,
        "",
        "--- stdout ---",
        result.stdout || "(empty)",
        "",
        "--- stderr ---",
        result.stderr || "(empty)",
        "",
      ]
        .filter((line) => line !== undefined)
        .join("\n"),
    )
    .join("\n");
}

function renderTopNPlan(args: Args, topFindings: StaticFinding[]): string {
  const rows =
    topFindings.length === 0
      ? "| - | - | - | - | No findings selected | none |\n"
      : topFindings
          .map(
            (finding, index) =>
              `| ${index + 1} | ${finding.tool} | ${finding.severity} | ${formatLocation(finding)} | ${escapePipe(reasonFor(finding))} | fix_or_document |`,
          )
          .join("\n");

  return `# Top N Fix Plan

- Profile: ${args.profile}
- Top N: ${args.topN}
- Ranking policy: critical security > type/runtime breakage > changed files > confidence

| Rank | Tool | Severity | File | Reason | Planned Handling |
|---|---|---|---|---|---|
${rows}
`;
}

function renderTopNResults(topFindings: StaticFinding[]): string {
  const rows =
    topFindings.length === 0
      ? "| - | not_actionable | No findings selected | Scan produced no Top N items |\n"
      : topFindings
          .map(
            (finding, index) =>
              `| ${index + 1} | pending_ai_handling | ${escapePipe(finding.message)} | Update after remediation and rerun |`,
          )
          .join("\n");

  return `# Top N Fix Results

Every selected finding must end with one of: fixed, deferred, false_positive, not_actionable, failed.

| Rank | Status | Handling | Verification |
|---|---|---|---|
${rows}
`;
}

function renderSummary(
  args: Args,
  results: ToolResult[],
  findings: StaticFinding[],
  topFindings: StaticFinding[],
  reportDir: string,
  comparison?: RerunComparison,
): string {
  const failedRequired = results.filter(
    (result) => result.required && !result.skipped && result.exitCode !== 0,
  );
  const skippedOptional = results.filter(
    (result) => !result.required && result.skipped,
  );
  const blockingFindings = findings.filter(isBlockingFinding);

  return `# Static Scan Summary

- Report: ${reportDir}
- Profile: ${args.profile}
- Top N: ${args.topN}
- Findings: ${findings.length}
- Selected Top N: ${topFindings.length}
- Blocking findings: ${blockingFindings.length}
- Required tool failures: ${failedRequired.length}
- Optional skipped tools: ${skippedOptional.length}

## Required Tool Results

${results
  .filter((result) => result.required)
  .map(
    (result) =>
      `- ${result.name}: ${result.skipped ? `skipped (${result.skipReason})` : `exit ${result.exitCode}`}`,
  )
  .join("\n")}

## Optional Tool Results

${
  results
    .filter((result) => !result.required)
    .map(
      (result) =>
        `- ${result.name}: ${result.skipped ? `skipped (${result.skipReason})` : `exit ${result.exitCode}`}`,
    )
    .join("\n") || "- none"
}

## Top N

${
  topFindings
    .map(
      (finding, index) =>
        `${index + 1}. [${finding.severity}] ${finding.tool} ${formatLocation(finding)} - ${finding.message}`,
    )
    .join("\n") || "No findings selected."
}

${
  comparison
    ? `## Rerun Comparison

- Previous run: \`${comparison.previousRunId}\`
- Fixed: ${comparison.fixed}
- Still present: ${comparison.stillPresent}
- New findings (not in previous Top N): ${comparison.newFindings}

`
    : ""
}## Required Follow-Up

1. Fix actionable Top N findings.
2. Update \`topN.results.md\` with fixed/deferred/false_positive/not_actionable/failed statuses.
3. Rerun \`pnpm run ai:complete\` and reference the new report in the final AI response.

## Blocking Policy

The command exits non-zero only for blocking findings: scanner failures, high-confidence type/runtime/security findings, dependency/secret/security findings, or lint findings in changed files. Historical lint findings outside changed files remain in the report and Top N plan, but they are documented rather than blocking every AI completion.
`;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function getChangedFiles(): string[] {
  const status = runGit(["status", "--porcelain"]);

  return status
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3))
    .map((line) => line.split(" -> ").at(-1) ?? line)
    .map(normalizeFile)
    .filter(Boolean);
}

function runGit(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function parseJsonObject(output: string): Record<string, unknown> | undefined {
  const trimmed = output.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonStart = Math.min(
      ...["{", "["]
        .map((char) => trimmed.indexOf(char))
        .filter((index) => index >= 0),
    );

    if (!Number.isFinite(jsonStart)) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed.slice(jsonStart));
    } catch {
      return undefined;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function mapBiomeSeverity(value: string | undefined): Severity {
  if (value === "error") {
    return "medium";
  }

  if (value === "warning") {
    return "low";
  }

  return "info";
}

function mapAuditSeverity(value: string | undefined): Severity {
  if (value === "critical" || value === "high" || value === "medium") {
    return value;
  }

  if (value === "low") {
    return "low";
  }

  return "info";
}

function mapSemgrepSeverity(value: string | undefined): Severity {
  if (value === "ERROR") {
    return "high";
  }

  if (value === "WARNING") {
    return "medium";
  }

  return "low";
}

function normalizeFile(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(new RegExp(`^${escapeRegExp(process.cwd())}/`), "");
}

function formatLocation(finding: StaticFinding): string {
  if (!finding.file) {
    return "repository";
  }

  if (!finding.line) {
    return finding.file;
  }

  return `${finding.file}:${finding.line}${finding.column ? `:${finding.column}` : ""}`;
}

function reasonFor(finding: StaticFinding): string {
  const reasons = [finding.category, `score ${finding.rankScore}`];

  if (finding.inChangedFile) {
    reasons.push("changed file");
  }

  if (finding.confidence >= 0.9) {
    reasons.push("high confidence");
  }

  return reasons.join(", ");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// ── Rerun comparison ──

interface RerunComparison {
  previousRunId: string;
  fixed: number;
  stillPresent: number;
  newFindings: number;
  previousTopNIds: Set<string>;
  statuses: Map<string, "fixed" | "deferred" | "false_positive" | "not_actionable" | "failed">;
}

function findPreviousReport(currentRunId: string): string | undefined {
  const baseDir = path.resolve("AIEF/reports/static-scan");
  if (!existsSync(baseDir)) return undefined;

  const entries = readdirSync(baseDir, { withFileTypes: true });
  const runs = entries
    .filter((e) => e.isDirectory() && e.name !== currentRunId)
    .map((e) => e.name)
    .sort()
    .reverse();

  return runs.length > 0 ? runs[0] : undefined;
}

function loadNormalizedFindings(runId: string): StaticFinding[] {
  const filePath = path.resolve("AIEF/reports/static-scan", runId, "scan.normalized.json");
  try {
    const text = readFileSync(filePath, "utf8");
    const data = JSON.parse(text) as { findings?: StaticFinding[] };
    return Array.isArray(data.findings) ? data.findings : [];
  } catch {
    return [];
  }
}

function compareWithPreviousRun(
  previousRunId: string,
  currentFindings: StaticFinding[],
  topN: number,
): RerunComparison {
  const previousFindings = loadNormalizedFindings(previousRunId);
  const previousTopN = previousFindings.slice(0, topN);
  const previousTopNIds = new Set(previousTopN.map((f) => f.id));

  const currentFindingIds = new Set(currentFindings.map((f) => f.id));
  const statuses = new Map<string, "fixed" | "deferred" | "false_positive" | "not_actionable" | "failed">();

  let fixed = 0;
  let stillPresent = 0;

  for (const prev of previousTopN) {
    if (currentFindingIds.has(prev.id)) {
      statuses.set(prev.id, "deferred");
      stillPresent += 1;
    } else {
      statuses.set(prev.id, "fixed");
      fixed += 1;
    }
  }

  // Count findings that are new (weren't in previous Top N)
  const newFindings = currentFindings
    .slice(0, topN)
    .filter((f) => !previousTopNIds.has(f.id)).length;

  return { previousRunId: previousRunId, fixed, stillPresent, newFindings, previousTopNIds, statuses };
}

function renderTopNResultsWithComparison(
  topFindings: StaticFinding[],
  comparison: RerunComparison,
): string {
  const rows = topFindings.length === 0
    ? "| - | not_actionable | No findings selected | Scan produced no Top N items |\n"
    : topFindings
        .map((finding, index) => {
          const status = comparison.statuses.get(finding.id) ?? "not_actionable";
          const verification =
            status === "fixed"
              ? "No longer present in rerun"
              : status === "deferred"
                ? "Still present in rerun"
                : "Awaiting verification";
          return `| ${index + 1} | ${status} | ${escapePipe(finding.message)} | ${verification} |`;
        })
        .join("\n");

  return `# Top N Fix Results

Compared with previous run. Every selected finding must end with one of: fixed, deferred, false_positive, not_actionable, failed.

| Rank | Status | Handling | Verification |
|---|---|---|---|
${rows}
`;
}


function hash(value: string): string {
  let hashValue = 0;

  for (const char of value) {
    hashValue = (hashValue << 5) - hashValue + char.charCodeAt(0);
    hashValue |= 0;
  }

  return Math.abs(hashValue).toString(36);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
