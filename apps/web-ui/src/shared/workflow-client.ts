import { requestJson } from "./server-api-client.js";
import type {
  WorkflowAssetRecord,
  WorkflowAssetUpsertInput,
  WorkflowAssetUsageRecord,
  WorkflowDefinitionRecord,
  WorkflowDefinitionUpsertInput,
  WorkflowExecutionRecord
} from "../screens/workflows-editor-state.js";

const EndpointPath = {
  DefinitionsList: "/workflows/definitions/list",
  DefinitionsGet: "/workflows/definitions/get",
  DefinitionsUpsert: "/workflows/definitions/upsert",
  DefinitionsDelete: "/workflows/definitions/delete",
  AssetsList: "/workflows/assets/list",
  AssetsGet: "/workflows/assets/get",
  AssetsUpsert: "/workflows/assets/upsert",
  AssetsDelete: "/workflows/assets/delete",
  AssetsUsage: "/workflows/assets/usage",
  ExecutionsList: "/workflows/executions/list",
  ExecutionsGet: "/workflows/executions/get",
  ExecutionsDelete: "/workflows/executions/delete"
} as const;

export type WorkflowClient = {
  listDefinitions: (input: { projectId: string }) => Promise<ReadonlyArray<WorkflowDefinitionRecord>>;
  getDefinition: (input: { workflowId: string }) => Promise<WorkflowDefinitionRecord>;
  upsertDefinition: (input: {
    projectId: string;
    definition: WorkflowDefinitionUpsertInput;
  }) => Promise<WorkflowDefinitionRecord>;
  deleteDefinition: (input: { workflowId: string }) => Promise<WorkflowDefinitionRecord>;
  listAssets: (input: {
    projectId: string;
    workspaceId: string;
  }) => Promise<ReadonlyArray<WorkflowAssetRecord>>;
  getAsset: (input: { assetId: string }) => Promise<WorkflowAssetRecord>;
  upsertAsset: (input: {
    projectId: string;
    asset: WorkflowAssetUpsertInput;
  }) => Promise<WorkflowAssetRecord>;
  deleteAsset: (input: { assetId: string }) => Promise<WorkflowAssetRecord>;
  listAssetUsages: (input: {
    assetId?: string;
    workflowId?: string;
    projectId?: string;
  }) => Promise<ReadonlyArray<WorkflowAssetUsageRecord>>;
  listExecutions: (input: {
    projectId: string;
    workflowId?: string;
  }) => Promise<ReadonlyArray<WorkflowExecutionRecord>>;
  getExecution: (input: { executionId: string }) => Promise<WorkflowExecutionRecord>;
  deleteExecution: (input: { executionId: string }) => Promise<WorkflowExecutionRecord>;
};

export const createWorkflowClient = (): WorkflowClient => ({
  listDefinitions: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsList,
      body: {
        projectId: input.projectId
      },
      parse: parseWorkflowDefinitionListResponse
    }),
  getDefinition: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsGet,
      body: {
        workflowId: input.workflowId
      },
      parse: parseWorkflowDefinitionResponse
    }),
  upsertDefinition: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsUpsert,
      body: {
        projectId: input.projectId,
        definition: input.definition
      },
      parse: parseWorkflowDefinitionResponse
    }),
  deleteDefinition: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsDelete,
      body: {
        workflowId: input.workflowId
      },
      parse: parseWorkflowDefinitionResponse
    }),
  listAssets: (input) =>
    requestJson({
      path: EndpointPath.AssetsList,
      body: {
        projectId: input.projectId,
        workspaceId: input.workspaceId
      },
      parse: parseWorkflowAssetListResponse
    }),
  getAsset: (input) =>
    requestJson({
      path: EndpointPath.AssetsGet,
      body: {
        assetId: input.assetId
      },
      parse: parseWorkflowAssetResponse
    }),
  upsertAsset: (input) =>
    requestJson({
      path: EndpointPath.AssetsUpsert,
      body: {
        projectId: input.projectId,
        asset: input.asset
      },
      parse: parseWorkflowAssetResponse
    }),
  deleteAsset: (input) =>
    requestJson({
      path: EndpointPath.AssetsDelete,
      body: {
        assetId: input.assetId
      },
      parse: parseWorkflowAssetResponse
    }),
  listAssetUsages: (input) =>
    requestJson({
      path: EndpointPath.AssetsUsage,
      body: {
        ...(input.assetId ? { assetId: input.assetId } : {}),
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {})
      },
      parse: parseWorkflowAssetUsageListResponse
    }),
  listExecutions: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsList,
      body: {
        projectId: input.projectId,
        ...(input.workflowId ? { workflowId: input.workflowId } : {})
      },
      parse: parseWorkflowExecutionListResponse
    }),
  getExecution: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsGet,
      body: {
        executionId: input.executionId
      },
      parse: parseWorkflowExecutionResponse
    }),
  deleteExecution: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsDelete,
      body: {
        executionId: input.executionId
      },
      parse: parseWorkflowExecutionResponse
    })
});

