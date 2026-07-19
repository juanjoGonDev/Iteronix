import { randomUUID } from "node:crypto";
import { z, type ZodType } from "zod";
import {
  buildExecutionPlan,
  MergePolicy,
  type ExecutionPlan,
  mergeNodeInputs,
} from "../../domain/src/workflow-contracts";
import { adaptLegacyWorkflowDefinition } from "./canonical-workflow-adapter";
import {
  WorkflowGuardrailOperator,
  WorkflowGuardrailSeverity,
  WorkflowExecutionStatus,
  WorkflowNodeExecutionInputSourceKind,
  WorkflowNodeKind,
  type WorkflowAlertRecord,
  type WorkflowAssetRecord,
  type WorkflowCitationRecord,
  type WorkflowContextEnvelope,
  type WorkflowDefinitionRecord,
  type WorkflowEdgeRecord,
  type WorkflowExecutionRecord,
  type WorkflowGuardrailFindingRecord,
  type JsonOutputContractRecord,
  type JsonSchemaNodeRecord,
  type WorkflowNodeExecutionRecord,
  type WorkflowNodeExecutionInputSourceRecord,
  type WorkflowNodeRecord,
  type WorkflowProviderSelectionRecord,
  type WorkflowUsageTotalsRecord,
} from "../../shared/src/workflows";

const DefaultSummaryLength = 240;
const PromptSectionSeparator = "\n\n";
const JsonContractPromptTitle = "Expected JSON output contract";
const JsonContractRetryTitle = "Previous JSON output failed validation";
const WorkflowExpressionTokenPattern =
  /\{\{var\|([^|{}]+)\|([^|{}]*)\|([^{}]*)\}\}/gu;
const WorkflowExpressionVariableKind = {
  NodeOutput: "node_output",
  LastNodeOutput: "last_node_output",
  AccumulatedOutputs: "accumulated_outputs",
  CurrentInput: "current_input",
  WorkflowContext: "workflow_context",
} as const;
const DefaultWorkflowNodeExecutionInputSource = {
  kind: WorkflowNodeExecutionInputSourceKind.LastUpstream,
} satisfies WorkflowNodeExecutionInputSourceRecord;

export type WorkflowProviderRunRequest = {
  workflowId: string;
  definition: WorkflowDefinitionRecord;
  workflowRunId: string;
  node: WorkflowNodeRecord;
  provider: WorkflowProviderSelectionRecord;
  envelope: WorkflowContextEnvelope;
  prompt: string;
  signal?: AbortSignal;
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
  WorkflowFailed: "workflow_failed",
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

export type WorkflowInvocationResolution = {
  definition: WorkflowDefinitionRecord;
  executionPlan?: ExecutionPlan;
};

export type WorkflowRuntime = {
  runDefinition: (input: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    contextSessionId?: string;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
    executionPlan?: ExecutionPlan;
  }) => Promise<WorkflowExecutionRecord>;
  runNode: (input: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    nodeId: string;
    inputSource?: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    contextSessionId?: string;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }) => Promise<WorkflowExecutionRecord>;
};

export type GovernedNodeExecutionRequest = {
  node: WorkflowNodeRecord;
  inputValue: unknown;
  workflowRunId: string;
};

