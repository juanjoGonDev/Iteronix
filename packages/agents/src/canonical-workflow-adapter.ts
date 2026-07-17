import {
  CanonicalNodeKind,
  MergePolicy,
  PortDataType,
  WorkflowTriggerBoundary,
  type CanonicalNodeContract,
  type CanonicalWorkflowGraph,
  type CanonicalWorkflowNode,
} from "../../domain/src/workflow-contracts";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  type WorkflowDefinitionRecord,
  type WorkflowNodeRecord,
} from "../../shared/src/workflows";

const DefaultConcurrencyLimit = 1;

export const adaptLegacyWorkflowDefinition = (
  definition: WorkflowDefinitionRecord,
): CanonicalWorkflowGraph => ({
  id: definition.id,
  version: definition.version,
  status: adaptWorkflowStatus(definition.status),
  triggerBoundary: adaptTriggerBoundary(definition.trigger.kind),
  triggerEnabled: definition.trigger.enabled,
  inputType: PortDataType.Json,
  outputType: PortDataType.Json,
  concurrencyLimit:
    definition.executionPolicy.maxConcurrency ?? DefaultConcurrencyLimit,
  nodes: definition.nodes.map(adaptLegacyWorkflowNode),
  edges: definition.edges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    sourcePortId: edge.sourcePortId,
    targetNodeId: edge.targetNodeId,
    targetPortId: edge.targetPortId,
  })),
});

const adaptWorkflowStatus = (
  status: WorkflowRecordStatus,
): CanonicalWorkflowGraph["status"] => {
  if (status === WorkflowRecordStatus.Published) {
    return "published";
  }
  if (status === WorkflowRecordStatus.Archived) {
    return "archived";
  }
  return "draft";
};

const adaptTriggerBoundary = (
  triggerKind: WorkflowTriggerKind,
): WorkflowTriggerBoundary => {
  if (triggerKind === WorkflowTriggerKind.Webhook) {
    return WorkflowTriggerBoundary.ExternalApi;
  }
  if (triggerKind === WorkflowTriggerKind.Event) {
    throw new Error("Unsupported legacy workflow trigger kind: event");
  }
  return WorkflowTriggerBoundary.Manual;
};

const adaptLegacyWorkflowNode = (
  node: WorkflowNodeRecord,
): CanonicalWorkflowNode => {
  const kind = adaptLegacyNodeKind(node.kind);
  return {
    id: node.id,
    kind,
    inputPorts: node.inputPorts.map((port) => ({
      id: port.id,
      dataType: PortDataType.Json,
      acceptsMany: port.acceptsMany,
    })),
    outputPorts: node.outputPorts.map((port) => ({
      id: port.id,
      dataType: PortDataType.Json,
      acceptsMany: port.acceptsMany,
    })),
    contract: adaptLegacyNodeContract(kind, node),
  };
};

const adaptLegacyNodeKind = (kind: WorkflowNodeKind): CanonicalNodeKind => {
  if (
    kind === WorkflowNodeKind.AssetPrompt ||
    kind === WorkflowNodeKind.AssetInstruction ||
    kind === WorkflowNodeKind.AiAgent ||
    kind === WorkflowNodeKind.AiProviderRun
  ) {
    return CanonicalNodeKind.AgentInvocation;
  }
  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return CanonicalNodeKind.Guardrail;
  }
  if (kind === WorkflowNodeKind.LogicMerge) {
    return CanonicalNodeKind.Merge;
  }
  if (kind === WorkflowNodeKind.WorkflowInvocation) {
    return CanonicalNodeKind.WorkflowInvocation;
  }
  if (kind === WorkflowNodeKind.LogicCondition) {
    return CanonicalNodeKind.SchemaValidation;
  }
  if (kind === WorkflowNodeKind.HumanReview) {
    return CanonicalNodeKind.Terminal;
  }
  if (kind === WorkflowNodeKind.TerminalResponse) {
    return CanonicalNodeKind.Terminal;
  }
  if (kind === WorkflowNodeKind.TriggerManual) {
    return CanonicalNodeKind.ExternalTrigger;
  }
  throw new Error(`Unsupported legacy workflow node kind: ${kind}`);
};

const adaptLegacyNodeContract = (
  kind: CanonicalNodeKind,
  node: WorkflowNodeRecord,
): CanonicalNodeContract => {
  if (kind === CanonicalNodeKind.AgentInvocation) {
    return {
      kind,
      ...(node.config.provider?.providerId
        ? { agentId: node.config.provider.providerId }
        : {}),
    };
  }
  if (kind === CanonicalNodeKind.SchemaValidation) {
    return { kind };
  }
  if (kind === CanonicalNodeKind.WorkflowInvocation) {
    const invocation = node.config.workflowInvocation;
    if (!invocation) {
      throw new Error(`Workflow node ${node.id} is missing invocation pin`);
    }
    return {
      kind,
      workflowId: invocation.workflowId,
      workflowVersion: invocation.workflowVersion,
      inputType: PortDataType.Json,
      outputType: PortDataType.Json,
    };
  }
  if (kind === CanonicalNodeKind.Guardrail) {
    return {
      kind,
      ...(node.config.assetId ? { guardrailId: node.config.assetId } : {}),
    };
  }
  if (kind === CanonicalNodeKind.Merge) {
    return { kind, policy: MergePolicy.ObjectByNodeId };
  }
  if (kind === CanonicalNodeKind.ExternalTrigger) {
    return { kind };
  }
  if (kind === CanonicalNodeKind.Terminal) {
    return { kind };
  }
  throw new Error(`Unsupported canonical workflow node kind: ${kind}`);
};
