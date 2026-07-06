import type {
  WorkflowCatalogStore,
  WorkflowAssetUpsertInput,
  WorkflowDefinitionUpsertInput,
} from "../../../packages/agents/src/workflow-catalog";
import { migrateWorkflowVersionExport } from "../../../packages/agents/src/workflow-versioning";
import type {
  WorkflowVersionExportRecord,
  WorkflowVersionImportPreviewRecord,
  WorkflowVersionRestorePart,
  WorkflowVersionTimelineExportRecord,
} from "../../../packages/agents/src/workflow-versioning";
import type { WorkflowRuntimeEvent } from "../../../packages/agents/src/workflow-runtime";
import {
  isWorkflowTriggerKindSupportedInMvp,
  type WorkflowAssetUsageRecord,
  type WorkflowAssetRecord,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionVersionRecord,
  type WorkflowExecutionRecord,
  WorkflowExecutionStatus,
  WorkflowNodeExecutionInputSourceKind,
  type WorkflowNodeExecutionInputSourceRecord,
  WorkflowNodeKind,
} from "../../../packages/shared/src/workflows";
import { ErrorMessage, HttpStatus } from "./constants";
import type { ProjectStore } from "./projects";
import { ResultType, err, ok, type Result } from "./result";

const WorkflowCancelAlertId = "workflow-execution-canceled";
const WorkflowCancelAlertMessage = "Workflow execution stopped by user.";

export type ApiError = {
  status: number;
  message: string;
};

export type WorkflowNodeProviderTestResult = {
  definition: WorkflowDefinitionRecord;
  nodeId: string;
  status: "passed" | "failed";
  testedAt: string;
  message: string;
};

