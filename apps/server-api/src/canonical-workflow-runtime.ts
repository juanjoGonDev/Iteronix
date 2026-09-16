import {
  buildExecutionPlan,
  CanonicalNodeKind,
  validateReusableWorkflowReferences,
  validateWorkflowGraph,
  type CanonicalWorkflowGraph,
  type ExecutionPlan,
} from "../../../packages/domain/src/workflow-contracts";
import { adaptLegacyWorkflowDefinition } from "../../../packages/agents/src/canonical-workflow-adapter";
import type {
  WorkflowDefinitionRecord,
  WorkflowDefinitionVersionRecord,
} from "../../../packages/shared/src/workflows";

export type CanonicalWorkflowRuntimeGuard = {
  prepare: (definition: WorkflowDefinitionRecord) => ExecutionPlan | undefined;
};

export const createCanonicalWorkflowRuntimeGuard = (input: {
  readDefinitionVersions: () => ReadonlyArray<WorkflowDefinitionVersionRecord>;
}): CanonicalWorkflowRuntimeGuard => ({
  prepare: (definition) => {
    const versionRecords = input.readDefinitionVersions();
    validateVersionRecordMetadata(versionRecords);
    const graph = adaptLegacyWorkflowDefinition(definition);
    const versionGraphs = versionRecords.map((record) =>
      adaptLegacyWorkflowDefinition(record.snapshot),
    );
    const graphsByVersion = new Map(
      [graph, ...versionGraphs].map((candidate) => [
        createVersionKey(candidate),
        candidate,
      ]),
    );
    return validateGraphForExecution({
      graph,
      graphsByVersion,
      allowLegacy: true,
      visited: new Set(),
    });
  },
});

const validateGraphForExecution = (input: {
  graph: CanonicalWorkflowGraph;
  graphsByVersion: ReadonlyMap<string, CanonicalWorkflowGraph>;
  allowLegacy: boolean;
  visited: ReadonlySet<string>;
}): ExecutionPlan | undefined => {
  const graphKey = createVersionKey(input.graph);
  if (input.visited.has(graphKey)) {
    return buildExecutionPlan(input.graph);
  }
  const canonical = input.graph.nodes.some(
    (node) => node.kind === CanonicalNodeKind.ExternalTrigger,
  );
  if (!canonical) {
    if (input.allowLegacy) {
      return undefined;
    }
    throw new Error("Persisted referenced workflow graph is invalid.");
  }
  if (validateWorkflowGraph(input.graph).length > 0) {
    throw new Error(
      input.allowLegacy
        ? "Persisted workflow graph is invalid."
        : "Persisted referenced workflow graph is invalid.",
    );
  }
  const availableGraphs = Array.from(input.graphsByVersion.values());
  if (
    validateReusableWorkflowReferences(input.graph, availableGraphs).length > 0
  ) {
    throw new Error("Persisted workflow references are invalid.");
  }
  const nextVisited = new Set(input.visited);
  nextVisited.add(graphKey);
  for (const node of input.graph.nodes) {
    if (node.contract.kind !== CanonicalNodeKind.WorkflowInvocation) {
      continue;
    }
    const child = input.graphsByVersion.get(
      `${node.contract.workflowId}@${node.contract.workflowVersion.toString()}`,
    );
    if (!child) {
      throw new Error("Persisted workflow references are invalid.");
    }
    validateGraphForExecution({
      graph: child,
      graphsByVersion: input.graphsByVersion,
      allowLegacy: false,
      visited: nextVisited,
    });
  }
  return buildExecutionPlan(input.graph);
};

const validateVersionRecordMetadata = (
  records: ReadonlyArray<WorkflowDefinitionVersionRecord>,
): void => {
  if (
    records.some(
      (record) =>
        record.workflowId !== record.snapshot.id ||
        record.version !== record.snapshot.version,
    )
  ) {
    throw new Error("Persisted workflow version metadata is invalid.");
  }
};

const createVersionKey = (graph: CanonicalWorkflowGraph): string =>
  `${graph.id}@${graph.version.toString()}`;
