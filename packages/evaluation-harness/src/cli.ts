#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBaselinePredictions } from "./baseline.js";
import { evaluateRun } from "./index.js";
import { loadPredictions, loadSamples, writeReport } from "./io.js";

type CliOptions = {
  dataset?: string;
  predictions?: string;
  variant?: string;
  output?: string;
  useBaseline?: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { useBaseline: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--dataset":
      case "-d":
        options.dataset = argv[i + 1];
        i += 1;
        break;
      case "--predictions":
      case "-p":
        options.predictions = argv[i + 1];
        options.useBaseline = false;
        i += 1;
        break;
      case "--variant":
      case "-v":
        options.variant = argv[i + 1];
        i += 1;
        break;
      case "--output":
      case "-o":
        options.output = argv[i + 1];
        i += 1;
        break;
      case "--baseline":
        options.useBaseline = true;
        break;
      default:
        break;
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const { samples, datasetName } = loadSamples(options.dataset);

  const variant = options.variant ?? (options.useBaseline ? "baseline-noisy" : "candidate");
  const predictions = options.useBaseline
    ? buildBaselinePredictions(samples, { variant })
    : loadPredictions(options.predictions ?? "");

  const report = evaluateRun({
    variant,
    datasetName,
    samples,
    predictions,
  });

  const outputPath =
    options.output ??
    path.resolve(process.cwd(), "packages/evaluation-harness/reports", `${variant}-${Date.now()}.json`);
  writeReport(outputPath, report);

  logSummary(report, outputPath);
}

function logSummary(report: ReturnType<typeof evaluateRun>, outputPath: string) {
  // eslint-disable-next-line no-console
  console.log(`\nEvaluation variant: ${report.variant}`);
  // eslint-disable-next-line no-console
  console.log(`Dataset: ${report.datasetName} (${report.sampleCount} samples)`);
  const { signal, issue, action, knowledge, redaction } = report.metrics;
  // eslint-disable-next-line no-console
  console.log(
    [
      `Signal precision ${signal.precision.toFixed(2)}, recall ${signal.recall.toFixed(2)}, top1 ${signal.top1HitRate.toFixed(2)}, top3 ${signal.top3HitRate.toFixed(2)}`,
      `Issue shouldIssue ${issue.shouldIssueAccuracy.toFixed(2)}, title ${issue.titleHitRate.toFixed(2)}, type ${issue.typeAccuracy.toFixed(2)}, actionability gap ${issue.actionabilityGap.toFixed(2)}`,
      `Action precision ${action.precision.toFixed(2)}, recall ${action.recall.toFixed(2)}`,
      `Knowledge distill ${knowledge.shouldDistillAccuracy.toFixed(2)}, type ${knowledge.typeAccuracy.toFixed(2)}`,
      `Redaction leak ${redaction.leakRate.toFixed(2)}, over-redaction ${redaction.overRedactionRate.toFixed(2)}`,
    ].join("\n"),
  );
  // eslint-disable-next-line no-console
  console.log(`Report saved to: ${outputPath}`);
}

const isMainModule = (() => {
  const current = pathToFileURL(process.argv[1] ?? "").href;
  const moduleUrl = fileURLToPath(import.meta.url);
  return current === pathToFileURL(moduleUrl).href;
})();

if (isMainModule) {
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main();
}