export const createWorkflowRuntime = (input: {
  now?: () => Date;
  runProviderNode: (
    request: WorkflowProviderRunRequest,
  ) => Promise<WorkflowProviderRunResult>;
  resolveWorkflowInvocation?: (input: {
    workflowId: string;
    workflowVersion: number;
  }) => WorkflowInvocationResolution | undefined;
  runGovernedNode?: (
    request: GovernedNodeExecutionRequest,
  ) => Promise<WorkflowProviderRunResult>;
}): WorkflowRuntime => {
  const now = input.now ?? (() => new Date());

  const runDefinition = async (request: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    contextSessionId?: string;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
    executionPlan?: ExecutionPlan;
  }): Promise<WorkflowExecutionRecord> =>
    runWorkflowNodes({
      definition: request.definition,
      assets: request.assets,
      stages: readExecutionStages(request.definition, request.executionPlan),
      ...(request.seedNodeOutputs
        ? { seedNodeOutputs: request.seedNodeOutputs }
        : {}),
      ...(request.contextSessionId
        ? { contextSessionId: request.contextSessionId }
        : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onEvent ? { onEvent: request.onEvent } : {}),
    });

  const runNode = async (request: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    nodeId: string;
    inputSource?: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    contextSessionId?: string;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }): Promise<WorkflowExecutionRecord> => {
    const targetNode = request.definition.nodes.find(
      (node) => node.id === request.nodeId,
    );
    if (!targetNode) {
      throw new Error(`Workflow node ${request.nodeId} not found`);
    }

    return runWorkflowNodes({
      definition: request.definition,
      assets: request.assets,
      stages: selectNodeExecutionNodes({
        definition: request.definition,
        nodeId: request.nodeId,
        inputSource:
          request.inputSource ?? DefaultWorkflowNodeExecutionInputSource,
        seedNodeIds: Object.keys(request.seedNodeOutputs ?? {}),
      }).map((node) => [node]),
      targetNodeId: request.nodeId,
      inputSource:
        request.inputSource ?? DefaultWorkflowNodeExecutionInputSource,
      ...(request.seedNodeOutputs
        ? { seedNodeOutputs: request.seedNodeOutputs }
        : {}),
      ...(request.contextSessionId
        ? { contextSessionId: request.contextSessionId }
        : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onEvent ? { onEvent: request.onEvent } : {}),
    });
  };

  const runWorkflowNodes = async (request: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    stages: ReadonlyArray<ReadonlyArray<WorkflowNodeRecord>>;
    targetNodeId?: string;
    inputSource?: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    contextSessionId?: string;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }): Promise<WorkflowExecutionRecord> => {
    const workflowRunId = randomUUID();
    const startedAt = now().toISOString();
    const contextSessionId = request.contextSessionId ?? workflowRunId;
    const assetsById = new Map(
      request.assets.map((asset) => [asset.id, asset] as const),
    );
    const seededOutputs = new Map<string, unknown>(
      Object.entries(request.seedNodeOutputs ?? {}),
    );
    const outputs = new Map<string, unknown>(seededOutputs);
    const nodeRuns: WorkflowNodeExecutionRecord[] = [];
    let envelope = seedEnvelopeOutputs(
      createInitialEnvelope({
        definition: request.definition,
        workflowRunId,
        contextSessionId,
      }),
      request.definition,
      seededOutputs,
    );
    let status: WorkflowExecutionStatus = WorkflowExecutionStatus.Completed;
    request.onEvent?.({
      type: WorkflowRuntimeEventType.WorkflowStarted,
      workflowId: request.definition.id,
      workflowRunId,
      startedAt,
    });

    for (const stage of request.stages) {
      if (request.signal?.aborted) {
        status = WorkflowExecutionStatus.Canceled;
        break;
      }

      const outcomes = await Promise.all(
        stage
          .filter((node) => !seededOutputs.has(node.id))
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((node) =>
            runWorkflowStageNode({
              node,
              ...(request.targetNodeId
                ? { targetNodeId: request.targetNodeId }
                : {}),
              ...(request.inputSource
                ? { inputSource: request.inputSource }
                : {}),
              definition: request.definition,
              assetsById,
              workflowRunId,
              envelope,
              outputs,
              now,
              runProviderNode: input.runProviderNode,
              ...(input.runGovernedNode
                ? { runGovernedNode: input.runGovernedNode }
                : {}),
              runWorkflowInvocation: async (invocationNode) => {
                const invocation = invocationNode.config.workflowInvocation;
                if (!invocation) {
                  throw new Error(
                    `Workflow node ${invocationNode.id} is missing invocation pin`,
                  );
                }
                const nested = input.resolveWorkflowInvocation?.(invocation);
                if (!nested) {
                  throw new Error(
                    `Workflow invocation ${invocation.workflowId}@${invocation.workflowVersion.toString()} was not found`,
                  );
                }
                const nestedExecution = await runDefinition({
                  definition: nested.definition,
                  assets: Array.from(assetsById.values()),
                  ...(nested.executionPlan
                    ? { executionPlan: nested.executionPlan }
                    : {}),
                  ...(request.contextSessionId
                    ? { contextSessionId: request.contextSessionId }
                    : {}),
                  ...(request.signal ? { signal: request.signal } : {}),
                  ...(request.onEvent ? { onEvent: request.onEvent } : {}),
                });
                if (
                  nestedExecution.status !== WorkflowExecutionStatus.Completed
                ) {
                  throw new Error(
                    `Workflow invocation ${invocation.workflowId}@${invocation.workflowVersion.toString()} did not complete`,
                  );
                }
                return nestedExecution.nodeRuns.at(-1)?.outputSnapshot;
              },
              ...(request.signal ? { signal: request.signal } : {}),
              ...(request.onEvent ? { onEvent: request.onEvent } : {}),
            }),
          ),
      );

      const orderedOutcomes = outcomes.sort((left, right) =>
        left.node.id.localeCompare(right.node.id),
      );
      for (const outcome of orderedOutcomes) {
        nodeRuns.push(outcome.nodeRun);
        if (outcome.result) {
          outputs.set(outcome.node.id, outcome.result.outputSnapshot);
          envelope = mergeStageEnvelope(envelope, outcome.result.envelope);
        }
      }
      const terminalOutcome = orderedOutcomes.find(
        (outcome) => outcome.status !== "completed",
      );
      if (terminalOutcome) {
        status =
          terminalOutcome.status === "awaiting_review"
            ? WorkflowExecutionStatus.AwaitingReview
            : terminalOutcome.status === "canceled"
              ? WorkflowExecutionStatus.Canceled
              : WorkflowExecutionStatus.Failed;
        break;
      }
    }

    const finishedAt = now().toISOString();
    const totals = sumWorkflowUsage(nodeRuns);
    const execution = {
      id: workflowRunId,
      workflowId: request.definition.id,
      triggerKind: request.definition.trigger.kind,
      status,
      startedAt,
      finishedAt,
      durationMs: Math.max(
        0,
        new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      ),
      warningsCount: countNodeAlerts(nodeRuns, "warn"),
      errorsCount: countNodeAlerts(nodeRuns, "error"),
      totals,
      contextSessionId,
      nodeRuns,
    };
    request.onEvent?.({
      type:
        execution.status === WorkflowExecutionStatus.Failed ||
        execution.status === WorkflowExecutionStatus.Canceled
          ? WorkflowRuntimeEventType.WorkflowFailed
          : WorkflowRuntimeEventType.WorkflowCompleted,
      workflowId: execution.workflowId,
      workflowRunId,
      finishedAt,
      execution,
    });
    return execution;
  };

  return {
    runDefinition,
    runNode,
  };
};

type WorkflowNodeResult = {
  envelope: WorkflowContextEnvelope;
  outputSnapshot: unknown;
  usage?: WorkflowUsageTotalsRecord;
  alerts: ReadonlyArray<WorkflowAlertRecord>;
  guardrailFindings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
  failedByGuardrail: boolean;
  provider?: WorkflowProviderSelectionRecord;
};

type WorkflowStageNodeOutcome = {
  node: WorkflowNodeRecord;
  nodeRun: WorkflowNodeExecutionRecord;
  result?: WorkflowNodeResult;
  status: "completed" | "failed" | "canceled" | "awaiting_review";
};

