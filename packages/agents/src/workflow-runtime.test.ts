import { describe, expect, it } from "vitest";
import {
  WorkflowNodeKind,
  WorkflowReasoningLevel,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  WorkflowVerbosity,
  type WorkflowAssetRecord,
  type WorkflowContextEnvelope,
  type WorkflowDefinitionRecord,
  type WorkflowProviderSelectionRecord
} from "../../shared/src/workflows";
import { createWorkflowRuntime } from "./workflow-runtime";

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
          envelope: request.envelope
        });

        if (request.node.id === "node-provider-1") {
          return {
            outputText: "Draft answer from first provider.",
            usage: {
              promptTokens: 10,
              completionTokens: 14,
              totalTokens: 24,
              estimatedCostEur: 0.02,
              latencyMs: 1100
            }
          };
        }

        return {
          outputText: "Final answer from second provider.",
          outputSnapshot: {
            result: "Final answer from second provider."
          },
          usage: {
            promptTokens: 12,
            completionTokens: 16,
            totalTokens: 28,
            estimatedCostEur: 0.03,
            latencyMs: 1400
          }
        };
      }
    });

    const execution = await runtime.runDefinition({
      definition: createWorkflowDefinitionRecord(),
      assets: [createWorkflowAssetRecord()]
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
        sourceNodeId: "node-prompt"
      },
      {
        role: "assistant",
        content: "Draft answer from first provider.",
        sourceNodeId: "node-provider-1"
      }
    ]);
    expect(providerCalls[1]?.envelope.variables).toMatchObject({
      "node-prompt": "Base workflow prompt",
      "node-provider-1": "Draft answer from first provider."
    });
    expect(providerCalls[1]?.prompt).toContain("Draft answer from first provider.");
    expect(execution.nodeRuns[3]?.outputSnapshot).toEqual({
      result: "Final answer from second provider."
    });
  });
});

const createWorkflowDefinitionRecord = (): WorkflowDefinitionRecord => ({
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
    config: {}
  },
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  },
  executionPolicy: {
    maxNodeRetries: 1,
    allowManualCheckpointResume: false
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 8,
    carryArtifactLimit: 8
  },
  tags: ["baseline", "continuity"],
  nodes: [
    createNodeRecord({
      id: "node-trigger",
      kind: WorkflowNodeKind.TriggerManual
    }),
    createNodeRecord({
      id: "node-prompt",
      kind: WorkflowNodeKind.AssetPrompt,
      assetId: "asset-prompt"
    }),
    createNodeRecord({
      id: "node-provider-1",
      kind: WorkflowNodeKind.AiProviderRun,
      provider: createProviderSelection("profile-1", "gpt-1"),
      prompt: "Draft with the workflow prompt."
    }),
    createNodeRecord({
      id: "node-provider-2",
      kind: WorkflowNodeKind.AiProviderRun,
      provider: createProviderSelection("profile-2", "gpt-2"),
      prompt: "Refine the prior output."
    })
  ],
  edges: [
    createEdgeRecord("edge-1", "node-trigger", "node-prompt"),
    createEdgeRecord("edge-2", "node-prompt", "node-provider-1"),
    createEdgeRecord("edge-3", "node-provider-1", "node-provider-2")
  ]
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
  updatedAt: BaseTime
});

const createNodeRecord = (input: {
  id: string;
  kind: WorkflowNodeKind;
  assetId?: string;
  provider?: WorkflowProviderSelectionRecord;
  prompt?: string;
}) => ({
  id: input.id,
  kind: input.kind,
  label: input.id,
  position: {
    x: 0,
    y: 0
  },
  width: 320,
  collapsed: false,
  config: {
    ...(input.assetId ? { assetId: input.assetId } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.prompt ? { prompt: input.prompt } : {})
  },
  inputPorts: [],
  outputPorts: [],
  attachedGuardrails: []
});

const createProviderSelection = (
  providerId: string,
  modelId: string
): WorkflowProviderSelectionRecord => ({
  providerId,
  modelId,
  reasoningLevel: WorkflowReasoningLevel.Medium,
  temperature: 0.2,
  verbosity: WorkflowVerbosity.Medium
});

const createEdgeRecord = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string
) => ({
  id,
  sourceNodeId,
  sourcePortId: "out",
  targetNodeId,
  targetPortId: "in",
  mapping: {
    mode: "passthrough" as const,
    entries: []
  }
});

const createNowSequence = (): (() => Date) => {
  let offset = 0;
  return () => {
    const value = new Date(new Date(BaseTime).getTime() + offset);
    offset += 1000;
    return value;
  };
};
