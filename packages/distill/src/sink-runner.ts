import type { DeliveryReport, DistillResult, SinkPlugin } from "@loamlog/core";

export interface ConfiguredSink {
  plugin: SinkPlugin;
  config: Record<string, unknown>;
}

export async function runSinks(
  sinks: ConfiguredSink[],
  results: DistillResult[],
  baseConfig: Record<string, unknown>,
): Promise<DeliveryReport[]> {
  const reports: DeliveryReport[] = [];

  for (const sink of sinks) {
    const accepted = results.filter((result) => sink.plugin.supports(result.type));
    if (accepted.length === 0) {
      reports.push({ delivered: 0, failed: 0 });
      continue;
    }

    try {
      const report = await sink.plugin.deliver({
        results: accepted,
        config: {
          ...baseConfig,
          ...sink.config,
        },
      });
      reports.push(report);
    } catch (error) {
      reports.push({
        delivered: 0,
        failed: accepted.length,
        errors: [
          {
            result_index: 0,
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    }
  }

  return reports;
}
