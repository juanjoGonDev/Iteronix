import { describe, expect, it } from "vitest";
import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowExecutionStatus,
  WorkflowNodeExecutionInputSourceKind,
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../../packages/shared/src/workflows";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import { ErrorMessage, HttpStatus } from "./constants";
import { createProjectStore } from "./projects";
import { ResultType } from "./result";
import {
  executeWorkflowAssetDelete,
  executeWorkflowAssetGet,
  executeWorkflowAssetList,
  executeWorkflowAssetUsageList,
  executeWorkflowAssetUpsert,
  executeWorkflowDefinitionDelete,
  executeWorkflowDefinitionGet,
  executeWorkflowDefinitionList,
  executeWorkflowDefinitionUpsert,
  executeWorkflowExecutionDelete,
  executeWorkflowExecutionGet,
  executeWorkflowExecutionList,
  executeWorkflowExecutionCancel,
  executeWorkflowExecutionRun,
  executeWorkflowNodeExecutionRun,
  executeWorkflowNodeProviderTest,
  parseWorkflowAssetDeleteRequest,
  parseWorkflowAssetUpsertRequest,
  parseWorkflowDefinitionDeleteRequest,
  parseWorkflowDefinitionUpsertRequest,
  parseWorkflowExecutionDeleteRequest,
  parseWorkflowExecutionGetRequest,
  parseWorkflowExecutionListRequest,
  parseWorkflowExecutionCancelRequest,
  parseWorkflowExecutionRunRequest,
  parseWorkflowNodeExecutionRunRequest,
  parseWorkflowNodeProviderTestRequest,
} from "./workflows";

const BaseTime = "2026-05-06T18:00:00.000Z";

