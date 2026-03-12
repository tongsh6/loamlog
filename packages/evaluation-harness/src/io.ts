import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EvaluationSample, SamplePrediction } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadSamples(datasetPath?: string): { samples: EvaluationSample[]; datasetName: string } {
  const resolvedPath =
    datasetPath ?? path.resolve(__dirname, "../datasets/mvp-samples.json");
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const samples = JSON.parse(raw) as EvaluationSample[];
  return { samples, datasetName: path.basename(resolvedPath) };
}

export function loadPredictions(predictionPath: string): SamplePrediction[] {
  const raw = fs.readFileSync(predictionPath, "utf-8");
  return JSON.parse(raw) as SamplePrediction[];
}

export function writeReport(outputPath: string, content: unknown): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));
}
