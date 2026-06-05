import { randomUUID } from "node:crypto";
import {
  WorkflowGuardrailOperator,
  WorkflowGuardrailSeverity,
  WorkflowExecutionStatus,
  WorkflowNodeKind,
  type WorkflowAlertRecord,
  type WorkflowAssetRecord,
  type WorkflowCitationRecord,
  type WorkflowContextEnvelope,
  type WorkflowDefinitionRecord,
  type WorkflowEdgeRecord,
  type WorkflowExecutionRecord,
  type WorkflowGuardrailFindingRecord,
  type WorkflowNodeExecutionRecord,
  type WorkflowNodeRecord,
  type WorkflowProviderSelectionRecord,
  type WorkflowUsageTotalsRecord
} from "../../shared/src/workflows";

const DefaultSummaryLength = 240;
const PromptSectionSeparator = "\n\n";

export type WorkflowProviderRunRequest = {
  workflowId: string;
  workflowRunId: string;
  projectId: string;
  node: WorkflowNodeRecord;
  provider: WorkflowProviderSelectionRecord;
  envelope: WorkflowContextEnvelope;
  prompt: string;
};

export type WorkflowProviderRunResult = {
  outputText: string;
  outputSnapshot?: unknown;
  usage?: Partial<WorkflowUsageTotalsRecord>;
  alerts?: ReadonlyArray<WorkflowAlertRecord>;
  citations?: ReadonlyArray<WorkflowCitationRecord>;
};

export const WorkflowRuntimeEventType = {
  WorkflowStarted: "workflow_started",
  NodeStarted: "node_started",
  NodeDelta: "node_delta",
  NodeCompleted: "node_completed",
  NodeFailed: "node_failed",
  WorkflowCompleted: "workflow_completed",
  WorkflowFailed: "workflow_failed"
} as const;

export type WorkflowRuntimeEvent =
  | {
      type: typeof WorkflowRuntimeEventType.WorkflowStarted;
      workflowId: string;
      workflowRunId: string;
      startedAt: string;
    }
  | {
      type: typeof WorkflowRuntimeEventType.NodeStarted;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      nodeKind: WorkflowNodeKind;
      label: string;
      startedAt: string;
    }
  | {
      type: typeof WorkflowRuntimeEventType.NodeDelta;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      delta: string;
      emittedAt: string;
    }
  | {
      type: typeof WorkflowRuntimeEventType.NodeCompleted;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      nodeKind: WorkflowNodeKind;
      label: string;
      status: "completed" | "failed" | "awaiting_review";
      startedAt: string;
      finishedAt: string;
      outputSnapshot: unknown;
      alerts: ReadonlyArray<WorkflowAlertRecord>;
      guardrailFindings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
      usage?: WorkflowUsageTotalsRecord;
      provider?: WorkflowProviderSelectionRecord;
    }
  | {
      type: typeof WorkflowRuntimeEventType.NodeFailed;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      nodeKind: WorkflowNodeKind;
      label: string;
      startedAt: string;
      finishedAt: string;
      message: string;
    }
  | {
      type: typeof WorkflowRuntimeEventType.WorkflowCompleted;
      workflowId: string;
      workflowRunId: string;
      finishedAt: string;
      execution: WorkflowExecutionRecord;
    }
  | {
      type: typeof WorkflowRuntimeEventType.WorkflowFailed;
      workflowId: string;
      workflowRunId: string;
      finishedAt: string;
      execution: WorkflowExecutionRecord;
    };

export type WorkflowRuntime = {
  runDefinition: (input: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    contextSessionId?: string;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }) => Promise<WorkflowExecutionRecord>;
};