describe("workflow api contracts", () => {
  it("accepts a manual-trigger workflow definition request", () => {
    const result = parseWorkflowDefinitionUpsertRequest({
      projectId: "project-1",
      definition: createWorkflowDefinitionInput(),
    });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      throw new Error("Expected workflow definition request to parse.");
    }

    expect(result.value.definition.trigger.kind).toBe(
      WorkflowTriggerKind.Manual,
    );
  });

  it("rejects workflow definitions that enable non-manual triggers in the MVP", () => {
    const result = parseWorkflowDefinitionUpsertRequest({
      projectId: "project-1",
      definition: {
        ...createWorkflowDefinitionInput(),
        trigger: {
          kind: WorkflowTriggerKind.Schedule,
          enabled: true,
          config: {},
        },
      },
    });

    expect(result).toEqual({
      type: ResultType.Err,
      error: {
        status: HttpStatus.BadRequest,
        message: ErrorMessage.InvalidBody,
      },
    });
  });

  it("creates, lists, gets and deletes workflow definitions", () => {
    const projectStore = createProjectStore({
      projects: [createProjectRecord()],
    });
    const catalog = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const upserted = executeWorkflowDefinitionUpsert(
      {
        projectId: "project-1",
        definition: createWorkflowDefinitionInput(),
      },
      {
        projectStore,
        catalog,
      },
    );

    expect(upserted.type).toBe(ResultType.Ok);
    if (upserted.type !== ResultType.Ok) {
      throw new Error("Expected workflow upsert to succeed.");
    }

    const listed = executeWorkflowDefinitionList(
      {
        projectId: "project-1",
      },
      {
        projectStore,
        catalog,
      },
    );
    const fetched = executeWorkflowDefinitionGet(
      {
        workflowId: upserted.value.id,
      },
      {
        catalog,
      },
    );
    const deleted = executeWorkflowDefinitionDelete(
      {
        workflowId: upserted.value.id,
      },
      {
        catalog,
      },
    );

    expect(listed.type).toBe(ResultType.Ok);
    expect(fetched.type).toBe(ResultType.Ok);
    expect(deleted.type).toBe(ResultType.Ok);
    if (listed.type === ResultType.Ok) {
      expect(listed.value).toHaveLength(1);
    }
  });

  it("creates assets, lists usages and blocks deleting referenced assets", () => {
    const projectStore = createProjectStore({
      projects: [createProjectRecord()],
    });
    const catalog = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });

    const asset = executeWorkflowAssetUpsert(
      {
        projectId: "project-1",
        asset: createWorkflowAssetInput(),
      },
      {
        projectStore,
        catalog,
      },
    );

    expect(asset.type).toBe(ResultType.Ok);
    if (asset.type !== ResultType.Ok) {
      throw new Error("Expected asset upsert to succeed.");
    }

    executeWorkflowDefinitionUpsert(
      {
        projectId: "project-1",
        definition: createWorkflowDefinitionInput(asset.value.id),
      },
      {
        projectStore,
        catalog,
      },
    );

    const usages = executeWorkflowAssetUsageList(
      {
        assetId: asset.value.id,
      },
      {
        catalog,
      },
    );
    const listed = executeWorkflowAssetList(
      {
        projectId: "project-1",
        workspaceId: "workspace-1",
      },
      {
        projectStore,
        catalog,
      },
    );
    const fetched = executeWorkflowAssetGet(
      {
        assetId: asset.value.id,
      },
      {
        catalog,
      },
    );
    const blockedDelete = executeWorkflowAssetDelete(
      {
        assetId: asset.value.id,
      },
      {
        catalog,
      },
    );

    expect(usages.type).toBe(ResultType.Ok);
    expect(listed.type).toBe(ResultType.Ok);
    expect(fetched.type).toBe(ResultType.Ok);
    if (usages.type === ResultType.Ok) {
      expect(usages.value).toHaveLength(1);
    }
    expect(blockedDelete.type).toBe(ResultType.Err);
    if (blockedDelete.type === ResultType.Err) {
      expect(blockedDelete.error.status).toBe(HttpStatus.Conflict);
    }
  });

  it("lists, gets and deletes executions", () => {
    const catalog = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });
    const execution = catalog.upsertExecution({
      workflowId: "workflow-1",
      projectId: "project-1",
      triggerKind: WorkflowTriggerKind.Manual,
      status: WorkflowExecutionStatus.Completed,
      startedAt: BaseTime,
      warningsCount: 0,
      errorsCount: 0,
      totals: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        estimatedCostEur: 0.1,
        latencyMs: 100,
      },
      contextSessionId: "context-1",
      nodeRuns: [],
    });

    const listed = executeWorkflowExecutionList(
      {
        projectId: "project-1",
      },
      {
        catalog,
      },
    );
    const fetched = executeWorkflowExecutionGet(
      {
        executionId: execution.id,
      },
      {
        catalog,
      },
    );
    const deleted = executeWorkflowExecutionDelete(
      {
        executionId: execution.id,
      },
      {
        catalog,
      },
    );

    expect(listed.type).toBe(ResultType.Ok);
    expect(fetched.type).toBe(ResultType.Ok);
    expect(deleted.type).toBe(ResultType.Ok);
  });

  it("runs a workflow execution and persists the returned record", async () => {
    const catalog = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });
    catalog.upsertWorkflow({
      ...createWorkflowDefinitionInput(),
      id: "workflow-1",
      projectId: "project-1",
      nodes: [createProviderRunNodeRecord()],
    });

    const result = await executeWorkflowExecutionRun(
      {
        workflowId: "workflow-1",
      },
      {
        catalog,
        runWorkflow: async ({ definition }) => ({
          id: "execution-1",
          workflowId: definition.id,
          projectId: definition.projectId,
          triggerKind: WorkflowTriggerKind.Manual,
          status: WorkflowExecutionStatus.Completed,
          startedAt: BaseTime,
          finishedAt: "2026-05-06T18:01:00.000Z",
          durationMs: 60000,
          warningsCount: 0,
          errorsCount: 0,
          totals: {
            promptTokens: 2,
            completionTokens: 3,
            totalTokens: 5,
            estimatedCostEur: 0.01,
            latencyMs: 1000,
          },
          contextSessionId: "ctx-1",
          nodeRuns: [],
        }),
      },
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(catalog.getExecution("execution-1")?.workflowId).toBe(
        "workflow-1",
      );
      expect(result.value.totals.totalTokens).toBe(5);
    }
  });

  it("runs and persists a partial node execution", async () => {
    const catalog = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });
    catalog.upsertWorkflow({
      ...createWorkflowDefinitionInput(),
      id: "workflow-1",
      projectId: "project-1",
      nodes: [createProviderRunNodeRecord()],
    });

    const result = await executeWorkflowNodeExecutionRun(
      {
        workflowId: "workflow-1",
        nodeId: "node-1",
        inputSource: {
          kind: WorkflowNodeExecutionInputSourceKind.AllPrevious,
        },
      },
      {
        catalog,
        runNode: async ({ definition, nodeId, inputSource }) => ({
          id: "execution-node-1",
          workflowId: definition.id,
          projectId: definition.projectId,
          triggerKind: WorkflowTriggerKind.Manual,
          status: WorkflowExecutionStatus.Completed,
          startedAt: BaseTime,
          finishedAt: "2026-05-06T18:01:00.000Z",
          durationMs: 60000,
          warningsCount: 0,
          errorsCount: 0,
          totals: {
            promptTokens: 2,
            completionTokens: 3,
            totalTokens: 5,
            estimatedCostEur: 0.01,
            latencyMs: 1000,
          },
          contextSessionId: `${nodeId}-${inputSource.kind}`,
          nodeRuns: [],
        }),
      },
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(catalog.getExecution("execution-node-1")?.workflowId).toBe(
        "workflow-1",
      );
      expect(result.value.contextSessionId).toBe("node-1-all-previous");
    }
  });

  it("cancels a running workflow execution and persists the history state", () => {
    const catalog = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });
    const execution = catalog.upsertExecution({
      id: "execution-running",
      workflowId: "workflow-1",
      projectId: "project-1",
      triggerKind: WorkflowTriggerKind.Manual,
      status: WorkflowExecutionStatus.Running,
      startedAt: BaseTime,
      warningsCount: 0,
      errorsCount: 0,
      totals: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostEur: 0,
        latencyMs: 0,
      },
      contextSessionId: "context-1",
      nodeRuns: [
        {
          id: "node-run-1",
          nodeId: "node-1",
          nodeKind: WorkflowNodeKind.AiProviderRun,
          status: "running",
          startedAt: BaseTime,
          alerts: [],
          guardrailFindings: [],
        },
      ],
    });
    const canceledIds: string[] = [];

    const result = executeWorkflowExecutionCancel(
      {
        executionId: execution.id,
      },
      {
        catalog,
        now: () => new Date("2026-05-06T18:01:00.000Z"),
        cancelActiveExecution: (executionId) => {
          canceledIds.push(executionId);
        },
      },
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      throw new Error("Expected workflow execution cancel to succeed.");
    }
    expect(canceledIds).toEqual(["execution-running"]);
    expect(result.value.status).toBe(WorkflowExecutionStatus.Canceled);
    expect(result.value.finishedAt).toBe("2026-05-06T18:01:00.000Z");
    expect(result.value.nodeRuns[0]?.status).toBe("skipped");
    expect(catalog.getExecution("execution-running")?.status).toBe(
      WorkflowExecutionStatus.Canceled,
    );
  });

  it("tests a workflow node provider and updates provider continuity metadata", async () => {
    const catalog = createWorkflowCatalogStore({
      now: () => new Date(BaseTime),
    });
    catalog.upsertWorkflow({
      ...createWorkflowDefinitionInput(),
      id: "workflow-1",
      projectId: "project-1",
      nodes: [createProviderRunNodeRecord()],
    });

    const result = await executeWorkflowNodeProviderTest(
      {
        workflowId: "workflow-1",
        nodeId: "node-1",
      },
      {
        catalog,
        testProviderNode: async () => ({
          status: "passed",
          testedAt: "2026-05-06T18:02:00.000Z",
          message: "Provider responded to smoke test.",
        }),
      },
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.status).toBe("passed");
      expect(
        result.value.definition.nodes[0]?.config.provider?.testStatus,
      ).toBe("passed");
      expect(result.value.definition.nodes[0]?.config.provider?.testedAt).toBe(
        "2026-05-06T18:02:00.000Z",
      );
    }
  });

  it("parses workflow asset and execution request payloads", () => {
    expect(
      parseWorkflowAssetUpsertRequest({
        projectId: "project-1",
        asset: createWorkflowAssetInput(),
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowAssetDeleteRequest({
        assetId: "asset-1",
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowDefinitionDeleteRequest({
        workflowId: "workflow-1",
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowExecutionListRequest({
        projectId: "project-1",
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowExecutionGetRequest({
        executionId: "execution-1",
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowExecutionCancelRequest({
        executionId: "execution-1",
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowExecutionDeleteRequest({
        executionId: "execution-1",
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowExecutionRunRequest({
        workflowId: "workflow-1",
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowNodeExecutionRunRequest({
        workflowId: "workflow-1",
        nodeId: "node-1",
        inputSource: {
          kind: WorkflowNodeExecutionInputSourceKind.NodeOutput,
          nodeId: "node-upstream",
        },
      }).type,
    ).toBe(ResultType.Ok);
    expect(
      parseWorkflowNodeProviderTestRequest({
        workflowId: "workflow-1",
        nodeId: "node-1",
      }).type,
    ).toBe(ResultType.Ok);
  });
});

const createProjectRecord = () => ({
  id: "project-1",
  name: "Iteronix",
  rootPath: null,
  createdAt: BaseTime,
  updatedAt: BaseTime,
});

const createWorkflowDefinitionInput = (assetId = "asset-1") => ({
  workspaceId: "workspace-1",
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
      id: "node-1",
      kind: WorkflowNodeKind.AssetPrompt,
      label: "Prompt",
      position: {
        x: 0,
        y: 0,
      },
      width: 320,
      collapsed: false,
      config: {
        assetId,
      },
      inputPorts: [],
      outputPorts: [],
      attachedGuardrails: [],
    },
  ],
  edges: [],
});

const createWorkflowAssetInput = () => ({
  workspaceId: "workspace-1",
  kind: WorkflowAssetKind.Prompt,
  scope: WorkflowAssetScope.Workspace,
  name: "Planner prompt",
  slug: "planner-prompt",
  description: "Prompt",
  body: "Plan the task",
  language: "en",
  tags: [],
});

const createProviderRunNodeRecord = () => ({
  id: "node-1",
  kind: WorkflowNodeKind.AiProviderRun,
  label: "Provider",
  position: {
    x: 0,
    y: 0,
  },
  width: 320,
  collapsed: false,
  config: {
    provider: {
      providerId: "profile-1",
      modelId: "gpt-1",
      reasoningLevel: "medium" as const,
      temperature: 0.2,
      verbosity: "medium" as const,
    },
  },
  inputPorts: [],
  outputPorts: [],
  attachedGuardrails: [],
});
