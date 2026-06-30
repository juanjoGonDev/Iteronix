import { describe, expect, it } from "vitest";
import {
  WorkflowExecutionStatus,
  WorkflowNodeKind,
  WorkflowNodeExecutionInputSourceKind,
  WorkflowReasoningLevel,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  WorkflowVerbosity,
  type WorkflowAssetRecord,
  type WorkflowContextEnvelope,
  type WorkflowDefinitionRecord,
  type WorkflowProviderSelectionRecord,
} from "../../shared/src/workflows";
import {
  createWorkflowRuntime,
  WorkflowRuntimeEventType,
} from "./workflow-runtime";

const BaseTime = "2026-05-16T18:00:00.000Z";

describe("workflow runtime", () => {
  it("keeps server-owned continuity between provider nodes", async () => {
    const providerCalls: Array<{
      nodeId: string;
      prompt: string;
      envelope: WorkflowContextEnvelope;
    }> = [];
    const runtime = createWorkflowRuntime({
      now: createNowSequence(),
      runProviderNode: async (request) => {
        providerCalls.push({
          nodeId: request.node.id,
          prompt: request.prompt,
          envelope: request.envelope,
        });

        if (request.node.id === "node-provider-1") {
          return {
            outputText: "Draft answer from first provider.",
            usage: {
              promptTokens: 10,
              completionTokens: 14,
              totalTokens: 24,
              estimatedCostEur: 0.02,
              latencyMs: 1100,
            },
          };
        }

        return {
          outputText: "Final answer from second provider.",
          outputSnapshot: {
            result: "Final answer from second provider.",
          },
          usage: {
            promptTokens: 12,
            completionTokens: 16,
            totalTokens: 28,
            estimatedCostEur: 0.03,
            latencyMs: 1400,
          },
        };
      },
    });

    const execution = await runtime.runDefinition({
      definition: createWorkflowDefinitionRecord(),
      assets: [createWorkflowAssetRecord()],
    });

    expect(execution.status).toBe("completed");
    expect(execution.nodeRuns).toHaveLength(4);
    expect(execution.totals.totalTokens).toBe(52);
    expect(providerCalls).toHaveLength(2);
    expect(providerCalls[0]?.prompt).toContain("Base workflow prompt");
    expect(providerCalls[1]?.envelope.messages).toEqual([
      {
        role: "assistant",
        content: "Base workflow prompt",
        sourceNodeId: "node-prompt",
      },
      {
        role: "assistant",
        content: "Draft answer from first provider.",
        sourceNodeId: "node-provider-1",
      },
    ]);
    expect(providerCalls[1]?.envelope.variables).toMatchObject({
      "node-prompt": "Base workflow prompt",
      "node-provider-1": "Draft answer from first provider.",
    });
    expect(providerCalls[1]?.prompt).toContain(
      "Draft answer from first provider.",
    );
    expect(execution.nodeRuns[3]?.outputSnapshot).toEqual({
      result: "Final answer from second provider.",
    });
  });

  it("persists warning guardrail findings on completed node runs", async () => {
    const runtime = createWorkflowRuntime({
      now: createNowSequence(),
      runProviderNode: async () => ({
        outputText: "Provider output",
        outputSnapshot: {
          summary: "Provider output",
        },
      }),
    });

    const execution = await runtime.runDefinition({
      definition: createWorkflowDefinitionRecord({
        providerGuardrailAssetId: "asset-guardrail-warn",
      }),
      assets: [
        createWorkflowAssetRecord(),
        createGuardrailAssetRecord({
          id: "asset-guardrail-warn",
          severity: "warn",
          targetPath: "$.summary",
          message: "Summary present.",
        }),
      ],
    });

    const providerNodeRun = execution.nodeRuns.find(
      (nodeRun) => nodeRun.nodeId === "node-provider-1",
    );
    expect(providerNodeRun?.status).toBe("completed");
    expect(providerNodeRun?.guardrailFindings).toEqual([
      {
        guardrailAssetId: "asset-guardrail-warn",
        nodeId: "node-provider-1",
        severity: "warn",
        message: "Summary present.",
      },
    ]);
  });

  it("fails workflow when an error guardrail finding triggers", async () => {
    const runtime = createWorkflowRuntime({
      now: createNowSequence(),
      runProviderNode: async () => ({
        outputText: "Provider output",
        outputSnapshot: {
          summary: "Provider output",
        },
      }),
    });

    const execution = await runtime.runDefinition({
      definition: createWorkflowDefinitionRecord({
        providerGuardrailAssetId: "asset-guardrail-error",
      }),
      assets: [
        createWorkflowAssetRecord(),
        createGuardrailAssetRecord({
          id: "asset-guardrail-error",
          severity: "error",
          targetPath: "$.missing",
          message: "Missing field blocks node.",
        }),
      ],
    });

    const providerNodeRun = execution.nodeRuns.find(
      (nodeRun) => nodeRun.nodeId === "node-provider-1",
    );
    expect(execution.status).toBe("failed");
    expect(providerNodeRun?.status).toBe("failed");
    expect(providerNodeRun?.guardrailFindings).toEqual([
      {
        guardrailAssetId: "asset-guardrail-error",
        nodeId: "node-provider-1",
        severity: "error",
        message: "Missing field blocks node.",
      },
    ]);
  });

  it("emits runtime events for node progress and provider output deltas", async () => {
    const events: ReadonlyArray<unknown> = [];
    const collected: unknown[] = [];
    const runtime = createWorkflowRuntime({
      now: createNowSequence(),
      runProviderNode: async (request) => ({
        outputText: `Output from ${request.node.id}`,
      }),
    });

    const execution = await runtime.runDefinition({
      definition: createWorkflowDefinitionRecord(),
      assets: [createWorkflowAssetRecord()],
      onEvent: (event) => {
        collected.push(event);
      },
    });

    expect(execution.status).toBe("completed");
    expect(events).toEqual([]);
    expect(
      collected.some((event) =>
        isEventOfType(event, WorkflowRuntimeEventType.WorkflowStarted),
      ),
    ).toBe(true);
    expect(
      collected.some((event) =>
        isEventOfType(event, WorkflowRuntimeEventType.NodeStarted),
      ),
    ).toBe(true);
    expect(
      collected.some(
        (event) =>
          isEventOfType(event, WorkflowRuntimeEventType.NodeDelta) &&
          event.nodeId === "node-provider-1" &&
          event.delta?.includes("Output from node-provider-1") === true,
      ),
    ).toBe(true);
    expect(
      collected.some((event) =>
        isEventOfType(event, WorkflowRuntimeEventType.WorkflowCompleted),
      ),
    ).toBe(true);
  });

  it("runs only required upstream context before the selected node", async () => {
    const providerCalls: string[] = [];
    const runtime = createWorkflowRuntime({
      now: createNowSequence(),
      runProviderNode: async (request) => {
        providerCalls.push(request.node.id);
        return {
          outputText: `Output from ${request.node.id}`,
        };
      },
    });

    const execution = await runtime.runNode({
      definition: createBranchedWorkflowDefinitionRecord(),
      assets: [createWorkflowAssetRecord()],
      nodeId: "node-provider-target",
      inputSource: {
        kind: WorkflowNodeExecutionInputSourceKind.NodeOutput,
        nodeId: "node-provider-left",
      },
    });

    expect(execution.status).toBe(WorkflowExecutionStatus.Completed);
    expect(providerCalls).toEqual([
      "node-provider-left",
      "node-provider-target",
    ]);
    expect(execution.nodeRuns.map((nodeRun) => nodeRun.nodeId)).toEqual([
      "node-trigger",
      "node-prompt",
      "node-provider-left",
      "node-provider-target",
    ]);
    expect(execution.nodeRuns).not.toContainEqual(
      expect.objectContaining({ nodeId: "node-provider-right" }),
    );
  });

  it("uses all previous node outputs as the selected node input when requested", async () => {
    const providerPrompts: Array<{ nodeId: string; prompt: string }> = [];
    const runtime = createWorkflowRuntime({
      now: createNowSequence(),
      runProviderNode: async (request) => {
        providerPrompts.push({
          nodeId: request.node.id,
          prompt: request.prompt,
        });
        return {
          outputText: `Output from ${request.node.id}`,
        };
      },
    });

    await runtime.runNode({
      definition: createBranchedWorkflowDefinitionRecord(),
      assets: [createWorkflowAssetRecord()],
      nodeId: "node-provider-target",
      inputSource: {
        kind: WorkflowNodeExecutionInputSourceKind.AllPrevious,
      },
    });

    const targetPrompt = providerPrompts.find(
      (entry) => entry.nodeId === "node-provider-target",
    )?.prompt;

    expect(targetPrompt).toContain("node-provider-left");
    expect(targetPrompt).toContain("node-provider-right");
    expect(targetPrompt).toContain("Output from node-provider-left");
    expect(targetPrompt).toContain("Output from node-provider-right");
  });
});