export const createWorkflowRuntime = (input: {
  now?: () => Date;
  runProviderNode: (
    request: WorkflowProviderRunRequest
  ) => Promise<WorkflowProviderRunResult>;
}): WorkflowRuntime => {
  const now = input.now ?? (() => new Date());

  const runDefinition = async (request: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    contextSessionId?: string;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }): Promise<WorkflowExecutionRecord> => {
    const workflowRunId = randomUUID();
    const startedAt = now().toISOString();
    const contextSessionId = request.contextSessionId ?? workflowRunId;
    const assetsById = new Map(
      request.assets.map((asset) => [asset.id, asset] as const)
    );
    const nodes = sortWorkflowNodes(request.definition.nodes, request.definition.edges);
    const outputs = new Map<string, unknown>();
    const nodeRuns: WorkflowNodeExecutionRecord[] = [];
    let envelope = createInitialEnvelope({
      definition: request.definition,
      workflowRunId,
      contextSessionId
    });
    let status: WorkflowExecutionStatus = WorkflowExecutionStatus.Completed;
    request.onEvent?.({
      type: WorkflowRuntimeEventType.WorkflowStarted,
      workflowId: request.definition.id,
      workflowRunId,
      startedAt
    });

    for (const node of nodes) {
      const nodeStartedAt = now().toISOString();
      request.onEvent?.({
        type: WorkflowRuntimeEventType.NodeStarted,
        workflowId: request.definition.id,
        workflowRunId,
        nodeId: node.id,
        nodeKind: node.kind,
        label: node.label,
        startedAt: nodeStartedAt
      });
      if (node.kind === WorkflowNodeKind.HumanReview) {
        const nodeFinishedAt = now().toISOString();
        const nodeRun = createNodeRunRecord({
          node,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          status: "awaiting_review",
          outputSnapshot: readNodeInput(node.id, request.definition.edges, outputs, envelope)
        });
        nodeRuns.push(nodeRun);
        request.onEvent?.({
          type: WorkflowRuntimeEventType.NodeCompleted,
          workflowId: request.definition.id,
          workflowRunId,
          nodeId: node.id,
          nodeKind: node.kind,
          label: node.label,
          status: "awaiting_review",
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          outputSnapshot: nodeRun.outputSnapshot,
          alerts: nodeRun.alerts,
          guardrailFindings: nodeRun.guardrailFindings
        });
        status = WorkflowExecutionStatus.AwaitingReview;
        break;
      }

      try {
        const inputValue = readNodeInput(
          node.id,
          request.definition.edges,
          outputs,
          envelope
        );
        const result = await executeWorkflowNode({
          node,
          inputValue,
          envelope,
          assetsById,
          workflowRunId,
          definition: request.definition,
          now,
          runProviderNode: input.runProviderNode,
          ...(request.onEvent ? { onEvent: request.onEvent } : {})
        });
        outputs.set(node.id, result.outputSnapshot);
        envelope = result.envelope;
        const nodeStatus = result.failedByGuardrail ? "failed" : "completed";
        const nodeFinishedAt = now().toISOString();
        const nodeRun = createNodeRunRecord({
          node,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          status: nodeStatus,
          alerts: result.alerts,
          guardrailFindings: result.guardrailFindings,
          outputSnapshot: result.outputSnapshot,
          ...(result.provider ? { provider: result.provider } : {}),
          ...(result.usage ? { usage: result.usage } : {})
        });
        nodeRuns.push(nodeRun);
        request.onEvent?.({
          type: WorkflowRuntimeEventType.NodeCompleted,
          workflowId: request.definition.id,
          workflowRunId,
          nodeId: node.id,
          nodeKind: node.kind,
          label: node.label,
          status: nodeStatus,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          outputSnapshot: nodeRun.outputSnapshot,
          alerts: nodeRun.alerts,
          guardrailFindings: nodeRun.guardrailFindings,
          ...(result.provider ? { provider: result.provider } : {}),
          ...(result.usage ? { usage: result.usage } : {})
        });
        if (result.failedByGuardrail) {
          status = WorkflowExecutionStatus.Failed;
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Workflow node failed";
        const nodeFinishedAt = now().toISOString();
        const nodeRun = createNodeRunRecord({
          node,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          status: "failed",
          alerts: [createRuntimeAlert(message)],
          guardrailFindings: [],
          outputSnapshot: {
            error: message
          }
        });
        nodeRuns.push(nodeRun);
        request.onEvent?.({
          type: WorkflowRuntimeEventType.NodeFailed,
          workflowId: request.definition.id,
          workflowRunId,
          nodeId: node.id,
          nodeKind: node.kind,
          label: node.label,
          startedAt: nodeStartedAt,
          finishedAt: nodeFinishedAt,
          message
        });
        status = WorkflowExecutionStatus.Failed;
        break;
      }
    }

    const finishedAt = now().toISOString();
    const totals = sumWorkflowUsage(nodeRuns);
    const execution = {
      id: workflowRunId,
      workflowId: request.definition.id,
      projectId: request.definition.projectId,
      triggerKind: request.definition.trigger.kind,
      status,
      startedAt,
      finishedAt,
      durationMs: Math.max(
        0,
        new Date(finishedAt).getTime() - new Date(startedAt).getTime()
      ),
      warningsCount: countNodeAlerts(nodeRuns, "warn"),
      errorsCount: countNodeAlerts(nodeRuns, "error"),
      totals,
      contextSessionId,
      nodeRuns
    };
    request.onEvent?.({
      type:
        execution.status === WorkflowExecutionStatus.Failed
          ? WorkflowRuntimeEventType.WorkflowFailed
          : WorkflowRuntimeEventType.WorkflowCompleted,
      workflowId: execution.workflowId,
      workflowRunId,
      finishedAt,
      execution
    });
    return execution;
  };

  return {
    runDefinition
  };
};