const runWorkflowStageNode = async (input: {
  node: WorkflowNodeRecord;
  targetNodeId?: string;
  inputSource?: WorkflowNodeExecutionInputSourceRecord;
  definition: WorkflowDefinitionRecord;
  assetsById: Map<string, WorkflowAssetRecord>;
  workflowRunId: string;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
  now: () => Date;
  runProviderNode: (
    request: WorkflowProviderRunRequest,
  ) => Promise<WorkflowProviderRunResult>;
  runGovernedNode?: (
    request: GovernedNodeExecutionRequest,
  ) => Promise<WorkflowProviderRunResult>;
  runWorkflowInvocation: (node: WorkflowNodeRecord) => Promise<unknown>;
  signal?: AbortSignal;
  onEvent?: (event: WorkflowRuntimeEvent) => void;
}): Promise<WorkflowStageNodeOutcome> => {
  const startedAt = input.now().toISOString();
  input.onEvent?.({
    type: WorkflowRuntimeEventType.NodeStarted,
    workflowId: input.definition.id,
    workflowRunId: input.workflowRunId,
    nodeId: input.node.id,
    nodeKind: input.node.kind,
    label: input.node.label,
    startedAt,
  });
  const inputValue = readNodeExecutionInput({
    nodeId: input.node.id,
    ...(input.targetNodeId ? { targetNodeId: input.targetNodeId } : {}),
    ...(input.inputSource ? { inputSource: input.inputSource } : {}),
    edges: input.definition.edges,
    outputs: new Map(input.outputs),
    envelope: input.envelope,
  });
  if (input.node.kind === WorkflowNodeKind.HumanReview) {
    const finishedAt = input.now().toISOString();
    const nodeRun = createNodeRunRecord({
      node: input.node,
      startedAt,
      finishedAt,
      status: "awaiting_review",
      outputSnapshot: inputValue,
    });
    input.onEvent?.({
      type: WorkflowRuntimeEventType.NodeCompleted,
      workflowId: input.definition.id,
      workflowRunId: input.workflowRunId,
      nodeId: input.node.id,
      nodeKind: input.node.kind,
      label: input.node.label,
      status: "awaiting_review",
      startedAt,
      finishedAt,
      outputSnapshot: nodeRun.outputSnapshot,
      alerts: nodeRun.alerts,
      guardrailFindings: nodeRun.guardrailFindings,
    });
    return { node: input.node, nodeRun, status: "awaiting_review" };
  }
  try {
    const result = await executeWorkflowNode({
      node: input.node,
      inputValue,
      envelope: input.envelope,
      outputs: new Map(input.outputs),
      assetsById: input.assetsById,
      workflowRunId: input.workflowRunId,
      definition: input.definition,
      nodeStartedAt: startedAt,
      now: input.now,
      runProviderNode: input.runProviderNode,
      ...(input.runGovernedNode
        ? { runGovernedNode: input.runGovernedNode }
        : {}),
      runWorkflowInvocation: input.runWorkflowInvocation,
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.onEvent ? { onEvent: input.onEvent } : {}),
    });
    const status = result.failedByGuardrail ? "failed" : "completed";
    const finishedAt = input.now().toISOString();
    const nodeRun = createNodeRunRecord({
      node: input.node,
      startedAt,
      finishedAt,
      status,
      alerts: result.alerts,
      guardrailFindings: result.guardrailFindings,
      outputSnapshot: result.outputSnapshot,
      ...(result.provider ? { provider: result.provider } : {}),
      ...(result.usage ? { usage: result.usage } : {}),
    });
    input.onEvent?.({
      type: WorkflowRuntimeEventType.NodeCompleted,
      workflowId: input.definition.id,
      workflowRunId: input.workflowRunId,
      nodeId: input.node.id,
      nodeKind: input.node.kind,
      label: input.node.label,
      status,
      startedAt,
      finishedAt,
      outputSnapshot: nodeRun.outputSnapshot,
      alerts: nodeRun.alerts,
      guardrailFindings: nodeRun.guardrailFindings,
      ...(result.provider ? { provider: result.provider } : {}),
      ...(result.usage ? { usage: result.usage } : {}),
    });
    return { node: input.node, nodeRun, result, status };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Workflow node failed";
    const finishedAt = input.now().toISOString();
    const canceled = input.signal?.aborted === true;
    const nodeRun = createNodeRunRecord({
      node: input.node,
      startedAt,
      finishedAt,
      status: canceled ? "skipped" : "failed",
      alerts: [
        canceled
          ? createRuntimeCancelAlert(message)
          : createRuntimeAlert(message),
      ],
      guardrailFindings: [],
      outputSnapshot: { error: message },
    });
    if (!canceled) {
      input.onEvent?.({
        type: WorkflowRuntimeEventType.NodeFailed,
        workflowId: input.definition.id,
        workflowRunId: input.workflowRunId,
        nodeId: input.node.id,
        nodeKind: input.node.kind,
        label: input.node.label,
        startedAt,
        finishedAt,
        message,
      });
    }
    return {
      node: input.node,
      nodeRun,
      status: canceled ? "canceled" : "failed",
    };
  }
};

const mergeStageEnvelope = (
  base: WorkflowContextEnvelope,
  nodeEnvelope: WorkflowContextEnvelope,
): WorkflowContextEnvelope => {
  const artifact = nodeEnvelope.artifacts[base.artifacts.length];
  if (!artifact) {
    return base;
  }
  const message = nodeEnvelope.messages[base.messages.length];
  const citations = nodeEnvelope.citations.slice(base.citations.length);
  const guardrailFindings = nodeEnvelope.guardrailFindings.slice(
    base.guardrailFindings.length,
  );
  return appendEnvelopeOutput(base, {
    nodeId: artifact.nodeId,
    outputSnapshot: artifact.content,
    message: message?.content ?? "",
    citations,
    guardrailFindings,
  });
};