const isEventOfType = <TType extends string>(
  value: unknown,
  type: TType,
): value is { type: TType; nodeId?: string; delta?: string } =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  (value as { type?: unknown }).type === type;

const createWorkflowDefinitionRecord = (
  input: {
    providerGuardrailAssetId?: string;
  } = {},
): WorkflowDefinitionRecord => ({
  id: "workflow-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  name: "Workflow 06.6",
  description: "Workflow runtime continuity",
  status: WorkflowRecordStatus.Draft,
  version: 1,
  createdAt: BaseTime,
  updatedAt: BaseTime,
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  executionPolicy: {
    maxNodeRetries: 1,
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 8,
    carryArtifactLimit: 8,
  },
  tags: ["baseline", "continuity"],
  nodes: [
    createNodeRecord({
      id: "node-trigger",
      kind: WorkflowNodeKind.TriggerManual,
    }),
    createNodeRecord({
      id: "node-prompt",
      kind: WorkflowNodeKind.AssetPrompt,
      assetId: "asset-prompt",
    }),
    createNodeRecord({
      id: "node-provider-1",
      kind: WorkflowNodeKind.AiProviderRun,
      provider: createProviderSelection("profile-1", "gpt-1"),
      prompt: "Draft with the workflow prompt.",
      attachedGuardrails: input.providerGuardrailAssetId
        ? [
            {
              assetId: input.providerGuardrailAssetId,
              order: 1,
              enabled: true,
            },
          ]
        : [],
    }),
    createNodeRecord({
      id: "node-provider-2",
      kind: WorkflowNodeKind.AiProviderRun,
      provider: createProviderSelection("profile-2", "gpt-2"),
      prompt: "Refine the prior output.",
    }),
  ],
  edges: [
    createEdgeRecord("edge-1", "node-trigger", "node-prompt"),
    createEdgeRecord("edge-2", "node-prompt", "node-provider-1"),
    createEdgeRecord("edge-3", "node-provider-1", "node-provider-2"),
  ],
});

