import { describe, expect, it } from "vitest";
import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowExecutionStatus,
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../shared/src/workflows";
import {
  createWorkflowCatalogStore,
  type WorkflowDefinitionUpsertInput,
} from "./workflow-catalog";

const BaseTime = "2026-05-06T18:00:00.000Z";

describe("workflow catalog store", () => {
  it("exposes one global asset catalog without a workspace filter", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    store.upsertAsset({
      kind: WorkflowAssetKind.Prompt,
      scope: WorkflowAssetScope.Workspace,
      name: "Global prompt",
      slug: "global-prompt",
      description: "Prompt",
      body: "Plan",
      language: "en",
      tags: [],
    });
    store.upsertAsset({
      kind: WorkflowAssetKind.Instruction,
      scope: WorkflowAssetScope.Workspace,
      name: "Global instruction",
      slug: "global-instruction",
      description: "Instruction",
      body: "Execute",
      language: "en",
      tags: [],
    });

    expect(store.listAssets()).toHaveLength(2);
  });

  it("stores workflow catalog records without a project scope", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const workflow = store.upsertWorkflow(
      createWorkflowInput({ name: "Scope-native workflow" }),
    );

    expect(workflow).not.toHaveProperty("projectId");
    expect(store.listWorkflows()).toEqual([workflow]);
  });

  it("derives asset usage records from workflow definitions", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const promptAsset = store.upsertAsset({
      kind: WorkflowAssetKind.Prompt,
      scope: WorkflowAssetScope.Workspace,
      name: "Planner prompt",
      slug: "planner-prompt",
      description: "Prompt",
      body: "Plan the task",
      language: "en",
      tags: [],
    });

    const guardrailAsset = store.upsertAsset({
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
            message: "answer is required",
          },
        ],
      },
    });

    if (!promptAsset || !guardrailAsset) {
      throw new Error("Expected workflow assets to be stored.");
    }

    const workflow = store.upsertWorkflow({
      name: "Example workflow",
      description: "Description",
      status: WorkflowRecordStatus.Draft,
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
        allowManualCheckpointResume: true,
      },
      defaultContextPolicy: {
        language: "en",
        carryMessagesLimit: 8,
        carryArtifactLimit: 8,
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
            assetId: promptAsset.id,
          },
          inputPorts: [],
          outputPorts: [
            {
              id: "output",
              name: "output",
              acceptsMany: true,
            },
          ],
          attachedGuardrails: [
            {
              assetId: guardrailAsset.id,
              order: 0,
              enabled: true,
            },
          ],
        },
      ],
      edges: [],
    });

    if (!workflow) {
      throw new Error("Expected workflow to be stored.");
    }

    const usages = store.listAssetUsages();

    expect(usages).toHaveLength(2);
    expect(usages.map((usage) => usage.assetId).sort()).toEqual(
      [guardrailAsset.id, promptAsset.id].sort(),
    );
  });

  it("prevents deleting an asset while it is still referenced", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const asset = store.upsertAsset({
      kind: WorkflowAssetKind.Prompt,
      scope: WorkflowAssetScope.Workspace,
      name: "Planner prompt",
      slug: "planner-prompt",
      description: "Prompt",
      body: "Plan the task",
      language: "en",
      tags: [],
    });

    if (!asset) {
      throw new Error("Expected workflow asset to be stored.");
    }

    store.upsertWorkflow({
      name: "Example workflow",
      description: "Description",
      status: WorkflowRecordStatus.Draft,
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
        allowManualCheckpointResume: true,
      },
      defaultContextPolicy: {
        language: "en",
        carryMessagesLimit: 8,
        carryArtifactLimit: 8,
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
            assetId: asset.id,
          },
          inputPorts: [],
          outputPorts: [],
          attachedGuardrails: [],
        },
      ],
      edges: [],
    });

    expect(() => store.deleteAsset(asset.id)).toThrowError(/referenced/i);
  });

  it("lists all workflow assets in the same workspace", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    store.upsertAsset({
      kind: WorkflowAssetKind.Prompt,
      scope: WorkflowAssetScope.Workspace,
      name: "Shared prompt",
      slug: "shared-prompt",
      description: "Prompt",
      body: "Shared",
      language: "en",
      tags: [],
    });
    store.upsertAsset({
      kind: WorkflowAssetKind.Instruction,
      scope: WorkflowAssetScope.Workspace,
      name: "Workflow instruction",
      slug: "workflow-instruction",
      description: "Instruction",
      body: "Project",
      language: "en",
      tags: [],
    });
    store.upsertAsset({
      kind: WorkflowAssetKind.Instruction,
      scope: WorkflowAssetScope.Workspace,
      name: "Other instruction",
      slug: "other-instruction",
      description: "Instruction",
      body: "Other",
      language: "en",
      tags: [],
    });

    const assets = store.listAssets();

    expect(assets.map((asset) => asset.name).sort()).toEqual([
      "Other instruction",
      "Shared prompt",
      "Workflow instruction",
    ]);
  });

  it("stores and manages workflow execution history", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const execution = store.upsertExecution({
      workflowId: "workflow-1",
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
        latencyMs: 1000,
      },
      contextSessionId: "context-1",
      nodeRuns: [],
    });

    expect(store.listExecutions({})).toHaveLength(1);
    expect(store.getExecution(execution.id)?.id).toBe(execution.id);

    const removed = store.deleteExecution(execution.id);

    expect(removed?.id).toBe(execution.id);
    expect(store.listExecutions({})).toHaveLength(0);
  });

  it("stores workflow definition versions and restores an older snapshot", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const created = store.upsertWorkflow(
      createWorkflowInput({
        name: "First workflow name",
      }),
    );
    const updated = store.upsertWorkflow(
      createWorkflowInput({
        id: created.id,
        name: "Second workflow name",
      }),
    );

    const versions = store.listWorkflowVersions({
      workflowId: created.id,
    });

    expect(updated.version).toBe(2);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[1]?.snapshot.name).toBe("First workflow name");

    const restored = store.restoreWorkflowVersion({
      workflowId: created.id,
      versionId: versions[1]?.id ?? "",
    });

    expect(restored?.version).toBe(3);
    expect(restored?.name).toBe("First workflow name");
    expect(store.getWorkflow(created.id)?.name).toBe("First workflow name");
    expect(
      store.listWorkflowVersions({
        workflowId: created.id,
      }),
    ).toHaveLength(3);
  });

  it("clones a workflow definition from a persisted version snapshot", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const created = store.upsertWorkflow(
      createWorkflowInput({
        name: "Source workflow",
      }),
    );
    store.upsertWorkflow(
      createWorkflowInput({
        id: created.id,
        name: "Updated source workflow",
      }),
    );
    const versions = store.listWorkflowVersions({
      workflowId: created.id,
    });

    const cloned = store.cloneWorkflowVersion({
      workflowId: created.id,
      versionId: versions[1]?.id ?? "",
    });

    expect(cloned?.id).not.toBe(created.id);
    expect(cloned?.name).toBe("Source workflow copy");
    expect(cloned?.version).toBe(1);
    expect(store.listWorkflows()).toHaveLength(2);
    expect(
      cloned ? store.listWorkflowVersions({ workflowId: cloned.id }) : [],
    ).toHaveLength(1);
  });

  it("manages rich workflow versions without duplicate snapshot noise", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const created = store.upsertWorkflow(
      createWorkflowInput({
        name: "Source workflow",
        versionNote: "first save",
        versionTags: ["release"],
      }),
    );
    const duplicate = store.upsertWorkflow(
      createWorkflowInput({
        id: created.id,
        name: "Source workflow",
      }),
    );
    const updated = store.upsertWorkflow(
      createWorkflowInput({
        id: created.id,
        name: "Updated workflow",
      }),
    );
    const versions = store.listWorkflowVersions({
      workflowId: created.id,
    });

    expect(duplicate.version).toBe(1);
    expect(updated.version).toBe(2);
    expect(versions).toHaveLength(2);
    expect(versions[1]?.checksum).toMatch(/[a-f0-9]{64}/);
    expect(versions[1]?.note).toBe("first save");
    expect(versions[1]?.tags).toEqual(["release"]);
    expect(versions[0]?.changeSummary).toContain("workflow changes");
  });

  it("supports named clone, partial restore, export/import and retention", () => {
    const store = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const created = store.upsertWorkflow(
      createWorkflowInput({
        name: "Source workflow",
        nodes: [
          createWorkflowNode({
            id: "node-a",
            label: "Original node",
          }),
        ],
      }),
    );
    store.upsertWorkflow(
      createWorkflowInput({
        id: created.id,
        name: "Updated workflow",
        nodes: [
          createWorkflowNode({
            id: "node-a",
            label: "Updated node",
          }),
        ],
      }),
    );
    const versions = store.listWorkflowVersions({
      workflowId: created.id,
    });
    const oldVersionId = versions[1]?.id ?? "";

    const cloned = store.cloneWorkflowVersion({
      workflowId: created.id,
      versionId: oldVersionId,
      name: "Custom clone",
    });
    const partial = store.restoreWorkflowVersionPart({
      workflowId: created.id,
      versionId: oldVersionId,
      part: {
        kind: "nodes",
        nodeIds: ["node-a"],
      },
    });
    const exported = store.exportWorkflowVersion({
      workflowId: created.id,
      versionId: oldVersionId,
    });
    const imported = exported
      ? store.importWorkflowVersion({
          exported,
          name: "Imported workflow",
        })
      : undefined;
    const retention = store.cleanupWorkflowVersions({
      workflowId: created.id,
      keepLatest: 1,
    });

    expect(cloned?.name).toBe("Custom clone");
    expect(partial?.nodes[0]?.label).toBe("Original node");
    expect(exported?.checksum).toMatch(/[a-f0-9]{64}/);
    expect(imported?.name).toBe("Imported workflow");
    expect(imported?.id).not.toBe(created.id);
    expect(retention.removed).toHaveLength(2);
    expect(store.listWorkflowVersions({ workflowId: created.id })).toHaveLength(
      1,
    );
  });
});

const createWorkflowInput = (input: {
  id?: string;
  name: string;
  versionNote?: string;
  versionTags?: ReadonlyArray<string>;
  nodes?: WorkflowDefinitionUpsertInput["nodes"];
}): WorkflowDefinitionUpsertInput => ({
  ...(input.id ? { id: input.id } : {}),
  ...(input.versionNote ? { versionNote: input.versionNote } : {}),
  ...(input.versionTags ? { versionTags: input.versionTags } : {}),
  name: input.name,
  description: "Description",
  status: WorkflowRecordStatus.Draft,
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
    allowManualCheckpointResume: true,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 8,
    carryArtifactLimit: 8,
  },
  tags: [],
  nodes: input.nodes ?? [],
  edges: [],
});

const createWorkflowNode = (input: {
  id: string;
  label: string;
}): WorkflowDefinitionUpsertInput["nodes"][number] => ({
  id: input.id,
  kind: WorkflowNodeKind.AiAgent,
  label: input.label,
  position: {
    x: 0,
    y: 0,
  },
  width: 220,
  collapsed: false,
  config: {},
  inputPorts: [],
  outputPorts: [],
  attachedGuardrails: [],
});