const executeWorkflowNode = async (input: {
  node: WorkflowNodeRecord;
  inputValue: unknown;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
  assetsById: Map<string, WorkflowAssetRecord>;
  workflowRunId: string;
  definition: WorkflowDefinitionRecord;
  nodeStartedAt: string;
  now: () => Date;
  runProviderNode: (
    request: WorkflowProviderRunRequest,
  ) => Promise<WorkflowProviderRunResult>;
  runGovernedNode?: (
    request: GovernedNodeExecutionRequest,
  ) => Promise<WorkflowProviderRunResult>;
  runWorkflowInvocation: (node: WorkflowNodeRecord) => Promise<unknown>;
  signal?: AbortSignal;
  onEvent?: (event: WorkflowRuntimeEvent) => void;
}): Promise<WorkflowNodeResult> => {
  if (input.node.kind === WorkflowNodeKind.TriggerManual) {
    const outputSnapshot = createTriggerExecutionOutput(input.nodeStartedAt);
    return {
      envelope: appendEnvelopeOutput(input.envelope, {
        nodeId: input.node.id,
        outputSnapshot,
        message: "",
        citations: [],
        guardrailFindings: [],
      }),
      outputSnapshot,
      alerts: [],
      guardrailFindings: [],
      failedByGuardrail: false,
    };
  }

  if (
    input.node.kind === WorkflowNodeKind.LogicCondition ||
    input.node.kind === WorkflowNodeKind.TerminalResponse
  ) {
    return {
      envelope: appendEnvelopeOutput(input.envelope, {
        nodeId: input.node.id,
        outputSnapshot: input.inputValue,
        message: readEnvelopeMessage(input.inputValue),
        citations: [],
        guardrailFindings: [],
      }),
      outputSnapshot: input.inputValue,
      alerts: [],
      guardrailFindings: [],
      failedByGuardrail: false,
    };
  }

  if (input.node.kind === WorkflowNodeKind.LogicMerge) {
    const outputSnapshot = mergeNodeInputs(
      MergePolicy.ObjectByNodeId,
      input.definition.edges
        .filter((edge) => edge.targetNodeId === input.node.id)
        .map((edge) => ({
          nodeId: edge.sourceNodeId,
          value: input.outputs.get(edge.sourceNodeId),
        })),
    );
    return {
      envelope: appendEnvelopeOutput(input.envelope, {
        nodeId: input.node.id,
        outputSnapshot,
        message: readEnvelopeMessage(outputSnapshot),
        citations: [],
        guardrailFindings: [],
      }),
      outputSnapshot,
      alerts: [],
      guardrailFindings: [],
      failedByGuardrail: false,
    };
  }

  if (input.node.kind === WorkflowNodeKind.WorkflowInvocation) {
    const outputSnapshot = await input.runWorkflowInvocation(input.node);
    return {
      envelope: appendEnvelopeOutput(input.envelope, {
        nodeId: input.node.id,
        outputSnapshot,
        message: readEnvelopeMessage(outputSnapshot),
        citations: [],
        guardrailFindings: [],
      }),
      outputSnapshot,
      alerts: [],
      guardrailFindings: [],
      failedByGuardrail: false,
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
        message:
          typeof assetOutput === "string"
            ? assetOutput
            : readEnvelopeMessage(assetOutput),
        citations: [],
        guardrailFindings: [],
      }),
      outputSnapshot: assetOutput,
      alerts: [],
      guardrailFindings: [],
      failedByGuardrail: false,
    };
  }

  if (
    input.node.kind === WorkflowNodeKind.AiProviderRun ||
    input.node.kind === WorkflowNodeKind.AiAgent
  ) {
    if (
      input.node.kind === WorkflowNodeKind.AiAgent &&
      input.node.config.skillId &&
      input.runGovernedNode
    ) {
      const governedResult = await input.runGovernedNode({
        node: input.node,
        inputValue: input.inputValue,
        workflowRunId: input.workflowRunId,
      });
      if (governedResult.outputText.trim().length > 0) {
        input.onEvent?.({
          type: WorkflowRuntimeEventType.NodeDelta,
          workflowId: input.definition.id,
          workflowRunId: input.workflowRunId,
          nodeId: input.node.id,
          delta: governedResult.outputText,
          emittedAt: input.now().toISOString(),
        });
      }
      const guardrailFindings = evaluateNodeGuardrails({
        node: input.node,
        inputValue: input.inputValue,
        outputSnapshot: governedResult.outputSnapshot,
        envelope: input.envelope,
        outputs: input.outputs,
        assetsById: input.assetsById,
      });
      const nextEnvelope = appendEnvelopeOutput(input.envelope, {
        nodeId: input.node.id,
        outputSnapshot: governedResult.outputSnapshot,
        message: governedResult.outputText,
        citations: governedResult.citations ?? [],
        guardrailFindings,
      });
      const usage = normalizeUsage(governedResult.usage);
      const guardrailAlerts = createGuardrailAlerts(
        guardrailFindings,
        input.now,
      );
      const failedByGuardrail = guardrailFindings.some(
        (finding) => finding.severity === WorkflowGuardrailSeverity.Error,
      );

      return {
        envelope: nextEnvelope,
        outputSnapshot: governedResult.outputSnapshot,
        alerts: [...(governedResult.alerts ?? []), ...guardrailAlerts],
        guardrailFindings,
        failedByGuardrail,
        ...(usage ? { usage } : {}),
      };
    }

    const provider = input.node.config.provider;
    if (!provider) {
      throw new Error(
        `Workflow node ${input.node.id} is missing provider configuration`,
      );
    }

    const providerRun = await runProviderWithOutputContract({
      definition: input.definition,
      workflowRunId: input.workflowRunId,
      node: input.node,
      provider,
      inputValue: input.inputValue,
      envelope: input.envelope,
      outputs: input.outputs,
      runProviderNode: input.runProviderNode,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (providerRun.result.outputText.trim().length > 0) {
      input.onEvent?.({
        type: WorkflowRuntimeEventType.NodeDelta,
        workflowId: input.definition.id,
        workflowRunId: input.workflowRunId,
        nodeId: input.node.id,
        delta: providerRun.result.outputText,
        emittedAt: input.now().toISOString(),
      });
    }
    const guardrailFindings = evaluateNodeGuardrails({
      node: input.node,
      inputValue: input.inputValue,
      outputSnapshot: providerRun.outputSnapshot,
      envelope: input.envelope,
      outputs: input.outputs,
      assetsById: input.assetsById,
    });
    const nextEnvelope = appendEnvelopeOutput(input.envelope, {
      nodeId: input.node.id,
      outputSnapshot: providerRun.outputSnapshot,
      message: providerRun.result.outputText,
      citations: providerRun.result.citations ?? [],
      guardrailFindings,
    });
    const usage = normalizeUsage(providerRun.result.usage);
    const guardrailAlerts = createGuardrailAlerts(guardrailFindings, input.now);
    const failedByGuardrail = guardrailFindings.some(
      (finding) => finding.severity === WorkflowGuardrailSeverity.Error,
    );

    return {
      envelope: nextEnvelope,
      outputSnapshot: providerRun.outputSnapshot,
      alerts: [...(providerRun.result.alerts ?? []), ...guardrailAlerts],
      guardrailFindings,
      failedByGuardrail,
      provider,
      ...(usage ? { usage } : {}),
    };
  }

  throw new Error(
    `Workflow node kind ${input.node.kind} is not supported in 06.6`,
  );
};

const runProviderWithOutputContract = async (input: {
  definition: WorkflowDefinitionRecord;
  workflowRunId: string;
  node: WorkflowNodeRecord;
  provider: WorkflowProviderSelectionRecord;
  inputValue: unknown;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
  runProviderNode: (
    request: WorkflowProviderRunRequest,
  ) => Promise<WorkflowProviderRunResult>;
  signal?: AbortSignal;
}): Promise<{
  result: WorkflowProviderRunResult;
  outputSnapshot: unknown;
}> => {
  const maxAttempts = input.definition.executionPolicy.maxNodeRetries + 1;
  let feedback: string | undefined;
  let lastValidationMessage = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = buildProviderPrompt(
      input.node,
      input.inputValue,
      input.envelope,
      input.outputs,
      feedback,
    );
    const providerResult = await input.runProviderNode({
      workflowId: input.definition.id,
      definition: input.definition,
      workflowRunId: input.workflowRunId,
      node: input.node,
      provider: input.provider,
      envelope: input.envelope,
      prompt,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const parsed = parseProviderOutput(providerResult, input.node);
    if (parsed.valid) {
      return {
        result: providerResult,
        outputSnapshot: parsed.outputSnapshot,
      };
    }

    lastValidationMessage = parsed.message;
    feedback = buildJsonContractRetryFeedback(parsed.message);
  }

  throw new Error(lastValidationMessage);
};

const createTriggerExecutionOutput = (
  executedAt: string,
): Record<"executedAt", string> => ({
  executedAt,
});

const buildProviderPrompt = (
  node: WorkflowNodeRecord,
  inputValue: unknown,
  envelope: WorkflowContextEnvelope,
  outputs: ReadonlyMap<string, unknown>,
  retryFeedback?: string,
): string => {
  const sections: string[] = [];
  const prompt = node.config.prompt?.trim();
  if (prompt) {
    sections.push(
      resolveWorkflowExpressionText({
        text: prompt,
        inputValue,
        envelope,
        outputs,
      }),
    );
  }

  if (node.outputContract) {
    sections.push(renderJsonContractForProvider(node.outputContract));
  }

  if (retryFeedback) {
    sections.push(retryFeedback);
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

const resolveWorkflowExpressionText = (input: {
  text: string;
  inputValue: unknown;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
}): string =>
  input.text.replace(
    WorkflowExpressionTokenPattern,
    (_match: string, kind: string, sourceId: string, path: string) =>
      formatWorkflowExpressionValue(
        resolveWorkflowExpressionValue({
          kind,
          sourceId,
          path,
          inputValue: input.inputValue,
          envelope: input.envelope,
          outputs: input.outputs,
        }),
      ),
  );

const resolveWorkflowExpressionValue = (input: {
  kind: string;
  sourceId: string;
  path: string;
  inputValue: unknown;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
}): unknown => {
  if (input.kind === WorkflowExpressionVariableKind.NodeOutput) {
    return readSourcePathValue(input.outputs.get(input.sourceId), input.path);
  }

  if (input.kind === WorkflowExpressionVariableKind.LastNodeOutput) {
    return readSourcePathValue(input.inputValue, input.path);
  }

  if (input.kind === WorkflowExpressionVariableKind.AccumulatedOutputs) {
    return readSourcePathValue(Object.fromEntries(input.outputs), input.path);
  }

  if (input.kind === WorkflowExpressionVariableKind.CurrentInput) {
    return readSourcePathValue(input.inputValue, input.path);
  }

  if (input.kind === WorkflowExpressionVariableKind.WorkflowContext) {
    return readSourcePathValue(input.envelope, input.path);
  }

  return undefined;
};

const formatWorkflowExpressionValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return serializeNodeInput(value);
};

const parseProviderOutput = (
  providerResult: WorkflowProviderRunResult,
  node: WorkflowNodeRecord,
):
  | {
      valid: true;
      outputSnapshot: unknown;
    }
  | {
      valid: false;
      message: string;
    } => {
  if (!node.outputContract) {
    return {
      valid: true,
      outputSnapshot:
        providerResult.outputSnapshot ?? providerResult.outputText,
    };
  }

  const jsonValue = readProviderJsonOutput(providerResult);
  if (!jsonValue.valid) {
    return jsonValue;
  }

  const validation = validateJsonOutputContract(
    node.outputContract,
    jsonValue.value,
  );
  return validation.valid
    ? {
        valid: true,
        outputSnapshot: validation.value,
      }
    : validation;
};

const readProviderJsonOutput = (
  providerResult: WorkflowProviderRunResult,
):
  | {
      valid: true;
      value: unknown;
    }
  | {
      valid: false;
      message: string;
    } => {
  if (providerResult.outputSnapshot !== undefined) {
    return {
      valid: true,
      value: providerResult.outputSnapshot,
    };
  }

  try {
    return {
      valid: true,
      value: JSON.parse(providerResult.outputText),
    };
  } catch {
    return {
      valid: false,
      message: "Provider output is not valid JSON.",
    };
  }
};

const validateJsonOutputContract = (
  contract: JsonOutputContractRecord,
  value: unknown,
):
  | {
      valid: true;
      value: unknown;
    }
  | {
      valid: false;
      message: string;
    } => {
  const schema = buildJsonSchemaZodType(contract.schema);
  const result = schema.safeParse(value);
  return result.success
    ? {
        valid: true,
        value: result.data,
      }
    : {
        valid: false,
        message: result.error.issues
          .map((issue) => `${formatZodIssuePath(issue.path)}: ${issue.message}`)
          .join(" "),
      };
};

const renderJsonContractForProvider = (
  contract: JsonOutputContractRecord,
): string =>
  [
    JsonContractPromptTitle,
    "Return only a JSON value that satisfies this contract. Do not wrap it in markdown.",
    JSON.stringify(contract.schema, null, 2),
  ].join("\n");

const buildJsonContractRetryFeedback = (message: string): string =>
  [
    JsonContractRetryTitle,
    message,
    "Return corrected JSON only, using the expected contract exactly.",
  ].join("\n");

const buildJsonSchemaZodType = (
  schema: JsonSchemaNodeRecord,
): ZodType<unknown> => {
  const baseType = buildJsonSchemaZodTypeCore(schema);
  return schema.nullable ? baseType.nullable() : baseType;
};

const buildJsonSchemaZodTypeCore = (
  schema: JsonSchemaNodeRecord,
): ZodType<unknown> => {
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const shape: Record<string, ZodType<unknown>> = {};
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      const propertyType = buildJsonSchemaZodType(value);
      shape[key] = required.has(key) ? propertyType : propertyType.optional();
    }

    return z.object(shape);
  }

  if (schema.type === "array") {
    return z.array(buildJsonSchemaZodType(schema.items ?? { type: "string" }));
  }

  if (schema.type === "integer") {
    return z.number().int();
  }

  if (schema.type === "number") {
    return z.number();
  }

  if (schema.type === "boolean") {
    return z.boolean();
  }

  if (schema.enum && schema.enum.length > 0) {
    return z.string().refine((value) => schema.enum?.includes(value) === true);
  }

  return z.string();
};

const formatZodIssuePath = (path: ReadonlyArray<PropertyKey>): string => {
  if (path.length === 0) {
    return "$";
  }

  return `$${path
    .map((segment) =>
      typeof segment === "number"
        ? `[${segment.toString()}]`
        : `.${String(segment)}`,
    )
    .join("")}`;
};

const renderEnvelopeForProvider = (
  envelope: WorkflowContextEnvelope,
): string => {
  const sections: string[] = [];

  if (envelope.summary.trim().length > 0) {
    sections.push(`Context summary:\n${envelope.summary}`);
  }

  if (envelope.objectives.length > 0) {
    sections.push(`Objectives:\n- ${envelope.objectives.join("\n- ")}`);
  }

  if (envelope.messages.length > 0) {
    sections.push(
      `Prior workflow messages:\n${envelope.messages
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n")}`,
    );
  }

  if (envelope.artifacts.length > 0) {
    sections.push(
      `Workflow artifacts:\n${envelope.artifacts
        .map(
          (artifact) =>
            `${artifact.nodeId}: ${serializeNodeInput(artifact.content)}`,
        )
        .join("\n")}`,
    );
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
  },
): WorkflowContextEnvelope => {
  const artifactKind: WorkflowContextEnvelope["artifacts"][number]["kind"] =
    typeof input.outputSnapshot === "string" ? "text_output" : "json_output";
  const artifacts = [
    ...envelope.artifacts,
    {
      id: randomUUID(),
      kind: artifactKind,
      nodeId: input.nodeId,
      content: input.outputSnapshot,
    },
  ].slice(-Math.max(1, envelope.artifacts.length + 1));
  const messages =
    input.message.trim().length === 0
      ? envelope.messages
      : [
          ...envelope.messages,
          {
            role: "assistant" as const,
            content: input.message,
            sourceNodeId: input.nodeId,
          },
        ];
  return {
    ...envelope,
    summary: buildEnvelopeSummary(input.message, envelope.summary),
    variables: {
      ...envelope.variables,
      [input.nodeId]: input.outputSnapshot,
    },
    artifacts,
    citations: [...envelope.citations, ...input.citations],
    guardrailFindings: [
      ...envelope.guardrailFindings,
      ...input.guardrailFindings,
    ],
    messages,
  };
};

const buildEnvelopeSummary = (
  latestMessage: string,
  previousSummary: string,
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
  assetsById: Map<string, WorkflowAssetRecord>,
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
  messages: [],
});