const createBranchedWorkflowDefinitionRecord =
  (): WorkflowDefinitionRecord => ({
    ...createWorkflowDefinitionRecord(),
    nodes: [
      createNodeRecord({
        id: "node-trigger",
        kind: WorkflowNodeKind.TriggerManual,
      }),
      createNodeRecord({
        id: "node-prompt",
        kind: WorkflowNodeKind.AssetPrompt,
        assetId: "asset-prompt",
      }),
      createNodeRecord({
        id: "node-provider-left",
        kind: WorkflowNodeKind.AiProviderRun,
        provider: createProviderSelection("profile-left", "gpt-left"),
        prompt: "Left branch.",
      }),
      createNodeRecord({
        id: "node-provider-right",
        kind: WorkflowNodeKind.AiProviderRun,
        provider: createProviderSelection("profile-right", "gpt-right"),
        prompt: "Right branch.",
      }),
      createNodeRecord({
        id: "node-provider-target",
        kind: WorkflowNodeKind.AiProviderRun,
        provider: createProviderSelection("profile-target", "gpt-target"),
        prompt: "Merge selected input.",
      }),
    ],
    edges: [
      createEdgeRecord("edge-1", "node-trigger", "node-prompt"),
      createEdgeRecord("edge-2", "node-prompt", "node-provider-left"),
      createEdgeRecord("edge-3", "node-prompt", "node-provider-right"),
      createEdgeRecord("edge-4", "node-provider-left", "node-provider-target"),
      createEdgeRecord("edge-5", "node-provider-right", "node-provider-target"),
    ],
  });

const createWorkflowAssetRecord = (): WorkflowAssetRecord => ({
  id: "asset-prompt",
  workspaceId: "workspace-1",
  projectId: "project-1",
  kind: "prompt",
  scope: "project",
  name: "Prompt asset",
  slug: "prompt-asset",
  description: "",
  body: "Base workflow prompt",
  language: "en",
  version: 1,
  tags: [],
  createdAt: BaseTime,
  updatedAt: BaseTime,
});

const createGuardrailAssetRecord = (input: {
  id: string;
  severity: "warn" | "error" | "success";
  targetPath: string;
  message: string;
}): WorkflowAssetRecord => ({
  id: input.id,
  workspaceId: "workspace-1",
  projectId: "project-1",
  kind: "guardrail",
  scope: "project",
  name: input.id,
  slug: input.id,
  description: "",
  body: "",
  language: "en",
  version: 1,
  tags: [],
  guardrail: {
    id: `${input.id}-definition`,
    severity: input.severity,
    operator: "all",
    validations: [
      {
        id: `${input.id}-validation`,
        kind: "field_exists",
        target: "output",
        path: input.targetPath,
        message: input.message,
      },
    ],
  },
  createdAt: BaseTime,
  updatedAt: BaseTime,
});

const createNodeRecord = (input: {
  id: string;
  kind: WorkflowNodeKind;
  assetId?: string;
  provider?: WorkflowProviderSelectionRecord;
  prompt?: string;
  attachedGuardrails?: ReadonlyArray<{
    assetId: string;
    order: number;
    enabled: boolean;
  }>;
}) => ({
  id: input.id,
  kind: input.kind,
  label: input.id,
  position: {
    x: 0,
    y: 0,
  },
  width: 320,
  collapsed: false,
  config: {
    ...(input.assetId ? { assetId: input.assetId } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.prompt ? { prompt: input.prompt } : {}),
  },
  inputPorts: [],
  outputPorts: [],
  attachedGuardrails: input.attachedGuardrails ?? [],
});

const createProviderSelection = (
  providerId: string,
  modelId: string,
): WorkflowProviderSelectionRecord => ({
  providerId,
  modelId,
  reasoningLevel: WorkflowReasoningLevel.Medium,
  temperature: 0.2,
  verbosity: WorkflowVerbosity.Medium,
});

const createEdgeRecord = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
) => ({
  id,
  sourceNodeId,
  sourcePortId: "out",
  targetNodeId,
  targetPortId: "in",
  mapping: {
    mode: "passthrough" as const,
    entries: [],
  },
});

const createNowSequence = (): (() => Date) => {
  let offset = 0;
  return () => {
    const value = new Date(new Date(BaseTime).getTime() + offset);
    offset += 1000;
    return value;
  };
};
