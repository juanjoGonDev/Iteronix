export const CanonicalNodeKind = {
  AgentInvocation: "agent.invocation",
  ExternalTrigger: "external.trigger",
  Guardrail: "guardrail",
  Merge: "merge",
  SchemaValidation: "schema.validation",
  Terminal: "terminal",
  WorkflowInvocation: "workflow.invocation",
} as const;

export type CanonicalNodeKind =
  (typeof CanonicalNodeKind)[keyof typeof CanonicalNodeKind];

export const PortDataType = {
  Boolean: "boolean",
  Json: "json",
  Number: "number",
  Text: "text",
} as const;

export type PortDataType = (typeof PortDataType)[keyof typeof PortDataType];

export const MergePolicy = {
  ArrayByNodeId: "array-by-node-id",
  FirstByNodeId: "first-by-node-id",
  ObjectByNodeId: "object-by-node-id",
} as const;

export type MergePolicy = (typeof MergePolicy)[keyof typeof MergePolicy];

export const WorkflowTriggerBoundary = {
  ExternalApi: "external-api",
  Manual: "manual",
} as const;

export type WorkflowTriggerBoundary =
  (typeof WorkflowTriggerBoundary)[keyof typeof WorkflowTriggerBoundary];

export const RetryClassification = {
  Canceled: "canceled",
  NonRetryable: "non-retryable",
  Retryable: "retryable",
} as const;

export type RetryClassification =
  (typeof RetryClassification)[keyof typeof RetryClassification];

export const ExternalInvocationFailure = {
  NotPublished: "not-published",
  NotScoped: "not-scoped",
  TriggerDisabled: "trigger-disabled",
  TriggerNotExternal: "trigger-not-external",
  VersionNotPinned: "version-not-pinned",
} as const;

export type ExternalInvocationFailure =
  (typeof ExternalInvocationFailure)[keyof typeof ExternalInvocationFailure];

export type CanonicalPort = {
  id: string;
  dataType: PortDataType;
  acceptsMany?: boolean;
};

export type CanonicalNodeContract =
  | {
      kind: "agent.invocation";
      agentId?: string;
      prompt?: import("./prompt-assets").PinnedPromptReference;
    }
  | {
      kind: "workflow.invocation";
      workflowId: string;
      workflowVersion: number;
      inputType: PortDataType;
      outputType: PortDataType;
    }
  | { kind: "schema.validation"; schemaId?: string }
  | { kind: "guardrail"; guardrailId?: string }
  | { kind: "merge"; policy?: MergePolicy }
  | { kind: "external.trigger" }
  | { kind: "terminal" };

export type CanonicalWorkflowNode = {
  id: string;
  kind: CanonicalNodeKind;
  inputPorts: ReadonlyArray<CanonicalPort>;
  outputPorts: ReadonlyArray<CanonicalPort>;
  contract: CanonicalNodeContract;
};

export type CanonicalWorkflowEdge = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
};

export type CanonicalWorkflowGraph = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  triggerBoundary: WorkflowTriggerBoundary;
  triggerEnabled: boolean;
  inputType: PortDataType;
  outputType: PortDataType;
  concurrencyLimit: number;
  nodes: ReadonlyArray<CanonicalWorkflowNode>;
  edges: ReadonlyArray<CanonicalWorkflowEdge>;
};

export type WorkflowRunContext = {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  input: unknown;
  cancellationRequested: boolean;
};

export type WorkflowExecutionEvent = {
  kind: "node-started" | "node-completed" | "node-failed" | "run-canceled";
  runId: string;
  nodeId?: string;
  sequence: number;
};

export type PersistedWorkflowRunSnapshot = {
  run: WorkflowRunContext;
  events: ReadonlyArray<WorkflowExecutionEvent>;
  completedNodeIds: ReadonlyArray<string>;
};

export type WorkflowGraphValidationIssue = {
  code:
    | "edge.port-type-incompatible"
    | "edge.source-node-missing"
    | "edge.source-port-missing"
    | "edge.target-node-missing"
    | "edge.target-port-cardinality"
    | "edge.target-port-missing"
    | "graph.cycle"
    | "graph.terminal-unreachable"
    | "graph.unreachable-node"
    | "node.contract-kind-mismatch";
  edgeId?: string;
  nodeId?: string;
};

export type WorkflowReferenceValidationIssue = {
  code:
    | "workflow-reference.input-incompatible"
    | "workflow-reference.input-port-incompatible"
    | "workflow-reference.missing"
    | "workflow-reference.output-incompatible"
    | "workflow-reference.output-port-incompatible"
    | "workflow-reference.recursive"
    | "workflow-reference.version-missing";
  nodeId: string;
};

