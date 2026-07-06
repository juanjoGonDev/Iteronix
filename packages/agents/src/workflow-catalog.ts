import { randomUUID } from "node:crypto";
import {
  WorkflowAssetScope,
  WorkflowAssetUsageRole,
  WorkflowNodeKind,
  type WorkflowAssetRecord,
  type WorkflowAssetUsageRecord,
  type WorkflowCatalogState,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionVersionRecord,
  type WorkflowExecutionRecord,
} from "../../shared/src/workflows";
import {
  compareWorkflowVersions,
  computeWorkflowVersionChecksum,
  exportWorkflowVersionSnapshot,
  exportWorkflowVersionTimeline,
  importWorkflowVersionSnapshot,
  previewWorkflowVersionImport,
  readWorkflowVersionChangeSummary,
  restoreWorkflowVersionPart,
  trimWorkflowVersionsByRetention,
  type WorkflowVersionExportRecord,
  type WorkflowVersionImportPreviewRecord,
  type WorkflowVersionTimelineExportRecord,
  type WorkflowVersionRestorePart,
} from "./workflow-versioning";

export type WorkflowDefinitionUpsertInput = Omit<
  WorkflowDefinitionRecord,
  "id" | "projectId" | "version" | "createdAt" | "updatedAt"
> & {
  id?: string;
  projectId?: string;
  versionNote?: string;
  versionTags?: ReadonlyArray<string>;
};

export type WorkflowAssetUpsertInput = Omit<
  WorkflowAssetRecord,
  "id" | "projectId" | "version" | "createdAt" | "updatedAt"
> & {
  id?: string;
  projectId?: string;
};

export type WorkflowExecutionUpsertInput = Omit<
  WorkflowExecutionRecord,
  "id"
> & {
  id?: string;
};

export type WorkflowCatalogStore = {
  upsertWorkflow: (
    input: WorkflowDefinitionUpsertInput,
  ) => WorkflowDefinitionRecord;
  listWorkflows: (input: {
    projectId: string;
  }) => ReadonlyArray<WorkflowDefinitionRecord>;
  getWorkflow: (id: string) => WorkflowDefinitionRecord | undefined;
  listWorkflowVersions: (input: {
    workflowId: string;
  }) => ReadonlyArray<WorkflowDefinitionVersionRecord>;
  restoreWorkflowVersion: (input: {
    workflowId: string;
    versionId: string;
  }) => WorkflowDefinitionRecord | undefined;
  restoreWorkflowVersionPart: (input: {
    workflowId: string;
    versionId: string;
    part: WorkflowVersionRestorePart;
  }) => WorkflowDefinitionRecord | undefined;
  cloneWorkflowVersion: (input: {
    workflowId: string;
    versionId: string;
    name?: string;
  }) => WorkflowDefinitionRecord | undefined;
  exportWorkflowVersion: (input: {
    workflowId: string;
    versionId: string;
  }) => WorkflowVersionExportRecord | undefined;
  exportWorkflowVersionTimeline: (input: {
    workflowId: string;
    versionIds?: ReadonlyArray<string>;
    exportedAt: string;
  }) => WorkflowVersionTimelineExportRecord | undefined;
  importWorkflowVersion: (input: {
    exported: WorkflowVersionExportRecord;
    name?: string;
  }) => WorkflowDefinitionRecord | undefined;
  previewWorkflowVersionImport: (input: {
    exported: WorkflowVersionExportRecord;
    targetWorkspaceId: string;
    targetProjectId: string;
  }) => WorkflowVersionImportPreviewRecord;
  cleanupWorkflowVersions: (input: {
    workflowId: string;
    keepLatest: number;
  }) => {
    kept: ReadonlyArray<WorkflowDefinitionVersionRecord>;
    removed: ReadonlyArray<WorkflowDefinitionVersionRecord>;
  };
  deleteWorkflow: (id: string) => WorkflowDefinitionRecord | undefined;
  upsertAsset: (input: WorkflowAssetUpsertInput) => WorkflowAssetRecord;
  listAssets: (input: {
    workspaceId: string;
    projectId: string;
  }) => ReadonlyArray<WorkflowAssetRecord>;
  getAsset: (id: string) => WorkflowAssetRecord | undefined;
  deleteAsset: (id: string) => WorkflowAssetRecord;
  listAssetUsages: (input?: {
    assetId?: string;
    workflowId?: string;
    projectId?: string;
  }) => ReadonlyArray<WorkflowAssetUsageRecord>;
  upsertExecution: (
    input: WorkflowExecutionUpsertInput,
  ) => WorkflowExecutionRecord;
  listExecutions: (input: {
    projectId: string;
    workflowId?: string;
  }) => ReadonlyArray<WorkflowExecutionRecord>;
  getExecution: (id: string) => WorkflowExecutionRecord | undefined;
  deleteExecution: (id: string) => WorkflowExecutionRecord | undefined;
  snapshot: () => WorkflowCatalogState;
};