const seedEnvelopeOutputs = (
  envelope: WorkflowContextEnvelope,
  definition: WorkflowDefinitionRecord,
  outputs: ReadonlyMap<string, unknown>,
): WorkflowContextEnvelope => {
  let current = envelope;
  for (const node of sortWorkflowNodes(definition.nodes, definition.edges)) {
    const outputSnapshot = outputs.get(node.id);
    if (outputSnapshot === undefined) {
      continue;
    }

    current = appendEnvelopeOutput(current, {
      nodeId: node.id,
      outputSnapshot,
      message: readEnvelopeMessage(outputSnapshot),
      citations: [],
      guardrailFindings: [],
    });
  }

  return current;
};

const readNodeInput = (
  targetNodeId: string,
  edges: ReadonlyArray<WorkflowEdgeRecord>,
  outputs: Map<string, unknown>,
  envelope: WorkflowContextEnvelope,
): unknown => {
  const incomingEdges = edges.filter(
    (edge) => edge.targetNodeId === targetNodeId,
  );
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
        readMappingSourceValue({
          source: entry.source,
          edge,
          outputs,
          envelope,
        }),
      );
    }
  }

  return mapped;
};

const readNodeExecutionInput = (input: {
  nodeId: string;
  targetNodeId?: string;
  inputSource?: WorkflowNodeExecutionInputSourceRecord;
  edges: ReadonlyArray<WorkflowEdgeRecord>;
  outputs: Map<string, unknown>;
  envelope: WorkflowContextEnvelope;
}): unknown => {
  if (input.nodeId !== input.targetNodeId) {
    return readNodeInput(
      input.nodeId,
      input.edges,
      input.outputs,
      input.envelope,
    );
  }

  if (
    input.inputSource?.kind === WorkflowNodeExecutionInputSourceKind.NodeOutput
  ) {
    return input.outputs.get(input.inputSource.nodeId);
  }

  if (
    input.inputSource?.kind === WorkflowNodeExecutionInputSourceKind.AllPrevious
  ) {
    return Object.fromEntries(input.outputs.entries());
  }

  return readNodeInput(
    input.nodeId,
    input.edges,
    input.outputs,
    input.envelope,
  );
};

