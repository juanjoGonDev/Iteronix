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
  AssetEditor: "asset-editor",
  ExecutionNode: "execution-node",
  VersionDetails: "version-details",
} as const;

export type WorkflowsUrlModal =
  (typeof WorkflowsUrlModal)[keyof typeof WorkflowsUrlModal];

export const WorkflowsUrlDebugPanelTab = {
  Schema: "schema",
  Table: "table",
  Json: "json",
} as const;

export type WorkflowsUrlDebugPanelTab =
  (typeof WorkflowsUrlDebugPanelTab)[keyof typeof WorkflowsUrlDebugPanelTab];

export const WorkflowsUrlEditor = {
  OutputEditor: "output-editor",
  DeepEditor: "deep-editor",
  RegexTester: "regex-tester",
} as const;

export type WorkflowsUrlEditor =
  (typeof WorkflowsUrlEditor)[keyof typeof WorkflowsUrlEditor];

export const WorkflowsUrlVersionAction = {
  Clone: "clone",
  Restore: "restore",
} as const;

export type WorkflowsUrlVersionAction =
  (typeof WorkflowsUrlVersionAction)[keyof typeof WorkflowsUrlVersionAction];

type WorkflowsUrlDeepEditorTab = "prompt" | "output" | "preview";
type WorkflowsUrlDeepEditorOutputTab = "visual" | "json";

export type WorkflowsUrlState = {
  panel: WorkflowsUrlPanel | null;
  modal: WorkflowsUrlModal | null;
  nodeId: string | null;
  assetId: string | null;
  executionId: string | null;
  versionId: string | null;
  compareVersionId: string | null;
  diffQuery: string | null;
  debugInputTab: WorkflowsUrlDebugPanelTab | null;
  debugOutputTab: WorkflowsUrlDebugPanelTab | null;
  debugInputSourceId: string | null;
  editor: WorkflowsUrlEditor | null;
  pinnedOutputId: string | null;
  deepEditorTab: WorkflowsUrlDeepEditorTab | null;
  deepEditorOutputTab: WorkflowsUrlDeepEditorOutputTab | null;
  regexPattern: string | null;
  regexFlags: string | null;
  versionAction: WorkflowsUrlVersionAction | null;
};

export type WorkflowsUrlPatch = {
  panel?: WorkflowsUrlPanel | null;
  modal?: WorkflowsUrlModal | null;
  nodeId?: string | null;
  assetId?: string | null;
  executionId?: string | null;
  versionId?: string | null;
  compareVersionId?: string | null;
  diffQuery?: string | null;
  debugInputTab?: WorkflowsUrlDebugPanelTab | null;
  debugOutputTab?: WorkflowsUrlDebugPanelTab | null;
  debugInputSourceId?: string | null;
  editor?: WorkflowsUrlEditor | null;
  pinnedOutputId?: string | null;
  deepEditorTab?: WorkflowsUrlDeepEditorTab | null;
  deepEditorOutputTab?: WorkflowsUrlDeepEditorOutputTab | null;
  regexPattern?: string | null;
  regexFlags?: string | null;
  versionAction?: WorkflowsUrlVersionAction | null;
};

const WorkflowsRoutePath = "/workflows";
const UrlParam = {
  Panel: "panel",
  Modal: "modal",
  Node: "node",
  Asset: "asset",
  Execution: "execution",
  Version: "version",
  Compare: "compare",
  Diff: "diff",
  InputTab: "inputTab",
  OutputTab: "outputTab",
  InputSource: "inputSource",
  Editor: "editor",
  PinnedOutput: "pinnedOutput",
  DeepEditorTab: "deepTab",
  DeepEditorOutputTab: "deepOutputTab",
  RegexPattern: "regexPattern",
  RegexFlags: "regexFlags",
  VersionAction: "action",
} as const;

export const readWorkflowsUrlState = (urlInput: string): WorkflowsUrlState => {
  const url = new URL(urlInput, "http://localhost");
  return {
    panel: readPanel(url.searchParams.get(UrlParam.Panel)),
    modal: readModal(url.searchParams.get(UrlParam.Modal)),
    nodeId: readNonEmptyParam(url.searchParams.get(UrlParam.Node)),
    assetId: readNonEmptyParam(url.searchParams.get(UrlParam.Asset)),
    executionId: readNonEmptyParam(url.searchParams.get(UrlParam.Execution)),
    versionId: readNonEmptyParam(url.searchParams.get(UrlParam.Version)),
    compareVersionId: readNonEmptyParam(url.searchParams.get(UrlParam.Compare)),
    diffQuery: readNonEmptyParam(url.searchParams.get(UrlParam.Diff)),
    debugInputTab: readDebugPanelTab(url.searchParams.get(UrlParam.InputTab)),
    debugOutputTab: readDebugPanelTab(url.searchParams.get(UrlParam.OutputTab)),
    debugInputSourceId: readNonEmptyParam(
      url.searchParams.get(UrlParam.InputSource),
    ),
    editor: readEditor(url.searchParams.get(UrlParam.Editor)),
    pinnedOutputId: readNonEmptyParam(
      url.searchParams.get(UrlParam.PinnedOutput),
    ),
    deepEditorTab: readDeepEditorTab(
      url.searchParams.get(UrlParam.DeepEditorTab),
    ),
    deepEditorOutputTab: readDeepEditorOutputTab(
      url.searchParams.get(UrlParam.DeepEditorOutputTab),
    ),
    regexPattern: readNonEmptyParam(
      url.searchParams.get(UrlParam.RegexPattern),
    ),
    regexFlags: readNullableParam(url.searchParams.get(UrlParam.RegexFlags)),
    versionAction: readVersionAction(
      url.searchParams.get(UrlParam.VersionAction),
    ),
  };
};