const executeWorkflowNode = async (input: {
  node: WorkflowNodeRecord;
  inputValue: unknown;
  envelope: WorkflowContextEnvelope;
  assetsById: Map<string, WorkflowAssetRecord>;
  workflowRunId: string;
  definition: WorkflowDefinitionRecord;
  now: () => Date;
  runProviderNode: (
    request: WorkflowProviderRunRequest
  ) => Promise<WorkflowProviderRunResult>;
  onEvent?: (event: WorkflowRuntimeEvent) => void;
}): Promise<{
  envelope: WorkflowContextEnvelope;
  outputSnapshot: unknown;
  usage?: WorkflowUsageTotalsRecord;
  alerts: ReadonlyArray<WorkflowAlertRecord>;
  guardrailFindings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
  failedByGuardrail: boolean;
  provider?: WorkflowProviderSelectionRecord;
}> => {
  if (
    input.node.kind === WorkflowNodeKind.TriggerManual ||
    input.node.kind === WorkflowNodeKind.LogicCondition ||
    input.node.kind === WorkflowNodeKind.LogicMerge ||
    input.node.kind === WorkflowNodeKind.TerminalResponse
  ) {
    return {
      envelope: appendEnvelopeOutput(input.envelope, {
        nodeId: input.node.id,
        outputSnapshot: input.inputValue,
        message: readEnvelopeMessage(input.inputValue),
        citations: [],
        guardrailFindings: []
      }),
      outputSnapshot: input.inputValue,
      alerts: [],
      guardrailFindings: [],
      failedByGuardrail: false
    };
  }

  if (
    input.node.kind === WorkflowNodeKind.AssetPrompt ||
    input.node.kind === WorkflowNodeKind.AssetInstruction ||
    input.node.kind === WorkflowNodeKind.AssetGuardrail
  ) {
    const assetOutput = readNodeAssetOutput(input.node, input.assetsById);
    return {
      envelope: appendEnvelopeOutput(input.envelope, {
        nodeId: input.node.id,
        outputSnapshot: assetOutput,
        message: typeof assetOutput === "string" ? assetOutput : readEnvelopeMessage(assetOutput),
        citations: [],
        guardrailFindings: []
      }),
      outputSnapshot: assetOutput,
      alerts: [],
      guardrailFindings: [],
      failedByGuardrail: false
    };
  }

  if (
    input.node.kind === WorkflowNodeKind.AiProviderRun ||
    input.node.kind === WorkflowNodeKind.AiAgent
  ) {
    const provider = input.node.config.provider;
    if (!provider) {
      throw new Error(`Workflow node ${input.node.id} is missing provider configuration`);
    }

    const prompt = buildProviderPrompt(input.node, input.inputValue, input.envelope);
    const providerResult = await input.runProviderNode({
      workflowId: input.definition.id,
      workflowRunId: input.workflowRunId,
      projectId: input.definition.projectId,
      node: input.node,
      provider,
      envelope: input.envelope,
      prompt
    });
    const outputSnapshot =
      providerResult.outputSnapshot ?? providerResult.outputText;
    if (providerResult.outputText.trim().length > 0) {
      input.onEvent?.({
        type: WorkflowRuntimeEventType.NodeDelta,
        workflowId: input.definition.id,
        workflowRunId: input.workflowRunId,
        nodeId: input.node.id,
        delta: providerResult.outputText,
        emittedAt: input.now().toISOString()
      });
    }
    const guardrailFindings = evaluateNodeGuardrails({
      node: input.node,
      inputValue: input.inputValue,
      outputSnapshot,
      envelope: input.envelope,
      assetsById: input.assetsById
    });
    const nextEnvelope = appendEnvelopeOutput(input.envelope, {
      nodeId: input.node.id,
      outputSnapshot,
      message: providerResult.outputText,
      citations: providerResult.citations ?? [],
      guardrailFindings
    });
    const usage = normalizeUsage(providerResult.usage);
    const guardrailAlerts = createGuardrailAlerts(guardrailFindings, input.now);
    const failedByGuardrail = guardrailFindings.some(
      (finding) => finding.severity === WorkflowGuardrailSeverity.Error
    );

    return {
      envelope: nextEnvelope,
      outputSnapshot,
      alerts: [...(providerResult.alerts ?? []), ...guardrailAlerts],
      guardrailFindings,
      failedByGuardrail,
      provider,
      ...(usage ? { usage } : {})
    };
  }

  throw new Error(`Workflow node kind ${input.node.kind} is not supported in 06.6`);
};