const renderTemplateMapping = (
  edge: WorkflowEdgeRecord,
  outputs: Map<string, unknown>,
  envelope: WorkflowContextEnvelope,
): string =>
  edge.mapping.entries
    .map((entry) =>
      serializeNodeInput(
        readMappingSourceValue({
          source: entry.source,
          edge,
          outputs,
          envelope,
        }),
      ),
    )
    .filter((value) => value.length > 0)
    .join("\n");

const selectNodeExecutionNodes = (input: {
  definition: WorkflowDefinitionRecord;
  nodeId: string;
  inputSource: WorkflowNodeExecutionInputSourceRecord;
  seedNodeIds?: ReadonlyArray<string>;
}): ReadonlyArray<WorkflowNodeRecord> => {
  const sourceNodeIds = readRequiredSourceNodeIds(input);
  const selectedNodeIds = new Set<string>([input.nodeId]);
  const seedNodeIds = new Set(input.seedNodeIds ?? []);
  for (const sourceNodeId of sourceNodeIds) {
    collectAncestorNodeIds(
      sourceNodeId,
      input.definition.edges,
      selectedNodeIds,
      seedNodeIds,
    );
  }

  return sortWorkflowNodes(
    input.definition.nodes,
    input.definition.edges,
  ).filter((node) => selectedNodeIds.has(node.id) && !seedNodeIds.has(node.id));
};

