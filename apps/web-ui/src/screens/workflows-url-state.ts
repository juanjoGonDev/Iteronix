export const WorkflowsUrlPanel = {
  Workflows: "workflows",
  Nodes: "nodes",
  Assets: "assets",
  History: "history",
} as const;

export type WorkflowsUrlPanel =
  (typeof WorkflowsUrlPanel)[keyof typeof WorkflowsUrlPanel];

export const WorkflowsUrlModal = {
  EditHistory: "edit-history",
  NodeEditor: "node-editor",
  ExecutionNode: "execution-node",
  VersionDetails: "version-details",
} as const;

export type WorkflowsUrlModal =
  (typeof WorkflowsUrlModal)[keyof typeof WorkflowsUrlModal];

export type WorkflowsUrlState = {
  panel: WorkflowsUrlPanel | null;
  modal: WorkflowsUrlModal | null;
  nodeId: string | null;
  executionId: string | null;
  versionId: string | null;
};

export type WorkflowsUrlPatch = {
  panel?: WorkflowsUrlPanel | null;
  modal?: WorkflowsUrlModal | null;
  nodeId?: string | null;
  executionId?: string | null;
  versionId?: string | null;
};

const WorkflowsRoutePath = "/workflows";
const UrlParam = {
  Panel: "panel",
  Modal: "modal",
  Node: "node",
  Execution: "execution",
  Version: "version",
} as const;

export const readWorkflowsUrlState = (urlInput: string): WorkflowsUrlState => {
  const url = new URL(urlInput, "http://localhost");
  return {
    panel: readPanel(url.searchParams.get(UrlParam.Panel)),
    modal: readModal(url.searchParams.get(UrlParam.Modal)),
    nodeId: readNonEmptyParam(url.searchParams.get(UrlParam.Node)),
    executionId: readNonEmptyParam(url.searchParams.get(UrlParam.Execution)),
    versionId: readNonEmptyParam(url.searchParams.get(UrlParam.Version)),
  };
};

export const applyWorkflowsUrlPatch = (
  urlInput: string,
  patch: WorkflowsUrlPatch,
): string => {
  const url = new URL(urlInput, "http://localhost");
  url.pathname = WorkflowsRoutePath;
  writeOptionalParam(url.searchParams, UrlParam.Panel, patch.panel);
  writeOptionalParam(url.searchParams, UrlParam.Modal, patch.modal);
  writeOptionalParam(url.searchParams, UrlParam.Node, patch.nodeId);
  writeOptionalParam(url.searchParams, UrlParam.Execution, patch.executionId);
  writeOptionalParam(url.searchParams, UrlParam.Version, patch.versionId);
  const query = url.searchParams.toString();
  return query.length > 0
    ? `${WorkflowsRoutePath}?${query}`
    : WorkflowsRoutePath;
};

export const readWorkflowsUrlStateFromLocation = (
  location: Location,
): WorkflowsUrlState =>
  readWorkflowsUrlState(
    `${location.pathname}${location.search}${location.hash}`,
  );

const readPanel = (value: string | null): WorkflowsUrlPanel | null => {
  if (value === WorkflowsUrlPanel.Workflows) {
    return WorkflowsUrlPanel.Workflows;
  }
  if (value === WorkflowsUrlPanel.Nodes) {
    return WorkflowsUrlPanel.Nodes;
  }
  if (value === WorkflowsUrlPanel.Assets) {
    return WorkflowsUrlPanel.Assets;
  }
  if (value === WorkflowsUrlPanel.History) {
    return WorkflowsUrlPanel.History;
  }
  return null;
};

const readModal = (value: string | null): WorkflowsUrlModal | null => {
  if (value === WorkflowsUrlModal.EditHistory) {
    return WorkflowsUrlModal.EditHistory;
  }
  if (value === WorkflowsUrlModal.NodeEditor) {
    return WorkflowsUrlModal.NodeEditor;
  }
  if (value === WorkflowsUrlModal.ExecutionNode) {
    return WorkflowsUrlModal.ExecutionNode;
  }
  if (value === WorkflowsUrlModal.VersionDetails) {
    return WorkflowsUrlModal.VersionDetails;
  }
  return null;
};

const readNonEmptyParam = (value: string | null): string | null => {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

const writeOptionalParam = (
  searchParams: URLSearchParams,
  key: string,
  value: string | null | undefined,
): void => {
  if (value === undefined) {
    return;
  }
  if (value === null || value.trim().length === 0) {
    searchParams.delete(key);
    return;
  }
  searchParams.set(key, value);
};