const buildProviderPrompt = (
  node: WorkflowNodeRecord,
  inputValue: unknown,
  envelope: WorkflowContextEnvelope
): string => {
  const sections: string[] = [];
  const prompt = node.config.prompt?.trim();
  if (prompt) {
    sections.push(prompt);
  }

  const continuity = renderEnvelopeForProvider(envelope);
  if (continuity) {
    sections.push(continuity);
  }

  const serializedInput = serializeNodeInput(inputValue);
  if (serializedInput) {
    sections.push(serializedInput);
  }

  return sections.join(PromptSectionSeparator);
};

const renderEnvelopeForProvider = (
  envelope: WorkflowContextEnvelope
): string => {
  const sections: string[] = [];

  if (envelope.summary.trim().length > 0) {
    sections.push(`Context summary:\n${envelope.summary}`);
  }

  if (envelope.objectives.length > 0) {
    sections.push(`Objectives:\n- ${envelope.objectives.join("\n- ")}`);
  }

  if (envelope.messages.length > 0) {
    sections.push(`Prior workflow messages:\n${envelope.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n")}`);
  }

  if (envelope.artifacts.length > 0) {
    sections.push(`Workflow artifacts:\n${envelope.artifacts
      .map((artifact) => `${artifact.nodeId}: ${serializeNodeInput(artifact.content)}`)
      .join("\n")}`);
  }

  return sections.join(PromptSectionSeparator);
};

const serializeNodeInput = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
};

const appendEnvelopeOutput = (
  envelope: WorkflowContextEnvelope,
  input: {
    nodeId: string;
    outputSnapshot: unknown;
    message: string;
    citations: ReadonlyArray<WorkflowCitationRecord>;
    guardrailFindings: WorkflowContextEnvelope["guardrailFindings"];
  }
): WorkflowContextEnvelope => {
  const artifactKind: WorkflowContextEnvelope["artifacts"][number]["kind"] =
    typeof input.outputSnapshot === "string" ? "text_output" : "json_output";
  const artifacts = [
    ...envelope.artifacts,
    {
      id: randomUUID(),
      kind: artifactKind,
      nodeId: input.nodeId,
      content: input.outputSnapshot
    }
  ].slice(-Math.max(1, envelope.artifacts.length + 1));
  const messages = input.message.trim().length === 0
    ? envelope.messages
    : [
        ...envelope.messages,
        {
          role: "assistant" as const,
          content: input.message,
          sourceNodeId: input.nodeId
        }
      ];
  return {
    ...envelope,
    summary: buildEnvelopeSummary(input.message, envelope.summary),
    variables: {
      ...envelope.variables,
      [input.nodeId]: input.outputSnapshot
    },
    artifacts,
    citations: [...envelope.citations, ...input.citations],
    guardrailFindings: [...envelope.guardrailFindings, ...input.guardrailFindings],
    messages
  };
};

const buildEnvelopeSummary = (
  latestMessage: string,
  previousSummary: string
): string => {
  const normalized = latestMessage.trim();
  if (normalized.length === 0) {
    return previousSummary;
  }

  if (normalized.length <= DefaultSummaryLength) {
    return normalized;
  }

  return `${normalized.slice(0, DefaultSummaryLength - 1)}…`;
};

const readNodeAssetOutput = (
  node: WorkflowNodeRecord,
  assetsById: Map<string, WorkflowAssetRecord>
): string => {
  const assetId = node.config.assetId;
  if (!assetId) {
    return node.config.prompt ?? "";
  }

  const asset = assetsById.get(assetId);
  if (!asset) {
    throw new Error(`Workflow asset ${assetId} not found`);
  }

  return asset.body;
};

