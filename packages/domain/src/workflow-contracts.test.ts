import { describe, expect, it } from "vitest";
import {
  CanonicalNodeKind,
  ExternalInvocationFailure,
  MergePolicy,
  PortDataType,
  RetryClassification,
  WorkflowTriggerBoundary,
  buildExecutionPlan,
  classifyExecutionFailure,
  mergeNodeInputs,
  validateExternalWorkflowInvocation,
  validateReusableWorkflowReferences,
  validateWorkflowGraph,
  type CanonicalNodeContract,
  type CanonicalWorkflowGraph,
} from "./workflow-contracts";

describe("canonical workflow graph contracts", () => {
  it("accepts a typed, reachable graph with a terminal path", () => {
    expect(validateWorkflowGraph(createParallelGraph())).toEqual([]);
  });

  it("reports graph defects in a deterministic order", () => {
    const graph = createParallelGraph({
      nodes: createParallelGraph().nodes.map((node) =>
        node.id === "agent-right"
          ? {
              ...node,
              inputPorts: [createPort("in", PortDataType.Text)],
            }
          : node,
      ),
      edges: [
        createEdge("missing", "out", "merge", "left"),
        createEdge("trigger", "out", "agent-left", "missing"),
        createEdge("agent-left", "out", "agent-right", "in"),
        createEdge("agent-right", "out", "agent-left", "in"),
        createEdge("agent-left", "out", "merge", "left"),
      ],
    });

    expect(validateWorkflowGraph(graph).map((issue) => issue.code)).toEqual([
      "edge.source-node-missing",
      "edge.target-port-missing",
      "edge.port-type-incompatible",
      "edge.target-port-cardinality",
      "graph.cycle",
      "graph.unreachable-node",
      "graph.terminal-unreachable",
    ]);
  });

  it("plans fan-out and fan-in in stable execution stages", () => {
    expect(
      buildExecutionPlan(createParallelGraph({ concurrencyLimit: 1 })),
    ).toEqual({
      stages: [
        ["trigger"],
        ["agent-left"],
        ["agent-right"],
        ["merge"],
        ["terminal"],
      ],
      maxParallelism: 1,
    });
  });

  it("merges parallel inputs using the declared deterministic policy", () => {
    expect(
      mergeNodeInputs(MergePolicy.ObjectByNodeId, [
        { nodeId: "agent-right", value: { result: "right" } },
        { nodeId: "agent-left", value: { result: "left" } },
      ]),
    ).toEqual({
      "agent-left": { result: "left" },
      "agent-right": { result: "right" },
    });
  });

  it("rejects recursive and incompatible version-pinned reusable workflow references", () => {
    const parent = createParallelGraph({
      id: "parent",
      version: 2,
      nodes: [
        createNode(
          "trigger",
          CanonicalNodeKind.ExternalTrigger,
          [],
          [createPort("out", PortDataType.Json)],
        ),
        {
          ...createNode(
            "call-child",
            CanonicalNodeKind.WorkflowInvocation,
            [createPort("in", PortDataType.Text)],
            [createPort("out", PortDataType.Json)],
          ),
          contract: {
            kind: CanonicalNodeKind.WorkflowInvocation,
            workflowId: "child",
            workflowVersion: 4,
            inputType: PortDataType.Json,
            outputType: PortDataType.Text,
          },
        },
        createNode("terminal", CanonicalNodeKind.Terminal, [
          createPort("in", PortDataType.Text),
        ]),
      ],
      edges: [
        createEdge("trigger", "out", "call-child", "in"),
        createEdge("call-child", "out", "terminal", "in"),
      ],
    });
    const child = createParallelGraph({
      id: "child",
      version: 4,
      inputType: PortDataType.Text,
      outputType: PortDataType.Json,
      nodes: [
        createNode(
          "trigger",
          CanonicalNodeKind.ExternalTrigger,
          [],
          [createPort("out", PortDataType.Text)],
        ),
        {
          ...createNode(
            "call-parent",
            CanonicalNodeKind.WorkflowInvocation,
            [createPort("in", PortDataType.Text)],
            [createPort("out", PortDataType.Json)],
          ),
          contract: {
            kind: CanonicalNodeKind.WorkflowInvocation,
            workflowId: "parent",
            workflowVersion: 2,
            inputType: PortDataType.Text,
            outputType: PortDataType.Json,
          },
        },
        createNode("terminal", CanonicalNodeKind.Terminal, [
          createPort("in", PortDataType.Json),
        ]),
      ],
      edges: [
        createEdge("trigger", "out", "call-parent", "in"),
        createEdge("call-parent", "out", "terminal", "in"),
      ],
    });

    expect(validateReusableWorkflowReferences(parent, [parent, child])).toEqual(
      [
        {
          code: "workflow-reference.input-incompatible",
          nodeId: "call-child",
        },
        {
          code: "workflow-reference.input-port-incompatible",
          nodeId: "call-child",
        },
        {
          code: "workflow-reference.output-incompatible",
          nodeId: "call-child",
        },
        {
          code: "workflow-reference.output-port-incompatible",
          nodeId: "call-child",
        },
        {
          code: "workflow-reference.recursive",
          nodeId: "call-child",
        },
      ],
    );
  });

  it("allows only published, version-pinned workflows through a scoped external boundary", () => {
    const graph = createParallelGraph({
      triggerBoundary: WorkflowTriggerBoundary.ExternalApi,
      status: "published",
      triggerEnabled: true,
    });

    expect(
      validateExternalWorkflowInvocation({
        graph,
        requestedVersion: 1,
        verifiedApiKey: createExternalApiKeyRecord(),
      }),
    ).toEqual({ ok: true });
    expect(
      validateExternalWorkflowInvocation({
        graph,
        requestedVersion: 2,
        verifiedApiKey: createExternalApiKeyRecord(),
      }),
    ).toEqual({
      ok: false,
      failure: ExternalInvocationFailure.VersionNotPinned,
    });
    expect(
      validateExternalWorkflowInvocation({
        graph: { ...graph, triggerEnabled: false },
        requestedVersion: 1,
        verifiedApiKey: createExternalApiKeyRecord(),
      }),
    ).toEqual({
      ok: false,
      failure: ExternalInvocationFailure.TriggerDisabled,
    });
    expect(
      validateExternalWorkflowInvocation({
        graph: { ...graph, triggerEnabled: true },
        requestedVersion: 1,
        verifiedApiKey: createExternalApiKeyRecord({ revokedAt: "now" }),
      }),
    ).toEqual({ ok: false, failure: ExternalInvocationFailure.NotScoped });
  });

  it("classifies cancellation and retryable failures without retrying cancellation", () => {
    expect(classifyExecutionFailure({ kind: "canceled" })).toBe(
      RetryClassification.Canceled,
    );
    expect(
      classifyExecutionFailure({ kind: "provider", statusCode: 429 }),
    ).toBe(RetryClassification.Retryable);
    expect(classifyExecutionFailure({ kind: "validation" })).toBe(
      RetryClassification.NonRetryable,
    );
  });
});

