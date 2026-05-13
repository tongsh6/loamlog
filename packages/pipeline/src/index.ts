import type { ExecutionContext, RetryOptions, withTimeout as WithTimeoutFn, withRetry as WithRetryFn } from "@loamlog/core";

export interface PipelineNode<I = unknown, O = unknown> {
  id: string;
  run(input: I, ctx: ExecutionContext): Promise<O>;
  /** Timeout in ms for this node. Skipped if not set. */
  timeoutMs?: number;
  /** Retry policy for transient failures. Skipped if not set. */
  retry?: RetryOptions;
}

export interface DAGDefinition {
  nodes: PipelineNode[];
  /** [fromNodeId, toNodeId] — toNode depends on fromNode's output. */
  edges: Array<[string, string]>;
}

export interface NodeReport {
  nodeId: string;
  status: "success" | "failed" | "skipped";
  durationMs: number;
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
}

export interface ExecutionReport {
  status: "success" | "partial_failure" | "failure";
  totalDurationMs: number;
  nodes: NodeReport[];
}

interface RunnableLevel {
  node: PipelineNode;
  dependencies: string[];
}

function topologicalLevels(def: DAGDefinition): RunnableLevel[][] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const nodeMap = new Map<string, PipelineNode>();

  for (const node of def.nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    dependents.set(node.id, []);
  }

  for (const [from, to] of def.edges) {
    if (!nodeMap.has(from) || !nodeMap.has(to)) {
      throw new Error(`edge references unknown node: ${from} -> ${to}`);
    }
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    dependents.get(from)?.push(to);
  }

  // Kahn's algorithm grouped by level
  const levels: RunnableLevel[][] = [];
  let currentLevel: RunnableLevel[] = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      const node = nodeMap.get(id);
      if (node) {
        currentLevel.push({ node, dependencies: [] });
      }
    }
  }

  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: RunnableLevel[] = [];

    for (const item of currentLevel) {
      for (const depId of dependents.get(item.node.id) ?? []) {
        const newDegree = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          const depNode = nodeMap.get(depId);
          if (!depNode) {
            throw new Error(`node not found while building level: ${depId}`);
          }
          // Collect dependency ids for this node
          const deps = def.edges
            .filter(([_, t]) => t === depId)
            .map(([f]) => f);
          nextLevel.push({ node: depNode, dependencies: deps });
        }
      }
    }

    currentLevel = nextLevel;
  }

  // Check for cycles
  for (const [_, degree] of inDegree) {
    if (degree > 0) {
      const stuck = [...inDegree.entries()].filter(([, d]) => d > 0).map(([id]) => id);
      throw new Error(`DAG contains a cycle involving: ${stuck.join(", ")}`);
    }
  }

  return levels;
}

export function validateDAG(def: DAGDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const node of def.nodes) {
    if (!node.id) {
      errors.push("node has empty id");
    } else if (ids.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`);
    } else {
      ids.add(node.id);
    }
  }

  for (const [from, to] of def.edges) {
    if (!ids.has(from)) {
      errors.push(`edge references unknown source node: ${from}`);
    }
    if (!ids.has(to)) {
      errors.push(`edge references unknown target node: ${to}`);
    }
  }

  try {
    topologicalLevels(def);
  } catch (error) {
    errors.push((error as Error).message);
  }

  return errors;
}

export interface ExecuteDAGOptions {
  concurrency?: number;
  /** Callback for progress tracking. */
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, report: NodeReport) => void;
  /** Timeout/retry impls from core aspects. */
  aspects?: {
    withTimeout: typeof WithTimeoutFn;
    withRetry: typeof WithRetryFn;
  };
}

export async function executeDAG(
  def: DAGDefinition,
  ctx: ExecutionContext,
  options: ExecuteDAGOptions = {},
): Promise<ExecutionReport> {
  const concurrency = options.concurrency ?? 4;
  const levels = topologicalLevels(def);
  const outputs = new Map<string, unknown>();
  const nodeReports: NodeReport[] = [];
  const failedNodes = new Set<string>();
  const startTime = Date.now();

  for (const level of levels) {
    // Nodes at this level can run in parallel (they have no dependencies on each other)
    const pending = level.filter((item) => {
      // Skip if any dependency failed
      return !item.dependencies.some((depId) => failedNodes.has(depId));
    });

    // Mark skipped nodes
    for (const item of level) {
      if (item.dependencies.some((depId) => failedNodes.has(depId))) {
        nodeReports.push({
          nodeId: item.node.id,
          status: "skipped",
          durationMs: 0,
          error: "skipped: upstream dependency failed",
        });
      }
    }

    // Run pending nodes with bounded concurrency
    const running: Promise<void>[] = [];

    for (const item of pending) {
      const runPromise = (async () => {
        const nodeStart = Date.now();
        options.onNodeStart?.(item.node.id);

        try {
          // Resolve inputs from upstream outputs
          const inputs: Record<string, unknown> = {};
          for (const depId of item.dependencies) {
            inputs[depId] = outputs.get(depId);
          }

          let runFn = () => item.node.run(inputs as unknown, ctx);
          const aspects = options.aspects;

          if (item.node.timeoutMs !== undefined && aspects) {
            const innerRun = runFn;
            const timeoutMs = item.node.timeoutMs;
            runFn = () => aspects.withTimeout(innerRun, timeoutMs, ctx);
          }

          if (item.node.retry && aspects) {
            const innerRun = runFn;
            runFn = () => aspects.withRetry(innerRun, item.node.retry, ctx);
          }

          const output = await runFn();
          outputs.set(item.node.id, output);

          const report: NodeReport = {
            nodeId: item.node.id,
            status: "success",
            durationMs: Date.now() - nodeStart,
            inputSummary: summarizeValue(inputs),
            outputSummary: summarizeValue(output),
          };
          nodeReports.push(report);
          options.onNodeComplete?.(item.node.id, report);
        } catch (error) {
          failedNodes.add(item.node.id);
          const message = error instanceof Error ? error.message : String(error);
          const report: NodeReport = {
            nodeId: item.node.id,
            status: "failed",
            durationMs: Date.now() - nodeStart,
            error: message,
          };
          nodeReports.push(report);
          options.onNodeComplete?.(item.node.id, report);
        }
      })();

      running.push(runPromise);

      if (running.length >= concurrency) {
        await Promise.race(running);
        running.splice(
          running.findIndex((p) =>
            p.then(() => false).catch(() => true),
          ),
          1,
        );
      }
    }

    await Promise.allSettled(running);
  }

  const totalDurationMs = Date.now() - startTime;
  const failedCount = failedNodes.size;
  const status =
    failedCount === 0
      ? "success"
      : failedCount === def.nodes.length
        ? "failure"
        : "partial_failure";

  return { status, totalDurationMs, nodes: nodeReports };
}

function summarizeValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.length > 80 ? value.slice(0, 77) + "..." : value;
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") return `Object(${Object.keys(value as object).length} keys)`;
  return String(value);
}