export const parseWorkflowDefinitionListResponse = (
  value: unknown
): ReadonlyArray<WorkflowDefinitionRecord> =>
  readRequiredArray(value, "workflowDefinitionListResponse", "definitions").map((item) =>
    parseWorkflowDefinitionRecord(ensureRecord(item, "workflowDefinitionRecord"))
  );

export const parseWorkflowDefinitionResponse = (
  value: unknown
): WorkflowDefinitionRecord =>
  parseWorkflowDefinitionRecord(
    readRequiredRecord(value, "workflowDefinitionResponse", "definition")
  );

export const parseWorkflowAssetListResponse = (
  value: unknown
): ReadonlyArray<WorkflowAssetRecord> =>
  readRequiredArray(value, "workflowAssetListResponse", "assets").map((item) =>
    parseWorkflowAssetRecord(ensureRecord(item, "workflowAssetRecord"))
  );

export const parseWorkflowAssetResponse = (
  value: unknown
): WorkflowAssetRecord =>
  parseWorkflowAssetRecord(
    readRequiredRecord(value, "workflowAssetResponse", "asset")
  );

export const parseWorkflowAssetUsageListResponse = (
  value: unknown
): ReadonlyArray<WorkflowAssetUsageRecord> =>
  readRequiredArray(value, "workflowAssetUsageListResponse", "usages").map((item) =>
    parseWorkflowAssetUsageRecord(ensureRecord(item, "workflowAssetUsageRecord"))
  );

export const parseWorkflowExecutionListResponse = (
  value: unknown
): ReadonlyArray<WorkflowExecutionRecord> =>
  readRequiredArray(value, "workflowExecutionListResponse", "executions").map((item) =>
    parseWorkflowExecutionRecord(ensureRecord(item, "workflowExecutionRecord"))
  );

export const parseWorkflowExecutionResponse = (
  value: unknown
): WorkflowExecutionRecord =>
  parseWorkflowExecutionRecord(
    readRequiredRecord(value, "workflowExecutionResponse", "execution")
  );

const parseWorkflowDefinitionRecord = (
  value: Record<string, unknown>
): WorkflowDefinitionRecord => ({
  id: readRequiredString(value, "workflowDefinitionRecord", "id"),
  workspaceId: readRequiredString(value, "workflowDefinitionRecord", "workspaceId"),
  projectId: readRequiredString(value, "workflowDefinitionRecord", "projectId"),
  name: readRequiredString(value, "workflowDefinitionRecord", "name"),
  description: readRequiredString(value, "workflowDefinitionRecord", "description"),
  status: readRequiredString(value, "workflowDefinitionRecord", "status") as WorkflowDefinitionRecord["status"],
  version: readRequiredNumber(value, "workflowDefinitionRecord", "version"),
  createdAt: readRequiredString(value, "workflowDefinitionRecord", "createdAt"),
  updatedAt: readRequiredString(value, "workflowDefinitionRecord", "updatedAt"),
  trigger: readRequiredRecord(value, "workflowDefinitionRecord", "trigger") as WorkflowDefinitionRecord["trigger"],
  viewport: readRequiredRecord(value, "workflowDefinitionRecord", "viewport") as WorkflowDefinitionRecord["viewport"],
  nodes: readRequiredArray(value, "workflowDefinitionRecord", "nodes") as WorkflowDefinitionRecord["nodes"],
  edges: readRequiredArray(value, "workflowDefinitionRecord", "edges") as WorkflowDefinitionRecord["edges"],
  executionPolicy: readRequiredRecord(value, "workflowDefinitionRecord", "executionPolicy") as WorkflowDefinitionRecord["executionPolicy"],
  defaultContextPolicy: readRequiredRecord(value, "workflowDefinitionRecord", "defaultContextPolicy") as WorkflowDefinitionRecord["defaultContextPolicy"],
  tags: readRequiredStringArray(value, "workflowDefinitionRecord", "tags")
});