export const createWorkflowCatalogStore = (
  seed: {
    definitions?: ReadonlyArray<WorkflowDefinitionRecord>;
    definitionVersions?: ReadonlyArray<WorkflowDefinitionVersionRecord>;
    assets?: ReadonlyArray<WorkflowAssetRecord>;
    executions?: ReadonlyArray<WorkflowExecutionRecord>;
    now?: () => Date;
  } = {},
): WorkflowCatalogStore => {
  const now = seed.now ?? (() => new Date());
  const definitionsById = new Map<string, WorkflowDefinitionRecord>();
  const definitionVersionsById = new Map<
    string,
    WorkflowDefinitionVersionRecord
  >();
  const assetsById = new Map<string, WorkflowAssetRecord>();
  const executionsById = new Map<string, WorkflowExecutionRecord>();
  let assetUsages = createAssetUsages(seed.definitions ?? [], now);

  for (const definition of seed.definitions ?? []) {
    definitionsById.set(definition.id, definition);
  }

  for (const definitionVersion of seed.definitionVersions ?? []) {
    definitionVersionsById.set(definitionVersion.id, definitionVersion);
  }

  for (const asset of seed.assets ?? []) {
    assetsById.set(asset.id, asset);
  }

  for (const execution of seed.executions ?? []) {
    executionsById.set(execution.id, execution);
  }

  const upsertWorkflow = (
    input: WorkflowDefinitionUpsertInput,
  ): WorkflowDefinitionRecord => {
    const current = input.id ? definitionsById.get(input.id) : undefined;
    const next = createWorkflowRecord(input, current, now);
    const checksum = computeWorkflowVersionChecksum(next);
    const latestVersion = readLatestWorkflowVersion(
      definitionVersionsById,
      next.id,
    );
    if (current && latestVersion?.checksum === checksum) {
      return current;
    }

    definitionsById.set(next.id, next);
    const version = createWorkflowVersionRecord({
      workflow: next,
      previous: current,
      now,
      checksum,
      ...(input.versionNote ? { note: input.versionNote } : {}),
      ...(input.versionTags ? { tags: input.versionTags } : {}),
    });
    definitionVersionsById.set(version.id, version);
    assetUsages = createAssetUsages(Array.from(definitionsById.values()), now);
    return next;
  };

  const listWorkflows = (input: {
    projectId: string;
  }): ReadonlyArray<WorkflowDefinitionRecord> =>
    Array.from(definitionsById.values()).filter(
      (definition) => definition.projectId === input.projectId,
    );

  const getWorkflow = (id: string): WorkflowDefinitionRecord | undefined =>
    definitionsById.get(id);

  const listWorkflowVersions = (input: {
    workflowId: string;
  }): ReadonlyArray<WorkflowDefinitionVersionRecord> =>
    Array.from(definitionVersionsById.values())
      .filter((version) => version.workflowId === input.workflowId)
      .sort((left, right) => right.version - left.version);

  const restoreWorkflowVersion = (input: {
    workflowId: string;
    versionId: string;
  }): WorkflowDefinitionRecord | undefined => {
    const current = definitionsById.get(input.workflowId);
    const version = definitionVersionsById.get(input.versionId);
    if (!current || !version || version.workflowId !== input.workflowId) {
      return undefined;
    }

    return upsertWorkflow({
      ...version.snapshot,
      id: current.id,
      projectId: current.projectId,
    });
  };

  const restoreWorkflowVersionPartInStore = (input: {
    workflowId: string;
    versionId: string;
    part: WorkflowVersionRestorePart;
  }): WorkflowDefinitionRecord | undefined => {
    const current = definitionsById.get(input.workflowId);
    const version = definitionVersionsById.get(input.versionId);
    if (!current || !version || version.workflowId !== input.workflowId) {
      return undefined;
    }

    return upsertWorkflow({
      ...restoreWorkflowVersionPart(current, version.snapshot, input.part),
      id: current.id,
      projectId: current.projectId,
    });
  };

  const cloneWorkflowVersion = (input: {
    workflowId: string;
    versionId: string;
    name?: string;
  }): WorkflowDefinitionRecord | undefined => {
    const current = definitionsById.get(input.workflowId);
    const version = definitionVersionsById.get(input.versionId);
    if (!current || !version || version.workflowId !== input.workflowId) {
      return undefined;
    }

    const snapshot = version.snapshot;
    return upsertWorkflow({
      workspaceId: snapshot.workspaceId,
      projectId: current.projectId,
      name: input.name ?? `${snapshot.name} copy`,
      description: snapshot.description,
      status: snapshot.status,
      trigger: snapshot.trigger,
      viewport: snapshot.viewport,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      executionPolicy: snapshot.executionPolicy,
      defaultContextPolicy: snapshot.defaultContextPolicy,
      tags: snapshot.tags,
    });
  };

  const exportWorkflowVersion = (input: {
    workflowId: string;
    versionId: string;
  }): WorkflowVersionExportRecord | undefined => {
    const version = definitionVersionsById.get(input.versionId);
    if (!version || version.workflowId !== input.workflowId) {
      return undefined;
    }

    return exportWorkflowVersionSnapshot(version);
  };

  const exportWorkflowVersionTimelineInStore = (input: {
    workflowId: string;
    versionIds?: ReadonlyArray<string>;
    exportedAt: string;
  }): WorkflowVersionTimelineExportRecord | undefined => {
    if (!definitionsById.has(input.workflowId)) {
      return undefined;
    }

    return exportWorkflowVersionTimeline({
      workflowId: input.workflowId,
      versions: listWorkflowVersions({ workflowId: input.workflowId }),
      ...(input.versionIds ? { versionIds: input.versionIds } : {}),
      exportedAt: input.exportedAt,
    });
  };

  const importWorkflowVersion = (input: {
    exported: WorkflowVersionExportRecord;
    name?: string;
  }): WorkflowDefinitionRecord | undefined => {
    const imported = importWorkflowVersionSnapshot(input.exported);
    return upsertWorkflow({
      ...createImportedWorkflowInput(imported.snapshot),
      name: input.name ?? imported.snapshot.name,
    });
  };

  const previewWorkflowVersionImportInStore = (input: {
    exported: WorkflowVersionExportRecord;
    targetWorkspaceId: string;
    targetProjectId: string;
  }): WorkflowVersionImportPreviewRecord =>
    previewWorkflowVersionImport({
      ...input,
      existingWorkflowIds: Array.from(definitionsById.keys()),
    });

  const cleanupWorkflowVersions = (input: {
    workflowId: string;
    keepLatest: number;
  }): {
    kept: ReadonlyArray<WorkflowDefinitionVersionRecord>;
    removed: ReadonlyArray<WorkflowDefinitionVersionRecord>;
  } => {
    const trimmed = trimWorkflowVersionsByRetention(
      listWorkflowVersions({ workflowId: input.workflowId }),
      { keepLatest: input.keepLatest },
    );
    for (const version of trimmed.removed) {
      definitionVersionsById.delete(version.id);
    }

    return trimmed;
  };

  const deleteWorkflow = (id: string): WorkflowDefinitionRecord | undefined => {
    const existing = definitionsById.get(id);
    if (!existing) {
      return undefined;
    }

    definitionsById.delete(id);
    assetUsages = createAssetUsages(Array.from(definitionsById.values()), now);
    return existing;
  };

  const upsertAsset = (
    input: WorkflowAssetUpsertInput,
  ): WorkflowAssetRecord => {
    const current = input.id ? assetsById.get(input.id) : undefined;
    const next = createAssetRecord(input, current, now);
    assetsById.set(next.id, next);
    return next;
  };

  const listAssets = (input: {
    workspaceId: string;
    projectId: string;
  }): ReadonlyArray<WorkflowAssetRecord> =>
    Array.from(assetsById.values()).filter((asset) => {
      if (asset.workspaceId !== input.workspaceId) {
        return false;
      }

      if (asset.scope === WorkflowAssetScope.Workspace) {
        return true;
      }

      return asset.projectId === input.projectId;
    });

  const getAsset = (id: string): WorkflowAssetRecord | undefined =>
    assetsById.get(id);

  const deleteAsset = (id: string): WorkflowAssetRecord => {
    const existing = assetsById.get(id);
    if (!existing) {
      throw new Error("Workflow asset not found");
    }

    if (assetUsages.some((usage) => usage.assetId === id)) {
      throw new Error("Workflow asset is still referenced");
    }

    assetsById.delete(id);
    return existing;
  };

  const listAssetUsages = (input?: {
    assetId?: string;
    workflowId?: string;
    projectId?: string;
  }): ReadonlyArray<WorkflowAssetUsageRecord> =>
    assetUsages.filter((usage) => {
      if (input?.assetId && usage.assetId !== input.assetId) {
        return false;
      }

      if (input?.workflowId && usage.workflowId !== input.workflowId) {
        return false;
      }

      if (input?.projectId && usage.projectId !== input.projectId) {
        return false;
      }

      return true;
    });

  const upsertExecution = (
    input: WorkflowExecutionUpsertInput,
  ): WorkflowExecutionRecord => {
    const next = createExecutionRecord(
      input,
      executionsById.get(input.id ?? ""),
    );
    executionsById.set(next.id, next);
    return next;
  };

  const listExecutions = (input: {
    projectId: string;
    workflowId?: string;
  }): ReadonlyArray<WorkflowExecutionRecord> =>
    Array.from(executionsById.values()).filter((execution) => {
      if (execution.projectId !== input.projectId) {
        return false;
      }

      if (input.workflowId && execution.workflowId !== input.workflowId) {
        return false;
      }

      return true;
    });

  const getExecution = (id: string): WorkflowExecutionRecord | undefined =>
    executionsById.get(id);

  const deleteExecution = (id: string): WorkflowExecutionRecord | undefined => {
    const existing = executionsById.get(id);
    if (!existing) {
      return undefined;
    }

    executionsById.delete(id);
    return existing;
  };

  const snapshot = (): WorkflowCatalogState => ({
    definitions: Array.from(definitionsById.values()),
    definitionVersions: Array.from(definitionVersionsById.values()),
    assets: Array.from(assetsById.values()),
    assetUsages,
    executions: Array.from(executionsById.values()),
  });

  return {
    upsertWorkflow,
    listWorkflows,
    getWorkflow,
    listWorkflowVersions,
    restoreWorkflowVersion,
    restoreWorkflowVersionPart: restoreWorkflowVersionPartInStore,
    cloneWorkflowVersion,
    exportWorkflowVersion,
    exportWorkflowVersionTimeline: exportWorkflowVersionTimelineInStore,
    importWorkflowVersion,
    previewWorkflowVersionImport: previewWorkflowVersionImportInStore,
    cleanupWorkflowVersions,
    deleteWorkflow,
    upsertAsset,
    listAssets,
    getAsset,
    deleteAsset,
    listAssetUsages,
    upsertExecution,
    listExecutions,
    getExecution,
    deleteExecution,
    snapshot,
  };
};