const readRequiredSourceNodeIds = (input: {
  definition: WorkflowDefinitionRecord;
  nodeId: string;
  inputSource: WorkflowNodeExecutionInputSourceRecord;
}): ReadonlyArray<string> => {
  if (
    input.inputSource.kind === WorkflowNodeExecutionInputSourceKind.NodeOutput
  ) {
    return [input.inputSource.nodeId];
  }

  return input.definition.edges
    .filter((edge) => edge.targetNodeId === input.nodeId)
    .map((edge) => edge.sourceNodeId);
};

const collectAncestorNodeIds = (
  nodeId: string,
  edges: ReadonlyArray<WorkflowEdgeRecord>,
  selectedNodeIds: Set<string>,
  seedNodeIds: ReadonlySet<string>,
): void => {
  if (selectedNodeIds.has(nodeId)) {
    return;
  }

  selectedNodeIds.add(nodeId);
  if (seedNodeIds.has(nodeId)) {
    return;
  }

  for (const edge of edges.filter(
    (candidate) => candidate.targetNodeId === nodeId,
  )) {
    collectAncestorNodeIds(
      edge.sourceNodeId,
      edges,
      selectedNodeIds,
      seedNodeIds,
    );
  }
};

const readMappingSourceValue = (input: {
  source: WorkflowEdgeRecord["mapping"]["entries"][number]["source"];
  edge: WorkflowEdgeRecord;
  outputs: Map<string, unknown>;
  envelope: WorkflowContextEnvelope;
}): unknown => {
  const source = input.source;
  if (source.kind === "literal") {
    return source.value;
  }

  if (source.kind === "context_value") {
    return readPathValue(
      input.envelope.variables,
      normalizeTargetPath(source.path),
    );
  }

  if (source.kind === "last_node_output") {
    return readSourcePathValue(
      input.outputs.get(input.edge.sourceNodeId),
      source.path,
    );
  }

  if (source.kind === "accumulated_outputs") {
    return readSourcePathValue(Object.fromEntries(input.outputs), source.path);
  }

  const nodeOutput = source.nodeId
    ? input.outputs.get(source.nodeId)
    : undefined;

  return readSourcePathValue(nodeOutput, source.path);
};

const readSourcePathValue = (value: unknown, path: string | undefined) => {
  if (!path) {
    return value;
  }

  return readPathValue(value, normalizeTargetPath(path));
};

const normalizeTargetPath = (value?: string): ReadonlyArray<string> => {
  if (!value) {
    return [];
  }

  return value
    .replace(/^\$\./u, "")
    .replace(/^\$/u, "")
    .replace(/\[(\d+)\]/gu, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const readPathValue = (
  value: unknown,
  path: ReadonlyArray<string>,
): unknown => {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }

      current = current[index];
      continue;
    }

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
  value: unknown,
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

const readExecutionStages = (
  definition: WorkflowDefinitionRecord,
  executionPlan?: ExecutionPlan,
): ReadonlyArray<ReadonlyArray<WorkflowNodeRecord>> => {
  if (executionPlan) {
    const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
    return executionPlan.stages.map((stage) =>
      stage.flatMap((nodeId) => {
        const node = nodesById.get(nodeId);
        return node ? [node] : [];
      }),
    );
  }
  return readDeterministicExecutionNodes(definition).map((node) => [node]);
};

const readDeterministicExecutionNodes = (
  definition: WorkflowDefinitionRecord,
): ReadonlyArray<WorkflowNodeRecord> => {
  try {
    const graph = adaptLegacyWorkflowDefinition(definition);
    const plan = buildExecutionPlan(graph);
    const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
    return plan.stages.flatMap((stage) =>
      stage.flatMap((nodeId) => {
        const node = nodesById.get(nodeId);
        return node ? [node] : [];
      }),
    );
  } catch {
    return sortWorkflowNodes(definition.nodes, definition.edges);
  }
};

const sortWorkflowNodes = (
  nodes: ReadonlyArray<WorkflowNodeRecord>,
  edges: ReadonlyArray<WorkflowEdgeRecord>,
): ReadonlyArray<WorkflowNodeRecord> => {
  const inDegree = new Map<string, number>(
    nodes.map((node) => [node.id, 0] as const),
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
  usage?: Partial<WorkflowUsageTotalsRecord>,
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
      : {}),
  };
};