export const applyWorkflowsUrlPatch = (
  urlInput: string,
  patch: WorkflowsUrlPatch,
): string => {
  const url = new URL(urlInput, "http://localhost");
  url.pathname = readWorkflowRoutePath(url.pathname);
  writeOptionalParam(url.searchParams, UrlParam.Panel, patch.panel);
  writeOptionalParam(url.searchParams, UrlParam.Modal, patch.modal);
  writeOptionalParam(url.searchParams, UrlParam.Node, patch.nodeId);
  writeOptionalParam(url.searchParams, UrlParam.Asset, patch.assetId);
  writeOptionalParam(url.searchParams, UrlParam.Execution, patch.executionId);
  writeOptionalParam(url.searchParams, UrlParam.Version, patch.versionId);
  writeOptionalParam(
    url.searchParams,
    UrlParam.Compare,
    patch.compareVersionId,
  );
  writeOptionalParam(url.searchParams, UrlParam.Diff, patch.diffQuery);
  writeOptionalParam(url.searchParams, UrlParam.InputTab, patch.debugInputTab);
  writeOptionalParam(
    url.searchParams,
    UrlParam.OutputTab,
    patch.debugOutputTab,
  );
  writeOptionalParam(
    url.searchParams,
    UrlParam.InputSource,
    patch.debugInputSourceId,
  );
  writeOptionalParam(url.searchParams, UrlParam.Editor, patch.editor);
  writeOptionalParam(
    url.searchParams,
    UrlParam.PinnedOutput,
    patch.pinnedOutputId,
  );
  writeOptionalParam(
    url.searchParams,
    UrlParam.DeepEditorTab,
    patch.deepEditorTab,
  );
  writeOptionalParam(
    url.searchParams,
    UrlParam.DeepEditorOutputTab,
    patch.deepEditorOutputTab,
  );
  writeOptionalParam(
    url.searchParams,
    UrlParam.RegexPattern,
    patch.regexPattern,
  );
  writeOptionalParam(url.searchParams, UrlParam.RegexFlags, patch.regexFlags);
  writeOptionalParam(
    url.searchParams,
    UrlParam.VersionAction,
    patch.versionAction,
  );
  const query = url.searchParams.toString();
  return query.length > 0 ? `${url.pathname}?${query}` : url.pathname;
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

const readWorkflowRoutePath = (pathname: string): string =>
  pathname === WorkflowsRoutePath ||
  pathname.startsWith(`${WorkflowsRoutePath}/`)
    ? pathname
    : WorkflowsRoutePath;

const readModal = (value: string | null): WorkflowsUrlModal | null => {
  if (value === WorkflowsUrlModal.EditHistory) {
    return WorkflowsUrlModal.EditHistory;
  }
  if (value === WorkflowsUrlModal.NodeEditor) {
    return WorkflowsUrlModal.NodeEditor;
  }
  if (value === WorkflowsUrlModal.AssetEditor) {
    return WorkflowsUrlModal.AssetEditor;
  }
  if (value === WorkflowsUrlModal.ExecutionNode) {
    return WorkflowsUrlModal.ExecutionNode;
  }
  if (value === WorkflowsUrlModal.VersionDetails) {
    return WorkflowsUrlModal.VersionDetails;
  }
  return null;
};

const readDebugPanelTab = (
  value: string | null,
): WorkflowsUrlDebugPanelTab | null => {
  if (value === WorkflowsUrlDebugPanelTab.Schema) {
    return WorkflowsUrlDebugPanelTab.Schema;
  }
  if (value === WorkflowsUrlDebugPanelTab.Table) {
    return WorkflowsUrlDebugPanelTab.Table;
  }
  if (value === WorkflowsUrlDebugPanelTab.Json) {
    return WorkflowsUrlDebugPanelTab.Json;
  }
  return null;
};

const readEditor = (value: string | null): WorkflowsUrlEditor | null => {
  if (value === WorkflowsUrlEditor.OutputEditor) {
    return WorkflowsUrlEditor.OutputEditor;
  }
  if (value === WorkflowsUrlEditor.DeepEditor) {
    return WorkflowsUrlEditor.DeepEditor;
  }
  if (value === WorkflowsUrlEditor.RegexTester) {
    return WorkflowsUrlEditor.RegexTester;
  }
  return null;
};

const readDeepEditorTab = (
  value: string | null,
): WorkflowsUrlDeepEditorTab | null => {
  if (value === "prompt" || value === "output" || value === "preview") {
    return value;
  }
  return null;
};

const readDeepEditorOutputTab = (
  value: string | null,
): WorkflowsUrlDeepEditorOutputTab | null => {
  if (value === "visual" || value === "json") {
    return value;
  }
  return null;
};

const readVersionAction = (
  value: string | null,
): WorkflowsUrlVersionAction | null => {
  if (value === WorkflowsUrlVersionAction.Clone) {
    return WorkflowsUrlVersionAction.Clone;
  }
  if (value === WorkflowsUrlVersionAction.Restore) {
    return WorkflowsUrlVersionAction.Restore;
  }
  return null;
};

const readNullableParam = (value: string | null): string | null =>
  value === null ? null : value;

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