export type ExecutionPlan = {
  stages: ReadonlyArray<ReadonlyArray<string>>;
  maxParallelism: number;
};

export type NodeInput = {
  nodeId: string;
  value: unknown;
};

export type ExecutionFailure =
  | { kind: "canceled" }
  | { kind: "provider"; statusCode?: number }
  | { kind: "validation" }
  | { kind: "unknown" };

export const validateWorkflowGraph = (
  graph: CanonicalWorkflowGraph,
): ReadonlyArray<WorkflowGraphValidationIssue> => [
  ...validateNodeContracts(graph.nodes),
  ...validateEdges(graph),
  ...validateTopology(graph),
];

export const buildExecutionPlan = (
  graph: CanonicalWorkflowGraph,
): ExecutionPlan => {
  const issues = validateWorkflowGraph(graph);
  if (issues.length > 0) {
    throw new Error("Workflow graph is invalid.");
  }

  const predecessorCounts = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    predecessorCounts.set(
      edge.targetNodeId,
      (predecessorCounts.get(edge.targetNodeId) ?? 0) + 1,
    );
  }

  const edgesBySource = createEdgesBySource(graph.edges);
  const stages: string[][] = [];
  let ready = graph.nodes
    .filter((node) => predecessorCounts.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  let maxParallelism = 0;

  while (ready.length > 0) {
    const next = new Set<string>();
    for (const stage of chunkReadyNodes(ready, graph.concurrencyLimit)) {
      stages.push(stage);
      maxParallelism = Math.max(maxParallelism, stage.length);
      for (const nodeId of stage) {
        for (const edge of edgesBySource.get(nodeId) ?? []) {
          const remaining = (predecessorCounts.get(edge.targetNodeId) ?? 1) - 1;
          predecessorCounts.set(edge.targetNodeId, remaining);
          if (remaining === 0) {
            next.add(edge.targetNodeId);
          }
        }
      }
    }
    ready = Array.from(next).sort();
  }

  return {
    stages,
    maxParallelism,
  };
};

export const mergeNodeInputs = (
  policy: MergePolicy,
  inputs: ReadonlyArray<NodeInput>,
): unknown => {
  const sortedInputs = [...inputs].sort((left, right) =>
    left.nodeId.localeCompare(right.nodeId),
  );
  if (policy === MergePolicy.ArrayByNodeId) {
    return sortedInputs.map((input) => input.value);
  }
  if (policy === MergePolicy.FirstByNodeId) {
    return sortedInputs[0]?.value;
  }
  return Object.fromEntries(
    sortedInputs.map((input) => [input.nodeId, input.value]),
  );
};

export const classifyExecutionFailure = (
  failure: ExecutionFailure,
): RetryClassification => {
  if (failure.kind === "canceled") {
    return RetryClassification.Canceled;
  }
  if (
    failure.kind === "provider" &&
    (failure.statusCode === 408 ||
      failure.statusCode === 409 ||
      failure.statusCode === 429 ||
      (failure.statusCode !== undefined && failure.statusCode >= 500))
  ) {
    return RetryClassification.Retryable;
  }
  return RetryClassification.NonRetryable;
};

export const validateReusableWorkflowReferences = (
  graph: CanonicalWorkflowGraph,
  availableGraphs: ReadonlyArray<CanonicalWorkflowGraph>,
): ReadonlyArray<WorkflowReferenceValidationIssue> => {
  const graphsByVersion = new Map(
    availableGraphs.map((candidate) => [
      createWorkflowVersionKey(candidate.id, candidate.version),
      candidate,
    ]),
  );
  const issues: WorkflowReferenceValidationIssue[] = [];
  const references = graph.nodes
    .filter(isWorkflowInvocationNode)
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const node of references) {
    const target = graphsByVersion.get(
      createWorkflowVersionKey(
        node.contract.workflowId,
        node.contract.workflowVersion,
      ),
    );
    if (!target) {
      issues.push({
        code: "workflow-reference.version-missing",
        nodeId: node.id,
      });
      continue;
    }
    if (node.contract.inputType !== target.inputType) {
      issues.push({
        code: "workflow-reference.input-incompatible",
        nodeId: node.id,
      });
    }
    if (
      node.inputPorts.some((port) => port.dataType !== node.contract.inputType)
    ) {
      issues.push({
        code: "workflow-reference.input-port-incompatible",
        nodeId: node.id,
      });
    }
    if (node.contract.outputType !== target.outputType) {
      issues.push({
        code: "workflow-reference.output-incompatible",
        nodeId: node.id,
      });
    }
    if (
      node.outputPorts.some(
        (port) => port.dataType !== node.contract.outputType,
      )
    ) {
      issues.push({
        code: "workflow-reference.output-port-incompatible",
        nodeId: node.id,
      });
    }
    if (hasWorkflowRecursion(graph, target, graphsByVersion, new Set())) {
      issues.push({ code: "workflow-reference.recursive", nodeId: node.id });
    }
  }
  return issues;
};

