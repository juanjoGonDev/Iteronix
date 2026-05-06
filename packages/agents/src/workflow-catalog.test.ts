import { describe, expect, it } from "vitest";
import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowExecutionStatus,
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind
} from "../../shared/src/workflows";
import { createWorkflowCatalogStore } from "./workflow-catalog";

const BaseTime = "2026-05-06T18:00:00.000Z";

describe("workflow catalog store", () => {
  it("derives asset usage records from workflow definitions", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime)
    });

    const promptAsset = store.upsertAsset({
      workspaceId: "workspace-1",
      kind: WorkflowAssetKind.Prompt,
      scope: WorkflowAssetScope.Workspace,
      name: "Planner prompt",
      slug: "planner-prompt",
      description: "Prompt",
      body: "Plan the task",
      language: "en",
      tags: []
    });

    const guardrailAsset = store.upsertAsset({
      workspaceId: "workspace-1",
      kind: WorkflowAssetKind.Guardrail,
      scope: WorkflowAssetScope.Workspace,
      name: "Groundedness",
      slug: "groundedness",
      description: "Guard",
      body: "",
      language: "en",
      tags: [],
      guardrail: {
        id: "guard-1",
        severity: "error",
        operator: "all",
        validations: [
          {
            id: "validation-1",
            kind: "field_exists",
            target: "output",
            path: "$.answer",
            message: "answer is required"
          }
        ]
      }
    });

    if (!promptAsset || !guardrailAsset) {
      throw new Error("Expected workflow assets to be stored.");
    }

    const workflow = store.upsertWorkflow({
      workspaceId: "workspace-1",
      projectId: "project-1",
      name: "Example workflow",
      description: "Description",
      status: WorkflowRecordStatus.Draft,
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
        allowManualCheckpointResume: true
      },
      defaultContextPolicy: {
        language: "en",
        carryMessagesLimit: 8,
        carryArtifactLimit: 8
      },
      tags: [],
      nodes: [
        {
          id: "node-prompt",
          kind: WorkflowNodeKind.AssetPrompt,
          label: "Prompt",
          position: { x: 0, y: 0 },
          width: 320,
          collapsed: false,
          config: {
            assetId: promptAsset.id
          },
          inputPorts: [],
          outputPorts: [
            {
              id: "output",
              name: "output",
              acceptsMany: true
            }
          ],
          attachedGuardrails: [
            {
              assetId: guardrailAsset.id,
              order: 0,
              enabled: true
            }
          ]
        }
      ],
      edges: []
    });

    if (!workflow) {
      throw new Error("Expected workflow to be stored.");
    }

    const usages = store.listAssetUsages();

    expect(usages).toHaveLength(2);
    expect(usages.map((usage) => usage.assetId).sort()).toEqual(
      [guardrailAsset.id, promptAsset.id].sort()
    );
  });

  it("prevents deleting an asset while it is still referenced", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime)
    });

    const asset = store.upsertAsset({
      workspaceId: "workspace-1",
      kind: WorkflowAssetKind.Prompt,
      scope: WorkflowAssetScope.Workspace,
      name: "Planner prompt",
      slug: "planner-prompt",
      description: "Prompt",
      body: "Plan the task",
      language: "en",
      tags: []
    });

    if (!asset) {
      throw new Error("Expected workflow asset to be stored.");
    }

    store.upsertWorkflow({
      workspaceId: "workspace-1",
      projectId: "project-1",
      name: "Example workflow",
      description: "Description",
      status: WorkflowRecordStatus.Draft,
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
        allowManualCheckpointResume: true
      },
      defaultContextPolicy: {
        language: "en",
        carryMessagesLimit: 8,
        carryArtifactLimit: 8
      },
      tags: [],
      nodes: [
        {
          id: "node-prompt",
          kind: WorkflowNodeKind.AssetPrompt,
          label: "Prompt",
          position: { x: 0, y: 0 },
          width: 320,
          collapsed: false,
          config: {
            assetId: asset.id
          },
          inputPorts: [],
          outputPorts: [],
          attachedGuardrails: []
        }
      ],
      edges: []
    });

    expect(() => store.deleteAsset(asset.id)).toThrowError(/referenced/i);
  });

  it("filters project assets while keeping workspace-scoped assets available", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime)
    });

    store.upsertAsset({
      workspaceId: "workspace-1",
      kind: WorkflowAssetKind.Prompt,
      scope: WorkflowAssetScope.Workspace,
      name: "Shared prompt",
      slug: "shared-prompt",
      description: "Prompt",
      body: "Shared",
      language: "en",
      tags: []
    });
    store.upsertAsset({
      workspaceId: "workspace-1",
      projectId: "project-1",
      kind: WorkflowAssetKind.Instruction,
      scope: WorkflowAssetScope.Project,
      name: "Project instruction",
      slug: "project-instruction",
      description: "Instruction",
      body: "Project",
      language: "en",
      tags: []
    });
    store.upsertAsset({
      workspaceId: "workspace-1",
      projectId: "project-2",
      kind: WorkflowAssetKind.Instruction,
      scope: WorkflowAssetScope.Project,
      name: "Other instruction",
      slug: "other-instruction",
      description: "Instruction",
      body: "Other",
      language: "en",
      tags: []
    });

    const assets = store.listAssets({
      workspaceId: "workspace-1",
      projectId: "project-1"
    });

    expect(assets.map((asset) => asset.name).sort()).toEqual([
      "Project instruction",
      "Shared prompt"
    ]);
  });

  it("stores and manages workflow execution history", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime)
    });

    const execution = store.upsertExecution({
      workflowId: "workflow-1",
      projectId: "project-1",
      triggerKind: WorkflowTriggerKind.Manual,
      status: WorkflowExecutionStatus.Completed,
      startedAt: BaseTime,
      finishedAt: "2026-05-06T18:01:00.000Z",
      durationMs: 60000,
      warningsCount: 1,
      errorsCount: 0,
      totals: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        estimatedCostEur: 0.12,
        latencyMs: 1000
      },
      contextSessionId: "context-1",
      nodeRuns: []
    });

    expect(store.listExecutions({
      projectId: "project-1"
    })).toHaveLength(1);
    expect(store.getExecution(execution.id)?.id).toBe(execution.id);

    const removed = store.deleteExecution(execution.id);

    expect(removed?.id).toBe(execution.id);
    expect(store.listExecutions({
      projectId: "project-1"
    })).toHaveLength(0);
  });
});