const sumWorkflowUsage = (
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>,
): WorkflowUsageTotalsRecord =>
  nodeRuns.reduce<WorkflowUsageTotalsRecord>(
    (totals, nodeRun) => ({
      promptTokens: totals.promptTokens + (nodeRun.usage?.promptTokens ?? 0),
      completionTokens:
        totals.completionTokens + (nodeRun.usage?.completionTokens ?? 0),
      totalTokens: totals.totalTokens + (nodeRun.usage?.totalTokens ?? 0),
      estimatedCostEur:
        totals.estimatedCostEur + (nodeRun.usage?.estimatedCostEur ?? 0),
      latencyMs: totals.latencyMs + (nodeRun.usage?.latencyMs ?? 0),
    }),
    {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostEur: 0,
      latencyMs: 0,
    },
  );

const countNodeAlerts = (
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>,
  level: WorkflowAlertRecord["level"],
): number =>
  nodeRuns.reduce<number>(
    (count, nodeRun) =>
      count + nodeRun.alerts.filter((alert) => alert.level === level).length,
    0,
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
    new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime(),
  ),
  ...(input.provider
    ? {
        providerId: input.provider.providerId,
        modelId: input.provider.modelId,
        reasoningLevel: input.provider.reasoningLevel,
        temperature: input.provider.temperature,
        verbosity: input.provider.verbosity,
      }
    : {}),
  ...(input.usage ? { usage: input.usage } : {}),
  alerts: input.alerts ?? [],
  guardrailFindings: input.guardrailFindings ?? [],
  outputSnapshot: input.outputSnapshot,
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
  createdAt: new Date().toISOString(),
});

const createRuntimeCancelAlert = (message: string): WorkflowAlertRecord => ({
  id: randomUUID(),
  level: "info",
  source: "system",
  message,
  createdAt: new Date().toISOString(),
});

const evaluateNodeGuardrails = (input: {
  node: WorkflowNodeRecord;
  inputValue: unknown;
  outputSnapshot: unknown;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
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
          envelope: input.envelope,
          outputs: input.outputs,
        }),
      );
      const matched =
        definition.operator === WorkflowGuardrailOperator.Any
          ? results.some(Boolean)
          : results.every(Boolean);
      const shouldReport =
        definition.severity === WorkflowGuardrailSeverity.Error
          ? !matched
          : matched;

      return shouldReport
        ? [
            {
              guardrailAssetId: attachment.assetId,
              nodeId: input.node.id,
              severity: definition.severity,
              message: readGuardrailFindingMessage(definition.validations),
            },
          ]
        : [];
    });

const evaluateGuardrailValidation = (input: {
  validation: NonNullable<
    WorkflowAssetRecord["guardrail"]
  >["validations"][number];
  inputValue: unknown;
  outputSnapshot: unknown;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
}): boolean => {
  const targetValue = readGuardrailTargetValue({
    target: input.validation.target,
    inputValue: input.inputValue,
    outputSnapshot: input.outputSnapshot,
    envelope: input.envelope,
  });
  const resolvedValue =
    input.validation.kind === "contains" ||
    input.validation.kind === "not_contains"
      ? targetValue
      : readPathValue(targetValue, normalizeTargetPath(input.validation.path));

  if (input.validation.kind === "field_exists") {
    return resolvedValue !== undefined;
  }

  if (input.validation.kind === "field_equals") {
    return resolvedValue === resolveGuardrailValidationValue(input);
  }

  if (input.validation.kind === "contains") {
    const validationValue = resolveGuardrailValidationValue(input);
    return (
      typeof resolvedValue === "string" &&
      typeof validationValue === "string" &&
      resolvedValue.includes(validationValue)
    );
  }

  if (input.validation.kind === "not_contains") {
    const validationValue = resolveGuardrailValidationValue(input);
    return (
      typeof resolvedValue === "string" &&
      typeof validationValue === "string" &&
      !resolvedValue.includes(validationValue)
    );
  }

  if (input.validation.kind === "regex") {
    const validationValue = resolveGuardrailValidationValue(input);
    if (
      typeof resolvedValue !== "string" ||
      typeof validationValue !== "string"
    ) {
      return false;
    }

    try {
      return new RegExp(validationValue, "u").test(resolvedValue);
    } catch {
      return false;
    }
  }

  if (input.validation.kind === "number_gte") {
    const validationValue = resolveGuardrailValidationValue(input);
    return (
      typeof resolvedValue === "number" &&
      typeof validationValue === "number" &&
      resolvedValue >= validationValue
    );
  }

  if (input.validation.kind === "number_lte") {
    const validationValue = resolveGuardrailValidationValue(input);
    return (
      typeof resolvedValue === "number" &&
      typeof validationValue === "number" &&
      resolvedValue <= validationValue
    );
  }

  if (input.validation.kind === "json_schema") {
    return isRecord(resolvedValue);
  }

  return false;
};

const resolveGuardrailValidationValue = (input: {
  validation: NonNullable<
    WorkflowAssetRecord["guardrail"]
  >["validations"][number];
  inputValue: unknown;
  outputSnapshot: unknown;
  envelope: WorkflowContextEnvelope;
  outputs: ReadonlyMap<string, unknown>;
}): unknown =>
  typeof input.validation.value === "string"
    ? resolveWorkflowExpressionText({
        text: input.validation.value,
        inputValue: input.inputValue,
        envelope: input.envelope,
        outputs: input.outputs,
      })
    : input.validation.value;

const readGuardrailTargetValue = (input: {
  target: NonNullable<
    WorkflowAssetRecord["guardrail"]
  >["validations"][number]["target"];
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
      language: input.envelope.language,
    };
  }

  return input.outputSnapshot;
};

const readGuardrailFindingMessage = (
  validations: NonNullable<WorkflowAssetRecord["guardrail"]>["validations"],
): string => validations[0]?.message ?? "Guardrail matched.";

const createGuardrailAlerts = (
  findings: ReadonlyArray<WorkflowGuardrailFindingRecord>,
  nowFactory: () => Date,
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
            createdAt: nowFactory().toISOString(),
          },
        ],
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