const createWorkflowRecord = (
  input: WorkflowDefinitionUpsertInput,
  current: WorkflowDefinitionRecord | undefined,
  now: () => Date,
): WorkflowDefinitionRecord => {
  const timestamp = now().toISOString();
  return {
    id: current?.id ?? input.id ?? randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? current?.projectId ?? "",
    name: input.name,
    description: input.description,
    status: input.status,
    version: current ? current.version + 1 : 1,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
    trigger: input.trigger,
    viewport: input.viewport,
    nodes: input.nodes,
    edges: input.edges,
    executionPolicy: input.executionPolicy,
    defaultContextPolicy: input.defaultContextPolicy,
    tags: input.tags,
  };
};

const createImportedWorkflowInput = (
  snapshot: WorkflowDefinitionRecord,
): Omit<
  WorkflowDefinitionUpsertInput,
  "name" | "versionNote" | "versionTags"
> => ({
  workspaceId: snapshot.workspaceId,
  projectId: snapshot.projectId,
  description: snapshot.description,
  status: snapshot.status,
  trigger: snapshot.trigger,
  viewport: snapshot.viewport,
  nodes: snapshot.nodes,
  edges: snapshot.edges,
  executionPolicy: snapshot.executionPolicy,
  defaultContextPolicy: snapshot.defaultContextPolicy,
  tags: snapshot.tags,
});