const createInitialEnvelope = (input: {
  definition: WorkflowDefinitionRecord;
  workflowRunId: string;
  contextSessionId: string;
}): WorkflowContextEnvelope => ({
  sessionId: input.contextSessionId,
  workflowRunId: input.workflowRunId,
  workflowId: input.definition.id,
  language: input.definition.defaultContextPolicy.language,
  summary: input.definition.description,
  objectives: input.definition.tags,
  variables: {},
  artifacts: [],
  citations: [],
  guardrailFindings: [],
  messages: []
});

const readNodeInput = (
  targetNodeId: string,
  edges: ReadonlyArray<WorkflowEdgeRecord>,
  outputs: Map<string, unknown>,
  envelope: WorkflowContextEnvelope
): unknown => {
  const incomingEdges = edges.filter((edge) => edge.targetNodeId === targetNodeId);
  if (incomingEdges.length === 0) {
    return undefined;
  }

  if (incomingEdges.every((edge) => edge.mapping.mode === "passthrough")) {
    const values = incomingEdges
      .map((edge) => outputs.get(edge.sourceNodeId))
      .filter((value) => value !== undefined);
    return values.length <= 1 ? values[0] : values;
  }

  if (incomingEdges.every((edge) => edge.mapping.mode === "template")) {
    return incomingEdges
      .map((edge) => renderTemplateMapping(edge, outputs, envelope))
      .filter((value) => value.trim().length > 0)
      .join(PromptSectionSeparator);
  }

  const mapped: Record<string, unknown> = {};
  for (const edge of incomingEdges) {
    if (edge.mapping.mode === "passthrough") {
      mapped[edge.sourceNodeId] = outputs.get(edge.sourceNodeId);
      continue;
    }

    for (const entry of edge.mapping.entries) {
      writePathValue(
        mapped,
        normalizeTargetPath(entry.targetPath),
        readMappingSourceValue(entry.source, outputs, envelope)
      );
    }
  }

  return mapped;
};

const renderTemplateMapping = (
  edge: WorkflowEdgeRecord,
  outputs: Map<string, unknown>,
  envelope: WorkflowContextEnvelope
): string =>
  edge.mapping.entries
    .map((entry) =>
      serializeNodeInput(readMappingSourceValue(entry.source, outputs, envelope))
    )
    .filter((value) => value.length > 0)
    .join("\n");

const readMappingSourceValue = (
  source: WorkflowEdgeRecord["mapping"]["entries"][number]["source"],
  outputs: Map<string, unknown>,
  envelope: WorkflowContextEnvelope
): unknown => {
  if (source.kind === "literal") {
    return source.value;
  }

  if (source.kind === "context_value") {
    return readPathValue(envelope.variables, normalizeTargetPath(source.path));
  }

  const nodeOutput = source.nodeId ? outputs.get(source.nodeId) : undefined;
  if (!source.path) {
    return nodeOutput;
  }

  return readPathValue(nodeOutput, normalizeTargetPath(source.path));
};

const normalizeTargetPath = (value?: string): ReadonlyArray<string> => {
  if (!value) {
    return [];
  }

  return value
    .replace(/^\$\./u, "")
    .replace(/^\$/u, "")
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const readPathValue = (
  value: unknown,
  path: ReadonlyArray<string>
): unknown => {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
};

const writePathValue = (
  target: Record<string, unknown>,
  path: ReadonlyArray<string>,
  value: unknown
): void => {
  if (path.length === 0) {
    return;
  }

  let current: Record<string, unknown> = target;
  for (const segment of path.slice(0, -1)) {
    const nested = current[segment];
    if (isRecord(nested)) {
      current = nested;
      continue;
    }

    const next: Record<string, unknown> = {};
    current[segment] = next;
    current = next;
  }

  current[path[path.length - 1] ?? "value"] = value;
};

const sortWorkflowNodes = (
  nodes: ReadonlyArray<WorkflowNodeRecord>,
  edges: ReadonlyArray<WorkflowEdgeRecord>
): ReadonlyArray<WorkflowNodeRecord> => {
  const inDegree = new Map<string, number>(
    nodes.map((node) => [node.id, 0] as const)
  );
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }

  const queue = nodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0);
  const ordered: WorkflowNodeRecord[] = [];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      break;
    }

    ordered.push(node);
    for (const targetId of outgoing.get(node.id) ?? []) {
      const nextInDegree = (inDegree.get(targetId) ?? 0) - 1;
      inDegree.set(targetId, nextInDegree);
      if (nextInDegree === 0) {
        const targetNode = nodes.find((candidate) => candidate.id === targetId);
        if (targetNode) {
          queue.push(targetNode);
        }
      }
    }
  }

  return ordered.length === nodes.length ? ordered : nodes;
};

