import { describe, expect, it } from "vitest";
import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  type WorkflowDefinitionRecord,
} from "../../../packages/shared/src/workflows";
import {
  createDefaultApplicationState,
  parseApplicationState,
  type ApplicationState,
} from "./application-state";
import { createCanonicalWorkflowRuntimeGuard } from "./canonical-workflow-runtime";
import { createWorkflowRuntimeService } from "./workflow-runtime";

describe("canonical workflow runtime guard", () => {
  it("adapts an unchanged persisted definition and produces deterministic bounded stages", () => {
    const definition = createDefinition();
    const before = JSON.stringify(definition);
    const guard = createCanonicalWorkflowRuntimeGuard({
      readDefinitionVersions: () => [],
    });

    expect(guard.prepare(definition)).toEqual({
      stages: [["trigger"], ["left"], ["right"], ["merge"], ["terminal"]],
      maxParallelism: 1,
    });
    expect(JSON.stringify(definition)).toBe(before);
  });

  it("rejects unsupported persisted trigger data before the existing runtime can create execution state", () => {
    const guard = createCanonicalWorkflowRuntimeGuard({
      readDefinitionVersions: () => [],
    });

    expect(() =>
      guard.prepare(
        createDefinition({ triggerKind: WorkflowTriggerKind.Event }),
      ),
    ).toThrow("Unsupported legacy workflow trigger kind");
  });

  it("rejects version metadata that does not match its pinned snapshot", () => {
    const state = createNestedWorkflowState();
    const record = state.workflows.definitionVersions?.[0];
    const parent = state.workflows.definitions[0];
    if (!record || !parent) {
      throw new Error("Nested workflow fixture is incomplete.");
    }
    record.version = 99;
    const guard = createCanonicalWorkflowRuntimeGuard({
      readDefinitionVersions: () => state.workflows.definitionVersions ?? [],
    });

    expect(() => guard.prepare(parent)).toThrow(
      "Persisted workflow version metadata is invalid.",
    );
  });

  it("rejects an invalid manual pinned child before parent node execution begins", async () => {
    const state = reloadState(createNestedWorkflowState());
    const invalidVersion = state.workflows.definitionVersions?.find(
      (record) => record.id === "child-v1",
    );
    if (!invalidVersion) {
      throw new Error("Child workflow version is missing.");
    }
    invalidVersion.snapshot = {
      ...invalidVersion.snapshot,
      nodes: invalidVersion.snapshot.nodes.filter(
        (node) => node.id !== "child-terminal",
      ),
      edges: invalidVersion.snapshot.edges.filter(
        (edge) => edge.targetNodeId !== "child-terminal",
      ),
    };
    const parent = state.workflows.definitions[0];
    if (!parent) {
      throw new Error("Parent workflow is missing.");
    }
    const events: string[] = [];
    const runtime = createWorkflowRuntimeService({
      readApplicationState: () => state,
    });

    await expect(
      runtime.runWorkflow({
        definition: parent,
        assets: state.workflows.assets,
        onEvent: (event) => {
          if (event.type === "node_started") {
            events.push(event.nodeId);
          }
        },
      }),
    ).rejects.toThrow("Persisted referenced workflow graph is invalid.");
    expect(events).toEqual([]);
  });

  it("reloads and executes a pinned nested workflow without selecting its newer version", async () => {
    const state = reloadState(createNestedWorkflowState());
    const runtime = createWorkflowRuntimeService({
      readApplicationState: () => state,
    });
    const parent = state.workflows.definitions[0];

    if (!parent) {
      throw new Error("Parent workflow is missing.");
    }

    expect(
      createCanonicalWorkflowRuntimeGuard({
        readDefinitionVersions: () => state.workflows.definitionVersions ?? [],
      }).prepare(parent),
    ).toEqual({
      stages: [["trigger"], ["invoke-child", "left"], ["merge"], ["terminal"]],
      maxParallelism: 2,
    });

    const execution = await runtime.runWorkflow({
      definition: parent,
      assets: state.workflows.assets,
    });

    expect(execution.status).toBe("completed");
    expect(
      execution.nodeRuns.find((nodeRun) => nodeRun.nodeId === "invoke-child")
        ?.outputSnapshot,
    ).toBe("child-v1");
    expect(
      execution.nodeRuns.find((nodeRun) => nodeRun.nodeId === "invoke-child")
        ?.outputSnapshot,
    ).not.toBe("child-v2");
    expect(execution.nodeRuns.at(-1)?.outputSnapshot).toEqual({
      "invoke-child": "child-v1",
      left: "left",
    });
  });
});

const reloadState = (state: ApplicationState): ApplicationState =>
  parseApplicationState(JSON.parse(JSON.stringify(state)));