const parseWorkflowAssetRecord = (
  value: Record<string, unknown>
): WorkflowAssetRecord => {
  const projectId = readOptionalString(value, "projectId");
  const archivedAt = readOptionalString(value, "archivedAt");
  const outputContract = hasDefinedProperty(value, "outputContract")
    ? readRequiredRecord(value, "workflowAssetRecord", "outputContract") as NonNullable<WorkflowAssetRecord["outputContract"]>
    : undefined;
  const guardrail = hasDefinedProperty(value, "guardrail")
    ? readRequiredRecord(value, "workflowAssetRecord", "guardrail") as NonNullable<WorkflowAssetRecord["guardrail"]>
    : undefined;

  return {
    id: readRequiredString(value, "workflowAssetRecord", "id"),
    workspaceId: readRequiredString(value, "workflowAssetRecord", "workspaceId"),
    ...(projectId ? { projectId } : {}),
    kind: readRequiredString(value, "workflowAssetRecord", "kind") as WorkflowAssetRecord["kind"],
    scope: readRequiredString(value, "workflowAssetRecord", "scope") as WorkflowAssetRecord["scope"],
    name: readRequiredString(value, "workflowAssetRecord", "name"),
    slug: readRequiredString(value, "workflowAssetRecord", "slug"),
    description: readRequiredString(value, "workflowAssetRecord", "description"),
    body: readRequiredString(value, "workflowAssetRecord", "body"),
    language: readRequiredString(value, "workflowAssetRecord", "language"),
    version: readRequiredNumber(value, "workflowAssetRecord", "version"),
    tags: readRequiredStringArray(value, "workflowAssetRecord", "tags"),
    ...(outputContract ? { outputContract } : {}),
    ...(guardrail ? { guardrail } : {}),
    createdAt: readRequiredString(value, "workflowAssetRecord", "createdAt"),
    updatedAt: readRequiredString(value, "workflowAssetRecord", "updatedAt"),
    ...(archivedAt ? { archivedAt } : {})
  };
};

const parseWorkflowAssetUsageRecord = (
  value: Record<string, unknown>
): WorkflowAssetUsageRecord => ({
  assetId: readRequiredString(value, "workflowAssetUsageRecord", "assetId"),
  workflowId: readRequiredString(value, "workflowAssetUsageRecord", "workflowId"),
  projectId: readRequiredString(value, "workflowAssetUsageRecord", "projectId"),
  nodeId: readRequiredString(value, "workflowAssetUsageRecord", "nodeId"),
  nodeKind: readRequiredString(value, "workflowAssetUsageRecord", "nodeKind") as WorkflowAssetUsageRecord["nodeKind"],
  role: readRequiredString(value, "workflowAssetUsageRecord", "role") as WorkflowAssetUsageRecord["role"],
  createdAt: readRequiredString(value, "workflowAssetUsageRecord", "createdAt")
});

const parseWorkflowExecutionRecord = (
  value: Record<string, unknown>
): WorkflowExecutionRecord => {
  const finishedAt = readOptionalString(value, "finishedAt");
  const durationMs = readOptionalNumber(value, "durationMs");

  return {
    id: readRequiredString(value, "workflowExecutionRecord", "id"),
    workflowId: readRequiredString(value, "workflowExecutionRecord", "workflowId"),
    projectId: readRequiredString(value, "workflowExecutionRecord", "projectId"),
    triggerKind: readRequiredString(value, "workflowExecutionRecord", "triggerKind") as WorkflowExecutionRecord["triggerKind"],
    status: readRequiredString(value, "workflowExecutionRecord", "status") as WorkflowExecutionRecord["status"],
    startedAt: readRequiredString(value, "workflowExecutionRecord", "startedAt"),
    ...(finishedAt ? { finishedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    warningsCount: readRequiredNumber(value, "workflowExecutionRecord", "warningsCount"),
    errorsCount: readRequiredNumber(value, "workflowExecutionRecord", "errorsCount"),
    totals: readRequiredRecord(value, "workflowExecutionRecord", "totals") as WorkflowExecutionRecord["totals"],
    contextSessionId: readRequiredString(value, "workflowExecutionRecord", "contextSessionId"),
    nodeRuns: readRequiredArray(value, "workflowExecutionRecord", "nodeRuns") as WorkflowExecutionRecord["nodeRuns"]
  };
};

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: unknown,
  label: string,
  key: string
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  return ensureRecord(record[key], `${label}.${key}`);
};

const readRequiredArray = (
  value: unknown,
  label: string,
  key: string
): ReadonlyArray<unknown> => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredStringArray = (
  value: Record<string, unknown>,
  label: string,
  key: string
): ReadonlyArray<string> => {
  const nested = value[key];
  if (!Array.isArray(nested) || nested.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested as ReadonlyArray<string>;
};

const readRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string
): string => {
  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readOptionalString = (
  value: Record<string, unknown>,
  key: string
): string | undefined => {
  const nested = value[key];
  return typeof nested === "string" ? nested : undefined;
};

const readRequiredNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string
): number => {
  const nested = value[key];
  if (typeof nested !== "number" || Number.isNaN(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readOptionalNumber = (
  value: Record<string, unknown>,
  key: string
): number | undefined => {
  const nested = value[key];
  return typeof nested === "number" && !Number.isNaN(nested) ? nested : undefined;
};

const hasDefinedProperty = (
  value: Record<string, unknown>,
  key: string
): boolean => value[key] !== undefined;