const createParallelGraph = (
  input: Partial<CanonicalWorkflowGraph> = {},
): CanonicalWorkflowGraph => ({
  id: "workflow",
  version: 1,
  status: "draft",
  triggerBoundary: WorkflowTriggerBoundary.Manual,
  triggerEnabled: true,
  inputType: PortDataType.Json,
  outputType: PortDataType.Json,
  concurrencyLimit: 2,
  nodes: [
    createNode(
      "trigger",
      CanonicalNodeKind.ExternalTrigger,
      [],
      [createPort("out", PortDataType.Json)],
    ),
    createNode(
      "agent-left",
      CanonicalNodeKind.AgentInvocation,
      [createPort("in", PortDataType.Json)],
      [createPort("out", PortDataType.Json)],
    ),
    createNode(
      "agent-right",
      CanonicalNodeKind.AgentInvocation,
      [createPort("in", PortDataType.Json)],
      [createPort("out", PortDataType.Json)],
    ),
    {
      ...createNode(
        "merge",
        CanonicalNodeKind.Merge,
        [
          createPort("left", PortDataType.Json),
          createPort("right", PortDataType.Json),
        ],
        [createPort("out", PortDataType.Json)],
      ),
      contract: {
        kind: CanonicalNodeKind.Merge,
        policy: MergePolicy.ObjectByNodeId,
      },
    },
    createNode("terminal", CanonicalNodeKind.Terminal, [
      createPort("in", PortDataType.Json),
    ]),
  ],
  edges: [
    createEdge("trigger", "out", "agent-left", "in"),
    createEdge("trigger", "out", "agent-right", "in"),
    createEdge("agent-left", "out", "merge", "left"),
    createEdge("agent-right", "out", "merge", "right"),
    createEdge("merge", "out", "terminal", "in"),
  ],
  ...input,
});

const createNode = (
  id: string,
  kind: CanonicalNodeKind,
  inputPorts: CanonicalWorkflowGraph["nodes"][number]["inputPorts"],
  outputPorts: CanonicalWorkflowGraph["nodes"][number]["outputPorts"] = [],
): CanonicalWorkflowGraph["nodes"][number] => ({
  id,
  kind,
  inputPorts,
  outputPorts,
  contract: createNodeContract(kind),
});

const createNodeContract = (kind: CanonicalNodeKind): CanonicalNodeContract => {
  if (kind === CanonicalNodeKind.AgentInvocation) {
    return { kind: CanonicalNodeKind.AgentInvocation };
  }
  if (kind === CanonicalNodeKind.ExternalTrigger) {
    return { kind: CanonicalNodeKind.ExternalTrigger };
  }
  if (kind === CanonicalNodeKind.Guardrail) {
    return { kind: CanonicalNodeKind.Guardrail };
  }
  if (kind === CanonicalNodeKind.Merge) {
    return { kind: CanonicalNodeKind.Merge };
  }
  if (kind === CanonicalNodeKind.SchemaValidation) {
    return { kind: CanonicalNodeKind.SchemaValidation };
  }
  if (kind === CanonicalNodeKind.Terminal) {
    return { kind: CanonicalNodeKind.Terminal };
  }
  return {
    kind: CanonicalNodeKind.WorkflowInvocation,
    workflowId: "workflow",
    workflowVersion: 1,
    inputType: PortDataType.Json,
    outputType: PortDataType.Json,
  };
};

const createPort = (
  id: string,
  dataType: PortDataType,
  acceptsMany = false,
) => ({
  id,
  dataType,
  acceptsMany,
});

const createExternalApiKeyRecord = (input: { revokedAt?: string } = {}) => ({
  id: "key",
  name: "Key",
  scope: { kind: "selected_workflows" as const, workflowIds: ["workflow"] },
  secretHash: "hash",
  createdAt: "2026-07-17T00:00:00.000Z",
  ...input,
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
});
