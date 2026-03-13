import { randomUUID } from "node:crypto";

export const ToolSideEffect = {
  None: "none",
  Filesystem: "filesystem",
  Network: "network",
  Process: "process"
} as const;

export type ToolSideEffect =
  typeof ToolSideEffect[keyof typeof ToolSideEffect];

export type Citation = {
  chunkId: string;
  sourceId: string;
  uri: string;
  snippet: string;
  retrievedAt: string;
  updatedAt: string;
  score: number;
  sourceType: string;
};

export type ConfidenceScore = {
  score: number;
  label: "low" | "medium" | "high";
  signals: ReadonlyArray<string>;
};

export type UsageRecord = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
};

export type EvidenceReport = {
  traceId: string;
  sessionId: string;
  decisions: ReadonlyArray<string>;
  guardrailsTriggered: ReadonlyArray<string>;
  retrievedSources: ReadonlyArray<Citation>;
  confidence: ConfidenceScore;
  usage: UsageRecord;
};

export type RunContext = {
  traceId: string;
  runId: string;
  sessionId: string;
  createdAt: string;
  providerId: string;
  modelId: string;
};

export type ToolDefinition = {
  id: string;
  sideEffect: ToolSideEffect;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

export type ToolRegistry = {
  list: () => ReadonlyArray<ToolDefinition>;
  get: (toolId: string) => ToolDefinition | undefined;
  execute: (
    toolId: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
};

export const createRunContext = (input: {
  sessionId: string;
  providerId?: string;
  modelId?: string;
  createdAt?: string;
}): RunContext => ({
  traceId: randomUUID(),
  runId: randomUUID(),
  sessionId: input.sessionId,
  createdAt: input.createdAt ?? new Date().toISOString(),
  providerId: input.providerId ?? "internal-workbench",
  modelId: input.modelId ?? "deterministic"
});

export const createToolRegistry = (
  tools: ReadonlyArray<ToolDefinition>
): ToolRegistry => {
  const toolsById = new Map<string, ToolDefinition>();

  for (const tool of tools) {
    toolsById.set(tool.id, tool);
  }

  const list = (): ReadonlyArray<ToolDefinition> => [...toolsById.values()];

  const get = (toolId: string): ToolDefinition | undefined => toolsById.get(toolId);

  const execute = async (
    toolId: string,
    args: Record<string, unknown>
  ): Promise<unknown> => {
    const tool = get(toolId);
    if (!tool) {
      throw new Error(`Unknown tool ${toolId}`);
    }

    return tool.execute(args);
  };

  return {
    list,
    get,
    execute
  };
};

export const createConfidenceScore = (
  score: number,
  signals: ReadonlyArray<string>
): ConfidenceScore => ({
  score,
  label: toConfidenceLabel(score),
  signals
});

export const estimateTextTokens = (text: string): number =>
  Math.max(1, Math.ceil(text.length / 4));

export const createUsageRecord = (input: {
  promptText: string;
  completionText: string;
  latencyMs: number;
  estimatedCostUsd?: number;
}): UsageRecord => {
  const promptTokens = estimateTextTokens(input.promptText);
  const completionTokens = estimateTextTokens(input.completionText);

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCostUsd: input.estimatedCostUsd ?? 0,
    latencyMs: input.latencyMs
  };
};

const toConfidenceLabel = (
  score: number
): "low" | "medium" | "high" => {
  if (score >= 0.75) {
    return "high";
  }

  if (score >= 0.45) {
    return "medium";
  }

  return "low";
};