export const executeWorkflowDefinitionUpsert = (
  input: {
    projectId: string;
    definition: WorkflowDefinitionUpsertInput;
  },
  dependencies: {
    projectStore: ProjectStore;
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowDefinitionRecord, ApiError> => {
  const project = dependencies.projectStore.getById(input.projectId);
  if (project.type === ResultType.Err) {
    return err({
      status: HttpStatus.NotFound,
      message: project.error.message,
    });
  }

  return ok(
    dependencies.catalog.upsertWorkflow({
      ...input.definition,
      projectId: project.value.id,
    }),
  );
};

export const executeWorkflowDefinitionList = (
  input: {
    projectId: string;
  },
  dependencies: {
    projectStore: ProjectStore;
    catalog: WorkflowCatalogStore;
  },
): Result<ReadonlyArray<WorkflowDefinitionRecord>, ApiError> => {
  const project = dependencies.projectStore.getById(input.projectId);
  if (project.type === ResultType.Err) {
    return err({
      status: HttpStatus.NotFound,
      message: project.error.message,
    });
  }

  return ok(
    dependencies.catalog.listWorkflows({
      projectId: project.value.id,
    }),
  );
};

export const executeWorkflowDefinitionGet = (
  input: {
    workflowId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowDefinitionRecord, ApiError> => {
  const workflow = dependencies.catalog.getWorkflow(input.workflowId);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(workflow);
};

export const executeWorkflowDefinitionVersionList = (
  input: {
    workflowId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<ReadonlyArray<WorkflowDefinitionVersionRecord>, ApiError> => {
  const workflow = dependencies.catalog.getWorkflow(input.workflowId);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(
    dependencies.catalog.listWorkflowVersions({
      workflowId: input.workflowId,
    }),
  );
};

export const executeWorkflowDefinitionRestoreVersion = (
  input: {
    workflowId: string;
    versionId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowDefinitionRecord, ApiError> => {
  const workflow = dependencies.catalog.restoreWorkflowVersion(input);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(workflow);
};

export const executeWorkflowDefinitionRestoreVersionPart = (
  input: {
    workflowId: string;
    versionId: string;
    part: WorkflowVersionRestorePart;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowDefinitionRecord, ApiError> => {
  const workflow = dependencies.catalog.restoreWorkflowVersionPart(input);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(workflow);
};

export const executeWorkflowDefinitionCloneVersion = (
  input: {
    workflowId: string;
    versionId: string;
    name?: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowDefinitionRecord, ApiError> => {
  const workflow = dependencies.catalog.cloneWorkflowVersion(input);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(workflow);
};

export const executeWorkflowDefinitionExportVersion = (
  input: {
    workflowId: string;
    versionId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowVersionExportRecord, ApiError> => {
  const exported = dependencies.catalog.exportWorkflowVersion(input);
  if (!exported) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(exported);
};

export const executeWorkflowDefinitionExportVersionTimeline = (
  input: {
    workflowId: string;
    versionIds?: ReadonlyArray<string>;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
    now: () => Date;
  },
): Result<WorkflowVersionTimelineExportRecord, ApiError> => {
  const exported: WorkflowVersionTimelineExportRecord | undefined =
    dependencies.catalog.exportWorkflowVersionTimeline({
      workflowId: input.workflowId,
      ...(input.versionIds ? { versionIds: input.versionIds } : {}),
      exportedAt: dependencies.now().toISOString(),
    });
  if (!exported) {
    return err({
      status: HttpStatus.NotFound,
      message: "Workflow definition not found",
    });
  }

  return ok(exported);
};

export const executeWorkflowDefinitionImportVersion = (
  input: {
    exported: WorkflowVersionExportRecord;
    name?: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowDefinitionRecord, ApiError> => {
  try {
    const workflow = dependencies.catalog.importWorkflowVersion(input);
    if (!workflow) {
      return err({
        status: HttpStatus.NotFound,
        message: ErrorMessage.NotFound,
      });
    }

    return ok(workflow);
  } catch (error) {
    return err({
      status: HttpStatus.BadRequest,
      message:
        error instanceof Error ? error.message : ErrorMessage.InvalidBody,
    });
  }
};

export const executeWorkflowDefinitionPreviewImportVersion = (
  input: {
    exported: WorkflowVersionExportRecord;
    targetWorkspaceId: string;
    targetProjectId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowVersionImportPreviewRecord, ApiError> =>
  ok(dependencies.catalog.previewWorkflowVersionImport(input));

export const executeWorkflowDefinitionCleanupVersions = (
  input: {
    workflowId: string;
    keepLatest: number;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<
  {
    kept: ReadonlyArray<WorkflowDefinitionVersionRecord>;
    removed: ReadonlyArray<WorkflowDefinitionVersionRecord>;
  },
  ApiError
> => {
  const workflow = dependencies.catalog.getWorkflow(input.workflowId);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(dependencies.catalog.cleanupWorkflowVersions(input));
};

export const executeWorkflowDefinitionDelete = (
  input: {
    workflowId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowDefinitionRecord, ApiError> => {
  const workflow = dependencies.catalog.deleteWorkflow(input.workflowId);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(workflow);
};

export const executeWorkflowAssetUpsert = (
  input: {
    projectId: string;
    asset: WorkflowAssetUpsertInput;
  },
  dependencies: {
    projectStore: ProjectStore;
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowAssetRecord, ApiError> => {
  const project = dependencies.projectStore.getById(input.projectId);
  if (project.type === ResultType.Err) {
    return err({
      status: HttpStatus.NotFound,
      message: project.error.message,
    });
  }

  const assetInput: WorkflowAssetUpsertInput = {
    ...input.asset,
  };
  if (input.asset.scope === "project") {
    assetInput.projectId = project.value.id;
  }

  return ok(dependencies.catalog.upsertAsset(assetInput));
};

export const executeWorkflowAssetList = (
  input: {
    projectId: string;
    workspaceId: string;
  },
  dependencies: {
    projectStore: ProjectStore;
    catalog: WorkflowCatalogStore;
  },
): Result<ReadonlyArray<WorkflowAssetRecord>, ApiError> => {
  const project = dependencies.projectStore.getById(input.projectId);
  if (project.type === ResultType.Err) {
    return err({
      status: HttpStatus.NotFound,
      message: project.error.message,
    });
  }

  return ok(
    dependencies.catalog.listAssets({
      workspaceId: input.workspaceId,
      projectId: project.value.id,
    }),
  );
};

export const executeWorkflowAssetGet = (
  input: {
    assetId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowAssetRecord, ApiError> => {
  const asset = dependencies.catalog.getAsset(input.assetId);
  if (!asset) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(asset);
};

export const executeWorkflowAssetDelete = (
  input: {
    assetId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowAssetRecord, ApiError> => {
  try {
    return ok(dependencies.catalog.deleteAsset(input.assetId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : ErrorMessage.InvalidBody;
    return err({
      status: /referenced/i.test(message)
        ? HttpStatus.Conflict
        : HttpStatus.NotFound,
      message,
    });
  }
};

export const executeWorkflowAssetUsageList = (
  input: {
    assetId?: string;
    workflowId?: string;
    projectId?: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<ReadonlyArray<WorkflowAssetUsageRecord>, ApiError> =>
  ok(dependencies.catalog.listAssetUsages(input));

export const executeWorkflowExecutionList = (
  input: {
    projectId: string;
    workflowId?: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<ReadonlyArray<WorkflowExecutionRecord>, ApiError> =>
  ok(dependencies.catalog.listExecutions(input));

export const executeWorkflowExecutionGet = (
  input: {
    executionId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowExecutionRecord, ApiError> => {
  const execution = dependencies.catalog.getExecution(input.executionId);
  if (!execution) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(execution);
};

export const executeWorkflowExecutionDelete = (
  input: {
    executionId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
  },
): Result<WorkflowExecutionRecord, ApiError> => {
  const execution = dependencies.catalog.deleteExecution(input.executionId);
  if (!execution) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  return ok(execution);
};

export const executeWorkflowExecutionCancel = (
  input: {
    executionId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
    now: () => Date;
    cancelActiveExecution?: (executionId: string) => void;
  },
): Result<WorkflowExecutionRecord, ApiError> => {
  const execution = dependencies.catalog.getExecution(input.executionId);
  if (!execution) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  if (!readWorkflowExecutionIsActive(execution.status)) {
    return ok(execution);
  }

  dependencies.cancelActiveExecution?.(execution.id);
  const finishedAt = dependencies.now().toISOString();
  return ok(
    dependencies.catalog.upsertExecution({
      ...execution,
      status: WorkflowExecutionStatus.Canceled,
      finishedAt,
      durationMs: readWorkflowExecutionDurationMs(
        execution.startedAt,
        finishedAt,
      ),
      nodeRuns: execution.nodeRuns.map((nodeRun) =>
        nodeRun.status === "running"
          ? {
              ...nodeRun,
              status: "skipped",
              finishedAt,
              durationMs: readWorkflowExecutionDurationMs(
                nodeRun.startedAt,
                finishedAt,
              ),
              alerts: [
                ...nodeRun.alerts,
                {
                  id: `${WorkflowCancelAlertId}:${nodeRun.id}`,
                  level: "info",
                  source: "system",
                  message: WorkflowCancelAlertMessage,
                  createdAt: finishedAt,
                },
              ],
            }
          : nodeRun,
      ),
    }),
  );
};

export const executeWorkflowExecutionRun = async (
  input: {
    workflowId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
    runWorkflow: (input: {
      definition: WorkflowDefinitionRecord;
      assets: ReadonlyArray<WorkflowAssetRecord>;
      signal?: AbortSignal;
      onEvent?: (event: WorkflowRuntimeEvent) => void;
    }) => Promise<WorkflowExecutionRecord>;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  },
): Promise<Result<WorkflowExecutionRecord, ApiError>> => {
  const workflow = dependencies.catalog.getWorkflow(input.workflowId);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  const assets = dependencies.catalog.listAssets({
    workspaceId: workflow.workspaceId,
    projectId: workflow.projectId,
  });
  const execution = await dependencies.runWorkflow({
    definition: workflow,
    assets,
    ...(dependencies.signal ? { signal: dependencies.signal } : {}),
    ...(dependencies.onEvent ? { onEvent: dependencies.onEvent } : {}),
  });
  return ok(dependencies.catalog.upsertExecution(execution));
};

export const executeWorkflowNodeExecutionRun = async (
  input: {
    workflowId: string;
    nodeId: string;
    inputSource: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
    runNode: (input: {
      definition: WorkflowDefinitionRecord;
      assets: ReadonlyArray<WorkflowAssetRecord>;
      nodeId: string;
      inputSource: WorkflowNodeExecutionInputSourceRecord;
      seedNodeOutputs?: Readonly<Record<string, unknown>>;
      signal?: AbortSignal;
      onEvent?: (event: WorkflowRuntimeEvent) => void;
    }) => Promise<WorkflowExecutionRecord>;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  },
): Promise<Result<WorkflowExecutionRecord, ApiError>> => {
  const workflow = dependencies.catalog.getWorkflow(input.workflowId);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  const node = workflow.nodes.find(
    (candidate) => candidate.id === input.nodeId,
  );
  if (!node) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  const assets = dependencies.catalog.listAssets({
    workspaceId: workflow.workspaceId,
    projectId: workflow.projectId,
  });
  const execution = await dependencies.runNode({
    definition: workflow,
    assets,
    nodeId: input.nodeId,
    inputSource: input.inputSource,
    ...(input.seedNodeOutputs
      ? { seedNodeOutputs: input.seedNodeOutputs }
      : {}),
    ...(dependencies.signal ? { signal: dependencies.signal } : {}),
    ...(dependencies.onEvent ? { onEvent: dependencies.onEvent } : {}),
  });
  return ok(dependencies.catalog.upsertExecution(execution));
};

export const executeWorkflowNodeProviderTest = async (
  input: {
    workflowId: string;
    nodeId: string;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
    testProviderNode: (input: {
      workflow: WorkflowDefinitionRecord;
      node: WorkflowDefinitionRecord["nodes"][number];
      assets: ReadonlyArray<WorkflowAssetRecord>;
    }) => Promise<{
      status: "passed" | "failed";
      testedAt: string;
      message: string;
    }>;
  },
): Promise<Result<WorkflowNodeProviderTestResult, ApiError>> => {
  const workflow = dependencies.catalog.getWorkflow(input.workflowId);
  if (!workflow) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  const node = workflow.nodes.find(
    (candidate) => candidate.id === input.nodeId,
  );
  if (!node) {
    return err({
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  }

  if (
    node.kind !== WorkflowNodeKind.AiProviderRun &&
    node.kind !== WorkflowNodeKind.AiAgent
  ) {
    return invalidBody();
  }

  const assets = dependencies.catalog.listAssets({
    workspaceId: workflow.workspaceId,
    projectId: workflow.projectId,
  });
  const outcome = await dependencies.testProviderNode({
    workflow,
    node,
    assets,
  });
  const updatedDefinition = dependencies.catalog.upsertWorkflow({
    ...workflow,
    nodes: workflow.nodes.map((candidate) =>
      candidate.id === node.id
        ? updateWorkflowNodeProviderTestMetadata(candidate, outcome)
        : candidate,
    ),
  });

  return ok({
    definition: updatedDefinition,
    nodeId: node.id,
    status: outcome.status,
    testedAt: outcome.testedAt,
    message: outcome.message,
  });
};

export const parseWorkflowDefinitionUpsertRequest = (
  value: unknown,
): Result<
  { projectId: string; definition: WorkflowDefinitionUpsertInput },
  ApiError
> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    "projectId",
    ErrorMessage.MissingProjectId,
  );
  const definition = value["definition"];
  if (projectId.type === ResultType.Err || !isRecord(definition)) {
    return invalidBody();
  }

  const candidate = definition as unknown as WorkflowDefinitionUpsertInput;
  if (!isWorkflowTriggerKindSupportedInMvp(candidate.trigger.kind)) {
    return invalidBody();
  }

  return ok({
    projectId: projectId.value,
    definition: candidate,
  });
};

export const parseWorkflowDefinitionDeleteRequest = (
  value: unknown,
): Result<{ workflowId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "workflowId");

export const parseWorkflowDefinitionListRequest = (
  value: unknown,
): Result<{ projectId: string }, ApiError> => parseProjectRequest(value);

export const parseWorkflowDefinitionGetRequest = (
  value: unknown,
): Result<{ workflowId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "workflowId");

export const parseWorkflowDefinitionVersionListRequest = (
  value: unknown,
): Result<{ workflowId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "workflowId");

export const parseWorkflowDefinitionRestoreVersionRequest = (
  value: unknown,
): Result<{ workflowId: string; versionId: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const workflowId = readRequiredString(
    value,
    "workflowId",
    ErrorMessage.MissingWorkflowId,
  );
  const versionId = readRequiredString(
    value,
    "versionId",
    ErrorMessage.InvalidBody,
  );
  if (workflowId.type === ResultType.Err || versionId.type === ResultType.Err) {
    return invalidBody();
  }

  return ok({
    workflowId: workflowId.value,
    versionId: versionId.value,
  });
};

export const parseWorkflowDefinitionCloneVersionRequest = (
  value: unknown,
): Result<
  { workflowId: string; versionId: string; name?: string },
  ApiError
> => {
  const parsed = parseWorkflowDefinitionRestoreVersionRequest(value);
  if (parsed.type === ResultType.Err) {
    return parsed;
  }

  if (!isRecord(value)) {
    return invalidBody();
  }

  const name = readOptionalString(value, "name");
  return ok({
    ...parsed.value,
    ...(name ? { name } : {}),
  });
};

export const parseWorkflowDefinitionRestoreVersionPartRequest = (
  value: unknown,
): Result<
  { workflowId: string; versionId: string; part: WorkflowVersionRestorePart },
  ApiError
> => {
  const parsed = parseWorkflowDefinitionRestoreVersionRequest(value);
  if (parsed.type === ResultType.Err) {
    return parsed;
  }

  if (!isRecord(value)) {
    return invalidBody();
  }

  const part = parseWorkflowVersionRestorePart(value["part"]);
  if (part.type === ResultType.Err) {
    return part;
  }

  return ok({
    ...parsed.value,
    part: part.value,
  });
};

export const parseWorkflowDefinitionExportVersionRequest = (
  value: unknown,
): Result<{ workflowId: string; versionId: string }, ApiError> =>
  parseWorkflowDefinitionRestoreVersionRequest(value);

export const parseWorkflowDefinitionExportVersionTimelineRequest = (
  value: unknown,
): Result<
  { workflowId: string; versionIds?: ReadonlyArray<string> },
  ApiError
> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const workflowId = readRequiredString(
    value,
    "workflowId",
    ErrorMessage.MissingWorkflowId,
  );
  if (workflowId.type === ResultType.Err) {
    return invalidBody();
  }

  const versionIds = parseOptionalStringArray(value["versionIds"]);
  if (versionIds.type === ResultType.Err) {
    return invalidBody();
  }

  return ok({
    workflowId: workflowId.value,
    ...(versionIds.value ? { versionIds: versionIds.value } : {}),
  });
};

export const parseWorkflowDefinitionImportVersionRequest = (
  value: unknown,
): Result<
  { exported: WorkflowVersionExportRecord; name?: string },
  ApiError
> => {
  if (!isRecord(value) || !isRecord(value["exported"])) {
    return invalidBody();
  }

  const name = readOptionalString(value, "name");
  try {
    return ok({
      exported: migrateWorkflowVersionExport(value["exported"]),
      ...(name ? { name } : {}),
    });
  } catch {
    return invalidBody();
  }
};

export const parseWorkflowDefinitionPreviewImportVersionRequest = (
  value: unknown,
): Result<
  {
    exported: WorkflowVersionExportRecord;
    targetWorkspaceId: string;
    targetProjectId: string;
  },
  ApiError
> => {
  if (!isRecord(value) || !isRecord(value["exported"])) {
    return invalidBody();
  }

  const targetWorkspaceId = readRequiredString(
    value,
    "targetWorkspaceId",
    ErrorMessage.InvalidBody,
  );
  const targetProjectId = readRequiredString(
    value,
    "targetProjectId",
    ErrorMessage.InvalidBody,
  );
  if (
    targetWorkspaceId.type === ResultType.Err ||
    targetProjectId.type === ResultType.Err
  ) {
    return invalidBody();
  }

  try {
    return ok({
      exported: migrateWorkflowVersionExport(value["exported"]),
      targetWorkspaceId: targetWorkspaceId.value,
      targetProjectId: targetProjectId.value,
    });
  } catch {
    return invalidBody();
  }
};

export const parseWorkflowDefinitionCleanupVersionsRequest = (
  value: unknown,
): Result<{ workflowId: string; keepLatest: number }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const workflowId = readRequiredString(
    value,
    "workflowId",
    ErrorMessage.MissingWorkflowId,
  );
  const keepLatest = value["keepLatest"];
  if (
    workflowId.type === ResultType.Err ||
    typeof keepLatest !== "number" ||
    !Number.isInteger(keepLatest) ||
    keepLatest < 1
  ) {
    return invalidBody();
  }

  return ok({
    workflowId: workflowId.value,
    keepLatest,
  });
};

export const parseWorkflowAssetUpsertRequest = (
  value: unknown,
): Result<{ projectId: string; asset: WorkflowAssetUpsertInput }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    "projectId",
    ErrorMessage.MissingProjectId,
  );
  const asset = value["asset"];
  if (projectId.type === ResultType.Err || !isRecord(asset)) {
    return invalidBody();
  }

  return ok({
    projectId: projectId.value,
    asset: asset as unknown as WorkflowAssetUpsertInput,
  });
};

export const parseWorkflowAssetDeleteRequest = (
  value: unknown,
): Result<{ assetId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "assetId");

export const parseWorkflowAssetListRequest = (
  value: unknown,
): Result<{ projectId: string; workspaceId: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    "projectId",
    ErrorMessage.MissingProjectId,
  );
  const workspaceId = readRequiredString(
    value,
    "workspaceId",
    ErrorMessage.InvalidBody,
  );
  if (
    projectId.type === ResultType.Err ||
    workspaceId.type === ResultType.Err
  ) {
    return invalidBody();
  }

  return ok({
    projectId: projectId.value,
    workspaceId: workspaceId.value,
  });
};

export const parseWorkflowAssetGetRequest = (
  value: unknown,
): Result<{ assetId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "assetId");

export const parseWorkflowAssetUsageListRequest = (
  value: unknown,
): Result<
  { assetId?: string; workflowId?: string; projectId?: string },
  ApiError
> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const parsed: { assetId?: string; workflowId?: string; projectId?: string } =
    {};
  const assetId = readOptionalString(value, "assetId");
  const workflowId = readOptionalString(value, "workflowId");
  const projectId = readOptionalString(value, "projectId");

  if (assetId !== undefined) {
    parsed.assetId = assetId;
  }

  if (workflowId !== undefined) {
    parsed.workflowId = workflowId;
  }

  if (projectId !== undefined) {
    parsed.projectId = projectId;
  }

  return ok(parsed);
};

export const parseWorkflowExecutionListRequest = (
  value: unknown,
): Result<{ projectId: string; workflowId?: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    "projectId",
    ErrorMessage.MissingProjectId,
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const parsed: { projectId: string; workflowId?: string } = {
    projectId: projectId.value,
  };
  const workflowId = readOptionalString(value, "workflowId");
  if (workflowId !== undefined) {
    parsed.workflowId = workflowId;
  }

  return ok(parsed);
};

export const parseWorkflowExecutionGetRequest = (
  value: unknown,
): Result<{ executionId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "executionId");

export const parseWorkflowExecutionDeleteRequest = (
  value: unknown,
): Result<{ executionId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "executionId");

export const parseWorkflowExecutionCancelRequest = (
  value: unknown,
): Result<{ executionId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "executionId");

export const parseWorkflowExecutionRunRequest = (
  value: unknown,
): Result<{ workflowId: string }, ApiError> =>
  parseSingleIdentifierRequest(value, "workflowId");

export const parseWorkflowNodeExecutionRunRequest = (
  value: unknown,
): Result<
  {
    workflowId: string;
    nodeId: string;
    inputSource: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
  },
  ApiError
> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const workflowId = readRequiredString(
    value,
    "workflowId",
    ErrorMessage.MissingWorkflowId,
  );
  const nodeId = readRequiredString(
    value,
    "nodeId",
    ErrorMessage.MissingNodeId,
  );
  const inputSource = parseWorkflowNodeExecutionInputSource(
    value["inputSource"],
  );
  const seedNodeOutputs = parseWorkflowSeedNodeOutputs(
    value["seedNodeOutputs"],
  );
  if (
    workflowId.type === ResultType.Err ||
    nodeId.type === ResultType.Err ||
    inputSource.type === ResultType.Err ||
    seedNodeOutputs.type === ResultType.Err
  ) {
    return invalidBody();
  }

  return ok({
    workflowId: workflowId.value,
    nodeId: nodeId.value,
    inputSource: inputSource.value,
    ...(seedNodeOutputs.value
      ? { seedNodeOutputs: seedNodeOutputs.value }
      : {}),
  });
};

export const parseWorkflowNodeProviderTestRequest = (
  value: unknown,
): Result<{ workflowId: string; nodeId: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const workflowId = readRequiredString(
    value,
    "workflowId",
    ErrorMessage.MissingWorkflowId,
  );
  const nodeId = readRequiredString(
    value,
    "nodeId",
    ErrorMessage.MissingNodeId,
  );
  if (workflowId.type === ResultType.Err || nodeId.type === ResultType.Err) {
    return invalidBody();
  }

  return ok({
    workflowId: workflowId.value,
    nodeId: nodeId.value,
  });
};

const parseProjectRequest = (
  value: unknown,
): Result<{ projectId: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    "projectId",
    ErrorMessage.MissingProjectId,
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  return ok({
    projectId: projectId.value,
  });
};

const parseWorkflowVersionRestorePart = (
  value: unknown,
): Result<WorkflowVersionRestorePart, ApiError> => {
  if (!isRecord(value) || typeof value["kind"] !== "string") {
    return invalidBody();
  }

  if (value["kind"] === "metadata") {
    return ok({ kind: "metadata" });
  }

  if (value["kind"] === "settings") {
    return ok({ kind: "settings" });
  }

  if (value["kind"] === "edges") {
    return ok({ kind: "edges" });
  }

  if (value["kind"] === "nodes") {
    return parseNodeScopedRestorePart(value, "nodes");
  }

  if (value["kind"] === "output_contracts") {
    return parseNodeScopedRestorePart(value, "output_contracts");
  }

  if (value["kind"] !== "pinned_outputs") {
    return invalidBody();
  }

  const nodeIds = parseOptionalStringArray(value["nodeIds"]);
  if (nodeIds.type === ResultType.Err) {
    return invalidBody();
  }

  return ok({
    kind: "pinned_outputs",
    ...(nodeIds.value ? { nodeIds: nodeIds.value } : {}),
  });
};

const parseNodeScopedRestorePart = (
  record: Record<string, unknown>,
  kind: "nodes" | "output_contracts",
): Result<WorkflowVersionRestorePart, ApiError> => {
  const nodeIds = parseOptionalStringArray(record["nodeIds"]);
  if (nodeIds.type === ResultType.Err || !nodeIds.value) {
    return invalidBody();
  }

  return ok({
    kind,
    nodeIds: nodeIds.value,
  });
};

const parseOptionalStringArray = (
  value: unknown,
): Result<ReadonlyArray<string> | undefined, ApiError> => {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!isNonEmptyStringArray(value)) {
    return invalidBody();
  }

  return ok(value.map((item) => item.trim()));
};

const isNonEmptyStringArray = (
  value: unknown,
): value is ReadonlyArray<string> =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "string" && item.trim().length > 0);

const readWorkflowExecutionIsActive = (
  status: WorkflowExecutionRecord["status"],
): boolean =>
  status === WorkflowExecutionStatus.Queued ||
  status === WorkflowExecutionStatus.Running;

const readWorkflowExecutionDurationMs = (
  startedAt: string,
  finishedAt: string,
): number =>
  Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());

const parseSingleIdentifierRequest = <TKey extends string>(
  value: unknown,
  key: TKey,
): Result<{ [key in TKey]: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const identifier = readRequiredString(value, key, ErrorMessage.InvalidBody);
  if (identifier.type === ResultType.Err) {
    return identifier;
  }

  return ok({
    [key]: identifier.value,
  } as { [key in TKey]: string });
};

const parseWorkflowSeedNodeOutputs = (
  value: unknown,
): Result<Readonly<Record<string, unknown>> | undefined, ApiError> => {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!isRecord(value)) {
    return invalidBody();
  }

  return ok(value);
};

const parseWorkflowNodeExecutionInputSource = (
  value: unknown,
): Result<WorkflowNodeExecutionInputSourceRecord, ApiError> => {
  if (value === undefined) {
    return ok({
      kind: WorkflowNodeExecutionInputSourceKind.LastUpstream,
    });
  }

  if (!isRecord(value) || typeof value["kind"] !== "string") {
    return invalidBody();
  }

  if (value["kind"] === WorkflowNodeExecutionInputSourceKind.LastUpstream) {
    return ok({
      kind: WorkflowNodeExecutionInputSourceKind.LastUpstream,
    });
  }

  if (value["kind"] === WorkflowNodeExecutionInputSourceKind.AllPrevious) {
    return ok({
      kind: WorkflowNodeExecutionInputSourceKind.AllPrevious,
    });
  }

  if (value["kind"] !== WorkflowNodeExecutionInputSourceKind.NodeOutput) {
    return invalidBody();
  }

  const nodeId = readRequiredString(
    value,
    "nodeId",
    ErrorMessage.MissingNodeId,
  );
  if (nodeId.type === ResultType.Err) {
    return invalidBody();
  }

  return ok({
    kind: WorkflowNodeExecutionInputSourceKind.NodeOutput,
    nodeId: nodeId.value,
  });
};

const invalidBody = <T>(): Result<T, ApiError> =>
  err({
    status: HttpStatus.BadRequest,
    message: ErrorMessage.InvalidBody,
  });

const updateWorkflowNodeProviderTestMetadata = (
  node: WorkflowDefinitionRecord["nodes"][number],
  outcome: {
    status: "passed" | "failed";
    testedAt: string;
  },
): WorkflowDefinitionRecord["nodes"][number] => {
  if (!node.config.provider) {
    return node;
  }

  return {
    ...node,
    config: {
      ...node.config,
      provider: {
        ...node.config.provider,
        testStatus: outcome.status,
        testedAt: outcome.testedAt,
      },
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRequiredString = (
  record: Record<string, unknown>,
  key: string,
  message: string,
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message,
    });
  }

  return ok(value.trim());
};

const readOptionalString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
