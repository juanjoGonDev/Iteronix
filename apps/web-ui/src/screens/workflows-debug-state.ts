import type {
  WorkflowDefinitionRecord,
  WorkflowExecutionRecord,
  WorkflowNodeExecutionRecord,
} from "./workflows-editor-state.js";

export type WorkflowDebugStatusTone =
  | "idle"
  | "running"
  | "success"
  | "warning"
  | "failed";

export type WorkflowDebugOutputMap = ReadonlyMap<string, unknown>;

export type ExecutionRefreshPollingAction = "start" | "stop" | "keep";

export type WorkflowStepExecutionAvailability = {
  disabled: boolean;
  label: "Execute step" | "Executing";
};

export type WorkflowRunControlState = {
  disabled: boolean;
  icon: "play_arrow" | "pause";
  label: "Run" | "Pause";
  mode: "run" | "pause";
  title?: string | undefined;
  variant: "secondary" | "danger";
};

export type WorkflowDebugInputSource = {
  id: string;
  label: string;
  detail: string;
  value: unknown;
};

export type WorkflowDebugSchemaEntry = {
  path: string;
  type: string;
  items: number;
  status: WorkflowDebugStatusTone;
};

export const readWorkflowDebugItemCount = (value: unknown): number => {
  if (value === undefined || value === null) {
    return 0;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  return 1;
};

export const readWorkflowDebugItemLabel = (value: unknown): string => {
  const count = readWorkflowDebugItemCount(value);
  return `${count.toString()} item${count === 1 ? "" : "s"}`;
};

export const shouldOpenNodeModalFromPointerDetail = (detail: number): boolean =>
  detail >= NodeModalPointerDetailThreshold;

export const readExecutionRefreshPollingAction = (input: {
  autoRefreshEnabled: boolean;
  isPolling: boolean;
}): ExecutionRefreshPollingAction => {
  if (!input.autoRefreshEnabled) {
    return input.isPolling ? "stop" : "keep";
  }

  return input.isPolling ? "keep" : "start";
};

export const selectWorkflowCanvasExecution = <
  TExecution extends WorkflowCanvasExecutionLike,
>(input: {
  workflowId: string;
  liveExecutionId: string | null;
  selectedExecutionId: string | null;
  executions: ReadonlyArray<TExecution>;
}): TExecution | null =>
  readExecutionById(
    input.executions,
    input.workflowId,
    input.liveExecutionId,
  ) ??
  readExecutionById(
    input.executions,
    input.workflowId,
    input.selectedExecutionId,
  ) ??
  readActiveWorkflowExecution(input.executions, input.workflowId);

export const readWorkflowStepExecutionAvailability = (input: {
  hasNodeSelection: boolean;
  hasCurrentProject: boolean;
  hasCurrentWorkflow: boolean;
  hasDirtyWorkflow: boolean;
  dirtyAssetCount: number;
  hasPendingAction: boolean;
  hasActiveExecution: boolean;
}): WorkflowStepExecutionAvailability => {
  if (input.hasActiveExecution) {
    return {
      disabled: true,
      label: "Executing",
    };
  }

  return {
    disabled:
      !input.hasNodeSelection ||
      !input.hasCurrentProject ||
      !input.hasCurrentWorkflow ||
      input.hasDirtyWorkflow ||
      input.dirtyAssetCount > 0 ||
      input.hasPendingAction,
    label: "Execute step",
  };
};

export const readWorkflowRunControlState = (input: {
  hasCurrentWorkflow: boolean;
  hasPendingAction: boolean;
  hasUnsavedChanges: boolean;
  hasActiveExecution: boolean;
  canPauseLiveExecution: boolean;
}): WorkflowRunControlState => {
  if (input.hasActiveExecution) {
    return {
      disabled: !input.canPauseLiveExecution,
      icon: "pause",
      label: "Pause",
      mode: "pause",
      title: input.canPauseLiveExecution ? undefined : PausedServerRunTitle,
      variant: "danger",
    };
  }

  return {
    disabled:
      !input.hasCurrentWorkflow ||
      input.hasPendingAction ||
      input.hasUnsavedChanges,
    icon: "play_arrow",
    label: "Run",
    mode: "run",
    title: undefined,
    variant: "secondary",
  };
};

export const readWorkflowExecutionIsActive = (
  status: WorkflowExecutionRecord["status"] | "running" | null | undefined,
): boolean => status === "queued" || status === "running";

export const readWorkflowDebugStatusTone = (input: {
  status?: WorkflowNodeExecutionRecord["status"] | "pending" | "warn";
  alertsCount: number;
  findingsCount: number;
}): WorkflowDebugStatusTone => {
  if (input.status === "failed") {
    return "failed";
  }

  if (input.status === "running") {
    return "running";
  }

  if (
    input.status === "skipped" ||
    input.status === "awaiting_review" ||
    input.status === "warn" ||
    input.alertsCount > 0 ||
    input.findingsCount > 0
  ) {
    return "warning";
  }

  if (input.status === "completed") {
    return "success";
  }

  return "idle";
};

export const readWorkflowDebugSchemaEntries = (
  value: unknown,
): ReadonlyArray<WorkflowDebugSchemaEntry> =>
  readSchemaEntries(value, "$", "success", 0);

export const buildWorkflowDebugInputSources = (input: {
  workflow: WorkflowDefinitionRecord | WorkflowDefinitionInputLike;
  nodeId: string;
  outputsByNodeId: WorkflowDebugOutputMap;
}): ReadonlyArray<WorkflowDebugInputSource> => {
  const incomingEdges = input.workflow.edges.filter(
    (edge) => edge.targetNodeId === input.nodeId,
  );
  const sourceNodes = incomingEdges.flatMap((edge) => {
    const node = input.workflow.nodes.find(
      (entry) => entry.id === edge.sourceNodeId,
    );
    return node ? [{ id: node.id, label: node.label }] : [];
  });
  const availableSources = sourceNodes
    .map((node) => ({
      node,
      value: input.outputsByNodeId.get(node.id),
    }))
    .filter((entry) => entry.value !== undefined);
  const lastSource = availableSources.at(-1);
  const sources: WorkflowDebugInputSource[] = [];

  if (lastSource) {
    sources.push({
      id: "last-upstream",
      label: "Last upstream response",
      detail: `${lastSource.node.label} · ${readWorkflowDebugItemLabel(lastSource.value)}`,
      value: lastSource.value,
    });
  }

  for (const source of availableSources) {
    sources.push({
      id: `node:${source.node.id}`,
      label: source.node.label,
      detail: readWorkflowDebugItemLabel(source.value),
      value: source.value,
    });
  }

  if (availableSources.length > 1) {
    sources.push({
      id: "all-upstream",
      label: "All previous node outputs",
      detail: `${availableSources.length.toString()} sources`,
      value: Object.fromEntries(
        availableSources.map((source) => [source.node.label, source.value]),
      ),
    });
  }

  return sources;
};

export const selectWorkflowDebugExecution = <
  TExecution extends WorkflowDebugExecutionLike,
>(input: {
  workflowId: string;
  activeExecutionId: string | null;
  selectedExecutionId: string | null;
  liveExecutionId: string | null;
  executions: ReadonlyArray<TExecution>;
}): TExecution | null =>
  readExecutionById(
    input.executions,
    input.workflowId,
    input.liveExecutionId,
  ) ??
  readExecutionById(
    input.executions,
    input.workflowId,
    input.activeExecutionId,
  ) ??
  readExecutionById(
    input.executions,
    input.workflowId,
    input.selectedExecutionId,
  ) ??
  input.executions.find(
    (execution) => execution.workflowId === input.workflowId,
  ) ??
  null;

type WorkflowDefinitionInputLike = Pick<
  WorkflowDefinitionRecord,
  "nodes" | "edges"
>;

type WorkflowDebugExecutionLike = Pick<
  WorkflowExecutionRecord,
  "id" | "workflowId"
>;

type WorkflowCanvasExecutionLike = Pick<
  WorkflowExecutionRecord,
  "id" | "workflowId" | "status" | "startedAt"
>;

const readExecutionById = <TExecution extends WorkflowDebugExecutionLike>(
  executions: ReadonlyArray<TExecution>,
  workflowId: string,
  executionId: string | null,
): TExecution | null => {
  if (!executionId) {
    return null;
  }

  return (
    executions.find(
      (execution) =>
        execution.workflowId === workflowId && execution.id === executionId,
    ) ?? null
  );
};

const readActiveWorkflowExecution = <
  TExecution extends WorkflowCanvasExecutionLike,
>(
  executions: ReadonlyArray<TExecution>,
  workflowId: string,
): TExecution | null =>
  executions
    .filter(
      (execution) =>
        execution.workflowId === workflowId &&
        readWorkflowExecutionIsActive(execution.status),
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ??
  null;

const readSchemaEntries = (
  value: unknown,
  path: string,
  status: WorkflowDebugStatusTone,
  depth: number,
): ReadonlyArray<WorkflowDebugSchemaEntry> => {
  const entry: WorkflowDebugSchemaEntry = {
    path,
    type: readValueType(value),
    items: readWorkflowDebugItemCount(value),
    status,
  };

  if (depth >= MaximumSchemaDepth) {
    return [entry];
  }

  if (Array.isArray(value)) {
    const sample = (value as ReadonlyArray<unknown>)[0];
    return sample === undefined
      ? [entry]
      : [entry, ...readSchemaEntries(sample, `${path}[]`, status, depth + 1)];
  }

  if (value && typeof value === "object" && !(value instanceof Error)) {
    return [
      entry,
      ...Object.entries(value).flatMap(([key, nested]) =>
        readSchemaEntries(nested, `${path}.${key}`, status, depth + 1),
      ),
    ];
  }

  return [entry];
};

const MaximumSchemaDepth = 4;
const NodeModalPointerDetailThreshold = 2;
const PausedServerRunTitle =
  "This run is active on the server. Pause is available only for the live stream in this tab.";

const readValueType = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (value instanceof Error) {
    return "error";
  }

  return typeof value;
};