const createNestedWorkflowState = (): ApplicationState => {
  const childVersionOne = createDefinition({
    id: "child",
    version: 1,
    nodes: [
      createNode("child-trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
      createNode("child-output", WorkflowNodeKind.AssetPrompt, ["in"], ["out"]),
      createNode(
        "child-terminal",
        WorkflowNodeKind.TerminalResponse,
        ["in"],
        [],
      ),
    ],
    edges: [
      createEdge("child-trigger", "child-output"),
      createEdge("child-output", "child-terminal"),
    ],
  });
  const childVersionTwo = {
    ...childVersionOne,
    version: 2,
    nodes: [
      createNode("child-trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
      {
        ...createNode(
          "child-output",
          WorkflowNodeKind.AssetPrompt,
          ["in"],
          ["out"],
        ),
        config: { assetId: "child-v2-asset" },
      },
      createNode(
        "child-terminal",
        WorkflowNodeKind.TerminalResponse,
        ["in"],
        [],
      ),
    ],
  };
  const parent = createDefinition({
    id: "parent",
    version: 1,
    maxConcurrency: 2,
    nodes: [
      createNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
      createNode("left", WorkflowNodeKind.AssetPrompt, ["in"], ["out"]),
      {
        ...createNode(
          "invoke-child",
          WorkflowNodeKind.WorkflowInvocation,
          ["in"],
          ["out"],
        ),
        config: {
          workflowInvocation: { workflowId: "child", workflowVersion: 1 },
        },
      },
      createNode("merge", WorkflowNodeKind.LogicMerge, ["in"], ["out"]),
      createNode("terminal", WorkflowNodeKind.TerminalResponse, ["in"], []),
    ],
    edges: [
      createEdge("trigger", "left"),
      createEdge("trigger", "invoke-child"),
      createEdge("left", "merge"),
      createEdge("invoke-child", "merge"),
      createEdge("merge", "terminal"),
    ],
  });
  const state = createDefaultApplicationState();
  return {
    ...state,
    workflows: {
      ...state.workflows,
      definitions: [parent],
      definitionVersions: [
        {
          id: "child-v1",
          workflowId: "child",
          version: 1,
          createdAt: childVersionOne.createdAt,
          snapshot: childVersionOne,
        },
        {
          id: "child-v2",
          workflowId: "child",
          version: 2,
          createdAt: childVersionTwo.createdAt,
          snapshot: childVersionTwo,
        },
      ],
      assets: [
        createAsset("left-asset", "left"),
        createAsset("child-asset", "child-v1"),
        createAsset("child-v2-asset", "child-v2"),
      ],
    },
  };
};

const createAsset = (id: string, body: string) => ({
  id,
  kind: WorkflowAssetKind.Prompt,
  scope: WorkflowAssetScope.Global,
  name: id,
  slug: id,
  description: "",
  body,
  language: "en",
  version: 1,
  tags: [],
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
});

const createDefinition = (
  input: {
    id?: string;
    kind?: WorkflowNodeKind;
    triggerKind?: WorkflowTriggerKind;
    version?: number;
    maxConcurrency?: number;
    nodes?: WorkflowDefinitionRecord["nodes"];
    edges?: WorkflowDefinitionRecord["edges"];
  } = {},
): WorkflowDefinitionRecord => ({
  id: input.id ?? "parallel-workflow",
  name: "Parallel workflow",
  description: "Canonical runtime guard acceptance fixture",
  status: WorkflowRecordStatus.Published,
  version: input.version ?? 4,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  trigger: {
    kind: input.triggerKind ?? WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  executionPolicy: {
    maxNodeRetries: 0,
    ...(input.maxConcurrency ? { maxConcurrency: input.maxConcurrency } : {}),
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 1,
    carryArtifactLimit: 1,
  },
  tags: [],
  nodes: input.nodes ?? [
    createNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
    createNode(
      "left",
      input.kind ?? WorkflowNodeKind.AiProviderRun,
      ["in"],
      ["out"],
    ),
    createNode("right", WorkflowNodeKind.AiProviderRun, ["in"], ["out"]),
    createNode("merge", WorkflowNodeKind.LogicMerge, ["in"], ["out"]),
    createNode("terminal", WorkflowNodeKind.TerminalResponse, ["in"], []),
  ],
  edges: input.edges ?? [
    createEdge("trigger", "left"),
    createEdge("trigger", "right"),
    createEdge("left", "merge"),
    createEdge("right", "merge"),
    createEdge("merge", "terminal"),
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
  config:
    id === "left"
      ? { assetId: "left-asset" }
      : id === "child-output"
        ? { assetId: "child-asset" }
        : {},
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

const createEdge = (sourceNodeId: string, targetNodeId: string) => ({
  id: `${sourceNodeId}-${targetNodeId}`,
  sourceNodeId,
  sourcePortId: "out",
  targetNodeId,
  targetPortId: "in",
  mapping: { mode: "passthrough" as const, entries: [] },
});