const createWorkflowVersionRecord = (input: {
  workflow: WorkflowDefinitionRecord;
  previous: WorkflowDefinitionRecord | undefined;
  now: () => Date;
  checksum: string;
  note?: string;
  tags?: ReadonlyArray<string>;
}): WorkflowDefinitionVersionRecord => {
  const diff = input.previous
    ? compareWorkflowVersions(input.previous, input.workflow)
    : undefined;
  return {
    id: randomUUID(),
    workflowId: input.workflow.id,
    projectId: input.workflow.projectId,
    version: input.workflow.version,
    createdAt: input.now().toISOString(),
    snapshot: input.workflow,
    checksum: input.checksum,
    ...(input.note ? { note: input.note } : {}),
    tags: input.tags ?? [],
    changeType: "manual",
    changeSummary: diff
      ? readWorkflowVersionChangeSummary(diff)
      : "Initial version",
  };
};

const readLatestWorkflowVersion = (
  versionsById: ReadonlyMap<string, WorkflowDefinitionVersionRecord>,
  workflowId: string,
): WorkflowDefinitionVersionRecord | undefined =>
  Array.from(versionsById.values())
    .filter((version) => version.workflowId === workflowId)
    .sort((left, right) => right.version - left.version)[0];

const createAssetRecord = (
  input: WorkflowAssetUpsertInput,
  current: WorkflowAssetRecord | undefined,
  now: () => Date,
): WorkflowAssetRecord => {
  const timestamp = now().toISOString();
  const next: WorkflowAssetRecord = {
    id: current?.id ?? input.id ?? randomUUID(),
    workspaceId: input.workspaceId,
    kind: input.kind,
    scope: input.scope,
    name: input.name,
    slug: input.slug,
    description: input.description,
    body: input.body,
    language: input.language,
    version: current ? current.version + 1 : 1,
    tags: input.tags,
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (input.projectId !== undefined) {
    next.projectId = input.projectId;
  }

  if (input.outputContract !== undefined) {
    next.outputContract = input.outputContract;
  }

  if (input.guardrail !== undefined) {
    next.guardrail = input.guardrail;
  }

  if (input.archivedAt !== undefined) {
    next.archivedAt = input.archivedAt;
  }

  return next;
};

const createExecutionRecord = (
  input: WorkflowExecutionUpsertInput,
  current: WorkflowExecutionRecord | undefined,
): WorkflowExecutionRecord => {
  const next: WorkflowExecutionRecord = {
    id: current?.id ?? input.id ?? randomUUID(),
    workflowId: input.workflowId,
    projectId: input.projectId,
    triggerKind: input.triggerKind,
    status: input.status,
    startedAt: input.startedAt,
    warningsCount: input.warningsCount,
    errorsCount: input.errorsCount,
    totals: input.totals,
    contextSessionId: input.contextSessionId,
    nodeRuns: input.nodeRuns,
  };

  if (input.finishedAt !== undefined) {
    next.finishedAt = input.finishedAt;
  }

  if (input.durationMs !== undefined) {
    next.durationMs = input.durationMs;
  }

  return next;
};

const createAssetUsages = (
  definitions: ReadonlyArray<WorkflowDefinitionRecord>,
  now: () => Date,
): ReadonlyArray<WorkflowAssetUsageRecord> => {
  const createdAt = now().toISOString();
  const usages: WorkflowAssetUsageRecord[] = [];

  for (const definition of definitions) {
    for (const node of definition.nodes) {
      if (node.config.assetId) {
        const role = derivePrimaryRole(node.kind);
        if (role) {
          usages.push({
            assetId: node.config.assetId,
            workflowId: definition.id,
            projectId: definition.projectId,
            nodeId: node.id,
            nodeKind: node.kind,
            role,
            createdAt,
          });
        }
      }

      for (const guardrail of node.attachedGuardrails) {
        usages.push({
          assetId: guardrail.assetId,
          workflowId: definition.id,
          projectId: definition.projectId,
          nodeId: node.id,
          nodeKind: node.kind,
          role: WorkflowAssetUsageRole.Guardrail,
          createdAt,
        });
      }
    }
  }

  return usages;
};

const derivePrimaryRole = (
  kind: WorkflowNodeKind,
): WorkflowAssetUsageRole | undefined => {
  if (kind === WorkflowNodeKind.AssetPrompt) {
    return WorkflowAssetUsageRole.Primary;
  }

  if (kind === WorkflowNodeKind.AssetInstruction) {
    return WorkflowAssetUsageRole.Instruction;
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return WorkflowAssetUsageRole.Guardrail;
  }

  return undefined;
};