const normalizeUsage = (
  usage?: Partial<WorkflowUsageTotalsRecord>
): WorkflowUsageTotalsRecord | undefined => {
  if (!usage) {
    return undefined;
  }

  return {
    promptTokens: usage.promptTokens ?? 0,
    completionTokens: usage.completionTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    estimatedCostEur: usage.estimatedCostEur ?? 0,
    latencyMs: usage.latencyMs ?? 0,
    ...(usage.estimatedCostSourceCurrency
      ? { estimatedCostSourceCurrency: usage.estimatedCostSourceCurrency }
      : {}),
    ...(usage.estimatedCostSourceValue !== undefined
      ? { estimatedCostSourceValue: usage.estimatedCostSourceValue }
      : {}),
    ...(usage.exchangeRateEur !== undefined
      ? { exchangeRateEur: usage.exchangeRateEur }
      : {})
  };
};

const sumWorkflowUsage = (
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>
): WorkflowUsageTotalsRecord =>
  nodeRuns.reduce<WorkflowUsageTotalsRecord>(
    (totals, nodeRun) => ({
      promptTokens: totals.promptTokens + (nodeRun.usage?.promptTokens ?? 0),
      completionTokens:
        totals.completionTokens + (nodeRun.usage?.completionTokens ?? 0),
      totalTokens: totals.totalTokens + (nodeRun.usage?.totalTokens ?? 0),
      estimatedCostEur:
        totals.estimatedCostEur + (nodeRun.usage?.estimatedCostEur ?? 0),
      latencyMs: totals.latencyMs + (nodeRun.usage?.latencyMs ?? 0)
    }),
    {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostEur: 0,
      latencyMs: 0
    }
  );

const countNodeAlerts = (
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>,
  level: WorkflowAlertRecord["level"]
): number =>
  nodeRuns.reduce<number>(
    (count, nodeRun) =>
      count + nodeRun.alerts.filter((alert) => alert.level === level).length,
    0
  );

const createNodeRunRecord = (input: {
  node: WorkflowNodeRecord;
  startedAt: string;
  finishedAt: string;
  status: WorkflowNodeExecutionRecord["status"];
  provider?: WorkflowProviderSelectionRecord;
  usage?: WorkflowUsageTotalsRecord;
  alerts?: ReadonlyArray<WorkflowAlertRecord>;
  guardrailFindings?: ReadonlyArray<WorkflowGuardrailFindingRecord>;
  outputSnapshot: unknown;
}): WorkflowNodeExecutionRecord => ({
  id: randomUUID(),
  nodeId: input.node.id,
  nodeKind: input.node.kind,
  status: input.status,
  startedAt: input.startedAt,
  finishedAt: input.finishedAt,
  durationMs: Math.max(
    0,
    new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime()
  ),
  ...(input.provider
    ? {
        providerId: input.provider.providerId,
        modelId: input.provider.modelId,
        reasoningLevel: input.provider.reasoningLevel,
        temperature: input.provider.temperature,
        verbosity: input.provider.verbosity
      }
    : {}),
  ...(input.usage ? { usage: input.usage } : {}),
  alerts: input.alerts ?? [],
  guardrailFindings: input.guardrailFindings ?? [],
  outputSnapshot: input.outputSnapshot
});

const readEnvelopeMessage = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value);
};

const createRuntimeAlert = (message: string): WorkflowAlertRecord => ({
  id: randomUUID(),
  level: "error",
  source: "system",
  message,
  createdAt: new Date().toISOString()
});

