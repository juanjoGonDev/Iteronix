import { describe, expect, it } from "vitest";
import {
  CanonicalNodeKind,
  MergePolicy,
  PortDataType,
  WorkflowTriggerBoundary,
} from "../../domain/src/workflow-contracts";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  type WorkflowDefinitionRecord,
} from "../../shared/src/workflows";
import { adaptLegacyWorkflowDefinition } from "./canonical-workflow-adapter";

describe("legacy workflow adapter", () => {
  it("adapts persisted Phase 0 workflow records without mutating them", () => {
    const legacy = createLegacyDefinition({ enabled: false });
    const graph = adaptLegacyWorkflowDefinition(legacy);

    expect({
      id: graph.id,
      version: graph.version,
      status: graph.status,
      triggerBoundary: graph.triggerBoundary,
      triggerEnabled: graph.triggerEnabled,
      inputType: graph.inputType,
      outputType: graph.outputType,
      concurrencyLimit: graph.concurrencyLimit,
    }).toEqual({
      id: "legacy-workflow",
      version: 3,
      status: "published",
      triggerBoundary: WorkflowTriggerBoundary.ExternalApi,
      triggerEnabled: false,
      inputType: PortDataType.Json,
      outputType: PortDataType.Json,
      concurrencyLimit: 1,
    });
    expect(graph.nodes.find((node) => node.id === "agent")?.kind).toBe(
      CanonicalNodeKind.AgentInvocation,
    );
    expect(graph.nodes.find((node) => node.id === "merge")?.contract).toEqual({
      kind: CanonicalNodeKind.Merge,
      policy: MergePolicy.ObjectByNodeId,
    });
    expect(graph.edges).toEqual(
      legacy.edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.sourceNodeId,
        sourcePortId: edge.sourcePortId,
        targetNodeId: edge.targetNodeId,
        targetPortId: edge.targetPortId,
      })),
    );
    expect(legacy.nodes[1]?.kind).toBe(WorkflowNodeKind.AiProviderRun);
    expect(() =>
      adaptLegacyWorkflowDefinition(
        createLegacyDefinition({ nodeKind: WorkflowNodeKind.AssetPrompt }),
      ),
    ).toThrow("Unsupported legacy workflow node kind");
    expect(() =>
      adaptLegacyWorkflowDefinition(
        createLegacyDefinition({ triggerKind: WorkflowTriggerKind.Event }),
      ),
    ).toThrow("Unsupported legacy workflow trigger kind");
  });
});

const createLegacyDefinition = (
  input: {
    enabled?: boolean;
    nodeKind?: WorkflowNodeKind;
    triggerKind?: WorkflowTriggerKind;
  } = {},
): WorkflowDefinitionRecord => ({
  id: "legacy-workflow",
  name: "Legacy workflow",
  description: "Imported in Phase 0",
  status: WorkflowRecordStatus.Published,
  version: 3,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  trigger: {
    kind: input.triggerKind ?? WorkflowTriggerKind.Webhook,
    enabled: input.enabled ?? true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  executionPolicy: {
    maxNodeRetries: 2,
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 3,
    carryArtifactLimit: 3,
  },
  tags: [],
  nodes: [
    createNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
    createNode(
      "agent",
      input.nodeKind ?? WorkflowNodeKind.AiProviderRun,
      ["in"],
      ["out"],
    ),
    createNode("merge", WorkflowNodeKind.LogicMerge, ["in"], ["out"]),
    createNode("terminal", WorkflowNodeKind.TerminalResponse, ["in"], []),
  ],
  edges: [
    createEdge("trigger", "out", "agent", "in"),
    createEdge("agent", "out", "merge", "in"),
    createEdge("merge", "out", "terminal", "in"),
  ],
});

const createNode = (
  id: string,
  kind: WorkflowNodeKind,
  inputPortIds: ReadonlyArray<string>,
  outputPortIds: ReadonlyArray<string>,
): WorkflowDefinitionRecord["nodes"][number] => ({
  id,
  kind,
  label: id,
  position: { x: 0, y: 0 },
  width: 160,
  collapsed: false,
  config: {},
  inputPorts: inputPortIds.map((portId) => ({
    id: portId,
    name: portId,
    acceptsMany: true,
  })),
  outputPorts: outputPortIds.map((portId) => ({
    id: portId,
    name: portId,
    acceptsMany: true,
  })),
  attachedGuardrails: [],
});

const createEdge = (
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
) => ({
  id: `${sourceNodeId}-${targetNodeId}`,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
  mapping: { mode: "passthrough" as const, entries: [] },
});