export const validateExternalWorkflowInvocation = (input: {
  graph: CanonicalWorkflowGraph;
  requestedVersion: number;
  verifiedApiKey: ExternalApiKeyRecord;
}): { ok: true } | { ok: false; failure: ExternalInvocationFailure } => {
  if (input.graph.status !== "published") {
    return { ok: false, failure: ExternalInvocationFailure.NotPublished };
  }
  if (input.graph.triggerBoundary !== WorkflowTriggerBoundary.ExternalApi) {
    return { ok: false, failure: ExternalInvocationFailure.TriggerNotExternal };
  }
  if (!input.graph.triggerEnabled) {
    return { ok: false, failure: ExternalInvocationFailure.TriggerDisabled };
  }
  if (input.graph.version !== input.requestedVersion) {
    return { ok: false, failure: ExternalInvocationFailure.VersionNotPinned };
  }
  if (
    !isWorkflowAllowedForExternalApiKey(input.verifiedApiKey, input.graph.id)
  ) {
    return { ok: false, failure: ExternalInvocationFailure.NotScoped };
  }
  return { ok: true };
};

const validateNodeContracts = (
  nodes: ReadonlyArray<CanonicalWorkflowNode>,
): ReadonlyArray<WorkflowGraphValidationIssue> =>
  nodes
    .filter((node) => node.kind !== node.contract.kind)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => ({ code: "node.contract-kind-mismatch", nodeId: node.id }));

const validateEdges = (
  graph: CanonicalWorkflowGraph,
): ReadonlyArray<WorkflowGraphValidationIssue> => {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return [
    ...graph.edges.flatMap((edge) => validateEdge(edge, nodesById)),
    ...validateInputCardinality(graph, nodesById),
  ];
};

const validateInputCardinality = (
  graph: CanonicalWorkflowGraph,
  nodesById: ReadonlyMap<string, CanonicalWorkflowNode>,
): ReadonlyArray<WorkflowGraphValidationIssue> =>
  Array.from(nodesById.values()).flatMap((node) =>
    node.inputPorts
      .filter((port) => !port.acceptsMany)
      .filter(
        (port) =>
          graph.edges.filter(
            (edge) =>
              edge.targetNodeId === node.id && edge.targetPortId === port.id,
          ).length > 1,
      )
      .map(() => ({
        code: "edge.target-port-cardinality" as const,
        nodeId: node.id,
      })),
  );

const validateEdge = (
  edge: CanonicalWorkflowEdge,
  nodesById: ReadonlyMap<string, CanonicalWorkflowNode>,
): ReadonlyArray<WorkflowGraphValidationIssue> => {
  const source = nodesById.get(edge.sourceNodeId);
  if (!source) {
    return [{ code: "edge.source-node-missing", edgeId: edge.id }];
  }
  const target = nodesById.get(edge.targetNodeId);
  if (!target) {
    return [{ code: "edge.target-node-missing", edgeId: edge.id }];
  }
  const sourcePort = source.outputPorts.find(
    (port) => port.id === edge.sourcePortId,
  );
  if (!sourcePort) {
    return [{ code: "edge.source-port-missing", edgeId: edge.id }];
  }
  const targetPort = target.inputPorts.find(
    (port) => port.id === edge.targetPortId,
  );
  if (!targetPort) {
    return [{ code: "edge.target-port-missing", edgeId: edge.id }];
  }
  if (sourcePort.dataType !== targetPort.dataType) {
    return [{ code: "edge.port-type-incompatible", edgeId: edge.id }];
  }
  return [];
};

const validateTopology = (
  graph: CanonicalWorkflowGraph,
): ReadonlyArray<WorkflowGraphValidationIssue> => {
  const edgesBySource = createEdgesBySource(graph.edges);
  const starts = graph.nodes
    .filter((node) => node.kind === CanonicalNodeKind.ExternalTrigger)
    .map((node) => node.id);
  const reachable = readReachableNodeIds(starts, edgesBySource);
  const issues: WorkflowGraphValidationIssue[] = [];
  if (
    hasCycle(
      graph.nodes.map((node) => node.id),
      edgesBySource,
    )
  ) {
    issues.push({ code: "graph.cycle" });
  }
  if (reachable.size !== graph.nodes.length) {
    issues.push({ code: "graph.unreachable-node" });
  }
  if (
    !graph.nodes.some(
      (node) =>
        node.kind === CanonicalNodeKind.Terminal && reachable.has(node.id),
    )
  ) {
    issues.push({ code: "graph.terminal-unreachable" });
  }
  return issues;
};