const evaluateNodeGuardrails = (input: {
  node: WorkflowNodeRecord;
  inputValue: unknown;
  outputSnapshot: unknown;
  envelope: WorkflowContextEnvelope;
  assetsById: Map<string, WorkflowAssetRecord>;
}): ReadonlyArray<WorkflowGuardrailFindingRecord> =>
  input.node.attachedGuardrails
    .filter((attachment) => attachment.enabled)
    .sort((left, right) => left.order - right.order)
    .flatMap((attachment) => {
      const asset = input.assetsById.get(attachment.assetId);
      const definition = asset?.guardrail;
      if (!asset || !definition || definition.validations.length === 0) {
        return [];
      }

      const results = definition.validations.map((validation) =>
        evaluateGuardrailValidation({
          validation,
          inputValue: input.inputValue,
          outputSnapshot: input.outputSnapshot,
          envelope: input.envelope
        })
      );
      const matched = definition.operator === WorkflowGuardrailOperator.Any
        ? results.some(Boolean)
        : results.every(Boolean);
      const shouldReport = definition.severity === WorkflowGuardrailSeverity.Error
        ? !matched
        : matched;

      return shouldReport
        ? [
            {
              guardrailAssetId: attachment.assetId,
              nodeId: input.node.id,
              severity: definition.severity,
              message: readGuardrailFindingMessage(definition.validations)
            }
          ]
        : [];
    });

const evaluateGuardrailValidation = (input: {
  validation: NonNullable<WorkflowAssetRecord["guardrail"]>["validations"][number];
  inputValue: unknown;
  outputSnapshot: unknown;
  envelope: WorkflowContextEnvelope;
}): boolean => {
  const targetValue = readGuardrailTargetValue({
    target: input.validation.target,
    inputValue: input.inputValue,
    outputSnapshot: input.outputSnapshot,
    envelope: input.envelope
  });
  const resolvedValue = input.validation.kind === "contains" || input.validation.kind === "not_contains"
    ? targetValue
    : readPathValue(targetValue, normalizeTargetPath(input.validation.path));

  if (input.validation.kind === "field_exists") {
    return resolvedValue !== undefined;
  }

  if (input.validation.kind === "field_equals") {
    return resolvedValue === input.validation.value;
  }

  if (input.validation.kind === "contains") {
    return typeof resolvedValue === "string" &&
      typeof input.validation.value === "string" &&
      resolvedValue.includes(input.validation.value);
  }

  if (input.validation.kind === "not_contains") {
    return typeof resolvedValue === "string" &&
      typeof input.validation.value === "string" &&
      !resolvedValue.includes(input.validation.value);
  }

  if (input.validation.kind === "regex") {
    if (typeof resolvedValue !== "string" || typeof input.validation.value !== "string") {
      return false;
    }

    try {
      return new RegExp(input.validation.value, "u").test(resolvedValue);
    } catch {
      return false;
    }
  }

  if (input.validation.kind === "number_gte") {
    return typeof resolvedValue === "number" &&
      typeof input.validation.value === "number" &&
      resolvedValue >= input.validation.value;
  }

  if (input.validation.kind === "number_lte") {
    return typeof resolvedValue === "number" &&
      typeof input.validation.value === "number" &&
      resolvedValue <= input.validation.value;
  }

  if (input.validation.kind === "json_schema") {
    return isRecord(resolvedValue);
  }

  return false;
};

const readGuardrailTargetValue = (input: {
  target: NonNullable<WorkflowAssetRecord["guardrail"]>["validations"][number]["target"];
  inputValue: unknown;
  outputSnapshot: unknown;
  envelope: WorkflowContextEnvelope;
}): unknown => {
  if (input.target === "input") {
    return input.inputValue;
  }

  if (input.target === "context") {
    return input.envelope;
  }

  if (input.target === "metadata") {
    return {
      workflowId: input.envelope.workflowId,
      workflowRunId: input.envelope.workflowRunId,
      sessionId: input.envelope.sessionId,
      language: input.envelope.language
    };
  }

  return input.outputSnapshot;
};

const readGuardrailFindingMessage = (
  validations: NonNullable<WorkflowAssetRecord["guardrail"]>["validations"]
): string => validations[0]?.message ?? "Guardrail matched.";

const createGuardrailAlerts = (
  findings: ReadonlyArray<WorkflowGuardrailFindingRecord>,
  nowFactory: () => Date
): ReadonlyArray<WorkflowAlertRecord> =>
  findings.flatMap((finding) =>
    finding.severity === WorkflowGuardrailSeverity.Success
      ? []
      : [
          {
            id: randomUUID(),
            level: finding.severity,
            source: "guardrail",
            message: finding.message,
            createdAt: nowFactory().toISOString()
          }
        ]
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