const createEdgesBySource = (
  edges: ReadonlyArray<CanonicalWorkflowEdge>,
): ReadonlyMap<string, ReadonlyArray<CanonicalWorkflowEdge>> => {
  const grouped = new Map<string, CanonicalWorkflowEdge[]>();
  for (const edge of edges) {
    const nodeEdges = grouped.get(edge.sourceNodeId) ?? [];
    nodeEdges.push(edge);
    grouped.set(edge.sourceNodeId, nodeEdges);
  }
  for (const nodeEdges of grouped.values()) {
    nodeEdges.sort((left, right) =>
      left.targetNodeId.localeCompare(right.targetNodeId),
    );
  }
  return grouped;
};

const chunkReadyNodes = (
  nodeIds: ReadonlyArray<string>,
  concurrencyLimit: number,
): Array<Array<string>> => {
  const chunks: string[][] = [];
  for (let index = 0; index < nodeIds.length; index += concurrencyLimit) {
    chunks.push(nodeIds.slice(index, index + concurrencyLimit));
  }
  return chunks;
};

const readReachableNodeIds = (
  starts: ReadonlyArray<string>,
  edgesBySource: ReadonlyMap<string, ReadonlyArray<CanonicalWorkflowEdge>>,
): ReadonlySet<string> => {
  const reachable = new Set(starts);
  const pending = [...starts];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) {
      continue;
    }
    for (const edge of edgesBySource.get(current) ?? []) {
      if (!reachable.has(edge.targetNodeId)) {
        reachable.add(edge.targetNodeId);
        pending.push(edge.targetNodeId);
      }
    }
  }
  return reachable;
};

const hasCycle = (
  nodeIds: ReadonlyArray<string>,
  edgesBySource: ReadonlyMap<string, ReadonlyArray<CanonicalWorkflowEdge>>,
): boolean => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  return nodeIds.some((nodeId) =>
    hasCycleFrom(nodeId, edgesBySource, visiting, visited),
  );
};

const hasCycleFrom = (
  nodeId: string,
  edgesBySource: ReadonlyMap<string, ReadonlyArray<CanonicalWorkflowEdge>>,
  visiting: Set<string>,
  visited: Set<string>,
): boolean => {
  if (visiting.has(nodeId)) {
    return true;
  }
  if (visited.has(nodeId)) {
    return false;
  }
  visiting.add(nodeId);
  const cycleFound = (edgesBySource.get(nodeId) ?? []).some((edge) =>
    hasCycleFrom(edge.targetNodeId, edgesBySource, visiting, visited),
  );
  visiting.delete(nodeId);
  visited.add(nodeId);
  return cycleFound;
};

const hasWorkflowRecursion = (
  source: CanonicalWorkflowGraph,
  current: CanonicalWorkflowGraph,
  graphsByVersion: ReadonlyMap<string, CanonicalWorkflowGraph>,
  visited: ReadonlySet<string>,
): boolean => {
  const currentKey = createWorkflowVersionKey(current.id, current.version);
  if (current.id === source.id && current.version === source.version) {
    return true;
  }
  if (visited.has(currentKey)) {
    return false;
  }
  const nextVisited = new Set(visited);
  nextVisited.add(currentKey);
  return current.nodes.some((node) => {
    if (!isWorkflowInvocationNode(node)) {
      return false;
    }
    const next = graphsByVersion.get(
      createWorkflowVersionKey(
        node.contract.workflowId,
        node.contract.workflowVersion,
      ),
    );
    return next
      ? hasWorkflowRecursion(source, next, graphsByVersion, nextVisited)
      : false;
  });
};

const createWorkflowVersionKey = (id: string, version: number): string =>
  `${id}@${version.toString()}`;

const isWorkflowInvocationNode = (
  node: CanonicalWorkflowNode,
): node is CanonicalWorkflowNode & {
  contract: Extract<CanonicalNodeContract, { kind: "workflow.invocation" }>;
} => node.contract.kind === CanonicalNodeKind.WorkflowInvocation;
import {
  isWorkflowAllowedForExternalApiKey,
  type ExternalApiKeyRecord,
} from "./external-api-keys";
