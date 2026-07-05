import { Button, IconButton } from "../components/Button.js";
import { StatusBadge } from "../components/Card.js";
import { PageNoticeStack } from "../components/PageScaffold.js";
import { EmptyStatePanel } from "../components/WorkbenchPanels.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import { COMPACT_VIEWPORT_MAX_WIDTH } from "../shared/constants.js";
import {
  createLogsClient,
  ServerLogLevel,
  type ServerLogEntry,
} from "../shared/logs-client.js";
import {
  createWorkflowClient,
  WorkflowRunStreamEventType,
  type WorkflowRunStreamEvent,
} from "../shared/workflow-client.js";
import {
  createWorkspaceStateClient,
  type WorkspaceStateSnapshot,
} from "../shared/workspace-state-client.js";
import type { ProjectRecord } from "../shared/workbench-types.js";
import type { ProviderProfileRecord } from "./settings-state.js";
import {
  buildWorkflowDebugInputSources,
  readExecutionRefreshPollingAction,
  readWorkflowExecutionIsActive,
  readWorkflowExecutionNodeOpenState,
  readWorkflowDebugItemLabel,
  readWorkflowDebugSchemaEntries,
  readWorkflowDebugStatusTone,
  readWorkflowNodeHoverRunControlState,
  readWorkflowNodeModalNavigationState,
  readWorkflowPinnedNodeVisualState,
  readWorkflowPinnedOutputAction,
  parseWorkflowEditedOutputSnapshot,
  readWorkflowPinnedTestOutputFromDefinition,
  writeWorkflowPinnedTestOutputToDefinition,
  readWorkflowStepSeedOutputs,
  readWorkflowNodeStepLaunchState,
  readWorkflowRunControlState,
  readWorkflowStepExecutionAvailability,
  selectWorkflowCanvasExecution,
  selectWorkflowDebugExecution,
  selectWorkflowDraftAfterCatalogReload,
  shouldApplyWorkflowExecutionsRefresh,
  shouldOpenNodeModalFromPointerSequence,
  type WorkflowDebugInputSource,
  type WorkflowDebugOutputMap,
  type WorkflowDebugStatusTone,
  type WorkflowEditHistoryEntry,
  type WorkflowPinnedTestOutput,
  type WorkflowStepExecutionAvailability,
} from "./workflows-debug-state.js";
import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowGuardrailOperator,
  WorkflowGuardrailSeverity,
  WorkflowNodeKind,
  WorkflowNodeExecutionInputSourceKind,
  WorkflowNodeRole,
  WorkflowReasoningLevel,
  WorkflowRecordStatus,
  WorkflowVerbosity,
  JsonSchemaItemsSegment,
  JsonSchemaStringFormat,
  addWorkflowNode,
  addWorkflowEdgeMappingEntry,
  addWorkflowGuardrailValidation,
  attachGuardrailToNode,
  createJsonSchemaNode,
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
  createWorkflowAssetDraft,
  detachGuardrailFromNode,
  evaluateWorkflowRegex,
  filterWorkflowExpressionItems,
  formatJsonOutputContractDocument,
  insertWorkflowExpressionVariable,
  moveWorkflowNode,
  normalizeWorkflowAssetExecutionPolicy,
  parseJsonOutputContractDocument,
  readJsonSchemaPaths,
  readAssetKindLabel,
  readAssetScopeLabel,
  readDefaultWorkflowWorkspaceId,
  readGuardrailDefinitionValidity,
  readJsonContractValidation,
  readWorkflowExpressionUsageHints,
  readNodeAccentClassName,
  readNodeAssetKind,
  readNodeIcon,
  readNodeKindLabel,
  readNodeKindsForPalette,
  readWorkflowNodeSelectableOutputPaths,
  readWorkflowConnectedUpstreamNodeIds,
  removeWorkflowEdge,
  removeWorkflowNode,
  removeJsonSchemaProperty,
  renameJsonSchemaProperty,
  setWorkflowViewport,
  serializeJsonContractForProvider,
  stripDefinitionVersionFields,
  updateJsonSchemaNode,
  updateWorkflowAssetGuardrail,
  updateWorkflowNodeOutputContract,
  upsertJsonSchemaProperty,
  isWorkflowViewportOnlyChange,
  WorkflowExpressionVariableKind,
  WorkflowAssetDefaultMaxRetries,
  WorkflowAssetDefaultTimeoutMs,
  type EdgeMappingEntryRecord,
  type GuardrailValidationRecord,
  type JsonOutputContractRecord,
  type JsonSchemaNodeRecord,
  type WorkflowAlertRecord,
  type WorkflowAssetKind as WorkflowAssetKindValue,
  type WorkflowAssetRecord,
  type WorkflowAssetExecutionPolicyRecord,
  type WorkflowAssetScope as WorkflowAssetScopeValue,
  type WorkflowAssetUsageRecord,
  type WorkflowAssetUpsertInput,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionUpsertInput,
  type WorkflowExecutionRecord,
  type WorkflowExpressionVariableReference,
  type WorkflowGuardrailFindingRecord,
  type WorkflowNodeExecutionRecord,
  type WorkflowNodeExecutionInputSourceRecord,
  type WorkflowNodeKind as WorkflowNodeKindValue,
  type WorkflowNodeRecord,
  type WorkflowProviderSelectionRecord,
  type WorkflowRegexMatchRecord,
  type WorkflowViewportRecord,
} from "./workflows-editor-state.js";

const WorkflowScreenSelector = {
  Root: "workflows-editor-root",
  CanvasViewport: "workflows-canvas-viewport",
  SidebarRail: "workflows-sidebar-rail",
  SidebarPanel: "workflows-sidebar-panel",
  InspectorPanel: "workflows-inspector-panel",
  WorkflowCreate: "workflows-create",
  WorkflowSave: "workflows-save",
  WorkflowDelete: "workflows-delete",
  WorkflowRun: "workflows-run",
  WorkflowSelect: "workflows-select",
  CanvasZoomOut: "workflows-canvas-zoom-out",
  CanvasFitView: "workflows-canvas-fit-view",
  CanvasResetView: "workflows-canvas-reset-view",
  CanvasZoomIn: "workflows-canvas-zoom-in",
  ConnectionHint: "workflows-connection-hint",
  ConnectionPreview: "workflows-connection-preview",
  EdgeDeletePrefix: "workflows-edge-delete-",
  EdgeHitPrefix: "workflows-edge-hit-",
  SectionWorkflows: "workflows-section-definitions",
  SectionNodes: "workflows-section-nodes",
  SectionAssets: "workflows-section-assets",
  SectionHistory: "workflows-section-history",
  ExecutionSummary: "workflows-execution-summary",
  ExecutionSummaryLatestRun: "workflows-execution-summary-latest-run",
  ExecutionSummaryLatestStatus: "workflows-execution-summary-latest-status",
  ExecutionSummaryStatusDistribution:
    "workflows-execution-summary-status-distribution",
  ExecutionSummaryRuns: "workflows-execution-summary-runs",
  ExecutionSummaryCost: "workflows-execution-summary-cost",
  ExecutionSummaryTokens: "workflows-execution-summary-tokens",
  ExecutionSummaryWarnings: "workflows-execution-summary-warnings",
  ExecutionSummaryErrors: "workflows-execution-summary-errors",
  ExecutionSummaryAttention: "workflows-execution-summary-attention",
  ExecutionSummaryAttentionRuns: "workflows-execution-summary-attention-runs",
  ExecutionSummaryAttentionFailedRuns:
    "workflows-execution-summary-attention-failed-runs",
  ExecutionSummaryAttentionAlertedRuns:
    "workflows-execution-summary-attention-alerted-runs",
  ExecutionFilterAll: "workflows-execution-filter-all",
  ExecutionFilterFailed: "workflows-execution-filter-failed",
  ExecutionFilterAttention: "workflows-execution-filter-attention",
  ExecutionAttentionRunPrefix: "workflows-execution-attention-run-",
  ExecutionCardPrefix: "workflows-execution-card-",
  ExecutionDeletePrefix: "workflows-execution-delete-",
  ExecutionInspector: "workflows-execution-inspector",
  ExecutionNodeRunPrefix: "workflows-execution-node-run-",
  WorkflowNameInput: "workflows-name-input",
  WorkflowDescriptionInput: "workflows-description-input",
  NodeLabelInput: "workflows-node-label-input",
  NodePromptInput: "workflows-node-prompt-input",
  NodeRoleSelect: "workflows-node-role-select",
  NodeProviderSelect: "workflows-node-provider-select",
  NodeProviderTest: "workflows-node-provider-test",
  NodeReasoningSelect: "workflows-node-reasoning-select",
  NodeVerbositySelect: "workflows-node-verbosity-select",
  OutputContractNameInput: "workflows-output-contract-name-input",
  OutputContractAddField: "workflows-output-contract-add-field",
  OutputContractStatus: "workflows-output-contract-status",
  OutputContractPropertyNamePrefix: "workflows-output-contract-property-name-",
  OutputContractPropertyTypePrefix: "workflows-output-contract-property-type-",
  OutputContractPropertyRequiredPrefix:
    "workflows-output-contract-property-required-",
  OutputContractPropertyDeletePrefix:
    "workflows-output-contract-property-delete-",
  OutputContractPropertyAddChildPrefix:
    "workflows-output-contract-property-add-child-",
  OutputContractPropertyFormatPrefix:
    "workflows-output-contract-property-format-",
  OutputContractPropertyMinPrefix: "workflows-output-contract-property-min-",
  OutputContractPropertyMaxPrefix: "workflows-output-contract-property-max-",
  OutputContractPropertyPatternPrefix:
    "workflows-output-contract-property-pattern-",
  OutputContractPropertyRegexTestPrefix:
    "workflows-output-contract-property-regex-test-",
  AssetOutputContractNameInput: "workflows-asset-output-contract-name-input",
  AssetOutputContractAddField: "workflows-asset-output-contract-add-field",
  AssetOutputContractStatus: "workflows-asset-output-contract-status",
  AssetOutputContractPropertyNamePrefix:
    "workflows-asset-output-contract-property-name-",
  AssetOutputContractPropertyTypePrefix:
    "workflows-asset-output-contract-property-type-",
  AssetOutputContractPropertyRequiredPrefix:
    "workflows-asset-output-contract-property-required-",
  AssetOutputContractPropertyDeletePrefix:
    "workflows-asset-output-contract-property-delete-",
  AssetOutputContractPropertyAddChildPrefix:
    "workflows-asset-output-contract-property-add-child-",
  AssetOutputContractPropertyFormatPrefix:
    "workflows-asset-output-contract-property-format-",
  AssetOutputContractPropertyMinPrefix:
    "workflows-asset-output-contract-property-min-",
  AssetOutputContractPropertyMaxPrefix:
    "workflows-asset-output-contract-property-max-",
  AssetOutputContractPropertyPatternPrefix:
    "workflows-asset-output-contract-property-pattern-",
  AssetOutputContractPropertyRegexTestPrefix:
    "workflows-asset-output-contract-property-regex-test-",
  AssetMaxRetriesInput: "workflows-asset-max-retries-input",
  AssetTimeoutMinutesInput: "workflows-asset-timeout-minutes-input",
  MappingTargetPathInput: "workflows-mapping-target-path-input",
  MappingSourcePathInput: "workflows-mapping-source-path-input",
  MappingAddEntry: "workflows-mapping-add-entry",
  GuardrailNewForNode: "workflows-guardrail-new-for-node",
  GuardrailAttachmentEditPrefix: "workflows-guardrail-attachment-edit-",
  GuardrailSeveritySelect: "workflows-guardrail-severity-select",
  GuardrailOperatorSelect: "workflows-guardrail-operator-select",
  GuardrailValidationKindSelect: "workflows-guardrail-validation-kind-select",
  GuardrailValidationTargetSelect:
    "workflows-guardrail-validation-target-select",
  GuardrailValidationPathInput: "workflows-guardrail-validation-path-input",
  GuardrailValidationValueInput: "workflows-guardrail-validation-value-input",
  GuardrailExpressionHints: "workflows-guardrail-expression-hints",
  GuardrailValidationVariablePrefix: "workflows-guardrail-variable-",
  GuardrailValidationRegexTest: "workflows-guardrail-validation-regex-test",
  GuardrailValidationMessageInput:
    "workflows-guardrail-validation-message-input",
  GuardrailAddValidation: "workflows-guardrail-add-validation",
  DeepEditorOpenPrefix: "workflows-deep-editor-open-",
  DeepEditorModal: "workflows-deep-editor-modal",
  DeepEditorPromptInput: "workflows-deep-editor-prompt-input",
  DeepEditorPromptHints: "workflows-deep-editor-prompt-hints",
  ExpressionHintPrefix: "workflows-expression-hint-",
  DeepEditorSampleOutputInput: "workflows-deep-editor-sample-output-input",
  DeepEditorRawJsonInput: "workflows-deep-editor-raw-json-input",
  OutputEditorTextarea: "workflows-output-editor-textarea",
  OutputPinControl: "workflows-output-pin-control",
  DeepEditorTabPrompt: "workflows-deep-editor-tab-prompt",
  DeepEditorTabOutput: "workflows-deep-editor-tab-output",
  DeepEditorTabPreview: "workflows-deep-editor-tab-preview",
  DeepEditorOutputTabVisual: "workflows-deep-editor-output-tab-visual",
  DeepEditorOutputTabJson: "workflows-deep-editor-output-tab-json",
  DeepEditorClose: "workflows-deep-editor-close",
  DeepEditorApplyRawJson: "workflows-deep-editor-apply-raw-json",
  RegexTesterModal: "workflows-regex-tester-modal",
  RegexTesterPatternInput: "workflows-regex-tester-pattern-input",
  RegexTesterFlagsInput: "workflows-regex-tester-flags-input",
  RegexTesterTextInput: "workflows-regex-tester-text-input",
  VariableSearchInput: "workflows-variable-search-input",
  VariableTokenPrefix: "workflows-variable-token-",
  NodePalettePrefix: "workflows-node-palette-",
  AssetCreatePrefix: "workflows-asset-create-",
  AssetCardPrefix: "workflows-asset-card-",
  NodeCardPrefix: "workflows-node-card-",
  NodeModalPrevious: "workflows-node-modal-previous",
  NodeModalNext: "workflows-node-modal-next",
  InspectorEmpty: "workflows-inspector-empty",
  CompactSidebar: "workflows-compact-sidebar",
  CompactCanvas: "workflows-compact-canvas",
  CompactInspector: "workflows-compact-inspector",
} as const;

const EdgeDeleteButtonSize = 20;
const EdgeDeleteNodeAvoidancePadding = 12;
const WorkflowNodeVisualWidth = 104;
const WorkflowNodeApproximateHeight = 120;
const WorkflowNodeDuplicateOffset = 48;
const WorkflowEditHistoryLimit = 40;
const PortLabelSingleOutputMinimum = 2;
const EdgeDirectionArrowSize = 7;
const EdgeDeleteOffset = 34;
const EdgeDeleteWideOffset = 58;
const WorkflowNodePaletteDragMimeType = "application/x-iteronix-workflow-node";
const LatestResponseSourcePath = "$";
const LatestResponseSourceLabel = "Latest response";
const AccumulatedOutputsSourcePath = "accumulated:$";
const AccumulatedOutputsSourcePrefix = "accumulated:";
const AccumulatedOutputsSourceLabel = "All previous outputs";
const ExecutionRefreshIntervalMs = 1_500;
const WorkflowAssetTimeoutMinuteMs = 60_000;
const DefaultRegexTesterFlags = "";
const DefaultRegexTesterTestText = "";
const InspectorInputClassName =
  "w-full rounded-md border border-border-dark bg-[#0e141b] px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/40";
const InspectorTextInputClassName = `h-10 ${InspectorInputClassName}`;
const InspectorTextAreaClassName = `min-h-32 resize-y py-3 leading-6 ${InspectorInputClassName}`;
const InspectorSelectClassName = `h-10 appearance-none pr-10 ${InspectorInputClassName}`;
const ProviderFallbackId = "codex-cli";

const SidebarSection = {
  Workflows: "workflows",
  Nodes: "nodes",
  Assets: "assets",
  History: "history",
} as const;

type SidebarSection = (typeof SidebarSection)[keyof typeof SidebarSection];

const CompactView = {
  Sidebar: "sidebar",
  Canvas: "canvas",
  Inspector: "inspector",
} as const;

type CompactView = (typeof CompactView)[keyof typeof CompactView];

const PendingAction = {
  Load: "load",
  CreateWorkflow: "create-workflow",
  SaveWorkflow: "save-workflow",
  DeleteWorkflow: "delete-workflow",
  CreateAsset: "create-asset",
  DeleteExecution: "delete-execution",
  RunWorkflow: "run-workflow",
  TestProvider: "test-provider",
} as const;

type PendingAction = (typeof PendingAction)[keyof typeof PendingAction];

const ExecutionHistoryFilter = {
  All: "all",
  Failed: "failed",
  Attention: "attention",
} as const;

type ExecutionHistoryFilter =
  (typeof ExecutionHistoryFilter)[keyof typeof ExecutionHistoryFilter];

const WorkflowLogsFilter = {
  Errors: "errors",
  All: "all",
} as const;

type WorkflowLogsFilter =
  (typeof WorkflowLogsFilter)[keyof typeof WorkflowLogsFilter];

type WorkflowSelection =
  | { type: "workflow"; id: string | null }
  | { type: "node"; id: string }
  | { type: "asset"; id: string }
  | { type: "execution"; id: string };

type PortSide = "input" | "output";

type PendingConnection = {
  nodeId: string;
  portId: string;
};

type HoveredPort = {
  nodeId: string;
  portId: string;
  side: PortSide;
};

type ConnectionPreviewPoint = {
  x: number;
  y: number;
};

type DeepEditorTarget =
  | {
      type: "node";
      id: string;
    }
  | {
      type: "asset";
      id: string;
    };

type DeepEditorTab = "prompt" | "output" | "preview";
type DeepEditorOutputTab = "visual" | "json";
type WorkflowDebugPanelTab = "schema" | "table" | "json";

type DeepEditorState = {
  target: DeepEditorTarget;
  tab: DeepEditorTab;
  outputTab: DeepEditorOutputTab;
  rawContractText: string;
  rawContractError: string | null;
  variableSearchQuery: string;
  promptSelectionStart: number;
  promptSelectionEnd: number;
  sampleSelectionStart: number;
  sampleSelectionEnd: number;
};

type RegexTesterState = {
  title: string;
  pattern: string;
  flags: string;
  testText: string;
};

type LiveNodeRunState = {
  status: "pending" | "running" | "completed" | "warn" | "failed";
  startedAt?: string;
  finishedAt?: string;
  outputText: string;
  outputSnapshot?: unknown;
  alerts: ReadonlyArray<WorkflowAlertRecord>;
  guardrailFindings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
  usage?: WorkflowNodeExecutionRecord["usage"];
  provider?: WorkflowProviderSelectionRecord;
};

type LiveExecutionState = {
  workflowId: string;
  workflowRunId: string | null;
  startedAt: string;
  activeNodeId: string | null;
  completedNodeIds: ReadonlyArray<string>;
  nodeRuns: Record<string, LiveNodeRunState>;
  status: "running" | "completed" | "failed";
  errorMessage: string | null;
};

type WorkflowInspectorLogsScope = {
  runId?: string | undefined;
  title: string;
  emptyMessage: string;
};

type ExecutionNodeModalState = {
  mode: "execution" | "live";
  executionId: string | null;
  nodeId: string;
};

type WorkflowOutputEditorState = {
  nodeId: string;
  text: string;
};

type ExecutionNodeModalContext = {
  modal: ExecutionNodeModalState;
  workflow: WorkflowDefinitionUpsertInput;
  node: WorkflowNodeRecord;
  runId?: string | undefined;
  runStatus:
    | WorkflowNodeExecutionRecord["status"]
    | LiveNodeRunState["status"]
    | "awaiting_review";
  outputText: string;
  alerts: ReadonlyArray<WorkflowAlertRecord>;
  findings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
  usage?: WorkflowNodeExecutionRecord["usage"] | undefined;
  providerLabel: string;
  durationLabel: string;
  isPinned: boolean;
};

type WorkflowNodeDebugContext = {
  node: WorkflowNodeRecord;
  workflow: WorkflowDefinitionUpsertInput;
  execution: WorkflowExecutionRecord | null;
  liveRun: LiveNodeRunState | null;
  outputValue: unknown;
  inputSources: ReadonlyArray<WorkflowDebugInputSource>;
  selectedInputSource: WorkflowDebugInputSource | null;
  statusTone: WorkflowDebugStatusTone;
  statusLabel: string;
};

type WorkflowVariableToken = {
  id: string;
  label: string;
  detail: string;
  reference: WorkflowExpressionVariableReference;
};

type WorkflowVariableGroup = {
  id: string;
  label: string;
  tokens: ReadonlyArray<WorkflowVariableToken>;
};

type NodeDropTarget = {
  nodeId: string;
  portId: string;
};

type GuardrailValidationKindValue = GuardrailValidationRecord["kind"];
type GuardrailValidationTargetValue = GuardrailValidationRecord["target"];
type OutputContractEditorSelectorSet = {
  nameInput: string;
  addFieldButton: string;
  status: string;
  propertyNamePrefix: string;
  propertyTypePrefix: string;
  propertyRequiredPrefix: string;
  propertyDeletePrefix: string;
  propertyAddChildPrefix: string;
  propertyFormatPrefix: string;
  propertyMinPrefix: string;
  propertyMaxPrefix: string;
  propertyPatternPrefix: string;
  propertyRegexTestPrefix: string;
};

type ContractSelectOption =
  | string
  | {
      label: string;
      options: ReadonlyArray<string>;
    };

const NodeOutputContractEditorSelectors: OutputContractEditorSelectorSet = {
  nameInput: WorkflowScreenSelector.OutputContractNameInput,
  addFieldButton: WorkflowScreenSelector.OutputContractAddField,
  status: WorkflowScreenSelector.OutputContractStatus,
  propertyNamePrefix: WorkflowScreenSelector.OutputContractPropertyNamePrefix,
  propertyTypePrefix: WorkflowScreenSelector.OutputContractPropertyTypePrefix,
  propertyRequiredPrefix:
    WorkflowScreenSelector.OutputContractPropertyRequiredPrefix,
  propertyDeletePrefix:
    WorkflowScreenSelector.OutputContractPropertyDeletePrefix,
  propertyAddChildPrefix:
    WorkflowScreenSelector.OutputContractPropertyAddChildPrefix,
  propertyFormatPrefix:
    WorkflowScreenSelector.OutputContractPropertyFormatPrefix,
  propertyMinPrefix: WorkflowScreenSelector.OutputContractPropertyMinPrefix,
  propertyMaxPrefix: WorkflowScreenSelector.OutputContractPropertyMaxPrefix,
  propertyPatternPrefix:
    WorkflowScreenSelector.OutputContractPropertyPatternPrefix,
  propertyRegexTestPrefix:
    WorkflowScreenSelector.OutputContractPropertyRegexTestPrefix,
};

const AssetOutputContractEditorSelectors: OutputContractEditorSelectorSet = {
  nameInput: WorkflowScreenSelector.AssetOutputContractNameInput,
  addFieldButton: WorkflowScreenSelector.AssetOutputContractAddField,
  status: WorkflowScreenSelector.AssetOutputContractStatus,
  propertyNamePrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyNamePrefix,
  propertyTypePrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyTypePrefix,
  propertyRequiredPrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyRequiredPrefix,
  propertyDeletePrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyDeletePrefix,
  propertyAddChildPrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyAddChildPrefix,
  propertyFormatPrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyFormatPrefix,
  propertyMinPrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyMinPrefix,
  propertyMaxPrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyMaxPrefix,
  propertyPatternPrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyPatternPrefix,
  propertyRegexTestPrefix:
    WorkflowScreenSelector.AssetOutputContractPropertyRegexTestPrefix,
};

interface WorkflowsScreenState {
  currentProject: ProjectRecord | null;
  workspaceState: WorkspaceStateSnapshot | null;
  workflows: ReadonlyArray<WorkflowDefinitionRecord>;
  assets: ReadonlyArray<WorkflowAssetRecord>;
  assetUsages: ReadonlyArray<WorkflowAssetUsageRecord>;
  executions: ReadonlyArray<WorkflowExecutionRecord>;
  serverLogs: ReadonlyArray<ServerLogEntry>;
  workflowLogsFilter: WorkflowLogsFilter;
  executionHistoryFilter: ExecutionHistoryFilter;
  executionAutoRefreshEnabled: boolean;
  draftWorkflow: WorkflowDefinitionUpsertInput | null;
  selection: WorkflowSelection;
  activeSidebarSection: SidebarSection;
  compactView: CompactView;
  desktopSidebarCollapsed: boolean;
  desktopInspectorCollapsed: boolean;
  isCompactViewport: boolean;
  pendingAction: PendingAction | null;
  refreshingLogs: boolean;
  loadingExecutionId: string | null;
  activeProviderTestNodeId: string | null;
  dirtyWorkflow: boolean;
  dirtyAssetIds: ReadonlyArray<string>;
  pendingConnection: PendingConnection | null;
  hoveredPort: HoveredPort | null;
  hoveredEdgeId: string | null;
  connectionPreviewPoint: ConnectionPreviewPoint | null;
  guardrailAttachAssetId: string | null;
  mappingTargetPath: string;
  mappingSourcePath: string;
  guardrailValidationKind: GuardrailValidationKindValue;
  guardrailValidationTarget: GuardrailValidationTargetValue;
  guardrailValidationPath: string;
  guardrailValidationValue: string;
  guardrailValidationMessage: string;
  deepEditor: DeepEditorState | null;
  regexTester: RegexTesterState | null;
  editorModalOpen: boolean;
  debugInputTab: WorkflowDebugPanelTab;
  debugOutputTab: WorkflowDebugPanelTab;
  debugInputSourceId: string;
  debugExecutionId: string | null;
  liveExecution: LiveExecutionState | null;
  pinnedTestOutput: WorkflowPinnedTestOutput | null;
  outputEditor: WorkflowOutputEditorState | null;
  nodeActionMenuId: string | null;
  workflowEditHistory: ReadonlyArray<
    WorkflowEditHistoryEntry<WorkflowDefinitionUpsertInput>
  >;
  executionNodeModal: ExecutionNodeModalState | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

export class WorkflowsScreen extends Component<
  ComponentProps,
  WorkflowsScreenState
> {
  private readonly workspaceStateClient = createWorkspaceStateClient();
  private readonly workflowClient = createWorkflowClient();
  private readonly logsClient = createLogsClient();
  private draggingNodeId: string | null = null;
  private dragPointerOffset: { x: number; y: number } | null = null;
  private connectionDragging = false;
  private panning = false;
  private spacePanPressed = false;
  private panOrigin: { x: number; y: number } | null = null;
  private panViewportOrigin: WorkflowViewportRecord | null = null;
  private lastNodePointerDown: { nodeId: string; eventTime: number } | null =
    null;
  private liveExecutionAbortController: AbortController | null = null;
  private executionRefreshIntervalId: number | null = null;
  private outputEditorDraftText: string | null = null;

  constructor(props: ComponentProps = {}) {
    super(props, {
      currentProject: null,
      workspaceState: null,
      workflows: [],
      assets: [],
      assetUsages: [],
      executions: [],
      serverLogs: [],
      workflowLogsFilter: WorkflowLogsFilter.Errors,
      executionHistoryFilter: ExecutionHistoryFilter.All,
      executionAutoRefreshEnabled: true,
      draftWorkflow: null,
      selection: { type: "workflow", id: null },
      activeSidebarSection: SidebarSection.Workflows,
      compactView: CompactView.Canvas,
      desktopSidebarCollapsed: false,
      desktopInspectorCollapsed: false,
      isCompactViewport: readIsCompactViewport(),
      pendingAction: null,
      refreshingLogs: false,
      loadingExecutionId: null,
      activeProviderTestNodeId: null,
      dirtyWorkflow: false,
      dirtyAssetIds: [],
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null,
      guardrailAttachAssetId: null,
      mappingTargetPath: "$.context",
      mappingSourcePath: "$.result",
      guardrailValidationKind: "field_exists",
      guardrailValidationTarget: "output",
      guardrailValidationPath: "$.result",
      guardrailValidationValue: "",
      guardrailValidationMessage: "Expected $.result to be present.",
      deepEditor: null,
      regexTester: null,
      editorModalOpen: false,
      debugInputTab: "json",
      debugOutputTab: "json",
      debugInputSourceId: "last-upstream",
      debugExecutionId: null,
      executionNodeModal: null,
      liveExecution: null,
      pinnedTestOutput: null,
      outputEditor: null,
      nodeActionMenuId: null,
      workflowEditHistory: [],
      errorMessage: null,
      noticeMessage: null,
    });
  }

  override onMount(): void {
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pointermove", this.handleGlobalPointerMove);
    window.addEventListener("pointerup", this.handleGlobalPointerUp);
    window.addEventListener("mousemove", this.handleGlobalPointerMove);
    window.addEventListener("mouseup", this.handleGlobalPointerUp);
    window.addEventListener("keydown", this.handleGlobalKeyDown);
    window.addEventListener("keyup", this.handleGlobalKeyUp);
    void this.hydrateState();
  }

  override onUnmount(): void {
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointermove", this.handleGlobalPointerMove);
    window.removeEventListener("pointerup", this.handleGlobalPointerUp);
    window.removeEventListener("mousemove", this.handleGlobalPointerMove);
    window.removeEventListener("mouseup", this.handleGlobalPointerUp);
    window.removeEventListener("keydown", this.handleGlobalKeyDown);
    window.removeEventListener("keyup", this.handleGlobalKeyUp);
    this.cancelLiveExecutionStream();
    this.stopExecutionRefreshPolling();
  }

  override render(): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#11161d] text-white",
        "data-testid": WorkflowScreenSelector.Root,
        style: "min-height: calc(100vh - 64px);",
      },
      [
        createElement(PageNoticeStack, {
          errorMessage: this.state.errorMessage,
          noticeMessage: this.state.noticeMessage,
        }),
        this.renderToolbar(),
        this.renderSurface(),
        this.state.editorModalOpen ? this.renderSelectionEditorModal() : "",
        this.state.deepEditor ? this.renderDeepEditorModal() : "",
        this.state.regexTester ? this.renderRegexTesterModal() : "",
        this.state.executionNodeModal ? this.renderExecutionNodeModal() : "",
        this.state.outputEditor ? this.renderOutputEditorModal() : "",
      ],
    );
  }

  private renderToolbar(): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const executionCount = currentWorkflow
      ? this.state.executions.filter(
          (execution) => execution.workflowId === currentWorkflow.id,
        ).length
      : 0;
    const hasUnsavedChanges =
      this.state.dirtyWorkflow || this.state.dirtyAssetIds.length > 0;
    const hasActiveExecution = currentWorkflow
      ? this.readWorkflowHasActiveExecution(currentWorkflow.id)
      : false;
    const runControl = readWorkflowRunControlState({
      hasCurrentWorkflow: currentWorkflow !== null,
      hasPendingAction: this.state.pendingAction !== null,
      hasUnsavedChanges,
      hasActiveExecution,
      canStopActiveExecution: currentWorkflow
        ? this.readWorkflowActiveExecutionId(currentWorkflow.id) !== null
        : false,
    });

    return createElement(
      "div",
      {
        className:
          "flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border-dark bg-[#141a21]/95 px-3 py-3 backdrop-blur xl:flex-nowrap xl:px-4",
      },
      [
        createElement(
          "div",
          { className: "flex min-w-0 flex-1 flex-wrap items-center gap-3" },
          [
            createElement("div", { className: "flex min-w-0 flex-col" }, [
              createElement(
                "span",
                { className: "truncate text-sm font-semibold text-white" },
                [currentWorkflow?.name ?? "Workflows"],
              ),
              createElement(
                "span",
                { className: "truncate text-xs text-text-secondary" },
                [
                  this.state.currentProject
                    ? `${this.state.currentProject.name} · ${this.state.currentProject.rootPath ?? "workflow-only project"}`
                    : "Select a project from the global sidebar to load the workflow editor.",
                ],
              ),
            ]),
            currentWorkflow
              ? createElement(
                  StatusBadge,
                  {
                    status: hasUnsavedChanges ? "warning" : "success",
                  },
                  [hasUnsavedChanges ? "unsaved" : "saved"],
                )
              : "",
            currentWorkflow
              ? createElement(
                  StatusBadge,
                  {
                    status: "info",
                  },
                  [`${executionCount} run${executionCount === 1 ? "" : "s"}`],
                )
              : "",
            currentWorkflow
              ? createElement(
                  "span",
                  {
                    className:
                      "rounded-full border border-border-dark bg-[#0d1319] px-2.5 py-1 text-xs text-slate-300",
                  },
                  [
                    `${currentWorkflow.nodes.length} nodes · ${currentWorkflow.edges.length} links`,
                  ],
                )
              : "",
          ],
        ),
        createElement(
          "div",
          { className: "flex flex-wrap items-center gap-2 xl:flex-nowrap" },
          [
            createElement(Button, {
              variant: "secondary",
              size: "sm",
              disabled:
                currentWorkflow === null || this.state.pendingAction !== null,
              onClick: () =>
                currentWorkflow
                  ? this.openSelectionEditorModal({
                      type: "workflow",
                      id: currentWorkflow.id,
                    })
                  : undefined,
              children: "Edit workflow",
            }),
            createElement(Button, {
              variant: "secondary",
              size: "sm",
              disabled:
                this.state.currentProject === null ||
                this.state.pendingAction !== null,
              onClick: () => {
                void this.handleCreateWorkflow();
              },
              children:
                this.state.pendingAction === PendingAction.CreateWorkflow
                  ? "Creating"
                  : "New workflow",
              dataset: {
                testid: WorkflowScreenSelector.WorkflowCreate,
              },
            }),
            createElement(Button, {
              variant: "primary",
              size: "sm",
              disabled:
                this.state.draftWorkflow === null ||
                this.state.pendingAction !== null ||
                !hasUnsavedChanges,
              onClick: () => {
                void this.handleSaveWorkflow();
              },
              children:
                this.state.pendingAction === PendingAction.SaveWorkflow
                  ? "Saving"
                  : "Save",
              dataset: {
                testid: WorkflowScreenSelector.WorkflowSave,
              },
            }),
            createElement(Button, {
              variant: runControl.variant,
              size: "sm",
              disabled: runControl.disabled,
              onClick: () => {
                if (runControl.mode === "stop") {
                  void this.handleStopWorkflowExecution();
                  return;
                }

                void this.handleRunWorkflow();
              },
              icon: runControl.icon,
              children: runControl.label,
              title: runControl.title,
              dataset: {
                testid: WorkflowScreenSelector.WorkflowRun,
              },
            }),
            createElement(Button, {
              variant: "danger",
              size: "sm",
              disabled:
                currentWorkflow === null || this.state.pendingAction !== null,
              onClick: () => {
                void this.handleDeleteWorkflow();
              },
              children:
                this.state.pendingAction === PendingAction.DeleteWorkflow
                  ? "Deleting"
                  : "Delete",
              dataset: {
                testid: WorkflowScreenSelector.WorkflowDelete,
              },
            }),
          ],
        ),
      ],
    );
  }

  private renderSurface(): HTMLElement {
    if (this.state.currentProject === null) {
      return createElement(
        "div",
        {
          className: "flex flex-1 items-center justify-center p-6",
        },
        [
          createElement(EmptyStatePanel, {
            icon: "account_tree",
            title: "No active project",
            description:
              "Open or create a project from the Projects screen. Workflow-only projects are supported, but the editor stays server-first and needs an active project ID.",
          }),
        ],
      );
    }

    return createElement(
      "div",
      {
        className: "flex min-h-0 flex-1",
      },
      [
        this.renderActivityRail(),
        this.shouldShowSidebar() ? this.renderSidebarPanel() : "",
        this.shouldShowCanvas() ? this.renderCanvasPanel() : "",
      ],
    );
  }

  private renderActivityRail(): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();

    return createElement(
      "aside",
      {
        className:
          "flex w-[60px] shrink-0 flex-col items-center border-r border-border-dark bg-[#11161c] px-2 py-3",
        "data-testid": WorkflowScreenSelector.SidebarRail,
      },
      [
        createElement(
          "div",
          {
            className:
              "mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border-dark bg-[#171d25] text-sm font-semibold text-white",
            title: currentWorkflow?.name ?? "Workflow editor",
          },
          [currentWorkflow?.name.slice(0, 2).toUpperCase() ?? "WF"],
        ),
        createElement(
          "div",
          {
            className:
              "flex w-full flex-col gap-1 rounded-lg border border-border-dark bg-[#151b22] p-1",
          },
          [
            this.renderRailButton(
              "list",
              "Definitions",
              this.state.activeSidebarSection === SidebarSection.Workflows,
              () => this.showSidebarSection(SidebarSection.Workflows),
              WorkflowScreenSelector.SectionWorkflows,
            ),
            this.renderRailButton(
              "deployed_code",
              "Nodes",
              this.state.activeSidebarSection === SidebarSection.Nodes,
              () => this.showSidebarSection(SidebarSection.Nodes),
              WorkflowScreenSelector.SectionNodes,
            ),
            this.renderRailButton(
              "library_books",
              "Assets",
              this.state.activeSidebarSection === SidebarSection.Assets,
              () => this.showSidebarSection(SidebarSection.Assets),
              WorkflowScreenSelector.SectionAssets,
            ),
            this.renderRailButton(
              "history",
              "History",
              this.state.activeSidebarSection === SidebarSection.History,
              () => this.showSidebarSection(SidebarSection.History),
              WorkflowScreenSelector.SectionHistory,
            ),
          ],
        ),
        !this.state.isCompactViewport
          ? createElement(
              "div",
              {
                className:
                  "mt-auto flex w-full flex-col gap-1 rounded-lg border border-border-dark bg-[#151b22] p-1",
              },
              [
                this.renderRailButton(
                  this.state.desktopSidebarCollapsed
                    ? "left_panel_open"
                    : "left_panel_close",
                  this.state.desktopSidebarCollapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar",
                  false,
                  () =>
                    this.setState({
                      desktopSidebarCollapsed:
                        !this.state.desktopSidebarCollapsed,
                    }),
                ),
              ],
            )
          : "",
        this.state.isCompactViewport
          ? createElement(
              "div",
              {
                className:
                  "mt-2 flex w-full flex-col gap-1 rounded-lg border border-border-dark bg-[#151b22] p-1",
              },
              [
                this.renderRailButton(
                  "left_panel_open",
                  "Sidebar",
                  this.state.compactView === CompactView.Sidebar,
                  () => this.setState({ compactView: CompactView.Sidebar }),
                  WorkflowScreenSelector.CompactSidebar,
                ),
                this.renderRailButton(
                  "grid_view",
                  "Canvas",
                  this.state.compactView === CompactView.Canvas,
                  () => this.setState({ compactView: CompactView.Canvas }),
                  WorkflowScreenSelector.CompactCanvas,
                ),
              ],
            )
          : "",
      ],
    );
  }

  private renderRailButton(
    icon: string,
    title: string,
    active: boolean,
    onClick: () => void,
    testId?: string,
  ): HTMLElement {
    return createElement(
      "button",
      {
        type: "button",
        title,
        ...(testId ? { "data-testid": testId } : {}),
        className: `flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border leading-none transition-colors ${active ? "border-slate-600 bg-[#202833] text-white" : "border-transparent text-text-secondary hover:border-border-dark hover:bg-[#1b222b] hover:text-white"}`,
        onClick,
      },
      [
        createElement(
          "span",
          {
            className:
              "material-symbols-outlined block max-h-5 max-w-5 overflow-hidden text-[19px] leading-none",
          },
          [icon],
        ),
      ],
    );
  }

  private showSidebarSection(section: SidebarSection): void {
    this.setState({
      activeSidebarSection: section,
      compactView: CompactView.Sidebar,
      desktopSidebarCollapsed: false,
    });
  }

  private renderSidebarPanel(): HTMLElement {
    return createElement(
      "aside",
      {
        className: this.state.isCompactViewport
          ? "flex min-h-0 flex-1 flex-col border-r border-border-dark bg-[#171d25]"
          : "flex min-h-0 w-[292px] shrink-0 flex-col border-r border-border-dark bg-[#171d25] xl:w-[304px]",
        "data-testid": WorkflowScreenSelector.SidebarPanel,
      },
      [this.renderSidebarHeader(), this.renderSidebarSection()],
    );
  }

  private renderSidebarHeader(): HTMLElement {
    const sectionTitle = this.readSidebarSectionTitle(
      this.state.activeSidebarSection,
    );
    const sectionCount = this.readSidebarSectionCount(
      this.state.activeSidebarSection,
    );

    return createElement(
      "div",
      {
        className:
          "flex items-center justify-between border-b border-border-dark px-3 py-3",
      },
      [
        createElement("div", { className: "min-w-0 flex-1" }, [
          createElement(
            "p",
            { className: "truncate text-sm font-semibold text-white" },
            [sectionTitle],
          ),
          createElement(
            "p",
            { className: "mt-1 truncate text-xs text-text-secondary" },
            [
              this.state.currentProject?.name
                ? `${this.state.currentProject.name} · ${sectionCount}`
                : "No project loaded",
            ],
          ),
        ]),
        !this.state.isCompactViewport
          ? createElement(IconButton, {
              icon: "left_panel_close",
              tooltip: "Collapse sidebar",
              onClick: () => this.setState({ desktopSidebarCollapsed: true }),
              className:
                "h-8 w-8 rounded-md border border-transparent hover:border-border-dark hover:bg-[#20262f]",
            })
          : "",
      ],
    );
  }

  private readSidebarSectionTitle(section: SidebarSection): string {
    if (section === SidebarSection.Workflows) {
      return "Definitions";
    }

    if (section === SidebarSection.Nodes) {
      return "Nodes";
    }

    if (section === SidebarSection.Assets) {
      return "Assets";
    }

    return "History";
  }

  private readSidebarSectionCount(section: SidebarSection): string {
    if (section === SidebarSection.Workflows) {
      return `${this.state.workflows.length.toString()} workflows`;
    }

    if (section === SidebarSection.Nodes) {
      return `${this.state.draftWorkflow?.nodes.length.toString() ?? "0"} nodes`;
    }

    if (section === SidebarSection.Assets) {
      return `${this.state.assets.length.toString()} assets`;
    }

    const currentWorkflow = this.readCurrentWorkflowRecord();
    const executionCount = currentWorkflow
      ? readWorkflowExecutions(this.state.executions, currentWorkflow.id).length
      : 0;
    return `${executionCount.toString()} runs`;
  }

  private renderSidebarSection(): HTMLElement {
    if (this.state.activeSidebarSection === SidebarSection.Nodes) {
      return this.renderNodePaletteSection();
    }

    if (this.state.activeSidebarSection === SidebarSection.Assets) {
      return this.renderAssetLibrarySection();
    }

    if (this.state.activeSidebarSection === SidebarSection.History) {
      return createElement(
        "div",
        { className: "flex min-h-0 flex-1 flex-col" },
        [this.renderExecutionSection()],
      );
    }

    return this.renderWorkflowListSection();
  }

  private renderWorkflowListSection(): HTMLElement {
    return createElement(
      "div",
      {
        className: "flex min-h-0 flex-1 flex-col",
      },
      [
        createElement(
          "div",
          { className: "border-b border-border-dark px-3 py-3" },
          [
            createElement("label", { className: "flex flex-col gap-2" }, [
              createElement(
                "span",
                {
                  className:
                    "text-[11px] font-medium tracking-[0.14em] text-text-secondary",
                },
                ["Active workflow"],
              ),
              createElement(
                "select",
                {
                  className:
                    "h-10 rounded-md border border-border-dark bg-[#0f151c] px-3 text-sm text-white focus:border-primary focus:outline-none",
                  value: this.readCurrentWorkflowRecord()?.id ?? "",
                  "data-testid": WorkflowScreenSelector.WorkflowSelect,
                  onChange: (event: Event) => {
                    const target = event.target;
                    if (target instanceof HTMLSelectElement) {
                      this.handleSelectWorkflow(target.value);
                    }
                  },
                },
                [
                  this.state.workflows.length === 0
                    ? createElement("option", { value: "" }, [
                        "No workflows yet",
                      ])
                    : this.state.workflows.map((workflow) =>
                        createElement(
                          "option",
                          {
                            key: workflow.id,
                            value: workflow.id,
                          },
                          [workflow.name],
                        ),
                      ),
                ],
              ),
            ]),
          ],
        ),
        this.state.workflows.length === 0
          ? createElement(
              "div",
              { className: "flex flex-1 items-center justify-center p-4" },
              [
                createElement(EmptyStatePanel, {
                  icon: "account_tree",
                  title: "No workflow definitions",
                  description:
                    "Create the first workflow from the toolbar. Definitions persist in the server workspace and reload across browser contexts.",
                }),
              ],
            )
          : createElement(
              "div",
              { className: "min-h-0 flex-1 overflow-y-auto p-3" },
              [
                this.state.workflows
                  .slice()
                  .sort((left, right) =>
                    right.updatedAt.localeCompare(left.updatedAt),
                  )
                  .map((workflow) =>
                    createElement(
                      "button",
                      {
                        type: "button",
                        key: workflow.id,
                        className: `mb-2 flex w-full flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors ${workflow.id === this.readCurrentWorkflowRecord()?.id ? "border-primary/50 bg-primary/10 shadow-[0_10px_24px_rgba(37,99,235,0.16)]" : "border-border-dark bg-[#10161d] hover:border-slate-600 hover:bg-[#1a222c]"}`,
                        onClick: () => this.handleSelectWorkflow(workflow.id),
                      },
                      [
                        createElement(
                          "div",
                          {
                            className:
                              "flex items-center justify-between gap-3",
                          },
                          [
                            createElement(
                              "span",
                              {
                                className:
                                  "truncate text-sm font-medium text-white",
                              },
                              [workflow.name],
                            ),
                            createElement(
                              StatusBadge,
                              {
                                status:
                                  workflow.status ===
                                  WorkflowRecordStatus.Published
                                    ? "success"
                                    : workflow.status ===
                                        WorkflowRecordStatus.Archived
                                      ? "paused"
                                      : "info",
                              },
                              [workflow.status],
                            ),
                          ],
                        ),
                        createElement(
                          "span",
                          { className: "truncate text-xs text-text-secondary" },
                          [workflow.description || "No description yet"],
                        ),
                        createElement(
                          "span",
                          { className: "text-[11px] text-text-secondary" },
                          [
                            `${workflow.nodes.length} nodes · ${workflow.edges.length} connections · v${workflow.version}`,
                          ],
                        ),
                      ],
                    ),
                  ),
              ],
            ),
      ],
    );
  }

  private renderNodePaletteSection(): HTMLElement {
    return createElement(
      "div",
      {
        className: "min-h-0 flex-1 overflow-y-auto p-3",
      },
      [
        createElement(
          "div",
          {
            className:
              "mb-3 rounded-xl border border-border-dark bg-[#10161d] px-3 py-3 text-sm leading-6 text-text-secondary",
          },
          [
            "Add the MVP node set to the canvas. Asset-backed nodes create project-scoped assets server-side before they are placed.",
          ],
        ),
        readNodeKindsForPalette().map((kind) =>
          createElement(
            "button",
            {
              type: "button",
              key: kind,
              className:
                "mb-2 flex w-full cursor-grab items-center gap-3 rounded-xl border border-border-dark bg-[#10161d] px-3 py-3 text-left transition-colors active:cursor-grabbing hover:border-slate-600 hover:bg-[#1a222c]",
              disabled:
                this.state.currentProject === null ||
                this.state.pendingAction !== null,
              draggable:
                this.state.currentProject !== null &&
                this.state.pendingAction === null,
              onClick: () => {
                void this.handleAddNode(kind);
              },
              onDragStart: (event: Event) =>
                this.handleNodePaletteDragStart(event as DragEvent, kind),
              dataset: {
                testid: `${WorkflowScreenSelector.NodePalettePrefix}${kind}`,
              },
            },
            [
              createElement(
                "span",
                {
                  className: "material-symbols-outlined text-[20px] text-white",
                },
                [readNodeIcon(kind)],
              ),
              createElement(
                "div",
                { className: "flex min-w-0 flex-1 flex-col" },
                [
                  createElement(
                    "span",
                    { className: "truncate text-sm font-medium text-white" },
                    [readNodeKindLabel(kind)],
                  ),
                  createElement(
                    "span",
                    { className: "text-xs text-text-secondary" },
                    [readNodePaletteDescription(kind)],
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  private renderAssetLibrarySection(): HTMLElement {
    return createElement(
      "div",
      {
        className: "flex min-h-0 flex-1 flex-col",
      },
      [
        createElement(
          "div",
          { className: "border-b border-border-dark px-3 py-3" },
          [
            createElement("div", { className: "grid gap-2 sm:grid-cols-3" }, [
              this.renderCreateAssetButton(WorkflowAssetKind.Prompt),
              this.renderCreateAssetButton(WorkflowAssetKind.Instruction),
              this.renderCreateAssetButton(WorkflowAssetKind.Guardrail),
            ]),
          ],
        ),
        createElement(
          "div",
          { className: "min-h-0 flex-1 overflow-y-auto p-3" },
          [
            this.state.assets.length === 0
              ? createElement(EmptyStatePanel, {
                  icon: "library_add",
                  title: "No reusable assets",
                  description:
                    "Create project-scoped prompt, instruction or guardrail assets here before reusing them across workflow definitions.",
                })
              : groupAssetsByKind(this.state.assets).map((group) =>
                  createElement(
                    "section",
                    {
                      key: group.kind,
                      className: "mb-4 flex flex-col gap-2",
                    },
                    [
                      createElement(
                        "div",
                        { className: "flex items-center justify-between" },
                        [
                          createElement(
                            "h3",
                            {
                              className:
                                "text-xs font-semibold uppercase tracking-wide text-text-secondary",
                            },
                            [readAssetKindLabel(group.kind)],
                          ),
                          createElement(
                            "span",
                            { className: "text-[11px] text-text-secondary" },
                            [
                              `${group.assets.length} asset${group.assets.length === 1 ? "" : "s"}`,
                            ],
                          ),
                        ],
                      ),
                      group.assets.map((asset) =>
                        createElement(
                          "button",
                          {
                            type: "button",
                            key: asset.id,
                            className: `flex w-full flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors ${this.state.selection.type === "asset" && this.state.selection.id === asset.id ? "border-primary/50 bg-primary/10 shadow-[0_10px_24px_rgba(37,99,235,0.16)]" : "border-border-dark bg-[#10161d] hover:border-slate-600 hover:bg-[#1a222c]"}`,
                            onClick: () =>
                              this.openSelectionEditorModal({
                                type: "asset",
                                id: asset.id,
                              }),
                            dataset: {
                              testid: `${WorkflowScreenSelector.AssetCardPrefix}${asset.id}`,
                            },
                          },
                          [
                            createElement(
                              "div",
                              {
                                className:
                                  "flex items-center justify-between gap-3",
                              },
                              [
                                createElement(
                                  "span",
                                  {
                                    className:
                                      "truncate text-sm font-medium text-white",
                                  },
                                  [asset.name],
                                ),
                                createElement(
                                  StatusBadge,
                                  {
                                    status:
                                      asset.scope ===
                                      WorkflowAssetScope.Workspace
                                        ? "info"
                                        : "warning",
                                  },
                                  [readAssetScopeLabel(asset.scope)],
                                ),
                              ],
                            ),
                            createElement(
                              "span",
                              {
                                className:
                                  "truncate text-xs text-text-secondary",
                              },
                              [asset.description || asset.slug],
                            ),
                            createElement(
                              "span",
                              { className: "text-[11px] text-text-secondary" },
                              [
                                `${readUsageCount(asset.id, this.state.assetUsages)} use${readUsageCount(asset.id, this.state.assetUsages) === 1 ? "" : "s"}`,
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
          ],
        ),
      ],
    );
  }

  private renderExecutionSection(): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const executions = currentWorkflow
      ? readWorkflowExecutions(this.state.executions, currentWorkflow.id)
      : [];
    const filteredExecutions = readFilteredExecutions(
      executions,
      this.state.executionHistoryFilter,
    );
    const liveExecution =
      this.state.liveExecution?.workflowId === currentWorkflow?.id
        ? this.state.liveExecution
        : null;

    return createElement(
      "div",
      {
        className: "flex min-h-0 flex-1 flex-col bg-[#232323]",
      },
      [
        createElement(
          "div",
          {
            className: "shrink-0 border-b border-[#343434] px-4 pb-3 pt-5",
          },
          [
            createElement(
              "div",
              { className: "flex items-center justify-between gap-3" },
              [
                createElement(
                  "h2",
                  { className: "text-base font-medium text-white" },
                  ["Executions"],
                ),
                createElement(IconButton, {
                  icon: "filter_list",
                  tooltip: "Filter executions",
                  onClick: () =>
                    this.handleSelectExecutionFilter(
                      this.state.executionHistoryFilter ===
                        ExecutionHistoryFilter.All
                        ? ExecutionHistoryFilter.Failed
                        : ExecutionHistoryFilter.All,
                    ),
                  className:
                    "h-8 w-8 rounded border border-[#454545] bg-[#2b2b2b] text-slate-200 hover:bg-[#333]",
                }),
              ],
            ),
            createElement(
              "label",
              {
                className:
                  "mt-5 flex items-center gap-2 text-sm text-slate-100",
              },
              [
                createElement("input", {
                  type: "checkbox",
                  checked: this.state.executionAutoRefreshEnabled,
                  onChange: (event: Event) =>
                    this.handleExecutionAutoRefreshChange(event),
                  className:
                    "h-4 w-4 rounded border-[#ff6d00] bg-[#ff6d00] accent-[#ff6d00]",
                }),
                "Auto refresh",
              ],
            ),
            createElement(
              "div",
              { className: "mt-3 flex items-center gap-1.5" },
              [
                this.renderExecutionFilterButton(
                  ExecutionHistoryFilter.All,
                  "All",
                  WorkflowScreenSelector.ExecutionFilterAll,
                ),
                this.renderExecutionFilterButton(
                  ExecutionHistoryFilter.Failed,
                  "Failed",
                  WorkflowScreenSelector.ExecutionFilterFailed,
                ),
                this.renderExecutionFilterButton(
                  ExecutionHistoryFilter.Attention,
                  "Issues",
                  WorkflowScreenSelector.ExecutionFilterAttention,
                ),
              ],
            ),
            this.renderWorkflowEditHistoryCard(),
          ],
        ),
        currentWorkflow === null
          ? createElement(
              "div",
              {
                className:
                  "flex min-h-0 flex-1 items-center justify-center p-4",
              },
              [
                createElement(EmptyStatePanel, {
                  icon: "history",
                  title: "Select a workflow",
                  description: "Pick a workflow first to inspect executions.",
                }),
              ],
            )
          : executions.length === 0 && liveExecution === null
            ? createElement(
                "div",
                {
                  className:
                    "flex min-h-0 flex-1 items-center justify-center p-4",
                },
                [
                  createElement(EmptyStatePanel, {
                    icon: "history_toggle_off",
                    title: "No executions",
                    description: "Run this workflow once to inspect history.",
                  }),
                ],
              )
            : createElement(
                "div",
                { className: "min-h-0 flex-1 overflow-y-auto px-4 pb-4" },
                [
                  filteredExecutions.length === 0
                    ? liveExecution
                      ? this.renderLiveExecutionHistoryRow(liveExecution)
                      : createElement(
                          "div",
                          {
                            className:
                              "mt-4 rounded border border-dashed border-[#454545] px-3 py-4 text-sm text-slate-300",
                          },
                          [
                            readExecutionFilterEmptyDescription(
                              this.state.executionHistoryFilter,
                            ),
                          ],
                        )
                    : [
                        ...(liveExecution
                          ? [this.renderLiveExecutionHistoryRow(liveExecution)]
                          : []),
                        ...filteredExecutions.map((execution) =>
                          this.renderExecutionHistoryRow(execution),
                        ),
                      ],
                ],
              ),
      ],
    );
  }

  private renderExecutionHistoryRow(
    execution: WorkflowExecutionRecord,
  ): HTMLElement {
    const selected =
      this.state.selection.type === "execution" &&
      this.state.selection.id === execution.id;
    const accentClassName = readExecutionHistoryAccentClassName(execution);

    return createElement(
      "button",
      {
        type: "button",
        key: execution.id,
        className: `relative flex w-full flex-col gap-1 border-l-4 px-3 py-3 text-left transition-colors ${selected ? "bg-[#333333]" : "bg-[#282828] hover:bg-[#303030]"}`,
        onClick: () => {
          void this.handleSelectExecution(execution.id);
        },
        "data-testid": `${WorkflowScreenSelector.ExecutionCardPrefix}${execution.id}`,
      },
      [
        createElement("span", {
          className: `absolute bottom-0 left-0 top-0 w-1 ${accentClassName}`,
        }),
        createElement(
          "span",
          { className: "pl-2 text-sm font-medium text-white" },
          [formatExecutionHistoryTitle(execution.startedAt)],
        ),
        createElement("span", { className: "pl-2 text-xs text-slate-300" }, [
          `${formatSelectOptionLabel(execution.status)} in ${formatDuration(execution.durationMs)}`,
        ]),
      ],
    );
  }

  private renderWorkflowEditHistoryCard(): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "mt-4 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-center justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "text-sm font-medium text-white" },
                ["Edit history"],
              ),
              createElement(
                "p",
                { className: "mt-1 text-xs text-text-secondary" },
                ["Session changes before save, available for quick restore."],
              ),
            ]),
            createElement(StatusBadge, { status: "info" }, [
              this.state.workflowEditHistory.length.toString(),
            ]),
          ],
        ),
        this.state.workflowEditHistory.length === 0
          ? createElement(
              "p",
              { className: "mt-3 text-xs text-text-secondary" },
              ["No edits captured yet."],
            )
          : createElement(
              "div",
              {
                className: "mt-3 flex max-h-52 flex-col gap-2 overflow-y-auto",
              },
              this.state.workflowEditHistory.map((entry) =>
                createElement(
                  "button",
                  {
                    key: entry.id,
                    type: "button",
                    className:
                      "rounded-md border border-border-dark bg-[#0f141a] px-3 py-2 text-left text-xs transition-colors hover:border-violet-500/50 hover:bg-violet-500/10",
                    onClick: () => this.restoreWorkflowEditHistoryEntry(entry),
                  },
                  [
                    createElement(
                      "span",
                      { className: "block truncate text-white" },
                      [entry.label],
                    ),
                    createElement(
                      "span",
                      { className: "mt-1 block text-text-secondary" },
                      [formatTimestamp(entry.changedAt)],
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  private restoreWorkflowEditHistoryEntry(
    entry: WorkflowEditHistoryEntry<WorkflowDefinitionUpsertInput>,
  ): void {
    this.setState({
      draftWorkflow: entry.workflow,
      dirtyWorkflow: true,
      selection: { type: "workflow", id: entry.workflow.id ?? null },
      noticeMessage: "Workflow restored from edit history. Save to persist it.",
      errorMessage: null,
    });
  }

  private readActiveLogsRunId(): string | undefined {
    if (this.state.liveExecution?.workflowRunId) {
      return this.state.liveExecution.workflowRunId;
    }

    if (this.state.selection.type === "execution") {
      return this.state.selection.id;
    }

    return undefined;
  }

  private readScopedLogs(
    scope: WorkflowInspectorLogsScope,
  ): ReadonlyArray<ServerLogEntry> {
    const levelFiltered = this.state.serverLogs.filter((entry) =>
      this.state.workflowLogsFilter === WorkflowLogsFilter.All
        ? true
        : entry.level === ServerLogLevel.Warn ||
          entry.level === ServerLogLevel.Error ||
          entry.level === ServerLogLevel.Fatal,
    );

    if (!scope.runId) {
      return levelFiltered;
    }

    return levelFiltered.filter((entry) => entry.runId === scope.runId);
  }

  private renderScopedInspectorLogs(
    scope: WorkflowInspectorLogsScope,
  ): HTMLElement {
    const logs = this.readScopedLogs(scope).slice(-8);

    return createElement(
      "section",
      {
        className:
          "rounded-xl border border-border-dark bg-[#10161d] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex flex-wrap items-center justify-between gap-2" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "text-sm font-medium text-white" },
                [scope.title],
              ),
              createElement(
                "p",
                { className: "text-[11px] leading-5 text-text-secondary" },
                [
                  scope.runId
                    ? `Run scoped · ${scope.runId}`
                    : "Latest relevant server logs",
                ],
              ),
            ]),
            createElement(Button, {
              variant: "ghost",
              size: "sm",
              onClick: () => {
                void this.refreshServerLogs();
              },
              children: this.state.refreshingLogs ? "Refreshing" : "Refresh",
            }),
          ],
        ),
        logs.length === 0
          ? createElement(
              "div",
              {
                className:
                  "mt-3 rounded-lg border border-dashed border-border-dark bg-[#0d1319] px-3 py-3 text-xs leading-6 text-text-secondary",
              },
              [
                this.state.refreshingLogs
                  ? "Refreshing logs..."
                  : scope.emptyMessage,
              ],
            )
          : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              logs.map((entry) =>
                createElement(
                  "article",
                  {
                    key: entry.id,
                    className:
                      "rounded-lg border border-border-dark bg-[#0d1319] px-3 py-2.5",
                  },
                  [
                    createElement(
                      "div",
                      { className: "flex flex-wrap items-center gap-2" },
                      [
                        createElement(
                          StatusBadge,
                          {
                            status: readServerLogBadgeStatus(entry.level),
                          },
                          [entry.level],
                        ),
                        createElement(
                          "span",
                          { className: "text-[11px] text-text-secondary" },
                          [formatTimestamp(entry.timestamp)],
                        ),
                      ],
                    ),
                    createElement(
                      "pre",
                      {
                        className:
                          "mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-200",
                      },
                      [entry.message],
                    ),
                  ],
                ),
              ),
            ]),
      ],
    );
  }

  private renderExecutionFilterButton(
    filter: ExecutionHistoryFilter,
    label: string,
    testId: string,
  ): HTMLElement {
    const isActive = this.state.executionHistoryFilter === filter;

    return createElement(
      "button",
      {
        type: "button",
        className: `rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
          isActive
            ? "border-[#555] bg-[#333] text-white"
            : "border-[#3a3a3a] bg-[#292929] text-slate-300 hover:bg-[#333] hover:text-white"
        }`,
        onClick: () => {
          this.handleSelectExecutionFilter(filter);
        },
        "data-testid": testId,
      },
      [label],
    );
  }

  private renderCreateAssetButton(kind: WorkflowAssetKindValue): HTMLElement {
    return createElement(Button, {
      variant: "secondary",
      size: "sm",
      disabled:
        this.state.currentProject === null || this.state.pendingAction !== null,
      onClick: () => {
        void this.handleCreateAsset(kind);
      },
      children: `Add ${readAssetKindLabel(kind)}`,
      dataset: {
        testid: `${WorkflowScreenSelector.AssetCreatePrefix}${kind}`,
      },
    });
  }

  private renderCanvasPanel(): HTMLElement {
    const workflow = this.state.draftWorkflow;
    const viewport = workflow?.viewport ?? { x: 0, y: 0, zoom: 1 };
    const previewPath = workflow
      ? this.readConnectionPreviewPath(workflow)
      : null;

    return createElement(
      "section",
      {
        className:
          "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#11161d]",
      },
      [
        this.renderCanvasHeader(),
        workflow
          ? createElement(
              "div",
              {
                className: "relative min-h-0 flex-1 overflow-hidden",
                onPointerDown: (event: Event) =>
                  this.handleCanvasPointerDown(event as PointerEvent),
                onPointerMove: (event: Event) =>
                  this.handleCanvasPointerMove(event as PointerEvent),
                onMouseMove: (event: Event) =>
                  this.handleCanvasMouseMove(event as MouseEvent),
                onWheel: (event: Event) =>
                  this.handleCanvasWheel(event as WheelEvent),
                onDragOver: (event: Event) =>
                  this.handleCanvasDragOver(event as DragEvent),
                onDrop: (event: Event) =>
                  void this.handleCanvasDrop(event as DragEvent),
                "data-testid": WorkflowScreenSelector.CanvasViewport,
                style: readCanvasBackgroundStyle(
                  viewport,
                  this.state.selection.type === "execution",
                ),
              },
              [
                createElement(
                  "div",
                  {
                    className: "absolute inset-0",
                  },
                  [
                    createElement(
                      "svg",
                      {
                        className: "absolute left-0 top-0 overflow-visible",
                        width: "3200",
                        height: "2200",
                        viewBox: "0 0 3200 2200",
                        preserveAspectRatio: "xMinYMin meet",
                        style: `transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom}); transform-origin: 0 0;`,
                      },
                      [
                        createElement("defs", {}, [
                          createElement(
                            "marker",
                            {
                              id: "workflows-edge-arrow",
                              markerWidth: "8",
                              markerHeight: "8",
                              refX: "7",
                              refY: "4",
                              orient: "auto",
                              markerUnits: "userSpaceOnUse",
                            },
                            [
                              createElement("path", {
                                d: "M 0 0 L 8 4 L 0 8 z",
                                fill: "#6f7f92",
                              }),
                            ],
                          ),
                          createElement(
                            "marker",
                            {
                              id: "workflows-preview-arrow",
                              markerWidth: "9",
                              markerHeight: "9",
                              refX: "8",
                              refY: "4.5",
                              orient: "auto",
                              markerUnits: "userSpaceOnUse",
                            },
                            [
                              createElement("path", {
                                d: "M 0 0 L 9 4.5 L 0 9 z",
                                fill: "#f59e0b",
                              }),
                            ],
                          ),
                          createElement(
                            "marker",
                            {
                              id: "workflows-preview-arrow-active",
                              markerWidth: "9",
                              markerHeight: "9",
                              refX: "8",
                              refY: "4.5",
                              orient: "auto",
                              markerUnits: "userSpaceOnUse",
                            },
                            [
                              createElement("path", {
                                d: "M 0 0 L 9 4.5 L 0 9 z",
                                fill: "#60a5fa",
                              }),
                            ],
                          ),
                        ]),
                        createElement("g", {}, [
                          workflow.edges.map((edge) =>
                            this.renderEdgePath(edge, workflow.nodes),
                          ),
                          previewPath
                            ? createElement(
                                "g",
                                {
                                  "data-testid":
                                    WorkflowScreenSelector.ConnectionPreview,
                                },
                                [
                                  createElement("path", {
                                    d: previewPath.path,
                                    stroke: previewPath.stroke,
                                    "stroke-width": "4",
                                    "stroke-linecap": "round",
                                    "stroke-dasharray": "10 8",
                                    "marker-end": hoveredPortUsesActiveArrow(
                                      this.state.hoveredPort,
                                    )
                                      ? "url(#workflows-preview-arrow-active)"
                                      : "url(#workflows-preview-arrow)",
                                    fill: "none",
                                  }),
                                  createElement("circle", {
                                    cx: String(previewPath.target.x),
                                    cy: String(previewPath.target.y),
                                    r: "8",
                                    fill: previewPath.stroke,
                                    opacity: "0.28",
                                  }),
                                  createElement("circle", {
                                    cx: String(previewPath.target.x),
                                    cy: String(previewPath.target.y),
                                    r: "3.5",
                                    fill: previewPath.stroke,
                                  }),
                                ],
                              )
                            : "",
                        ]),
                      ],
                    ),
                    createElement(
                      "div",
                      {
                        className: "pointer-events-none absolute inset-0",
                        style: `transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom}); transform-origin: 0 0;`,
                      },
                      [
                        workflow.nodes.map((node) =>
                          this.renderCanvasNode(node),
                        ),
                        workflow.edges.map((edge) =>
                          this.renderEdgeDeleteControl(edge, workflow.nodes),
                        ),
                      ],
                    ),
                  ],
                ),
                this.renderSelectedExecutionCanvasHeader(),
                this.renderCanvasFooter(),
              ],
            )
          : createElement(
              "div",
              {
                className: "flex flex-1 items-center justify-center p-6",
              },
              [
                createElement(EmptyStatePanel, {
                  icon: "account_tree",
                  title: "No workflow loaded",
                  description:
                    "Create a workflow or select one from the definitions panel to start editing the canvas.",
                }),
              ],
            ),
      ],
    );
  }

  private renderSelectedExecutionCanvasHeader(): HTMLElement | string {
    if (this.state.selection.type !== "execution") {
      return "";
    }

    const execution = this.readWorkflowDebugExecution();
    if (!execution) {
      return "";
    }

    return createElement(
      "div",
      {
        className:
          "pointer-events-none absolute left-5 top-5 z-10 flex flex-col gap-1 text-sm",
      },
      [
        createElement(
          "div",
          {
            className:
              "flex items-center gap-2 text-base font-medium text-white",
          },
          [formatExecutionHistoryTitle(execution.startedAt)],
        ),
        createElement("div", { className: "text-sm text-slate-200" }, [
          `${formatSelectOptionLabel(execution.status)} in ${formatDuration(execution.durationMs)} | ID#${readExecutionLabel(execution)} | Autosave`,
        ]),
      ],
    );
  }

  private renderCanvasHeader(): HTMLElement {
    const workflow = this.state.draftWorkflow;
    const viewport = workflow?.viewport ?? null;

    return createElement(
      "div",
      {
        className:
          "flex flex-wrap items-center justify-between gap-3 border-b border-border-dark bg-[#121820]/95 px-3 py-3 backdrop-blur xl:flex-nowrap xl:px-4",
      },
      [
        createElement(
          "div",
          { className: "flex min-w-0 flex-wrap items-center gap-2.5" },
          [
            createElement(
              "span",
              {
                className:
                  "rounded-full border border-border-dark bg-[#0d1319] px-2.5 py-1 text-[11px] font-medium tracking-[0.14em] text-text-secondary",
              },
              ["Canvas"],
            ),
            workflow
              ? createElement(
                  "span",
                  {
                    className:
                      "rounded-full border border-border-dark bg-[#0d1319] px-2.5 py-1 text-xs text-slate-300",
                  },
                  [
                    `${workflow.nodes.length} nodes · ${workflow.edges.length} links`,
                  ],
                )
              : "",
            viewport
              ? createElement(
                  "span",
                  {
                    className:
                      "rounded-full border border-border-dark bg-[#0d1319] px-2.5 py-1 text-xs text-slate-300",
                  },
                  [`${Math.round(viewport.zoom * 100)}%`],
                )
              : "",
            this.state.pendingConnection
              ? createElement(
                  StatusBadge,
                  {
                    status: "warning",
                  },
                  ["Select an input port"],
                )
              : createElement(
                  StatusBadge,
                  {
                    status: "info",
                  },
                  ["Drag from output"],
                ),
          ],
        ),
        createElement("div", { className: "min-w-0 flex-1" }, [
          this.state.pendingConnection
            ? createElement(
                "span",
                { className: "block truncate text-xs text-amber-200" },
                [
                  "Connection mode active. Choose a compatible input port or press Esc to cancel.",
                ],
              )
            : "",
        ]),
        createElement(
          "div",
          {
            className:
              "flex items-center gap-1 rounded-xl border border-border-dark bg-[#0d1319] p-1",
          },
          [
            createElement(IconButton, {
              icon: "fit_screen",
              tooltip: "Fit workflow",
              disabled: this.state.draftWorkflow === null,
              onClick: () => this.handleFitViewport(),
              className:
                "h-9 w-9 rounded-lg border border-transparent hover:border-border-dark hover:bg-[#1b2330]",
              dataset: {
                testid: WorkflowScreenSelector.CanvasFitView,
              },
            }),
            createElement(IconButton, {
              icon: "zoom_out",
              tooltip: "Zoom out",
              disabled: this.state.draftWorkflow === null,
              onClick: () => this.handleZoom(-0.1),
              className:
                "h-9 w-9 rounded-lg border border-transparent hover:border-border-dark hover:bg-[#1b2330]",
              dataset: {
                testid: WorkflowScreenSelector.CanvasZoomOut,
              },
            }),
            createElement(IconButton, {
              icon: "center_focus_strong",
              tooltip: "Reset view",
              disabled: this.state.draftWorkflow === null,
              onClick: () => this.handleResetViewport(),
              className:
                "h-9 w-9 rounded-lg border border-transparent hover:border-border-dark hover:bg-[#1b2330]",
              dataset: {
                testid: WorkflowScreenSelector.CanvasResetView,
              },
            }),
            createElement(IconButton, {
              icon: "zoom_in",
              tooltip: "Zoom in",
              disabled: this.state.draftWorkflow === null,
              onClick: () => this.handleZoom(0.1),
              className:
                "h-9 w-9 rounded-lg border border-transparent hover:border-border-dark hover:bg-[#1b2330]",
              dataset: {
                testid: WorkflowScreenSelector.CanvasZoomIn,
              },
            }),
          ],
        ),
      ],
    );
  }

  private renderCanvasFooter(): HTMLElement {
    const viewport = this.state.draftWorkflow?.viewport;
    const footerLabel = this.readCanvasFooterLabel();

    return createElement(
      "div",
      {
        className:
          "absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-border-dark bg-[#121820]/95 px-3 py-2 text-xs text-text-secondary shadow-[0_12px_28px_rgba(3,7,18,0.28)]",
      },
      [
        createElement("span", {}, [
          viewport ? `${Math.round(viewport.zoom * 100)}%` : "100%",
        ]),
        createElement("span", { className: "text-slate-500" }, ["•"]),
        createElement("span", {}, [footerLabel]),
      ],
    );
  }

  private renderCanvasNode(node: WorkflowNodeRecord): HTMLElement {
    const selected =
      this.state.selection.type === "node" &&
      this.state.selection.id === node.id;
    const canAcceptConnection =
      this.state.pendingConnection !== null &&
      readNodeInputPorts(node).length > 0;
    const highlightedInputNode =
      this.state.hoveredPort?.side === "input" &&
      this.state.hoveredPort.nodeId === node.id;
    const nodeRunVisual = this.readNodeRunVisual(node.id);
    const workflowId = this.state.draftWorkflow?.id ?? "";
    const pinnedVisual = readWorkflowPinnedNodeVisualState({
      pinnedOutput: this.state.pinnedTestOutput,
      workflowId,
      nodeId: node.id,
    });
    const stateToneClassName = readNodeRunToneClassName(nodeRunVisual.status);
    const stateAccentClassName = readNodeRunAccentClassName(
      nodeRunVisual.status,
    );

    return createElement(
      "div",
      {
        key: node.id,
        className:
          "group pointer-events-auto absolute flex flex-col items-center",
        style: `left:${node.position.x}px; top:${node.position.y}px; width:${WorkflowNodeVisualWidth}px;`,
        onPointerMove: (event: Event) =>
          this.handleNodeConnectionMouseMove(event as PointerEvent),
        onPointerUp: (event: Event) =>
          this.handleNodeConnectionMouseUp(event as PointerEvent),
        onDblClick: (event: MouseEvent) => {
          event.stopPropagation();
          this.openSelectionEditorModal({ type: "node", id: node.id });
        },
        dataset: {
          nodeId: node.id,
          testid: `${WorkflowScreenSelector.NodeCardPrefix}${node.id}`,
        },
      },
      [
        createElement(
          "div",
          {
            className: `relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border bg-[#2d2d2d] transition-colors active:cursor-grabbing ${pinnedVisual.pinned ? "border-violet-500 ring-2 ring-violet-500/45" : selected ? "border-[#ff8a3d] ring-1 ring-[#ff8a3d]/40" : canAcceptConnection ? "border-slate-400" : stateToneClassName} ${nodeRunVisual.status === "running" ? "animate-pulse" : ""}`,
            dataset: {
              dragHandle: node.id,
            },
            onPointerDown: (event: Event) =>
              this.handleNodePointerDown(event as PointerEvent, node.id),
          },
          [
            nodeRunVisual.status !== "idle"
              ? createElement("div", {
                  className: `pointer-events-none absolute inset-0 rounded-md border ${readNodeRunOverlayClassName(nodeRunVisual.status)}`,
                })
              : "",
            createElement("div", {
              className: `pointer-events-none absolute left-0 top-0 h-1 w-full rounded-t-md ${stateAccentClassName ? `bg-gradient-to-r ${stateAccentClassName}` : readNodeAccentClassName(node.kind)}`,
            }),
            canAcceptConnection
              ? createElement("div", {
                  className: `pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-md border-r transition-colors ${highlightedInputNode ? "border-primary/70 bg-primary/10" : "border-slate-500/20 bg-slate-500/5"}`,
                })
              : "",
            createElement(
              "span",
              {
                className:
                  "material-symbols-outlined text-[34px] text-[#ff8a3d]",
              },
              [readNodeIcon(node.kind)],
            ),
            nodeRunVisual.label
              ? createElement(
                  "span",
                  {
                    className:
                      "absolute right-1.5 top-1 rounded-sm bg-[#3a3a3a] px-1.5 py-0.5 text-[10px] font-semibold text-white",
                  },
                  [readNodeRunCountLabel(nodeRunVisual.label)],
                )
              : "",
            pinnedVisual.pinned
              ? createElement(
                  "span",
                  {
                    className:
                      "material-symbols-outlined pointer-events-none absolute bottom-1.5 right-1.5 text-[16px] leading-none text-violet-300",
                  },
                  ["push_pin"],
                )
              : "",
            this.renderNodeHoverToolbar(node),
            readNodeInputPorts(node).map((port, index) =>
              this.renderNodePort(
                node,
                port.id,
                port.name,
                "input",
                index,
                readNodeInputPorts(node).length,
              ),
            ),
            node.outputPorts.map((port, index) =>
              this.renderNodePort(
                node,
                port.id,
                port.name,
                "output",
                index,
                node.outputPorts.length,
              ),
            ),
            node.outputPorts.length >= PortLabelSingleOutputMinimum
              ? node.outputPorts.map((port, index) =>
                  this.renderNodeOutputPortLabel(
                    port.name,
                    index,
                    node.outputPorts.length,
                  ),
                )
              : "",
          ],
        ),
        createElement(
          "div",
          {
            className:
              "mt-2 w-44 -translate-x-10 text-center text-sm font-medium leading-5 text-white",
          },
          [node.label],
        ),
      ],
    );
  }

  private renderNodeHoverToolbar(node: WorkflowNodeRecord): HTMLElement {
    const runControl = this.readNodeHoverRunControlState(node.id);

    return createElement(
      "div",
      {
        className:
          "pointer-events-none absolute -top-12 left-1/2 z-20 flex h-12 w-32 -translate-x-1/2 items-start justify-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        onPointerDown: (event: Event) => event.stopPropagation(),
        onMouseDown: (event: Event) => event.stopPropagation(),
      },
      [
        createElement(
          "div",
          {
            className:
              "relative flex items-center overflow-hidden rounded-md border border-[#3d3d3d] bg-[#202020] shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
          },
          [
            this.renderNodeHoverToolbarButton({
              icon: runControl.icon,
              title: runControl.title,
              disabled: runControl.disabled,
              onClick: () => {
                void this.handleExecuteNodeStep(node.id, "hover");
              },
            }),
            this.renderNodeHoverToolbarButton({
              icon: "edit",
              title: "Edit node",
              onClick: () =>
                this.openSelectionEditorModal({ type: "node", id: node.id }),
            }),
            this.renderNodeHoverToolbarButton({
              icon: "delete",
              title: "Delete node",
              tone: "danger",
              onClick: () => this.handleRemoveNode(node.id),
            }),
            this.renderNodeHoverToolbarButton({
              icon: "more_horiz",
              title: "Node settings",
              onClick: () => this.toggleNodeActionMenu(node.id),
            }),
            this.renderNodeActionMenu(node),
          ],
        ),
      ],
    );
  }

  private toggleNodeActionMenu(nodeId: string): void {
    this.setState({
      nodeActionMenuId: this.state.nodeActionMenuId === nodeId ? null : nodeId,
    });
  }

  private renderNodeActionMenu(node: WorkflowNodeRecord): HTMLElement | string {
    if (this.state.nodeActionMenuId !== node.id) {
      return "";
    }

    const outputValue = this.readWorkflowDebugOutputMap(
      this.readWorkflowDebugExecution(),
    ).get(node.id);
    const pinAction = readWorkflowPinnedOutputAction({
      currentPinnedOutput: this.state.pinnedTestOutput,
      nextNodeId: node.id,
      nextOutputSnapshot: outputValue,
      hasOutput: outputValue !== undefined,
    });

    return createElement(
      "div",
      {
        className:
          "absolute left-full top-0 z-30 ml-2 w-56 rounded-md border border-[#3d3d3d] bg-[#202020] py-1 text-left shadow-[0_8px_20px_rgba(0,0,0,0.35)]",
        onPointerDown: (event: Event) => event.stopPropagation(),
        onMouseDown: (event: Event) => event.stopPropagation(),
      },
      [
        this.renderNodeActionMenuItem("Open", "open_in_new", () => {
          this.setState({ nodeActionMenuId: null });
          this.openSelectionEditorModal({ type: "node", id: node.id });
        }),
        this.renderNodeActionMenuItem(
          "Execute step",
          "play_arrow",
          () => {
            this.setState({ nodeActionMenuId: null });
            void this.handleExecuteNodeStep(node.id, "hover");
          },
          this.readNodeHoverRunControlState(node.id).disabled,
        ),
        this.renderNodeActionMenuItem(
          "Rename",
          "drive_file_rename_outline",
          () => {
            this.setState({ nodeActionMenuId: null });
            this.handleRenameNode(node.id);
          },
        ),
        this.renderNodeActionMenuItem("Duplicate", "content_copy", () => {
          this.setState({ nodeActionMenuId: null });
          this.handleDuplicateNode(node.id);
        }),
        this.renderNodeActionMenuItem(
          pinAction === "unpin" ? "Unpin" : "Pin output",
          "push_pin",
          () => {
            this.setState({ nodeActionMenuId: null });
            this.handleTogglePinnedTestOutputForNode(
              node.id,
              outputValue,
              pinAction,
            );
          },
          pinAction === "disabled",
        ),
        this.renderNodeActionMenuItem(
          "Deactivate",
          "power_settings_new",
          undefined,
          true,
        ),
        this.renderNodeActionMenuItem(
          "Delete",
          "delete",
          () => {
            this.setState({ nodeActionMenuId: null });
            this.handleRemoveNode(node.id);
          },
          false,
          "danger",
        ),
      ],
    );
  }

  private renderNodeActionMenuItem(
    label: string,
    icon: string,
    onClick: (() => void) | undefined,
    disabled = false,
    tone: "default" | "danger" = "default",
  ): HTMLElement {
    return createElement(
      "button",
      {
        type: "button",
        disabled,
        className: `flex w-full items-center justify-between gap-3 px-3 py-2 text-xs ${disabled ? "cursor-not-allowed text-slate-500" : tone === "danger" ? "text-rose-100 hover:bg-rose-950/50" : "text-slate-200 hover:bg-[#2c2c2c] hover:text-white"}`,
        onClick: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) {
            onClick?.();
          }
        },
      },
      [
        createElement("span", { className: "truncate" }, [label]),
        createElement(
          "span",
          { className: "material-symbols-outlined text-[15px]" },
          [icon],
        ),
      ],
    );
  }

  private renderNodeHoverToolbarButton(input: {
    icon: string;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    tone?: "default" | "danger";
  }): HTMLElement {
    const disabled = input.disabled ?? false;
    const tone = input.tone ?? "default";

    return createElement(
      "button",
      {
        type: "button",
        title: input.title,
        disabled,
        className: `flex h-7 w-7 items-center justify-center border-r border-[#333] text-slate-200 last:border-r-0 ${disabled ? "cursor-not-allowed opacity-45" : tone === "danger" ? "hover:bg-rose-950/70 hover:text-rose-100" : "hover:bg-[#2c2c2c] hover:text-white"}`,
        onPointerDown: (event: Event) => event.stopPropagation(),
        onMouseDown: (event: Event) => event.stopPropagation(),
        onClick: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled) {
            return;
          }
          input.onClick();
        },
      },
      [
        createElement(
          "span",
          { className: "material-symbols-outlined text-[16px] leading-none" },
          [input.icon],
        ),
      ],
    );
  }

  private readNodeHoverRunControlState(nodeId: string): {
    disabled: boolean;
    icon: "hourglass_top" | "play_arrow";
    title: string;
  } {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    return readWorkflowNodeHoverRunControlState({
      hasTargetNode:
        currentWorkflow?.nodes.some((node) => node.id === nodeId) ?? false,
      hasCurrentProject: this.state.currentProject !== null,
      hasCurrentWorkflow: currentWorkflow !== null,
      hasDirtyWorkflow: this.state.dirtyWorkflow,
      dirtyAssetCount: this.state.dirtyAssetIds.length,
      hasPendingAction: this.state.pendingAction !== null,
      hasActiveExecution: currentWorkflow
        ? this.readWorkflowHasActiveExecution(currentWorkflow.id)
        : false,
    });
  }

  private renderNodeOutputPortLabel(
    name: string,
    index: number,
    total: number,
  ): HTMLElement {
    const topOffset = readPortOffset(index, total);

    return createElement(
      "span",
      {
        className:
          "pointer-events-none absolute left-[92px] max-w-[68px] truncate rounded border border-[#4a4a4a] bg-[#242424] px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-200",
        style: `top: ${topOffset + 2}px;`,
        title: name,
      },
      [name],
    );
  }

  private renderNodePort(
    node: WorkflowNodeRecord,
    portId: string,
    name: string,
    side: PortSide,
    index: number,
    total: number,
  ): HTMLElement {
    const topOffset = readPortOffset(index, total);
    const active =
      this.state.pendingConnection?.nodeId === node.id &&
      this.state.pendingConnection?.portId === portId;
    const hovered =
      this.state.hoveredPort?.nodeId === node.id &&
      this.state.hoveredPort?.portId === portId &&
      this.state.hoveredPort.side === side;
    const compatibleTarget =
      side === "input" && this.state.pendingConnection !== null;
    const incompatiblePort =
      side === "output" && this.state.pendingConnection !== null && !active;
    const pinClassName = active
      ? "border-amber-300 bg-amber-400"
      : hovered
        ? side === "input"
          ? "border-sky-200 bg-primary"
          : "border-emerald-200 bg-emerald-400"
        : compatibleTarget
          ? "border-sky-300 bg-sky-500/80"
          : side === "input"
            ? "border-[#7a7a7a] bg-[#464646]"
            : incompatiblePort
              ? "border-emerald-200/40 bg-emerald-400/40"
              : "border-[#777] bg-[#3a3a3a]";

    return createElement(
      "button",
      {
        type: "button",
        title: `${side} · ${name}`,
        className: `absolute flex cursor-crosshair select-none items-center transition-transform ${side === "input" ? "-left-3" : "-right-3"} ${hovered || active ? "scale-110" : ""}`,
        style: `top: ${topOffset}px;`,
        onPointerDown: (event: Event) =>
          this.handlePortPointerDown(
            event as PointerEvent,
            node.id,
            portId,
            side,
          ),
        onPointerUp: (event: Event) =>
          this.handlePortPointerUp(
            event as PointerEvent,
            node.id,
            portId,
            side,
          ),
        onMouseDown: (event: Event) =>
          this.handlePortPointerDown(
            event as MouseEvent,
            node.id,
            portId,
            side,
          ),
        onMouseUp: (event: Event) =>
          this.handlePortPointerUp(event as MouseEvent, node.id, portId, side),
        onMouseEnter: () => this.handlePortHover(node.id, portId, side),
        onMouseLeave: () => this.handlePortHoverEnd(node.id, portId, side),
        dataset: {
          portHandle: "true",
          portNodeId: node.id,
          portId,
          portSide: side,
        },
      },
      [
        createElement("span", {
          className: `block h-5 w-5 rounded-full border-2 transition-all ${pinClassName}`,
        }),
      ],
    );
  }

  private renderEdgePath(
    edge: WorkflowDefinitionRecord["edges"][number],
    nodes: ReadonlyArray<WorkflowNodeRecord>,
  ): HTMLElement {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    const targetNode = nodes.find((node) => node.id === edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      return createElement("g", {});
    }

    const sourcePortIndex = sourceNode.outputPorts.findIndex(
      (port) => port.id === edge.sourcePortId,
    );
    const targetInputPorts = readNodeInputPorts(targetNode);
    const targetPortIndex = targetInputPorts.findIndex(
      (port) => port.id === edge.targetPortId,
    );
    const source = readPortAnchorPoint(
      sourceNode,
      "output",
      Math.max(sourcePortIndex, 0),
      sourceNode.outputPorts.length,
    );
    const target = readPortAnchorPoint(
      targetNode,
      "input",
      Math.max(targetPortIndex, 0),
      targetInputPorts.length,
    );
    const path = readEdgeCurvePath(source, target);
    const hovered = this.state.hoveredEdgeId === edge.id;
    const itemLabel = this.readWorkflowDebugEdgeItemLabel(edge.sourceNodeId);

    return createElement(
      "g",
      {
        key: edge.id,
        className: "pointer-events-auto",
        onMouseEnter: () => this.handleEdgeHover(edge.id),
      },
      [
        createElement("path", {
          d: path,
          stroke: "#ffffff",
          "stroke-width": "18",
          "stroke-linecap": "round",
          opacity: "0.01",
          fill: "none",
          style: "pointer-events: stroke;",
          onMouseMove: () => this.handleEdgeHover(edge.id),
          onMouseEnter: () => this.handleEdgeHover(edge.id),
          "data-testid": `${WorkflowScreenSelector.EdgeHitPrefix}${edge.id}`,
        }),
        createElement("path", {
          d: path,
          stroke: hovered ? "#aab4c2" : "#6f7f92",
          "stroke-width": hovered ? "3.5" : "3",
          "stroke-linecap": "round",
          "marker-end": "url(#workflows-edge-arrow)",
          fill: "none",
          style: "pointer-events: stroke;",
          onMouseMove: () => this.handleEdgeHover(edge.id),
          onMouseEnter: () => this.handleEdgeHover(edge.id),
          "data-testid": "workflows-edge",
        }),
        this.renderEdgeDirectionArrow(source, target, hovered),
        itemLabel
          ? this.renderEdgeItemLabel(source, target, itemLabel, hovered)
          : "",
      ],
    );
  }

  private renderLiveExecutionHistoryRow(
    liveExecution: LiveExecutionState,
  ): HTMLElement {
    const runningCount = Object.values(liveExecution.nodeRuns).filter(
      (nodeRun) => nodeRun.status === "running",
    ).length;
    const completedCount = liveExecution.completedNodeIds.length;
    const accentClassName =
      liveExecution.status === "failed"
        ? "bg-[#ff5c5c]"
        : runningCount > 0
          ? "bg-[#f7c948]"
          : "bg-[#8b5cf6]";

    return createElement(
      "button",
      {
        type: "button",
        key: liveExecution.workflowRunId ?? "queued-live-execution",
        className:
          "relative flex w-full flex-col gap-1 border-l-4 bg-[#282828] px-3 py-3 text-left transition-colors hover:bg-[#303030]",
        onClick: () =>
          this.setState({
            selection: { type: "workflow", id: liveExecution.workflowId },
            compactView: this.state.isCompactViewport
              ? CompactView.Canvas
              : this.state.compactView,
          }),
      },
      [
        createElement("span", {
          className: `absolute bottom-0 left-0 top-0 w-1 ${accentClassName}`,
        }),
        createElement(
          "span",
          { className: "pl-2 text-sm font-medium text-white" },
          [formatExecutionHistoryTitle(liveExecution.startedAt)],
        ),
        createElement("span", { className: "pl-2 text-xs text-slate-300" }, [
          liveExecution.workflowRunId
            ? `Running · ${completedCount.toString()} reached · ${runningCount.toString()} active`
            : "Queued · waiting for server",
        ]),
      ],
    );
  }

  private renderEdgeItemLabel(
    source: ConnectionPreviewPoint,
    target: ConnectionPreviewPoint,
    label: string,
    hovered: boolean,
  ): HTMLElement {
    const center = readEdgeDirectionCenter(source, target);

    return createElement(
      "g",
      {
        style: "pointer-events: none;",
      },
      [
        createElement("rect", {
          x: (center.x - 28).toString(),
          y: (center.y - 18).toString(),
          width: "56",
          height: "20",
          rx: "5",
          fill: hovered ? "#202833" : "#111820",
          stroke: "#2f3a47",
        }),
        createElement(
          "text",
          {
            x: center.x.toString(),
            y: (center.y - 4).toString(),
            "text-anchor": "middle",
            fill: "#d6dde7",
            "font-size": "11",
            "font-family": "monospace",
          },
          [label],
        ),
      ],
    );
  }

  private readWorkflowDebugEdgeItemLabel(sourceNodeId: string): string | null {
    const execution = this.readWorkflowDebugExecution();
    const outputsByNodeId = this.readWorkflowDebugOutputMap(execution);
    const output = outputsByNodeId.get(sourceNodeId);
    return output === undefined ? null : readWorkflowDebugItemLabel(output);
  }

  private renderEdgeDirectionArrow(
    source: ConnectionPreviewPoint,
    target: ConnectionPreviewPoint,
    hovered: boolean,
  ): HTMLElement {
    const center = readEdgeDirectionCenter(source, target);
    const angle = readEdgeDirectionAngle(source, target);
    const fill = hovered ? "#aab4c2" : "#7f8da0";

    return createElement("path", {
      d: readEdgeDirectionArrowPath(center, EdgeDirectionArrowSize),
      fill,
      opacity: hovered ? "1" : "0.9",
      style: "pointer-events: none;",
      transform: `rotate(${angle.toString()} ${center.x.toString()} ${center.y.toString()})`,
    });
  }

  private renderEdgeDeleteControl(
    edge: WorkflowDefinitionRecord["edges"][number],
    nodes: ReadonlyArray<WorkflowNodeRecord>,
  ): HTMLElement {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    const targetNode = nodes.find((node) => node.id === edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      return createElement("span", {});
    }

    const sourcePortIndex = sourceNode.outputPorts.findIndex(
      (port) => port.id === edge.sourcePortId,
    );
    const targetInputPorts = readNodeInputPorts(targetNode);
    const targetPortIndex = targetInputPorts.findIndex(
      (port) => port.id === edge.targetPortId,
    );
    const source = readPortAnchorPoint(
      sourceNode,
      "output",
      Math.max(sourcePortIndex, 0),
      sourceNode.outputPorts.length,
    );
    const target = readPortAnchorPoint(
      targetNode,
      "input",
      Math.max(targetPortIndex, 0),
      targetInputPorts.length,
    );
    const point = readEdgeActionPoint(source, target, nodes);
    const hovered = this.state.hoveredEdgeId === edge.id;

    return createElement(
      "button",
      {
        type: "button",
        title: "Remove connection",
        className: `absolute grid h-5 w-5 place-items-center rounded border border-rose-400/80 bg-[#151a20] text-[13px] leading-none text-rose-200 transition-opacity ${hovered ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`,
        style: `left:${point.x - 10}px; top:${point.y - 10}px;`,
        onMouseMove: () => this.handleEdgeHover(edge.id),
        onMouseEnter: () => this.handleEdgeHover(edge.id),
        onMouseDown: (event: Event) => this.handleEdgeDeletePointerStart(event),
        onPointerDown: (event: Event) =>
          this.handleEdgeDeletePointerStart(event),
        onClick: (event: Event) => this.handleRemoveEdge(event, edge.id),
        "data-testid": `${WorkflowScreenSelector.EdgeDeletePrefix}${edge.id}`,
      },
      [
        createElement(
          "span",
          {
            className: "material-symbols-outlined text-[13px]",
          },
          ["delete"],
        ),
      ],
    );
  }

  private readConnectionPreviewPath(
    workflow: WorkflowDefinitionUpsertInput,
  ): { path: string; stroke: string; target: ConnectionPreviewPoint } | null {
    const source = this.state.pendingConnection;
    if (!source) {
      return null;
    }

    const sourceNode = workflow.nodes.find((node) => node.id === source.nodeId);
    if (!sourceNode) {
      return null;
    }

    const sourcePortIndex = sourceNode.outputPorts.findIndex(
      (port) => port.id === source.portId,
    );
    if (sourcePortIndex < 0) {
      return null;
    }

    const sourcePoint = readPortAnchorPoint(
      sourceNode,
      "output",
      sourcePortIndex,
      sourceNode.outputPorts.length,
    );
    const hoveredInput =
      this.state.hoveredPort?.side === "input" ? this.state.hoveredPort : null;
    const targetPoint = hoveredInput
      ? readHoveredInputAnchorPoint(workflow.nodes, hoveredInput)
      : this.state.connectionPreviewPoint;

    if (!targetPoint) {
      return null;
    }

    return {
      path: readEdgeCurvePath(sourcePoint, targetPoint),
      stroke: hoveredInput ? "#60a5fa" : "#f59e0b",
      target: targetPoint,
    };
  }

  private readCanvasFooterLabel(): string {
    if (this.spacePanPressed) {
      return "Space pressed · drag to pan like n8n";
    }

    if (this.panning) {
      return "Panning canvas";
    }

    if (this.draggingNodeId) {
      return "Dragging node";
    }

    if (this.state.pendingConnection) {
      return this.state.hoveredPort?.side === "input"
        ? "Release on this input to create the connection"
        : "Connection mode active";
    }

    return "Click + drag pans the canvas. Drag nodes or drag from outputs to connect";
  }

  private openSelectionEditorModal(selection?: WorkflowSelection): void {
    const debugExecutionId =
      selection?.type === "node" && this.state.selection.type === "execution"
        ? this.state.selection.id
        : this.state.debugExecutionId;
    this.setState({
      ...(selection ? { selection } : {}),
      debugExecutionId,
      editorModalOpen: true,
    });
  }

  private closeSelectionEditorModal(): void {
    this.setState({ editorModalOpen: false });
  }

  private renderSelectionEditorModal(): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-5",
        onClick: () => this.closeSelectionEditorModal(),
      },
      [
        createElement(
          "section",
          {
            className: `flex h-full max-h-[min(900px,calc(100vh-40px))] w-full ${this.state.selection.type === "node" ? "max-w-[1560px]" : "max-w-[980px]"} flex-col overflow-hidden rounded-lg border border-border-dark relative bg-[#11161d] shadow-xl`,
            onClick: (event: Event) => event.stopPropagation(),
            "data-testid": WorkflowScreenSelector.InspectorPanel,
          },
          [
            this.renderNodeModalNavigationButton("previous"),
            createElement(
              "div",
              {
                className:
                  "flex items-center justify-between border-b border-border-dark px-4 py-3",
              },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "truncate text-sm font-semibold text-white" },
                    [this.readInspectorTitle()],
                  ),
                  createElement(
                    "p",
                    {
                      className: "mt-0.5 truncate text-xs text-text-secondary",
                    },
                    [this.readInspectorSubtitle()],
                  ),
                ]),
                createElement("div", { className: "flex items-center gap-2" }, [
                  this.state.selection.type === "node"
                    ? (() => {
                        const stepAvailability =
                          this.readSelectedNodeStepExecutionAvailability();
                        return createElement(Button, {
                          variant: "primary",
                          size: "sm",
                          disabled: stepAvailability.disabled,
                          onClick: () => {
                            void this.handleExecuteSelectedNodeStep();
                          },
                          children: stepAvailability.label,
                        });
                      })()
                    : "",
                  this.state.selection.type === "node"
                    ? createElement(IconButton, {
                        icon: "delete",
                        tooltip: "Delete node",
                        onClick: (event: MouseEvent) => {
                          event.stopPropagation();
                          this.handleRemoveSelectedNode();
                        },
                        className:
                          "h-9 w-9 overflow-hidden rounded-md border border-rose-500/60 bg-rose-950/40 text-rose-100 hover:bg-rose-900/60",
                      })
                    : this.state.selection.type === "execution"
                      ? (() => {
                          const executionId = this.state.selection.id;
                          return createElement(Button, {
                            variant: "danger",
                            size: "sm",
                            disabled: this.state.pendingAction !== null,
                            onClick: () => {
                              void this.handleDeleteExecution(executionId);
                            },
                            children:
                              this.state.pendingAction ===
                              PendingAction.DeleteExecution
                                ? "Deleting"
                                : "Delete run",
                          });
                        })()
                      : "",
                  createElement(IconButton, {
                    icon: "close",
                    tooltip: "Close editor",
                    onClick: () => this.closeSelectionEditorModal(),
                    className:
                      "h-8 w-8 rounded-md border border-transparent hover:border-border-dark hover:bg-[#20262f]",
                  }),
                ]),
              ],
            ),
            createElement(
              "div",
              {
                className: "min-h-0 flex-1 overflow-y-auto p-4",
                "data-preserve-scroll-key": "workflows-editor-modal-scroll",
              },
              [this.renderInspectorBody()],
            ),
            this.renderNodeModalNavigationButton("next"),
          ],
        ),
      ],
    );
  }

  private renderNodeModalNavigationButton(
    direction: "previous" | "next",
  ): HTMLElement | string {
    if (this.state.selection.type !== "node" || !this.state.draftWorkflow) {
      return "";
    }

    const navigationState = readWorkflowNodeModalNavigationState({
      workflow: this.state.draftWorkflow,
      nodeId: this.state.selection.id,
      executionId:
        this.readWorkflowDebugExecution()?.id ?? this.state.debugExecutionId,
    });
    const targetNodeId =
      direction === "previous"
        ? navigationState.previousNodeId
        : navigationState.nextNodeId;
    const targetNode = this.state.draftWorkflow.nodes.find(
      (node) => node.id === targetNodeId,
    );

    if (!targetNode) {
      return "";
    }

    const sideClassName = direction === "previous" ? "left-0" : "right-0";
    const testId =
      direction === "previous"
        ? WorkflowScreenSelector.NodeModalPrevious
        : WorkflowScreenSelector.NodeModalNext;
    const titlePrefix = direction === "previous" ? "previous" : "next";

    return createElement(
      "button",
      {
        type: "button",
        className: `${sideClassName} absolute top-1/2 z-[51] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md border border-border-dark bg-[#151b23] text-slate-200 shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-colors hover:border-primary/60 hover:bg-[#202833] hover:text-white`,
        title: `Open ${titlePrefix} node: ${targetNode.label}`,
        "data-testid": testId,
        onClick: (event: Event) => {
          event.stopPropagation();
          this.openNodeEditorModal(targetNode.id);
        },
      },
      [
        createElement(
          "span",
          { className: "material-symbols-outlined text-[21px]" },
          [readNodeIcon(targetNode.kind)],
        ),
      ],
    );
  }

  private openNodeEditorModal(nodeId: string): void {
    this.setState({
      selection: { type: "node", id: nodeId },
      editorModalOpen: true,
      executionNodeModal: null,
      debugInputSourceId: "last-upstream",
    });
  }

  private renderInspectorBody(): HTMLElement {
    if (
      this.state.liveExecution &&
      this.state.pendingAction === PendingAction.RunWorkflow
    ) {
      return this.renderLiveExecutionInspector(this.state.liveExecution);
    }

    if (this.state.selection.type === "node") {
      const node = this.readSelectedNode();
      return node
        ? this.renderNodeDebugEditor(node)
        : this.renderEmptyInspector();
    }

    if (this.state.selection.type === "asset") {
      const asset = this.readSelectedAsset();
      return asset
        ? this.renderAssetInspector(asset)
        : this.renderEmptyInspector();
    }

    if (this.state.selection.type === "execution") {
      const execution = this.readSelectedExecution();
      return execution
        ? this.renderExecutionInspector(execution)
        : this.renderEmptyInspector();
    }

    const workflow = this.state.draftWorkflow;
    return workflow
      ? this.renderWorkflowInspector(workflow)
      : this.renderEmptyInspector();
  }

  private renderExecutionInspector(
    execution: WorkflowExecutionRecord,
  ): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const nodeLookup = new Map(
      (currentWorkflow?.nodes ?? []).map((node) => [node.id, node]),
    );
    const hasAlerts = execution.nodeRuns.some(
      (nodeRun) => nodeRun.alerts.length > 0,
    );
    const hasGuardrailFindings = execution.nodeRuns.some(
      (nodeRun) => nodeRun.guardrailFindings.length > 0,
    );

    return createElement(
      "div",
      {
        className: "flex flex-col gap-4",
        "data-testid": WorkflowScreenSelector.ExecutionInspector,
      },
      [
        createElement(
          "div",
          {
            className:
              "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
          },
          [
            createElement(
              "div",
              { className: "flex items-center justify-between gap-3" },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "truncate text-sm font-medium text-white" },
                    [readExecutionLabel(execution)],
                  ),
                  createElement(
                    "p",
                    { className: "mt-1 text-xs text-text-secondary" },
                    [`Started ${formatTimestamp(execution.startedAt)}`],
                  ),
                ]),
                createElement(
                  StatusBadge,
                  {
                    status: readExecutionBadgeStatus(execution.status),
                    pulse: execution.status === "running",
                  },
                  [formatSelectOptionLabel(execution.status)],
                ),
              ],
            ),
            createElement(
              "div",
              { className: "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" },
              [
                this.renderInlineMetaTile(
                  "Runtime",
                  formatDuration(execution.durationMs),
                ),
                this.renderInlineMetaTile(
                  "Tokens",
                  execution.totals.totalTokens.toLocaleString(),
                ),
                this.renderInlineMetaTile(
                  "EUR",
                  formatEuro(execution.totals.estimatedCostEur),
                ),
                this.renderInlineMetaTile(
                  "Latency",
                  formatDuration(execution.totals.latencyMs),
                ),
                this.renderInlineMetaTile(
                  "Warnings",
                  execution.warningsCount.toString(),
                ),
                this.renderInlineMetaTile(
                  "Errors",
                  execution.errorsCount.toString(),
                ),
              ],
            ),
          ],
        ),
        createElement(
          "div",
          {
            className:
              "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
          },
          [
            createElement(
              "p",
              { className: "text-sm font-medium text-white" },
              ["Run context"],
            ),
            createElement(
              "div",
              { className: "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" },
              [
                this.renderInlineMetaTile(
                  "Trigger",
                  formatSelectOptionLabel(execution.triggerKind),
                ),
                this.renderInlineMetaTile(
                  "Session",
                  execution.contextSessionId,
                ),
                this.renderInlineMetaTile(
                  "Prompt",
                  execution.totals.promptTokens.toLocaleString(),
                ),
                this.renderInlineMetaTile(
                  "Completion",
                  execution.totals.completionTokens.toLocaleString(),
                ),
              ],
            ),
          ],
        ),
        createElement(
          "div",
          {
            className:
              "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
          },
          [
            createElement(
              "p",
              { className: "text-sm font-medium text-white" },
              ["Inspect node output"],
            ),
            createElement(
              "p",
              { className: "mt-1 text-xs text-text-secondary" },
              [
                "Click a canvas node or use Open in the run cards to inspect full node output in a modal without leaving this persisted run.",
              ],
            ),
          ],
        ),
        hasAlerts
          ? createElement(
              "div",
              {
                className:
                  "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
              },
              [
                createElement(
                  "p",
                  { className: "text-sm font-medium text-white" },
                  ["Run alerts"],
                ),
                createElement(
                  "div",
                  { className: "mt-3 flex flex-col gap-2" },
                  [
                    execution.nodeRuns.flatMap((nodeRun) =>
                      nodeRun.alerts.map((alert) =>
                        createElement(
                          "div",
                          {
                            key: alert.id,
                            className:
                              "rounded-md border border-border-dark bg-[#161b22] px-3 py-2",
                          },
                          [
                            createElement(
                              "div",
                              {
                                className:
                                  "flex items-center justify-between gap-3",
                              },
                              [
                                createElement(
                                  "span",
                                  {
                                    className: "text-xs font-medium text-white",
                                  },
                                  [
                                    `${nodeLookup.get(nodeRun.nodeId)?.label ?? nodeRun.nodeId} · ${formatSelectOptionLabel(alert.source)}`,
                                  ],
                                ),
                                createElement(
                                  StatusBadge,
                                  {
                                    status: readAlertBadgeStatus(alert.level),
                                  },
                                  [formatSelectOptionLabel(alert.level)],
                                ),
                              ],
                            ),
                            createElement(
                              "p",
                              { className: "mt-2 text-xs text-text-secondary" },
                              [alert.message],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            )
          : "",
        hasGuardrailFindings
          ? createElement(
              "div",
              {
                className:
                  "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
              },
              [
                createElement(
                  "p",
                  { className: "text-sm font-medium text-white" },
                  ["Guardrail findings"],
                ),
                createElement(
                  "div",
                  { className: "mt-3 flex flex-col gap-2" },
                  [
                    execution.nodeRuns.flatMap((nodeRun) =>
                      nodeRun.guardrailFindings.map((finding, index) =>
                        createElement(
                          "div",
                          {
                            key: `${nodeRun.id}-guardrail-${index.toString()}`,
                            className:
                              "rounded-md border border-border-dark bg-[#161b22] px-3 py-2",
                          },
                          [
                            createElement(
                              "div",
                              {
                                className:
                                  "flex items-center justify-between gap-3",
                              },
                              [
                                createElement(
                                  "span",
                                  {
                                    className: "text-xs font-medium text-white",
                                  },
                                  [
                                    `${nodeLookup.get(nodeRun.nodeId)?.label ?? nodeRun.nodeId} · Guardrail`,
                                  ],
                                ),
                                createElement(
                                  StatusBadge,
                                  {
                                    status: readGuardrailFindingBadgeStatus(
                                      finding.severity,
                                    ),
                                  },
                                  [formatSelectOptionLabel(finding.severity)],
                                ),
                              ],
                            ),
                            createElement(
                              "p",
                              { className: "mt-2 text-xs text-text-secondary" },
                              [finding.message],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            )
          : "",
        this.renderScopedInspectorLogs({
          runId: execution.id,
          title: "Run logs",
          emptyMessage: "No server log entries captured for this execution.",
        }),
        createElement(
          "div",
          {
            className:
              "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
          },
          [
            createElement(
              "div",
              { className: "flex items-center justify-between gap-3" },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "text-sm font-medium text-white" },
                    ["Node runs"],
                  ),
                  createElement(
                    "p",
                    { className: "mt-1 text-xs text-text-secondary" },
                    ["Per-node runtime, provider usage and alert visibility."],
                  ),
                ]),
                this.state.loadingExecutionId === execution.id
                  ? createElement(
                      StatusBadge,
                      {
                        status: "running",
                        pulse: true,
                      },
                      ["Refreshing"],
                    )
                  : "",
              ],
            ),
            createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
              execution.nodeRuns.map((nodeRun) => {
                const nodeLabel =
                  nodeLookup.get(nodeRun.nodeId)?.label ?? nodeRun.nodeId;
                return createElement(
                  "div",
                  {
                    key: nodeRun.id,
                    className:
                      "rounded-md border border-border-dark bg-[#161b22] px-3 py-3",
                    "data-testid": `${WorkflowScreenSelector.ExecutionNodeRunPrefix}${nodeRun.id}`,
                  },
                  [
                    createElement(
                      "div",
                      { className: "flex items-center justify-between gap-3" },
                      [
                        createElement("div", { className: "min-w-0" }, [
                          createElement(
                            "p",
                            {
                              className:
                                "truncate text-sm font-medium text-white",
                            },
                            [nodeLabel],
                          ),
                          createElement(
                            "p",
                            {
                              className: "truncate text-xs text-text-secondary",
                            },
                            [
                              `${readNodeKindLabel(nodeRun.nodeKind)} · ${formatDuration(nodeRun.durationMs)}`,
                            ],
                          ),
                        ]),
                        createElement(
                          "div",
                          { className: "flex items-center gap-2" },
                          [
                            createElement(
                              StatusBadge,
                              {
                                status: readExecutionBadgeStatus(
                                  nodeRun.status,
                                ),
                              },
                              [formatSelectOptionLabel(nodeRun.status)],
                            ),
                            createElement(Button, {
                              variant: "ghost",
                              size: "sm",
                              onClick: () =>
                                this.openExecutionNodeModal(nodeRun.nodeId),
                              children: "Open",
                            }),
                          ],
                        ),
                      ],
                    ),
                    createElement(
                      "div",
                      {
                        className:
                          "mt-3 grid grid-cols-1 gap-2 text-xs text-text-secondary sm:grid-cols-2",
                      },
                      [
                        createElement("span", {}, [
                          readNodeRunProviderLabel(nodeRun),
                        ]),
                        createElement("span", {}, [
                          nodeRun.usage
                            ? `${nodeRun.usage.totalTokens.toLocaleString()} tokens`
                            : "No token data",
                        ]),
                        createElement("span", {}, [
                          nodeRun.usage
                            ? formatEuro(nodeRun.usage.estimatedCostEur)
                            : "No EUR data",
                        ]),
                        createElement("span", {}, [
                          `${nodeRun.alerts.length} alert${nodeRun.alerts.length === 1 ? "" : "s"}`,
                        ]),
                        createElement("span", {}, [
                          `${nodeRun.guardrailFindings.length} finding${nodeRun.guardrailFindings.length === 1 ? "" : "s"}`,
                        ]),
                        createElement("span", {}, [
                          formatDuration(nodeRun.durationMs),
                        ]),
                      ],
                    ),
                    createElement(
                      "div",
                      {
                        className:
                          "mt-3 rounded-md border border-border-dark bg-[#0d1117] px-3 py-3",
                      },
                      [
                        createElement(
                          "div",
                          {
                            className:
                              "flex items-center justify-between gap-2",
                          },
                          [
                            createElement(
                              "span",
                              { className: "text-xs font-medium text-white" },
                              ["Output snapshot"],
                            ),
                            createElement(
                              "span",
                              { className: "text-[11px] text-text-secondary" },
                              [
                                readOutputSnapshotKindLabel(
                                  nodeRun.outputSnapshot,
                                ),
                              ],
                            ),
                          ],
                        ),
                        createElement(
                          "pre",
                          {
                            className:
                              "mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-dark bg-[#11161d] px-3 py-3 font-mono text-[11px] leading-5 text-slate-200",
                          },
                          [formatOutputSnapshot(nodeRun.outputSnapshot)],
                        ),
                      ],
                    ),
                    nodeRun.guardrailFindings.length > 0
                      ? createElement(
                          "div",
                          { className: "mt-3 flex flex-col gap-2" },
                          [
                            nodeRun.guardrailFindings.map((finding, index) =>
                              createElement(
                                "div",
                                {
                                  key: `${nodeRun.id}-finding-${index.toString()}`,
                                  className:
                                    "rounded border border-border-dark bg-[#11161d] px-3 py-2",
                                },
                                [
                                  createElement(
                                    "div",
                                    {
                                      className:
                                        "flex items-center justify-between gap-2",
                                    },
                                    [
                                      createElement(
                                        "span",
                                        { className: "text-xs text-white" },
                                        [finding.message],
                                      ),
                                      createElement(
                                        StatusBadge,
                                        {
                                          status:
                                            readGuardrailFindingBadgeStatus(
                                              finding.severity,
                                            ),
                                        },
                                        [
                                          formatSelectOptionLabel(
                                            finding.severity,
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                  createElement(
                                    "p",
                                    {
                                      className:
                                        "mt-1 text-[11px] text-text-secondary",
                                    },
                                    [finding.guardrailAssetId],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        )
                      : createElement(
                          "p",
                          { className: "mt-3 text-xs text-text-secondary" },
                          ["No guardrail findings."],
                        ),
                    nodeRun.alerts.length > 0
                      ? createElement(
                          "div",
                          { className: "mt-3 flex flex-col gap-2" },
                          [
                            nodeRun.alerts.map((alert) =>
                              createElement(
                                "div",
                                {
                                  key: alert.id,
                                  className:
                                    "rounded border border-border-dark bg-[#11161d] px-3 py-2",
                                },
                                [
                                  createElement(
                                    "div",
                                    {
                                      className:
                                        "flex items-center justify-between gap-2",
                                    },
                                    [
                                      createElement(
                                        "span",
                                        { className: "text-xs text-white" },
                                        [alert.message],
                                      ),
                                      createElement(
                                        StatusBadge,
                                        {
                                          status: readAlertBadgeStatus(
                                            alert.level,
                                          ),
                                        },
                                        [formatSelectOptionLabel(alert.level)],
                                      ),
                                    ],
                                  ),
                                  createElement(
                                    "p",
                                    {
                                      className:
                                        "mt-1 text-[11px] text-text-secondary",
                                    },
                                    [
                                      `${formatSelectOptionLabel(alert.source)} · ${formatTimestamp(alert.createdAt)}`,
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        )
                      : createElement(
                          "p",
                          { className: "mt-3 text-xs text-text-secondary" },
                          ["No node alerts."],
                        ),
                  ],
                );
              }),
            ]),
          ],
        ),
      ],
    );
  }

  private renderLiveExecutionInspector(
    liveExecution: LiveExecutionState,
  ): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const nodeLookup = new Map(
      (currentWorkflow?.nodes ?? []).map((node) => [node.id, node]),
    );
    const liveNodeRuns = (currentWorkflow?.nodes ?? []).map((node) => ({
      node,
      run: liveExecution.nodeRuns[node.id] ?? createPendingLiveNodeRunState(),
    }));
    const completedCount = liveNodeRuns.filter(
      ({ run }) => run.status !== "pending",
    ).length;
    const hasAlerts = liveNodeRuns.some(({ run }) => run.alerts.length > 0);
    const hasFindings = liveNodeRuns.some(
      ({ run }) => run.guardrailFindings.length > 0,
    );

    return createElement(
      "div",
      {
        className: "flex flex-col gap-4",
        "data-testid": WorkflowScreenSelector.ExecutionInspector,
      },
      [
        createElement(
          "div",
          {
            className:
              "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
          },
          [
            createElement(
              "div",
              { className: "flex flex-wrap items-start justify-between gap-3" },
              [
                createElement("div", { className: "min-w-0 flex-1" }, [
                  createElement(
                    "p",
                    { className: "truncate text-sm font-medium text-white" },
                    [currentWorkflow?.name ?? "Workflow run"],
                  ),
                  createElement(
                    "p",
                    { className: "mt-1 text-xs text-text-secondary" },
                    [`Started ${formatTimestamp(liveExecution.startedAt)}`],
                  ),
                ]),
                createElement(
                  StatusBadge,
                  {
                    status:
                      liveExecution.status === "failed" ? "failed" : "running",
                    pulse: liveExecution.status === "running",
                  },
                  [formatSelectOptionLabel(liveExecution.status)],
                ),
              ],
            ),
            createElement(
              "div",
              {
                className:
                  "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4",
              },
              [
                this.renderInlineMetaTile(
                  "Nodes",
                  `${completedCount.toString()}/${liveNodeRuns.length.toString()}`,
                ),
                this.renderInlineMetaTile(
                  "Active",
                  liveExecution.activeNodeId
                    ? (nodeLookup.get(liveExecution.activeNodeId)?.label ??
                        liveExecution.activeNodeId)
                    : "Idle",
                ),
                this.renderInlineMetaTile(
                  "Run ID",
                  liveExecution.workflowRunId ?? "Pending",
                ),
                this.renderInlineMetaTile(
                  "State",
                  formatSelectOptionLabel(liveExecution.status),
                ),
              ],
            ),
            liveExecution.errorMessage
              ? createElement(
                  "div",
                  {
                    className:
                      "mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100",
                  },
                  [liveExecution.errorMessage],
                )
              : "",
          ],
        ),
        createElement(
          "div",
          {
            className:
              "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
          },
          [
            createElement(
              "p",
              { className: "text-sm font-medium text-white" },
              ["Inspect node output"],
            ),
            createElement(
              "p",
              { className: "mt-1 text-xs text-text-secondary" },
              [
                "While this workflow streams, click a canvas node or use Open in the run cards to inspect the live output in a dedicated modal.",
              ],
            ),
          ],
        ),
        hasAlerts
          ? createElement(
              "div",
              {
                className:
                  "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
              },
              [
                createElement(
                  "p",
                  { className: "text-sm font-medium text-white" },
                  ["Live alerts"],
                ),
                createElement(
                  "div",
                  { className: "mt-3 flex flex-col gap-2" },
                  [
                    liveNodeRuns.flatMap(({ node, run }) =>
                      run.alerts.map((alert) =>
                        createElement(
                          "div",
                          {
                            key: `${node.id}-${alert.id}`,
                            className:
                              "rounded-md border border-border-dark bg-[#161b22] px-3 py-2",
                          },
                          [
                            createElement(
                              "div",
                              {
                                className:
                                  "flex flex-wrap items-center justify-between gap-2",
                              },
                              [
                                createElement(
                                  "span",
                                  {
                                    className: "text-xs font-medium text-white",
                                  },
                                  [
                                    `${node.label} · ${formatSelectOptionLabel(alert.source)}`,
                                  ],
                                ),
                                createElement(
                                  StatusBadge,
                                  { status: readAlertBadgeStatus(alert.level) },
                                  [formatSelectOptionLabel(alert.level)],
                                ),
                              ],
                            ),
                            createElement(
                              "p",
                              { className: "mt-2 text-xs text-text-secondary" },
                              [alert.message],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            )
          : "",
        hasFindings
          ? createElement(
              "div",
              {
                className:
                  "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
              },
              [
                createElement(
                  "p",
                  { className: "text-sm font-medium text-white" },
                  ["Live guardrails"],
                ),
                createElement(
                  "div",
                  { className: "mt-3 flex flex-col gap-2" },
                  [
                    liveNodeRuns.flatMap(({ node, run }) =>
                      run.guardrailFindings.map((finding, index) =>
                        createElement(
                          "div",
                          {
                            key: `${node.id}-finding-${index.toString()}`,
                            className:
                              "rounded-md border border-border-dark bg-[#161b22] px-3 py-2",
                          },
                          [
                            createElement(
                              "div",
                              {
                                className:
                                  "flex flex-wrap items-center justify-between gap-2",
                              },
                              [
                                createElement(
                                  "span",
                                  {
                                    className: "text-xs font-medium text-white",
                                  },
                                  [`${node.label} · Guardrail`],
                                ),
                                createElement(
                                  StatusBadge,
                                  {
                                    status: readGuardrailFindingBadgeStatus(
                                      finding.severity,
                                    ),
                                  },
                                  [formatSelectOptionLabel(finding.severity)],
                                ),
                              ],
                            ),
                            createElement(
                              "p",
                              { className: "mt-2 text-xs text-text-secondary" },
                              [finding.message],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            )
          : "",
        this.renderScopedInspectorLogs({
          runId: liveExecution.workflowRunId ?? undefined,
          title: "Live run logs",
          emptyMessage: "No server log entries captured for this live run yet.",
        }),
        createElement(
          "div",
          {
            className:
              "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
          },
          [
            createElement(
              "div",
              { className: "flex items-center justify-between gap-3" },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "text-sm font-medium text-white" },
                    ["Live node runs"],
                  ),
                  createElement(
                    "p",
                    { className: "mt-1 text-xs text-text-secondary" },
                    [
                      "Real-time progress and node output while the workflow runs.",
                    ],
                  ),
                ]),
                createElement(StatusBadge, { status: "running", pulse: true }, [
                  "Streaming",
                ]),
              ],
            ),
            createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
              liveNodeRuns.map(({ node, run }) =>
                createElement(
                  "div",
                  {
                    key: node.id,
                    className:
                      "rounded-md border border-border-dark bg-[#161b22] px-3 py-3",
                  },
                  [
                    createElement(
                      "div",
                      {
                        className:
                          "flex flex-wrap items-center justify-between gap-3",
                      },
                      [
                        createElement("div", { className: "min-w-0 flex-1" }, [
                          createElement(
                            "p",
                            {
                              className:
                                "truncate text-sm font-medium text-white",
                            },
                            [node.label],
                          ),
                          createElement(
                            "p",
                            {
                              className: "truncate text-xs text-text-secondary",
                            },
                            [
                              `${readNodeKindLabel(node.kind)} · ${readLiveNodeRunMeta(run)}`,
                            ],
                          ),
                        ]),
                        createElement(
                          "div",
                          { className: "flex items-center gap-2" },
                          [
                            createElement(
                              StatusBadge,
                              {
                                status: readLiveNodeRunBadgeStatus(run.status),
                                pulse: run.status === "running",
                              },
                              [formatSelectOptionLabel(run.status)],
                            ),
                            createElement(Button, {
                              variant: "ghost",
                              size: "sm",
                              onClick: () =>
                                this.openExecutionNodeModal(node.id),
                              children: "Open",
                            }),
                          ],
                        ),
                      ],
                    ),
                    createElement(
                      "div",
                      {
                        className:
                          "mt-3 grid grid-cols-1 gap-2 text-[11px] text-text-secondary sm:grid-cols-2 xl:grid-cols-3",
                      },
                      [
                        createElement("span", {}, [
                          run.provider
                            ? formatProviderLabel(run.provider)
                            : readNodeSecondaryText(node),
                        ]),
                        createElement("span", {}, [
                          run.usage
                            ? `${run.usage.totalTokens.toLocaleString()} tokens`
                            : "No token data",
                        ]),
                        createElement("span", {}, [
                          run.usage
                            ? formatEuro(run.usage.estimatedCostEur)
                            : "No EUR data",
                        ]),
                        createElement("span", {}, [
                          `${run.alerts.length} alert${run.alerts.length === 1 ? "" : "s"}`,
                        ]),
                        createElement("span", {}, [
                          `${run.guardrailFindings.length} finding${run.guardrailFindings.length === 1 ? "" : "s"}`,
                        ]),
                        createElement("span", {}, [
                          run.finishedAt && run.startedAt
                            ? formatDuration(
                                new Date(run.finishedAt).getTime() -
                                  new Date(run.startedAt).getTime(),
                              )
                            : run.status === "running"
                              ? "Running"
                              : "Pending",
                        ]),
                      ],
                    ),
                    createElement(
                      "div",
                      {
                        className:
                          "mt-3 rounded-md border border-border-dark bg-[#0d1117] px-3 py-3",
                      },
                      [
                        createElement(
                          "div",
                          {
                            className:
                              "flex flex-wrap items-center justify-between gap-2",
                          },
                          [
                            createElement(
                              "span",
                              { className: "text-xs font-medium text-white" },
                              ["Live output"],
                            ),
                            createElement(
                              "span",
                              { className: "text-[11px] text-text-secondary" },
                              [
                                run.outputText.trim().length > 0 ||
                                run.outputSnapshot !== undefined
                                  ? readOutputSnapshotKindLabel(
                                      run.outputSnapshot ?? run.outputText,
                                    )
                                  : "Pending",
                              ],
                            ),
                          ],
                        ),
                        createElement(
                          "pre",
                          {
                            className:
                              "mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-dark bg-[#11161d] px-3 py-3 font-mono text-[11px] leading-5 text-slate-200",
                          },
                          [
                            run.outputText.trim().length > 0
                              ? run.outputText
                              : run.outputSnapshot !== undefined
                                ? formatOutputSnapshot(run.outputSnapshot)
                                : "Waiting for node output...",
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ]),
          ],
        ),
      ],
    );
  }

  private renderWorkflowInspector(
    workflow: WorkflowDefinitionUpsertInput,
  ): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-4" }, [
      this.renderInspectorField(
        "Workflow name",
        workflow.name,
        (value) => {
          this.patchDraftWorkflow((current) => ({
            ...current,
            name: value,
          }));
        },
        WorkflowScreenSelector.WorkflowNameInput,
      ),
      this.renderInspectorTextArea(
        "Description",
        workflow.description,
        (value) => {
          this.patchDraftWorkflow((current) => ({
            ...current,
            description: value,
          }));
        },
        WorkflowScreenSelector.WorkflowDescriptionInput,
      ),
      this.renderInspectorSelect(
        "Status",
        workflow.status,
        [
          WorkflowRecordStatus.Draft,
          WorkflowRecordStatus.Published,
          WorkflowRecordStatus.Archived,
        ],
        (value) => {
          this.patchDraftWorkflow((current) => ({
            ...current,
            status: readWorkflowRecordStatus(value),
          }));
        },
      ),
      this.renderInspectorField(
        "Language",
        workflow.defaultContextPolicy.language,
        (value) => {
          this.updateDraftWorkflow({
            ...workflow,
            defaultContextPolicy: {
              ...workflow.defaultContextPolicy,
              language: value,
            },
          });
        },
      ),
      this.renderInlineMetaGrid([
        { label: "Nodes", value: String(workflow.nodes.length) },
        { label: "Connections", value: String(workflow.edges.length) },
        {
          label: "Zoom",
          value: `${Math.round(workflow.viewport.zoom * 100)}%`,
        },
        { label: "Workspace", value: workflow.workspaceId },
      ]),
    ]);
  }

  private openExecutionNodeModal(nodeId: string): void {
    if (this.state.selection.type === "execution") {
      this.setState(
        readWorkflowExecutionNodeOpenState({
          executionId: this.state.selection.id,
          nodeId,
        }),
      );
      return;
    }

    if (this.state.liveExecution) {
      this.setState(
        readWorkflowExecutionNodeOpenState({
          executionId: this.state.liveExecution.workflowRunId,
          nodeId,
        }),
      );
    }
  }

  private closeExecutionNodeModal(): void {
    this.setState({ executionNodeModal: null });
  }

  private stepExecutionNodeModal(offset: -1 | 1): void {
    const modal = this.state.executionNodeModal;
    const workflow = this.state.draftWorkflow;
    if (!modal || !workflow || workflow.nodes.length === 0) {
      return;
    }

    const currentIndex = workflow.nodes.findIndex(
      (node) => node.id === modal.nodeId,
    );
    if (currentIndex < 0) {
      return;
    }

    const nextIndex =
      (currentIndex + offset + workflow.nodes.length) % workflow.nodes.length;
    const nextNode = workflow.nodes[nextIndex];
    if (!nextNode) {
      return;
    }

    this.setState({
      executionNodeModal: {
        ...modal,
        nodeId: nextNode.id,
      },
    });
  }

  private async handlePinExecutionNodeModalSampleOutput(): Promise<void> {
    const modal = this.state.executionNodeModal;
    const workflow = this.state.draftWorkflow;
    if (!modal || !workflow) {
      return;
    }

    const node = workflow.nodes.find((entry) => entry.id === modal.nodeId);
    if (!node) {
      return;
    }

    const outputText = this.readExecutionNodeModalOutputText();
    if (outputText.trim().length === 0) {
      this.setState({
        noticeMessage: null,
        errorMessage: "There is no node output available to pin right now.",
      });
      return;
    }

    const action = readWorkflowPinnedOutputAction({
      currentPinnedOutput: this.state.pinnedTestOutput,
      nextNodeId: node.id,
      nextOutputSnapshot: parseWorkflowEditedOutputSnapshot(outputText),
      hasOutput: true,
    });

    await this.handleTogglePinnedTestOutputForNode(
      node.id,
      parseWorkflowEditedOutputSnapshot(outputText),
      action === "unpin" ? "pin" : action,
      workflow.id ?? "",
    );
  }

  private readExecutionNodeModalOutputText(): string {
    const modal = this.state.executionNodeModal;
    const workflow = this.state.draftWorkflow;
    if (!modal || !workflow) {
      return "";
    }

    if (modal.mode === "execution") {
      const execution = this.state.executions.find(
        (entry) => entry.id === modal.executionId,
      );
      const nodeRun = execution?.nodeRuns.find(
        (entry) => entry.nodeId === modal.nodeId,
      );
      return nodeRun ? formatOutputSnapshot(nodeRun.outputSnapshot) : "";
    }

    const liveNodeRun = this.state.liveExecution?.nodeRuns[modal.nodeId];
    if (!liveNodeRun) {
      return "";
    }

    return liveNodeRun.outputText.trim().length > 0
      ? liveNodeRun.outputText
      : liveNodeRun.outputSnapshot !== undefined
        ? formatOutputSnapshot(liveNodeRun.outputSnapshot)
        : "";
  }

  private readExecutionNodeModalContext(): ExecutionNodeModalContext | null {
    const modal = this.state.executionNodeModal;
    const workflow = this.state.draftWorkflow;
    if (!modal || !workflow) {
      return null;
    }

    const node = workflow.nodes.find((entry) => entry.id === modal.nodeId);
    if (!node) {
      return null;
    }

    const persistedExecution =
      modal.mode === "execution"
        ? (this.state.executions.find(
            (entry) => entry.id === modal.executionId,
          ) ?? null)
        : null;
    const persistedNodeRun =
      persistedExecution?.nodeRuns.find((entry) => entry.nodeId === node.id) ??
      null;
    const liveNodeRun =
      modal.mode === "live"
        ? (this.state.liveExecution?.nodeRuns[node.id] ??
          createPendingLiveNodeRunState())
        : null;
    const runStatus =
      modal.mode === "execution"
        ? (persistedNodeRun?.status ?? "awaiting_review")
        : (liveNodeRun?.status ?? "pending");
    const outputText = this.readExecutionNodeModalOutputText();
    const runId =
      modal.mode === "execution"
        ? (modal.executionId ?? undefined)
        : (this.state.liveExecution?.workflowRunId ?? undefined);
    const alerts =
      modal.mode === "execution"
        ? (persistedNodeRun?.alerts ?? [])
        : (liveNodeRun?.alerts ?? []);
    const findings =
      modal.mode === "execution"
        ? (persistedNodeRun?.guardrailFindings ?? [])
        : (liveNodeRun?.guardrailFindings ?? []);
    const usage =
      modal.mode === "execution" ? persistedNodeRun?.usage : liveNodeRun?.usage;
    const providerLabel =
      modal.mode === "execution"
        ? persistedNodeRun
          ? readNodeRunProviderLabel(persistedNodeRun)
          : "No provider data"
        : liveNodeRun?.provider
          ? formatProviderLabel(liveNodeRun.provider)
          : readNodeSecondaryText(node);
    const isPinned = node.outputContract?.sampleOutput === outputText;

    return {
      modal,
      workflow,
      node,
      ...(runId ? { runId } : {}),
      runStatus,
      outputText,
      alerts,
      findings,
      ...(usage ? { usage } : {}),
      providerLabel,
      durationLabel:
        modal.mode === "execution"
          ? formatDuration(persistedNodeRun?.durationMs)
          : liveNodeRun?.finishedAt && liveNodeRun.startedAt
            ? formatDuration(
                new Date(liveNodeRun.finishedAt).getTime() -
                  new Date(liveNodeRun.startedAt).getTime(),
              )
            : runStatus === "running"
              ? "Running"
              : "Pending",
      isPinned,
    };
  }

  private renderExecutionNodeModal(): HTMLElement {
    const context = this.readExecutionNodeModalContext();
    if (!context) {
      return createElement("div");
    }

    const badgeStatus = this.readExecutionNodeModalBadgeStatus(context);

    return createElement(
      "div",
      {
        className: "fixed inset-0 z-50 bg-black/72 p-3 md:p-6",
        onClick: () => this.closeExecutionNodeModal(),
      },
      [
        createElement(
          "div",
          {
            className:
              "mx-auto flex h-full w-full max-w-[1480px] overflow-hidden rounded-lg border border-border-dark bg-[#0f141a] shadow-2xl",
            onClick: (event: Event) => event.stopPropagation(),
          },
          [
            createElement(
              "section",
              {
                className:
                  "flex min-w-0 flex-1 flex-col border-r border-border-dark",
              },
              [
                createElement(
                  "div",
                  {
                    className:
                      "flex flex-wrap items-center justify-between gap-3 border-b border-border-dark px-4 py-3",
                  },
                  [
                    createElement("div", { className: "min-w-0" }, [
                      createElement(
                        "p",
                        {
                          className:
                            "truncate text-sm font-semibold text-white",
                        },
                        [
                          `${context.node.label} · ${readNodeKindLabel(context.node.kind)}`,
                        ],
                      ),
                      createElement(
                        "p",
                        { className: "mt-1 text-xs text-text-secondary" },
                        [
                          `${context.modal.mode === "live" ? "Live run" : "Persisted run"} · ArrowLeft / ArrowRight to move · P to pin output`,
                        ],
                      ),
                    ]),
                    createElement(
                      "div",
                      { className: "flex items-center gap-2" },
                      [
                        createElement(
                          StatusBadge,
                          {
                            status: badgeStatus,
                            pulse: context.runStatus === "running",
                          },
                          [formatSelectOptionLabel(context.runStatus)],
                        ),
                        createElement(Button, {
                          variant: context.isPinned ? "secondary" : "ghost",
                          size: "sm",
                          onClick: () => {
                            void this.handlePinExecutionNodeModalSampleOutput();
                          },
                          children: context.isPinned
                            ? "Pinned to test"
                            : "Pin output",
                        }),
                        createElement(IconButton, {
                          icon: "close",
                          tooltip: "Close",
                          onClick: () => this.closeExecutionNodeModal(),
                          className:
                            "h-8 w-8 rounded-md border border-transparent hover:border-border-dark hover:bg-[#1b222c]",
                        }),
                      ],
                    ),
                  ],
                ),
                createElement(
                  "div",
                  {
                    className:
                      "grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]",
                  },
                  [
                    createElement(
                      "div",
                      {
                        className:
                          "min-h-0 overflow-y-auto border-b border-border-dark px-4 py-4 xl:border-b-0",
                      },
                      [this.renderExecutionNodeModalMain(context)],
                    ),
                    createElement(
                      "aside",
                      {
                        className:
                          "min-h-0 overflow-y-auto bg-[#121820] px-3 py-3",
                      },
                      [this.renderExecutionNodeModalSidebar(context)],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  private readExecutionNodeModalBadgeStatus(
    context: ExecutionNodeModalContext,
  ): "info" | "success" | "warning" | "running" | "failed" {
    if (context.runStatus === "warn") {
      return "warning";
    }

    if (context.runStatus === "pending") {
      return "info";
    }

    if (context.modal.mode === "live") {
      return context.runStatus === "completed" ||
        context.runStatus === "running" ||
        context.runStatus === "failed"
        ? readLiveNodeRunBadgeStatus(context.runStatus)
        : "info";
    }

    return readExecutionBadgeStatus(context.runStatus);
  }

  private renderExecutionNodeModalMain(
    context: ExecutionNodeModalContext,
  ): HTMLElement {
    return createElement("div", { className: "flex flex-col" }, [
      createElement(
        "div",
        { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" },
        [
          this.renderInlineMetaTile("Provider", context.providerLabel),
          this.renderInlineMetaTile("Runtime", context.durationLabel),
          this.renderInlineMetaTile(
            "Tokens",
            context.usage
              ? context.usage.totalTokens.toLocaleString()
              : "No token data",
          ),
          this.renderInlineMetaTile(
            "Alerts",
            `${context.alerts.length.toString()} · ${context.findings.length.toString()} findings`,
          ),
        ],
      ),
      createElement(
        "div",
        {
          className: "mt-4 rounded-lg border border-border-dark bg-[#10161d]",
        },
        [
          createElement(
            "div",
            {
              className:
                "flex items-center justify-between gap-2 border-b border-border-dark px-3 py-2.5",
            },
            [
              createElement(
                "span",
                { className: "text-sm font-medium text-white" },
                ["Node output"],
              ),
              createElement(
                "span",
                { className: "text-[11px] text-text-secondary" },
                [context.outputText.trim().length > 0 ? "Captured" : "Pending"],
              ),
            ],
          ),
          createElement(
            "pre",
            {
              className:
                "max-h-[44vh] overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-[12px] leading-6 text-slate-200",
            },
            [
              context.outputText.trim().length > 0
                ? context.outputText
                : "No output captured for this node yet.",
            ],
          ),
        ],
      ),
      context.alerts.length > 0
        ? createElement(
            "div",
            { className: "mt-4 flex flex-col gap-2" },
            context.alerts.map((alert) =>
              createElement(
                "div",
                {
                  key: alert.id,
                  className:
                    "rounded-md border border-border-dark bg-[#11161d] px-3 py-2.5",
                },
                [
                  createElement(
                    "div",
                    {
                      className: "flex items-center justify-between gap-2",
                    },
                    [
                      createElement(
                        "span",
                        { className: "text-xs font-medium text-white" },
                        [alert.message],
                      ),
                      createElement(
                        StatusBadge,
                        {
                          status: readAlertBadgeStatus(alert.level),
                        },
                        [formatSelectOptionLabel(alert.level)],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          )
        : "",
      context.findings.length > 0
        ? createElement(
            "div",
            { className: "mt-4 flex flex-col gap-2" },
            context.findings.map((finding, index) =>
              createElement(
                "div",
                {
                  key: `${context.node.id}-modal-finding-${index.toString()}`,
                  className:
                    "rounded-md border border-border-dark bg-[#11161d] px-3 py-2.5",
                },
                [
                  createElement(
                    "div",
                    {
                      className: "flex items-center justify-between gap-2",
                    },
                    [
                      createElement(
                        "span",
                        { className: "text-xs font-medium text-white" },
                        [finding.message],
                      ),
                      createElement(
                        StatusBadge,
                        {
                          status: readGuardrailFindingBadgeStatus(
                            finding.severity,
                          ),
                        },
                        [formatSelectOptionLabel(finding.severity)],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          )
        : "",
    ]);
  }

  private renderExecutionNodeModalSidebar(
    context: ExecutionNodeModalContext,
  ): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-3" }, [
      createElement(
        "div",
        { className: "flex flex-col gap-2" },
        context.workflow.nodes.map((workflowNode) => {
          const selected = workflowNode.id === context.node.id;
          const visual = this.readNodeRunVisual(workflowNode.id);
          return createElement(
            "button",
            {
              type: "button",
              key: workflowNode.id,
              className: `flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${selected ? "border-primary/50 bg-primary/10" : "border-border-dark bg-[#0f141a] hover:border-slate-600 hover:bg-[#18202a]"}`,
              onClick: () => this.openExecutionNodeModal(workflowNode.id),
            },
            [
              createElement("div", { className: "min-w-0 flex-1" }, [
                createElement(
                  "p",
                  { className: "truncate text-sm font-medium text-white" },
                  [workflowNode.label],
                ),
                createElement(
                  "p",
                  { className: "text-[11px] text-text-secondary" },
                  [readNodeKindLabel(workflowNode.kind)],
                ),
              ]),
              createElement(
                StatusBadge,
                {
                  status: visual.badgeStatus,
                  pulse: visual.status === "running",
                },
                [visual.label ?? "Idle"],
              ),
            ],
          );
        }),
      ),
      this.renderScopedInspectorLogs({
        ...(context.runId ? { runId: context.runId } : {}),
        title: "Run logs",
        emptyMessage: "No server log entries captured for this run.",
      }),
    ]);
  }

  private renderNodeDebugEditor(node: WorkflowNodeRecord): HTMLElement {
    const context = this.readNodeDebugContext(node);
    if (!context) {
      return this.renderNodeInspector(node);
    }

    return createElement(
      "div",
      {
        className:
          "grid min-h-[640px] gap-0 overflow-hidden rounded-lg border border-border-dark bg-[#0f141a] xl:grid-cols-[minmax(280px,0.9fr)_minmax(420px,1.15fr)_minmax(280px,0.9fr)]",
      },
      [
        this.renderWorkflowDebugDataPanel({
          title: "INPUT",
          tab: this.state.debugInputTab,
          onTabChange: (tab) => this.setState({ debugInputTab: tab }),
          value: context.selectedInputSource?.value,
          statusTone: context.statusTone,
          itemLabel: context.selectedInputSource
            ? readWorkflowDebugItemLabel(context.selectedInputSource.value)
            : "0 items",
          emptyMessage: "Run the workflow or connect an upstream node first.",
          selector: this.renderWorkflowDebugInputSelector(context),
        }),
        createElement(
          "div",
          {
            className:
              "min-h-0 overflow-y-auto border-y border-border-dark bg-[#11161d] p-4 xl:border-x xl:border-y-0",
          },
          [
            createElement(
              "div",
              {
                className:
                  "mb-3 flex flex-wrap items-center justify-between gap-2",
              },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "truncate text-sm font-semibold text-white" },
                    [node.label],
                  ),
                  createElement(
                    "p",
                    { className: "mt-1 text-xs text-text-secondary" },
                    [
                      `${readNodeKindLabel(node.kind)} · ${context.statusLabel}`,
                    ],
                  ),
                ]),
                createElement(
                  StatusBadge,
                  {
                    status: readWorkflowDebugBadgeStatus(context.statusTone),
                    pulse: context.statusTone === "running",
                  },
                  [context.statusLabel],
                ),
              ],
            ),
            this.renderNodeInspector(node),
          ],
        ),
        this.renderWorkflowDebugDataPanel({
          title: "OUTPUT",
          tab: this.state.debugOutputTab,
          onTabChange: (tab) => this.setState({ debugOutputTab: tab }),
          value: context.outputValue,
          statusTone: context.statusTone,
          itemLabel: readWorkflowDebugItemLabel(context.outputValue),
          emptyMessage: "Execute this step to inspect the current node output.",
          pinned:
            this.state.pinnedTestOutput?.workflowId ===
              (context.workflow.id ?? "") &&
            this.state.pinnedTestOutput?.nodeId === context.node.id,
          selector: createElement(
            "div",
            { className: "flex items-center gap-1" },
            [
              createElement(IconButton, {
                icon: "edit",
                tooltip: "Edit output for test runs",
                onClick: () => this.openOutputEditor(context),
              }),
              this.renderPinnedOutputControl(context),
            ],
          ),
        }),
      ],
    );
  }

  private renderPinnedOutputControl(
    context: WorkflowNodeDebugContext,
  ): HTMLElement {
    const action = readWorkflowPinnedOutputAction({
      currentPinnedOutput: readWorkflowPinnedTestOutputFromDefinition(
        context.workflow,
      ),
      nextNodeId: context.node.id,
      nextOutputSnapshot: context.outputValue,
      hasOutput: context.outputValue !== undefined,
    });
    const active = action === "unpin";

    return createElement(IconButton, {
      icon: "push_pin",
      tooltip: active ? "Unpin test output" : "Pin output as test response",
      disabled: action === "disabled",
      "data-testid": WorkflowScreenSelector.OutputPinControl,
      ...(active
        ? { className: "border-primary/60 bg-primary/15 text-primary" }
        : {}),
      onClick: () => this.handleTogglePinnedTestOutput(context, action),
    });
  }

  private handleTogglePinnedTestOutput(
    context: WorkflowNodeDebugContext,
    action: ReturnType<typeof readWorkflowPinnedOutputAction>,
  ): void {
    void this.handleTogglePinnedTestOutputForNode(
      context.node.id,
      context.outputValue,
      action,
      context.workflow.id ?? "",
    );
  }

  private async handleTogglePinnedTestOutputForNode(
    nodeId: string,
    outputValue: unknown,
    action: ReturnType<typeof readWorkflowPinnedOutputAction>,
    workflowId = this.state.draftWorkflow?.id ?? "",
  ): Promise<void> {
    if (action === "disabled") {
      return;
    }

    if (action === "unpin") {
      await this.updatePinnedTestOutput(null);
      return;
    }

    if (
      action === "confirm-overwrite" &&
      !window.confirm("Replace the currently pinned test output?")
    ) {
      return;
    }

    await this.updatePinnedTestOutput({
      workflowId,
      nodeId,
      outputSnapshot: outputValue,
    });
  }

  private async updatePinnedTestOutput(
    pinnedTestOutput: WorkflowPinnedTestOutput | null,
  ): Promise<void> {
    const workflow = this.state.draftWorkflow;
    if (!workflow) {
      this.setState({ pinnedTestOutput });
      return;
    }

    const nextWorkflow = writeWorkflowPinnedTestOutputToDefinition(
      workflow,
      pinnedTestOutput,
      new Date().toISOString(),
    );
    this.updateDraftWorkflow(nextWorkflow);
    this.setState({ pinnedTestOutput });
    await this.persistPinnedTestOutputWorkflow(nextWorkflow);
  }

  private async persistPinnedTestOutputWorkflow(
    workflow: WorkflowDefinitionUpsertInput,
  ): Promise<void> {
    const projectId = this.state.currentProject?.id;
    if (!projectId) {
      return;
    }

    try {
      const saved = await this.workflowClient.upsertDefinition({
        projectId,
        definition: workflow,
      });
      const draftWorkflow = stripDefinitionVersionFields(saved);
      this.setState({
        workflows: this.state.workflows.map((entry) =>
          entry.id === saved.id ? saved : entry,
        ),
        draftWorkflow,
        pinnedTestOutput: readWorkflowPinnedTestOutputFromDefinition(saved),
        dirtyWorkflow: false,
        errorMessage: null,
      });
    } catch (error) {
      this.setState({
        errorMessage: readErrorMessage(
          error,
          "Could not persist the pinned test output.",
        ),
        noticeMessage: null,
      });
    }
  }

  private openOutputEditor(context: WorkflowNodeDebugContext): void {
    const text =
      context.outputValue === undefined
        ? ""
        : formatOutputSnapshot(context.outputValue);
    this.outputEditorDraftText = text;
    this.setState({
      outputEditor: {
        nodeId: context.node.id,
        text,
      },
    });
  }

  private closeOutputEditor(): void {
    this.outputEditorDraftText = null;
    this.setState({ outputEditor: null });
  }

  private async saveOutputEditor(): Promise<void> {
    const editor = this.state.outputEditor;
    if (!editor) {
      return;
    }

    const outputTextarea = document.querySelector<HTMLTextAreaElement>(
      `[data-testid="${WorkflowScreenSelector.OutputEditorTextarea}"]`,
    );
    const outputSnapshot = parseWorkflowEditedOutputSnapshot(
      outputTextarea?.value ?? this.outputEditorDraftText ?? editor.text,
    );
    const action = readWorkflowPinnedOutputAction({
      currentPinnedOutput: this.state.pinnedTestOutput,
      nextNodeId: editor.nodeId,
      nextOutputSnapshot: outputSnapshot,
      hasOutput: true,
    });
    await this.handleTogglePinnedTestOutputForNode(
      editor.nodeId,
      outputSnapshot,
      action === "unpin" ? "pin" : action,
    );
    this.outputEditorDraftText = null;
    this.setState({ outputEditor: null });
  }

  private renderOutputEditorModal(): HTMLElement {
    const editor = this.state.outputEditor;
    if (!editor) {
      return createElement("div");
    }

    const node = this.state.draftWorkflow?.nodes.find(
      (entry) => entry.id === editor.nodeId,
    );

    return createElement(
      "div",
      {
        className: "fixed inset-0 z-[60] bg-black/72 p-4 md:p-8",
        onClick: () => this.closeOutputEditor(),
      },
      [
        createElement(
          "div",
          {
            className:
              "mx-auto flex h-full max-w-[980px] flex-col overflow-hidden rounded-lg border border-border-dark bg-[#0f141a]",
            onClick: (event: Event) => event.stopPropagation(),
          },
          [
            createElement(
              "div",
              {
                className:
                  "flex items-center justify-between gap-3 border-b border-border-dark px-4 py-3",
              },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "truncate text-sm font-semibold text-white" },
                    [`Edit output · ${node?.label ?? editor.nodeId}`],
                  ),
                  createElement(
                    "p",
                    { className: "mt-1 text-xs text-text-secondary" },
                    [
                      "Saving stores this as the pinned test output for manual executions.",
                    ],
                  ),
                ]),
                createElement("div", { className: "flex items-center gap-2" }, [
                  createElement(Button, {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => this.closeOutputEditor(),
                    children: "Cancel",
                  }),
                  createElement(Button, {
                    variant: "primary",
                    size: "sm",
                    onClick: () => {
                      void this.saveOutputEditor();
                    },
                    children: "Save",
                  }),
                ]),
              ],
            ),
            createElement("textarea", {
              className:
                "min-h-0 flex-1 resize-none border-0 bg-[#0d1117] px-4 py-4 font-mono text-sm leading-6 text-slate-100 outline-none",
              "data-testid": WorkflowScreenSelector.OutputEditorTextarea,
              value: this.outputEditorDraftText ?? editor.text,
              onInput: (event: Event) => {
                const target = event.target;
                if (target instanceof HTMLTextAreaElement) {
                  this.outputEditorDraftText = target.value;
                }
              },
            }),
          ],
        ),
      ],
    );
  }

  private renderWorkflowDebugInputSelector(
    context: WorkflowNodeDebugContext,
  ): HTMLElement | string {
    if (context.inputSources.length === 0) {
      return "";
    }

    return createElement(
      "select",
      {
        value: context.selectedInputSource?.id ?? "",
        className:
          "h-8 min-w-0 rounded-md border border-border-dark bg-[#151b23] px-2 text-xs text-white outline-none focus:border-primary",
        onChange: (event: Event) => {
          const target = event.target as HTMLSelectElement;
          this.setState({ debugInputSourceId: target.value });
        },
      },
      context.inputSources.map((source) =>
        createElement(
          "option",
          {
            key: source.id,
            value: source.id,
          },
          [`${source.label} · ${source.detail}`],
        ),
      ),
    );
  }

  private renderWorkflowDebugDataPanel(input: {
    title: "INPUT" | "OUTPUT";
    tab: WorkflowDebugPanelTab;
    onTabChange: (tab: WorkflowDebugPanelTab) => void;
    value: unknown;
    statusTone: WorkflowDebugStatusTone;
    itemLabel: string;
    emptyMessage: string;
    selector: HTMLElement | string;
    pinned?: boolean;
  }): HTMLElement {
    return createElement(
      "section",
      { className: "flex min-h-0 flex-col bg-[#0f141a]" },
      [
        createElement(
          "div",
          {
            className:
              "flex min-h-[64px] flex-wrap items-center justify-between gap-2 border-b border-border-dark px-3 py-2",
          },
          [
            createElement("div", { className: "flex items-center gap-2" }, [
              createElement("span", {
                className: `h-2 w-2 rounded-full ${readWorkflowDebugDotClassName(input.statusTone)}`,
              }),
              createElement(
                "span",
                {
                  className:
                    "text-xs font-semibold tracking-[0.18em] text-white",
                },
                [input.title],
              ),
              createElement(
                "span",
                { className: "text-xs text-text-secondary" },
                [input.itemLabel],
              ),
            ]),
            input.selector,
          ],
        ),
        input.pinned
          ? createElement(
              "div",
              {
                className:
                  "flex items-center gap-2 border-b border-violet-500/50 bg-violet-500/18 px-3 py-2 text-xs text-violet-100",
              },
              [
                createElement(
                  "span",
                  { className: "material-symbols-outlined text-[15px]" },
                  ["push_pin"],
                ),
                "This output is pinned for manual test executions.",
              ],
            )
          : "",
        createElement(
          "div",
          {
            className:
              "flex items-center gap-1 border-b border-border-dark bg-[#121820] px-3 py-2",
          },
          (["schema", "table", "json"] as const).map((tab) =>
            createElement(
              "button",
              {
                type: "button",
                key: `${input.title}-${tab}`,
                className: `rounded-md px-2.5 py-1.5 text-xs ${input.tab === tab ? "bg-[#202833] text-white" : "text-text-secondary hover:bg-[#1a222b] hover:text-white"}`,
                onClick: () => input.onTabChange(tab),
              },
              [formatSelectOptionLabel(tab)],
            ),
          ),
        ),
        createElement(
          "div",
          { className: "min-h-0 flex-1 overflow-auto p-3" },
          [this.renderWorkflowDebugPanelBody(input)],
        ),
      ],
    );
  }

  private renderWorkflowDebugPanelBody(input: {
    tab: WorkflowDebugPanelTab;
    value: unknown;
    emptyMessage: string;
  }): HTMLElement {
    if (input.value === undefined) {
      return createElement(
        "div",
        {
          className:
            "flex min-h-[320px] items-center justify-center rounded-md border border-dashed border-border-dark px-4 text-center text-sm text-text-secondary",
        },
        [input.emptyMessage],
      );
    }

    if (input.tab === "schema") {
      return this.renderWorkflowDebugSchema(input.value);
    }

    if (input.tab === "table") {
      return this.renderWorkflowDebugTable(input.value);
    }

    return createElement(
      "pre",
      {
        className:
          "whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-200",
      },
      [formatOutputSnapshot(input.value)],
    );
  }

  private renderWorkflowDebugSchema(value: unknown): HTMLElement {
    return createElement(
      "div",
      { className: "flex flex-col divide-y divide-border-dark" },
      readWorkflowDebugSchemaEntries(value).map((entry) =>
        createElement(
          "div",
          {
            key: `${entry.path}-${entry.type}`,
            className: "grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 py-2",
          },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "truncate font-mono text-xs text-white" },
                [entry.path],
              ),
              createElement(
                "p",
                { className: "text-[11px] text-text-secondary" },
                [entry.type],
              ),
            ]),
            createElement(
              "span",
              { className: "text-right text-xs text-text-secondary" },
              [`${entry.items.toString()} items`],
            ),
            createElement("span", { className: "flex justify-end" }, [
              createElement("span", {
                className: `mt-1 h-2 w-2 rounded-full ${readWorkflowDebugDotClassName(entry.status)}`,
              }),
            ]),
          ],
        ),
      ),
    );
  }

  private renderWorkflowDebugTable(value: unknown): HTMLElement {
    const rows = Array.isArray(value) ? value : [value];
    const columns = readWorkflowDebugTableColumns(rows);

    if (columns.length === 0) {
      return createElement(
        "pre",
        {
          className:
            "whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-200",
        },
        [formatOutputSnapshot(value)],
      );
    }

    return createElement(
      "table",
      { className: "w-full border-collapse text-left text-xs" },
      [
        createElement("thead", {}, [
          createElement(
            "tr",
            {},
            columns.map((column) =>
              createElement(
                "th",
                {
                  key: column,
                  className:
                    "border-b border-border-dark px-2 py-2 font-medium text-text-secondary",
                },
                [column],
              ),
            ),
          ),
        ]),
        createElement(
          "tbody",
          {},
          rows.slice(0, DebugTableMaximumRows).map((row, index) =>
            createElement(
              "tr",
              { key: `debug-row-${index.toString()}` },
              columns.map((column) =>
                createElement(
                  "td",
                  {
                    key: `${index.toString()}-${column}`,
                    className:
                      "max-w-[180px] truncate border-b border-border-dark/70 px-2 py-2 text-slate-200",
                  },
                  [readWorkflowDebugTableCell(row, column)],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  private readNodeDebugContext(
    node: WorkflowNodeRecord,
  ): WorkflowNodeDebugContext | null {
    const workflow = this.state.draftWorkflow;
    if (!workflow) {
      return null;
    }

    const execution = this.readWorkflowDebugExecution();
    const liveRun = this.state.liveExecution?.nodeRuns[node.id] ?? null;
    const persistedRun =
      execution?.nodeRuns.find((nodeRun) => nodeRun.nodeId === node.id) ?? null;
    const outputsByNodeId = this.readWorkflowDebugOutputMap(execution);
    const inputSources = buildWorkflowDebugInputSources({
      workflow,
      nodeId: node.id,
      outputsByNodeId,
    });
    const selectedInputSource =
      inputSources.find(
        (source) => source.id === this.state.debugInputSourceId,
      ) ??
      inputSources[0] ??
      null;
    const pinnedOutputValue =
      this.state.pinnedTestOutput?.workflowId === (workflow.id ?? "") &&
      this.state.pinnedTestOutput.nodeId === node.id
        ? this.state.pinnedTestOutput.outputSnapshot
        : undefined;
    const outputValue =
      execution !== null
        ? persistedRun?.outputSnapshot
        : (liveRun?.outputSnapshot ??
          (liveRun?.outputText.trim().length
            ? liveRun.outputText
            : undefined) ??
          pinnedOutputValue);
    const debugStatus = liveRun?.status ?? persistedRun?.status;
    const statusTone = readWorkflowDebugStatusTone({
      ...(debugStatus ? { status: debugStatus } : {}),
      alertsCount: liveRun?.alerts.length ?? persistedRun?.alerts.length ?? 0,
      findingsCount:
        liveRun?.guardrailFindings.length ??
        persistedRun?.guardrailFindings.length ??
        0,
    });

    return {
      node,
      workflow,
      execution,
      liveRun,
      outputValue,
      inputSources,
      selectedInputSource,
      statusTone,
      statusLabel: readWorkflowDebugStatusLabel(statusTone),
    };
  }

  private readWorkflowDebugExecution(): WorkflowExecutionRecord | null {
    const workflowId = this.state.draftWorkflow?.id;
    if (!workflowId) {
      return null;
    }

    const canvasExecution = this.readWorkflowCanvasExecution();
    if (canvasExecution) {
      return canvasExecution;
    }

    return selectWorkflowDebugExecution({
      workflowId,
      activeExecutionId:
        this.state.debugExecutionId ??
        this.readWorkflowActiveExecutionId(workflowId),
      selectedExecutionId:
        this.state.selection.type === "execution"
          ? this.state.selection.id
          : null,
      liveExecutionId: this.state.liveExecution?.workflowRunId ?? null,
      executions: this.state.executions,
    });
  }

  private readWorkflowCanvasExecution(): WorkflowExecutionRecord | null {
    const workflowId = this.state.draftWorkflow?.id;
    if (!workflowId) {
      return null;
    }

    return selectWorkflowCanvasExecution({
      workflowId,
      liveExecutionId: this.state.liveExecution?.workflowRunId ?? null,
      selectedExecutionId:
        this.state.selection.type === "execution"
          ? this.state.selection.id
          : null,
      executions: this.state.executions,
    });
  }

  private readWorkflowHasActiveExecution(workflowId: string): boolean {
    return this.readWorkflowActiveExecutionId(workflowId) !== null;
  }

  private readWorkflowActiveExecutionId(workflowId: string): string | null {
    const liveStatus =
      this.state.liveExecution?.workflowId === workflowId
        ? this.state.liveExecution.status
        : null;
    if (readWorkflowExecutionIsActive(liveStatus)) {
      return this.state.liveExecution?.workflowRunId ?? null;
    }

    return (
      this.state.executions.find(
        (execution) =>
          execution.workflowId === workflowId &&
          readWorkflowExecutionIsActive(execution.status),
      )?.id ?? null
    );
  }

  private readWorkflowDebugOutputMap(
    execution: WorkflowExecutionRecord | null,
  ): WorkflowDebugOutputMap {
    const entries = new Map<string, unknown>();
    for (const nodeRun of execution?.nodeRuns ?? []) {
      entries.set(nodeRun.nodeId, nodeRun.outputSnapshot);
    }

    if (execution) {
      return entries;
    }

    for (const [nodeId, liveRun] of Object.entries(
      this.state.liveExecution?.nodeRuns ?? {},
    )) {
      if (liveRun.outputSnapshot !== undefined) {
        entries.set(nodeId, liveRun.outputSnapshot);
      } else if (liveRun.outputText.trim().length > 0) {
        entries.set(nodeId, liveRun.outputText);
      }
    }

    if (
      this.state.pinnedTestOutput &&
      this.state.pinnedTestOutput.workflowId === this.state.draftWorkflow?.id
    ) {
      entries.set(
        this.state.pinnedTestOutput.nodeId,
        this.state.pinnedTestOutput.outputSnapshot,
      );
    }

    return entries;
  }

  private readSelectedNodeStepExecutionAvailability(): WorkflowStepExecutionAvailability {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    return readWorkflowStepExecutionAvailability({
      hasNodeSelection: this.state.selection.type === "node",
      hasCurrentProject: this.state.currentProject !== null,
      hasCurrentWorkflow: currentWorkflow !== null,
      hasDirtyWorkflow: this.state.dirtyWorkflow,
      dirtyAssetCount: this.state.dirtyAssetIds.length,
      hasPendingAction: this.state.pendingAction !== null,
      hasActiveExecution: currentWorkflow
        ? this.readWorkflowHasActiveExecution(currentWorkflow.id)
        : false,
    });
  }

  private async handleExecuteSelectedNodeStep(): Promise<void> {
    const selectedNode = this.readSelectedNode();
    if (!selectedNode) {
      return;
    }

    await this.handleExecuteNodeStep(selectedNode.id, "modal");
  }

  private async handleExecuteNodeStep(
    nodeId: string,
    source: "hover" | "modal",
  ): Promise<void> {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const projectId = this.state.currentProject?.id;
    const targetNode = currentWorkflow?.nodes.find(
      (node) => node.id === nodeId,
    );
    const launchState = readWorkflowNodeStepLaunchState(source);
    if (
      !targetNode ||
      !currentWorkflow ||
      !projectId ||
      this.readNodeHoverRunControlState(nodeId).disabled
    ) {
      return;
    }

    this.setState({
      pendingAction: PendingAction.RunWorkflow,
      liveExecution: createLiveExecutionState(currentWorkflow),
      debugExecutionId: null,
      errorMessage: null,
      noticeMessage: null,
      editorModalOpen: launchState.editorModalOpen,
      selection: { type: "node", id: targetNode.id },
    });
    this.cancelLiveExecutionStream();
    this.liveExecutionAbortController = new AbortController();

    try {
      await this.workflowClient.streamNode({
        workflowId: currentWorkflow.id,
        nodeId: targetNode.id,
        inputSource: this.readSelectedNodeExecutionInputSource(),
        seedNodeOutputs: this.readSelectedNodeSeedOutputs(
          currentWorkflow.id,
          targetNode.id,
        ),
        signal: this.liveExecutionAbortController.signal,
        onEvent: (event) => {
          this.handleWorkflowRunStreamEvent(event);
        },
      });
      await this.reloadCatalog(projectId);
      this.setState({
        pendingAction: null,
        liveExecution: null,
        selection: { type: "node", id: targetNode.id },
        debugExecutionId: this.readCompletedLiveExecution()?.id ?? null,
        editorModalOpen: launchState.editorModalOpen,
        errorMessage: null,
        noticeMessage: null,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not execute this step."),
        noticeMessage: null,
      });
    } finally {
      this.cancelLiveExecutionStream();
      void this.refreshServerLogs();
    }
  }

  private readSelectedNodeSeedOutputs(
    workflowId: string,
    targetNodeId: string,
  ): Readonly<Record<string, unknown>> {
    return readWorkflowStepSeedOutputs({
      workflow: this.state.draftWorkflow ?? { nodes: [], edges: [] },
      executionOutputs: this.readWorkflowDebugOutputMap(
        this.readWorkflowDebugExecution(),
      ),
      pinnedOutput: this.state.pinnedTestOutput,
      workflowId,
      targetNodeId,
    });
  }

  private readSelectedNodeExecutionInputSource(): WorkflowNodeExecutionInputSourceRecord {
    if (this.state.debugInputSourceId === "all-upstream") {
      return {
        kind: WorkflowNodeExecutionInputSourceKind.AllPrevious,
      };
    }

    if (this.state.debugInputSourceId.startsWith("node:")) {
      return {
        kind: WorkflowNodeExecutionInputSourceKind.NodeOutput,
        nodeId: this.state.debugInputSourceId.slice("node:".length),
      };
    }

    return {
      kind: WorkflowNodeExecutionInputSourceKind.LastUpstream,
    };
  }

  private renderNodeInspector(node: WorkflowNodeRecord): HTMLElement {
    const compatibleAssetKind = readNodeAssetKind(node.kind);
    const compatibleAssets = compatibleAssetKind
      ? this.state.assets.filter((asset) => asset.kind === compatibleAssetKind)
      : [];
    const guardrailAssets = this.state.assets.filter(
      (asset) => asset.kind === WorkflowAssetKind.Guardrail,
    );
    const linkedAsset = node.config.assetId
      ? (compatibleAssets.find((asset) => asset.id === node.config.assetId) ??
        null)
      : null;

    return createElement("div", { className: "flex flex-col gap-4" }, [
      this.renderInspectorField(
        "Node label",
        node.label,
        (value) => {
          this.patchNode(node.id, (current) => ({
            ...current,
            label: value,
          }));
        },
        WorkflowScreenSelector.NodeLabelInput,
      ),
      this.renderReadOnlyBadgeRow(
        node.kind,
        readNodeInputPorts(node).length,
        node.outputPorts.length,
      ),
      compatibleAssetKind
        ? createElement(
            "div",
            {
              className:
                "flex flex-col gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
            },
            [
              createElement(
                "div",
                { className: "flex items-center justify-between gap-3" },
                [
                  createElement(
                    "span",
                    { className: "text-sm font-medium text-white" },
                    [`${readAssetKindLabel(compatibleAssetKind)} binding`],
                  ),
                  createElement(Button, {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => {
                      void this.handleCreateAsset(compatibleAssetKind, node.id);
                    },
                    children: "New asset",
                  }),
                ],
              ),
              this.renderInspectorSelect(
                "Asset",
                linkedAsset?.id ?? "",
                compatibleAssets.map((asset) => asset.id),
                (value) => {
                  const asset = compatibleAssets.find(
                    (entry) => entry.id === value,
                  );
                  if (!asset) {
                    return;
                  }
                  this.patchNode(node.id, (current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      assetId: asset.id,
                    },
                  }));
                  this.setState({ selection: { type: "node", id: node.id } });
                },
                compatibleAssets.map((asset) => ({
                  value: asset.id,
                  label: asset.name,
                })),
              ),
              linkedAsset
                ? this.renderEmbeddedAssetEditor(linkedAsset)
                : createElement(
                    "p",
                    { className: "text-xs text-text-secondary" },
                    ["Select or create an asset to author this node."],
                  ),
            ],
          )
        : "",
      node.kind === WorkflowNodeKind.AiAgent
        ? this.renderAgentConfig(node)
        : "",
      node.kind === WorkflowNodeKind.AiProviderRun
        ? this.renderProviderRunConfig(node)
        : "",
      node.kind === WorkflowNodeKind.HumanReview
        ? this.renderReviewConfig(node)
        : "",
      isOutputContractCapableNode(node.kind)
        ? this.renderNodeOutputContractSection(node)
        : "",
      this.renderNodeInputMappingSection(node),
      node.kind !== WorkflowNodeKind.TriggerManual &&
      node.kind !== WorkflowNodeKind.TerminalResponse
        ? this.renderGuardrailAttachmentSection(node, guardrailAssets)
        : "",
    ]);
  }

  private renderNodeOutputContractSection(
    node: WorkflowNodeRecord,
  ): HTMLElement {
    const contract = node.outputContract ?? null;
    const validation = readJsonContractValidation(contract);
    const pathCount = contract
      ? readJsonSchemaPaths(contract.schema).length
      : 0;

    return this.renderQuickEditorCard({
      title: "JSON output contract",
      description: validation.valid
        ? `${pathCount.toString()} paths available for downstream mappings.`
        : validation.message,
      status: validation.valid ? "success" : "warning",
      statusLabel: validation.valid ? "Valid" : "Needs work",
      buttonLabel: "Open editor",
      testId: `${WorkflowScreenSelector.DeepEditorOpenPrefix}contract`,
      onOpen: () =>
        this.openDeepEditor(
          {
            type: "node",
            id: node.id,
          },
          "output",
        ),
    });
  }

  private renderQuickEditorCard(input: {
    title: string;
    description: string;
    status: "success" | "warning" | "info";
    statusLabel: string;
    buttonLabel: string;
    testId: string;
    onOpen: () => void;
  }): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-start justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "text-sm font-medium text-white" },
                [input.title],
              ),
              createElement(
                "p",
                { className: "mt-1 text-xs leading-5 text-text-secondary" },
                [input.description],
              ),
            ]),
            createElement(StatusBadge, { status: input.status }, [
              input.statusLabel,
            ]),
          ],
        ),
        createElement("div", { className: "mt-3 flex justify-end" }, [
          createElement(Button, {
            variant: "secondary",
            size: "sm",
            onClick: input.onOpen,
            children: input.buttonLabel,
            dataset: {
              testid: input.testId,
            },
          }),
        ]),
      ],
    );
  }

  private openDeepEditor(
    target: DeepEditorTarget,
    initialTab: DeepEditorTab = "prompt",
  ): void {
    const contract = this.readDeepEditorContract(target);
    this.setState({
      deepEditor: {
        target,
        tab: initialTab,
        outputTab: initialTab === "output" ? "visual" : "visual",
        rawContractText: contract
          ? formatJsonOutputContractDocument(contract)
          : "",
        rawContractError: null,
        variableSearchQuery: "",
        promptSelectionStart: 0,
        promptSelectionEnd: 0,
        sampleSelectionStart: 0,
        sampleSelectionEnd: 0,
      },
      errorMessage: null,
    });
  }

  private closeDeepEditor(): void {
    this.setState({
      deepEditor: null,
    });
  }

  private openRegexTester(input: RegexTesterState): void {
    this.setState({
      regexTester: input,
      errorMessage: null,
    });
  }

  private patchRegexTester(patch: Partial<RegexTesterState>): void {
    if (!this.state.regexTester) {
      return;
    }

    this.setState({
      regexTester: {
        ...this.state.regexTester,
        ...patch,
      },
    });
  }

  private closeRegexTester(): void {
    this.setState({
      regexTester: null,
    });
  }

  private renderDeepEditorModal(): HTMLElement {
    const deepEditor = this.state.deepEditor;
    if (!deepEditor) {
      return createElement("div");
    }

    const targetTitle = this.readDeepEditorTitle(deepEditor.target);
    const promptValue = this.readDeepEditorPromptValue(deepEditor.target);
    const contract = this.readDeepEditorContract(deepEditor.target);
    const variableGroups = this.readDeepEditorVariableGroups(deepEditor.target);
    const filteredVariableGroups = readFilteredWorkflowVariableGroups(
      variableGroups,
      deepEditor.variableSearchQuery,
    );
    const variableMatchCount = readWorkflowVariableTokenCount(
      filteredVariableGroups,
    );
    const sampleOutputValue = contract?.sampleOutput ?? "";

    return createElement(
      "div",
      {
        className: "fixed inset-0 z-50 bg-black/70 p-3 md:p-6",
        onClick: () => this.closeDeepEditor(),
        "data-testid": WorkflowScreenSelector.DeepEditorModal,
      },
      [
        createElement(
          "div",
          {
            className:
              "mx-auto flex h-full w-full max-w-[1460px] flex-col overflow-hidden rounded-xl border border-border-dark bg-[#0f141a] shadow-2xl",
            onClick: (event: Event) => event.stopPropagation(),
          },
          [
            createElement(
              "div",
              {
                className:
                  "flex items-center justify-between border-b border-border-dark px-4 py-3",
              },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "truncate text-sm font-semibold text-white" },
                    [targetTitle],
                  ),
                  createElement(
                    "p",
                    { className: "truncate text-xs text-text-secondary" },
                    [
                      "Deep authoring modal. Quick edits stay in inspector; full prompt/schema work happens here.",
                    ],
                  ),
                ]),
                createElement(IconButton, {
                  icon: "close",
                  tooltip: "Close editor",
                  onClick: () => this.closeDeepEditor(),
                  dataset: {
                    testid: WorkflowScreenSelector.DeepEditorClose,
                  },
                }),
              ],
            ),
            createElement(
              "div",
              {
                className:
                  "flex items-center gap-2 border-b border-border-dark px-4 py-2",
              },
              [
                this.renderDeepEditorTabButton(
                  "Prompt",
                  "prompt",
                  WorkflowScreenSelector.DeepEditorTabPrompt,
                ),
                this.renderDeepEditorTabButton(
                  "Output",
                  "output",
                  WorkflowScreenSelector.DeepEditorTabOutput,
                ),
                this.renderDeepEditorTabButton(
                  "Preview",
                  "preview",
                  WorkflowScreenSelector.DeepEditorTabPreview,
                ),
              ],
            ),
            createElement(
              "div",
              {
                className:
                  "grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]",
              },
              [
                createElement(
                  "div",
                  {
                    className: "min-h-0 overflow-y-auto p-4",
                  },
                  [
                    deepEditor.tab === "prompt"
                      ? this.renderDeepEditorPromptPane(promptValue)
                      : deepEditor.tab === "output"
                        ? this.renderDeepEditorOutputPane(
                            contract,
                            sampleOutputValue,
                          )
                        : this.renderDeepEditorPreviewPane(
                            promptValue,
                            contract,
                          ),
                  ],
                ),
                createElement(
                  "aside",
                  {
                    className:
                      "min-h-0 overflow-y-auto border-t border-border-dark bg-[#121820] p-4 lg:border-l lg:border-t-0",
                  },
                  [
                    createElement(
                      "p",
                      { className: "text-sm font-medium text-white" },
                      ["Variables"],
                    ),
                    createElement(
                      "p",
                      {
                        className: "mt-1 text-xs leading-5 text-text-secondary",
                      },
                      [
                        "Click or drag variables into prompt or output template fields. Raw schema JSON stays explicit and recoverable.",
                      ],
                    ),
                    this.renderVariableSearchControl(
                      deepEditor.variableSearchQuery,
                      variableMatchCount,
                    ),
                    createElement(
                      "div",
                      { className: "mt-4 flex flex-col gap-3" },
                      [
                        filteredVariableGroups.length === 0
                          ? this.renderVariableSearchEmptyState()
                          : filteredVariableGroups.map((group) =>
                              this.renderVariableGroup(group),
                            ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  private renderDeepEditorTabButton(
    label: string,
    tab: DeepEditorTab,
    testId: string,
  ): HTMLElement {
    const active = this.state.deepEditor?.tab === tab;

    return createElement(Button, {
      variant: active ? "secondary" : "ghost",
      size: "sm",
      onClick: () => {
        if (!this.state.deepEditor) {
          return;
        }
        this.setState({
          deepEditor: {
            ...this.state.deepEditor,
            tab,
          },
        });
      },
      children: label,
      dataset: {
        testid: testId,
      },
    });
  }

  private renderDeepEditorPromptPane(promptValue: string): HTMLElement {
    return createElement("div", { className: "flex h-full flex-col gap-4" }, [
      createElement(
        "div",
        {
          className:
            "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3",
        },
        [
          createElement("p", { className: "text-sm font-medium text-white" }, [
            "Prompt or body",
          ]),
          createElement(
            "p",
            { className: "mt-1 text-xs leading-5 text-text-secondary" },
            [
              "Use variables from prior outputs, current input, workflow context, or reusable assets. Canonical insertion tokens stay compact for downstream providers.",
            ],
          ),
        ],
      ),
      createElement("textarea", {
        className:
          "min-h-[420px] w-full resize-y rounded-lg border border-border-dark bg-[#0d1117] px-4 py-3 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40",
        value: promptValue,
        onInput: (event: Event) => {
          const target = event.target;
          if (!(target instanceof HTMLTextAreaElement)) {
            return;
          }
          this.updateDeepEditorPromptValue(target.value);
          this.setDeepEditorSelection(
            "prompt",
            target.selectionStart,
            target.selectionEnd,
          );
        },
        onClick: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLTextAreaElement) {
            this.setDeepEditorSelection(
              "prompt",
              target.selectionStart,
              target.selectionEnd,
            );
          }
        },
        onKeyUp: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLTextAreaElement) {
            this.setDeepEditorSelection(
              "prompt",
              target.selectionStart,
              target.selectionEnd,
            );
          }
        },
        onDragOver: (event: DragEvent) => {
          event.preventDefault();
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          const tokenId = event.dataTransfer?.getData("text/plain") ?? "";
          this.handleVariableTokenInsert(tokenId, "prompt");
        },
        "data-testid": WorkflowScreenSelector.DeepEditorPromptInput,
      }),
      this.renderExpressionUsageHints(
        promptValue,
        WorkflowScreenSelector.DeepEditorPromptHints,
      ),
    ]);
  }

  private renderDeepEditorOutputPane(
    contract: JsonOutputContractRecord | null,
    sampleOutputValue: string,
  ): HTMLElement {
    const deepEditor = this.state.deepEditor;
    if (!deepEditor) {
      return createElement("div");
    }

    return createElement("div", { className: "flex h-full flex-col gap-4" }, [
      createElement("div", { className: "flex items-center gap-2" }, [
        createElement(Button, {
          variant: deepEditor.outputTab === "visual" ? "secondary" : "ghost",
          size: "sm",
          onClick: () => this.setDeepEditorOutputTab("visual"),
          children: "Visual",
          dataset: {
            testid: WorkflowScreenSelector.DeepEditorOutputTabVisual,
          },
        }),
        createElement(Button, {
          variant: deepEditor.outputTab === "json" ? "secondary" : "ghost",
          size: "sm",
          onClick: () => this.setDeepEditorOutputTab("json"),
          children: "Raw JSON",
          dataset: {
            testid: WorkflowScreenSelector.DeepEditorOutputTabJson,
          },
        }),
      ]),
      deepEditor.outputTab === "visual" && contract
        ? this.renderOutputContractEditor({
            title: "JSON output contract",
            description:
              "Visual tree and raw JSON share one canonical schema model.",
            contract,
            selectors: NodeOutputContractEditorSelectors,
            onRename: (name) =>
              this.updateDeepEditorContract((current) => ({
                ...current,
                name,
              })),
            onChangeContract: (updater) =>
              this.updateDeepEditorContract(updater),
          })
        : "",
      deepEditor.outputTab === "json"
        ? createElement(
            "div",
            {
              className:
                "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3",
            },
            [
              createElement(
                "div",
                { className: "flex items-center justify-between gap-3" },
                [
                  createElement("div", { className: "min-w-0" }, [
                    createElement(
                      "p",
                      { className: "text-sm font-medium text-white" },
                      ["Raw contract JSON"],
                    ),
                    createElement(
                      "p",
                      {
                        className: "mt-1 text-xs leading-5 text-text-secondary",
                      },
                      [
                        "Fallback editor chosen after validating that raw ESM runtime makes Monaco/CodeMirror integration risky for this slice.",
                      ],
                    ),
                  ]),
                  createElement(Button, {
                    variant: "secondary",
                    size: "sm",
                    onClick: () => this.applyDeepEditorRawJson(),
                    children: "Apply JSON",
                    dataset: {
                      testid: WorkflowScreenSelector.DeepEditorApplyRawJson,
                    },
                  }),
                ],
              ),
              createElement("textarea", {
                className:
                  "mt-3 min-h-[360px] w-full resize-y rounded-lg border border-border-dark bg-[#0d1117] px-4 py-3 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40",
                value: deepEditor.rawContractText,
                onInput: (event: Event) => {
                  const target = event.target;
                  if (!(target instanceof HTMLTextAreaElement)) {
                    return;
                  }
                  this.setState({
                    deepEditor: this.state.deepEditor
                      ? {
                          ...this.state.deepEditor,
                          rawContractText: target.value,
                          rawContractError: null,
                        }
                      : null,
                  });
                },
                "data-testid": WorkflowScreenSelector.DeepEditorRawJsonInput,
              }),
              deepEditor.rawContractError
                ? createElement(
                    "p",
                    {
                      className:
                        "mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100",
                    },
                    [deepEditor.rawContractError],
                  )
                : createElement(
                    "p",
                    { className: "mt-3 text-xs text-text-secondary" },
                    [
                      "Apply updates after editing raw JSON to keep schema tree and provider payload in sync.",
                    ],
                  ),
            ],
          )
        : "",
      createElement(
        "div",
        {
          className:
            "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3",
        },
        [
          createElement("p", { className: "text-sm font-medium text-white" }, [
            "Output template / sample",
          ]),
          createElement(
            "p",
            { className: "mt-1 text-xs leading-5 text-text-secondary" },
            [
              "Optional sample payload or template. Click or drag variables into this field.",
            ],
          ),
          createElement("textarea", {
            className:
              "mt-3 min-h-[180px] w-full resize-y rounded-lg border border-border-dark bg-[#0d1117] px-4 py-3 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40",
            value: sampleOutputValue,
            onInput: (event: Event) => {
              const target = event.target;
              if (!(target instanceof HTMLTextAreaElement)) {
                return;
              }
              this.updateDeepEditorContract((current) => ({
                ...current,
                sampleOutput: target.value,
              }));
              this.setDeepEditorSelection(
                "sample",
                target.selectionStart,
                target.selectionEnd,
              );
            },
            onClick: (event: Event) => {
              const target = event.target;
              if (target instanceof HTMLTextAreaElement) {
                this.setDeepEditorSelection(
                  "sample",
                  target.selectionStart,
                  target.selectionEnd,
                );
              }
            },
            onKeyUp: (event: Event) => {
              const target = event.target;
              if (target instanceof HTMLTextAreaElement) {
                this.setDeepEditorSelection(
                  "sample",
                  target.selectionStart,
                  target.selectionEnd,
                );
              }
            },
            onDragOver: (event: DragEvent) => {
              event.preventDefault();
            },
            onDrop: (event: DragEvent) => {
              event.preventDefault();
              const tokenId = event.dataTransfer?.getData("text/plain") ?? "";
              this.handleVariableTokenInsert(tokenId, "sample");
            },
            "data-testid": WorkflowScreenSelector.DeepEditorSampleOutputInput,
          }),
        ],
      ),
    ]);
  }

  private renderDeepEditorPreviewPane(
    promptValue: string,
    contract: JsonOutputContractRecord | null,
  ): HTMLElement {
    const paths = contract ? readJsonSchemaPaths(contract.schema) : [];
    const providerSchema = contract
      ? serializeJsonContractForProvider(contract)
      : null;

    return createElement("div", { className: "flex flex-col gap-4" }, [
      createElement(
        "div",
        {
          className:
            "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3",
        },
        [
          createElement("p", { className: "text-sm font-medium text-white" }, [
            "Prompt preview",
          ]),
          createElement(
            "pre",
            {
              className:
                "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border-dark bg-[#0d1117] px-3 py-3 font-mono text-xs leading-6 text-slate-200",
            },
            [promptValue.length > 0 ? promptValue : "No prompt text yet."],
          ),
        ],
      ),
      createElement(
        "div",
        {
          className:
            "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3",
        },
        [
          createElement("p", { className: "text-sm font-medium text-white" }, [
            "Available output paths",
          ]),
          paths.length === 0
            ? createElement(
                "p",
                { className: "mt-2 text-xs text-text-secondary" },
                ["No contract paths yet."],
              )
            : createElement("div", { className: "mt-3 flex flex-wrap gap-2" }, [
                paths.map((path) =>
                  createElement(
                    "span",
                    {
                      key: path,
                      className:
                        "rounded-md border border-border-dark bg-[#0d1117] px-2 py-1 font-mono text-xs text-slate-200",
                    },
                    [path],
                  ),
                ),
              ]),
        ],
      ),
      createElement(
        "div",
        {
          className:
            "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3",
        },
        [
          createElement("p", { className: "text-sm font-medium text-white" }, [
            "Compact provider payload",
          ]),
          createElement(
            "pre",
            {
              className:
                "mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border-dark bg-[#0d1117] px-3 py-3 font-mono text-[11px] leading-5 text-slate-200",
            },
            [providerSchema ? JSON.stringify(providerSchema, null, 2) : "{}"],
          ),
        ],
      ),
    ]);
  }

  private renderVariableSearchControl(
    value: string,
    matchCount: number,
  ): HTMLElement {
    const hasQuery = value.trim().length > 0;

    return createElement("label", { className: "mt-3 block" }, [
      createElement("span", { className: "sr-only" }, ["Search variables"]),
      createElement("input", {
        type: "search",
        value,
        placeholder: "Search variables...",
        className:
          "w-full rounded-md border border-border-dark bg-[#0f141a] px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-text-muted focus:border-primary",
        onInput: (event: Event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) {
            return;
          }
          this.updateDeepEditorVariableSearch(target.value);
        },
        "data-testid": WorkflowScreenSelector.VariableSearchInput,
      }),
      hasQuery
        ? createElement(
            "span",
            { className: "mt-2 block text-[11px] text-text-secondary" },
            [`${matchCount} matching variable${matchCount === 1 ? "" : "s"}`],
          )
        : "",
    ]);
  }

  private renderVariableSearchEmptyState(): HTMLElement {
    return createElement(
      "p",
      {
        className:
          "rounded-lg border border-dashed border-border-dark bg-[#0f141a] px-3 py-4 text-xs text-text-secondary",
      },
      ["No variables match this search."],
    );
  }

  private renderExpressionUsageHints(
    value: string,
    testId: string,
  ): string | HTMLElement {
    const hints = readWorkflowExpressionUsageHints({
      value,
      resolveSourceLabel: (sourceId) =>
        this.readWorkflowExpressionSourceLabel(sourceId),
    });

    if (hints.length === 0) {
      return "";
    }

    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#101720] px-3 py-3",
        "data-testid": testId,
      },
      [
        createElement(
          "p",
          {
            className:
              "text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary",
          },
          ["Expression previews"],
        ),
        createElement("div", { className: "mt-2 flex flex-wrap gap-2" }, [
          hints.map((hint) =>
            createElement(
              "span",
              {
                key: hint.id,
                className:
                  "inline-flex max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] text-slate-100",
                "data-testid": `${WorkflowScreenSelector.ExpressionHintPrefix}${hint.id}`,
              },
              [
                createElement("span", { className: "shrink-0 text-primary" }, [
                  hint.kindLabel,
                ]),
                createElement(
                  "span",
                  { className: "truncate text-text-secondary" },
                  [hint.label],
                ),
                createElement(
                  "code",
                  { className: "shrink-0 font-mono text-slate-100" },
                  [hint.detail],
                ),
              ],
            ),
          ),
        ]),
      ],
    );
  }

  private renderVariableGroup(group: WorkflowVariableGroup): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#0f141a] px-3 py-3",
      },
      [
        createElement(
          "p",
          {
            className:
              "text-xs font-semibold uppercase tracking-wide text-text-secondary",
          },
          [group.label],
        ),
        group.tokens.length === 0
          ? createElement(
              "p",
              { className: "mt-2 text-xs text-text-secondary" },
              ["No variables available."],
            )
          : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              group.tokens.map((token) =>
                createElement(
                  "button",
                  {
                    key: token.id,
                    type: "button",
                    className:
                      "rounded-md border border-border-dark bg-[#151b22] px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-[#19212b]",
                    draggable: true,
                    onClick: () =>
                      this.handleVariableTokenInsert(
                        token.id,
                        this.state.deepEditor?.tab === "output"
                          ? "sample"
                          : "prompt",
                      ),
                    onDragstart: (event: DragEvent) => {
                      event.dataTransfer?.setData("text/plain", token.id);
                    },
                    "data-testid": `${WorkflowScreenSelector.VariableTokenPrefix}${token.id}`,
                  },
                  [
                    createElement(
                      "span",
                      { className: "block font-mono text-xs text-slate-100" },
                      [token.label],
                    ),
                    createElement(
                      "span",
                      {
                        className: "mt-1 block text-[11px] text-text-secondary",
                      },
                      [token.detail],
                    ),
                  ],
                ),
              ),
            ]),
      ],
    );
  }

  private updateDeepEditorVariableSearch(variableSearchQuery: string): void {
    if (!this.state.deepEditor) {
      return;
    }

    this.setState({
      deepEditor: {
        ...this.state.deepEditor,
        variableSearchQuery,
      },
    });
  }

  private setDeepEditorOutputTab(outputTab: DeepEditorOutputTab): void {
    if (!this.state.deepEditor) {
      return;
    }

    this.setState({
      deepEditor: {
        ...this.state.deepEditor,
        outputTab,
      },
    });
  }

  private setDeepEditorSelection(
    field: "prompt" | "sample",
    selectionStart: number,
    selectionEnd: number,
  ): void {
    if (!this.state.deepEditor) {
      return;
    }

    this.setState({
      deepEditor: {
        ...this.state.deepEditor,
        ...(field === "prompt"
          ? {
              promptSelectionStart: selectionStart,
              promptSelectionEnd: selectionEnd,
            }
          : {
              sampleSelectionStart: selectionStart,
              sampleSelectionEnd: selectionEnd,
            }),
      },
    });
  }

  private updateDeepEditorPromptValue(value: string): void {
    const deepEditor = this.state.deepEditor;
    if (!deepEditor) {
      return;
    }

    if (deepEditor.target.type === "node") {
      this.patchNode(deepEditor.target.id, (current) => ({
        ...current,
        config: {
          ...current.config,
          prompt: value,
        },
      }));
      return;
    }

    this.patchAsset(deepEditor.target.id, (current) => ({
      ...current,
      body: value,
    }));
  }

  private updateDeepEditorContract(
    updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord,
  ): void {
    const deepEditor = this.state.deepEditor;
    if (!deepEditor) {
      return;
    }

    if (deepEditor.target.type === "node") {
      if (!this.state.draftWorkflow) {
        return;
      }
      const nextWorkflow = updateWorkflowNodeOutputContract(
        this.state.draftWorkflow,
        deepEditor.target.id,
        updater,
      );
      const nextNode = nextWorkflow.nodes.find(
        (node) => node.id === deepEditor.target.id,
      );
      this.updateDraftWorkflow(nextWorkflow, {
        type: "node",
        id: deepEditor.target.id,
      });
      this.setState({
        deepEditor: {
          ...deepEditor,
          rawContractText: nextNode?.outputContract
            ? formatJsonOutputContractDocument(nextNode.outputContract)
            : deepEditor.rawContractText,
          rawContractError: null,
        },
      });
      return;
    }

    this.patchAsset(deepEditor.target.id, (current) => {
      if (!current.outputContract) {
        return current;
      }
      const nextContract = updater(current.outputContract);
      return {
        ...current,
        outputContract: nextContract,
      };
    });
    const asset = this.state.assets.find(
      (entry) => entry.id === deepEditor.target.id,
    );
    const nextContract = asset?.outputContract
      ? updater(asset.outputContract)
      : null;
    this.setState({
      deepEditor: {
        ...deepEditor,
        rawContractText: nextContract
          ? formatJsonOutputContractDocument(nextContract)
          : deepEditor.rawContractText,
        rawContractError: null,
      },
    });
  }

  private applyDeepEditorRawJson(): void {
    const deepEditor = this.state.deepEditor;
    if (!deepEditor) {
      return;
    }

    const contract = this.readDeepEditorContract(deepEditor.target);
    if (!contract) {
      return;
    }

    const parsed = parseJsonOutputContractDocument(
      deepEditor.rawContractText,
      contract,
    );
    if (!parsed.success) {
      this.setState({
        deepEditor: {
          ...deepEditor,
          rawContractError: parsed.error,
        },
      });
      return;
    }

    this.updateDeepEditorContract(() => parsed.contract);
  }

  private handleVariableTokenInsert(
    tokenId: string,
    targetField: "prompt" | "sample",
  ): void {
    const deepEditor = this.state.deepEditor;
    if (!deepEditor) {
      return;
    }

    const token = this.readDeepEditorVariableGroups(deepEditor.target)
      .flatMap((group) => group.tokens)
      .find((entry) => entry.id === tokenId);
    if (!token) {
      return;
    }

    if (targetField === "prompt") {
      const promptValue = this.readDeepEditorPromptValue(deepEditor.target);
      const inserted = insertWorkflowExpressionVariable({
        value: promptValue,
        selectionStart: deepEditor.promptSelectionStart,
        selectionEnd: deepEditor.promptSelectionEnd,
        reference: token.reference,
      });
      this.updateDeepEditorPromptValue(inserted.value);
      this.setState({
        deepEditor: {
          ...deepEditor,
          promptSelectionStart: inserted.value.length,
          promptSelectionEnd: inserted.value.length,
        },
      });
      return;
    }

    const contract = this.readDeepEditorContract(deepEditor.target);
    if (!contract) {
      return;
    }
    const inserted = insertWorkflowExpressionVariable({
      value: contract.sampleOutput ?? "",
      selectionStart: deepEditor.sampleSelectionStart,
      selectionEnd: deepEditor.sampleSelectionEnd,
      reference: token.reference,
    });
    this.updateDeepEditorContract((current) => ({
      ...current,
      sampleOutput: inserted.value,
    }));
    this.setState({
      deepEditor: {
        ...deepEditor,
        sampleSelectionStart: inserted.value.length,
        sampleSelectionEnd: inserted.value.length,
      },
    });
  }

  private handleGuardrailVariableInsert(
    reference: WorkflowExpressionVariableReference,
  ): void {
    const inserted = insertWorkflowExpressionVariable({
      value: this.state.guardrailValidationValue,
      selectionStart: this.state.guardrailValidationValue.length,
      selectionEnd: this.state.guardrailValidationValue.length,
      reference,
    });
    this.setState({
      guardrailValidationValue: inserted.value,
    });
  }

  private readDeepEditorTitle(target: DeepEditorTarget): string {
    if (target.type === "node") {
      const node = this.state.draftWorkflow?.nodes.find(
        (entry) => entry.id === target.id,
      );
      return node ? `${node.label} editor` : "Node editor";
    }

    const asset = this.state.assets.find((entry) => entry.id === target.id);
    return asset ? `${asset.name} editor` : "Asset editor";
  }

  private readDeepEditorPromptValue(target: DeepEditorTarget): string {
    if (target.type === "node") {
      return (
        this.state.draftWorkflow?.nodes.find((entry) => entry.id === target.id)
          ?.config.prompt ?? ""
      );
    }

    return (
      this.state.assets.find((entry) => entry.id === target.id)?.body ?? ""
    );
  }

  private readWorkflowExpressionSourceLabel(
    sourceId: string,
  ): string | undefined {
    const workflowNode = this.state.draftWorkflow?.nodes.find(
      (node) => node.id === sourceId,
    );
    if (workflowNode) {
      return workflowNode.label;
    }

    return this.state.assets.find((asset) => asset.id === sourceId)?.name;
  }

  private readDeepEditorContract(
    target: DeepEditorTarget,
  ): JsonOutputContractRecord | null {
    if (target.type === "node") {
      return (
        this.state.draftWorkflow?.nodes.find((entry) => entry.id === target.id)
          ?.outputContract ?? null
      );
    }

    return (
      this.state.assets.find((entry) => entry.id === target.id)
        ?.outputContract ?? null
    );
  }

  private readDeepEditorVariableGroups(
    target: DeepEditorTarget,
  ): ReadonlyArray<WorkflowVariableGroup> {
    const workflow = this.state.draftWorkflow;
    const targetNodeId = target.type === "node" ? target.id : null;
    const upstreamNodeIds =
      workflow && targetNodeId
        ? new Set(readWorkflowConnectedUpstreamNodeIds(workflow, targetNodeId))
        : null;
    const upstreamTokens = workflow
      ? workflow.nodes
          .filter(
            (node) =>
              node.id !== targetNodeId &&
              (upstreamNodeIds === null || upstreamNodeIds.has(node.id)),
          )
          .flatMap((node) =>
            readWorkflowNodeSelectableOutputPaths(node).map((path) => ({
              id: `node-${node.id}-${path}`,
              label: `${node.label} · ${path}`,
              detail: "Previous node output",
              reference: {
                kind: WorkflowExpressionVariableKind.NodeOutput,
                sourceId: node.id,
                path,
              } satisfies WorkflowExpressionVariableReference,
            })),
          )
      : [];
    const incomingTokens =
      workflow && targetNodeId
        ? workflow.edges
            .filter((edge) => edge.targetNodeId === targetNodeId)
            .flatMap((edge) => {
              const sourceNode = workflow.nodes.find(
                (node) => node.id === edge.sourceNodeId,
              );
              const sourcePaths = sourceNode
                ? readWorkflowNodeSelectableOutputPaths(sourceNode)
                : [];
              const paths = [
                "$",
                ...sourcePaths.filter((path) => path !== "$"),
              ];
              return paths.map((path) => ({
                id: `input-${edge.id}-${path}`,
                label: path,
                detail: sourceNode
                  ? `Current input via ${sourceNode.label}`
                  : "Current input",
                reference: {
                  kind: WorkflowExpressionVariableKind.CurrentInput,
                  path,
                } satisfies WorkflowExpressionVariableReference,
              }));
            })
        : [];
    const lastOutputTokens: ReadonlyArray<WorkflowVariableToken> =
      targetNodeId === null || incomingTokens.length === 0
        ? []
        : [
            {
              id: "last-output-root",
              label: "Last upstream output · $",
              detail: "Latest connected node output",
              reference: {
                kind: WorkflowExpressionVariableKind.LastNodeOutput,
                path: "$",
              } satisfies WorkflowExpressionVariableReference,
            },
          ];
    const accumulatedOutputTokens: ReadonlyArray<WorkflowVariableToken> =
      workflow && upstreamNodeIds && upstreamNodeIds.size > 0
        ? [
            {
              id: "accumulated-outputs-root",
              label: "All previous outputs · $",
              detail: "Accumulated outputs",
              reference: {
                kind: WorkflowExpressionVariableKind.AccumulatedOutputs,
                path: "$",
              } satisfies WorkflowExpressionVariableReference,
            },
            ...workflow.nodes
              .filter((node) => upstreamNodeIds.has(node.id))
              .flatMap((node) =>
                readWorkflowNodeSelectableOutputPaths(node).map((path) => ({
                  id: `accumulated-${node.id}-${path}`,
                  label: `${node.label} · ${readAccumulatedOutputPath(node.id, path)}`,
                  detail: "Accumulated output path",
                  reference: {
                    kind: WorkflowExpressionVariableKind.AccumulatedOutputs,
                    path: readAccumulatedOutputPath(node.id, path),
                  } satisfies WorkflowExpressionVariableReference,
                })),
              ),
          ]
        : [];
    const contextTokens: ReadonlyArray<WorkflowVariableToken> = [
      {
        id: "context-workflow-name",
        label: "$.workflow.name",
        detail: "Workflow context",
        reference: {
          kind: WorkflowExpressionVariableKind.WorkflowContext,
          path: "$.workflow.name",
        },
      },
      {
        id: "context-workflow-language",
        label: "$.workflow.language",
        detail: "Workflow context",
        reference: {
          kind: WorkflowExpressionVariableKind.WorkflowContext,
          path: "$.workflow.language",
        },
      },
    ];
    const assetTokens = this.state.assets
      .filter((asset) => asset.outputContract)
      .flatMap((asset) =>
        readJsonSchemaPaths(
          asset.outputContract?.schema ?? createJsonSchemaNode("object"),
        ).map((path) => ({
          id: `asset-${asset.id}-${path}`,
          label: `${asset.name} · ${path}`,
          detail: "Reusable asset output",
          reference: {
            kind: WorkflowExpressionVariableKind.AssetOutput,
            sourceId: asset.id,
            path,
          } satisfies WorkflowExpressionVariableReference,
        })),
      );

    return [
      {
        id: "current-input",
        label: "Current input",
        tokens: incomingTokens,
      },
      {
        id: "last-output",
        label: "Last upstream output",
        tokens: lastOutputTokens,
      },
      {
        id: "previous-outputs",
        label: "Previous node outputs",
        tokens: upstreamTokens,
      },
      {
        id: "accumulated-outputs",
        label: "Accumulated outputs",
        tokens: accumulatedOutputTokens,
      },
      {
        id: "workflow-context",
        label: "Workflow context",
        tokens: contextTokens,
      },
      {
        id: "reusable-assets",
        label: "Reusable assets",
        tokens: assetTokens,
      },
    ];
  }

  private renderNodeInputMappingSection(node: WorkflowNodeRecord): HTMLElement {
    const workflow = this.state.draftWorkflow;
    const incomingEdges =
      workflow?.edges.filter((edge) => edge.targetNodeId === node.id) ?? [];

    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-start justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "text-sm font-medium text-white" },
                ["Input mapping"],
              ),
              createElement(
                "p",
                { className: "mt-1 text-xs leading-5 text-text-secondary" },
                [
                  "Map prior node outputs into this node input. Passthrough remains valid when no explicit entry is configured.",
                ],
              ),
            ]),
            createElement(
              StatusBadge,
              { status: incomingEdges.length > 0 ? "info" : "warning" },
              [
                `${incomingEdges.length} input${incomingEdges.length === 1 ? "" : "s"}`,
              ],
            ),
          ],
        ),
        createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
          incomingEdges.length === 0
            ? createElement(
                "p",
                {
                  className:
                    "rounded-md border border-dashed border-border-dark px-3 py-3 text-xs text-text-secondary",
                },
                ["Connect an upstream node before configuring mappings."],
              )
            : incomingEdges.map((edge) => this.renderEdgeMappingEditor(edge)),
        ]),
      ],
    );
  }

  private renderEdgeMappingEditor(
    edge: WorkflowDefinitionUpsertInput["edges"][number],
  ): HTMLElement {
    const workflow = this.state.draftWorkflow;
    const sourceNode = workflow?.nodes.find(
      (node) => node.id === edge.sourceNodeId,
    );
    const selectableSourcePaths = sourceNode
      ? readWorkflowNodeSelectableOutputPaths(sourceNode)
      : [];
    const sourcePaths = [
      LatestResponseSourcePath,
      ...(selectableSourcePaths.length > 0
        ? selectableSourcePaths
        : ["$.result"]),
      AccumulatedOutputsSourcePath,
      ...(sourceNode
        ? selectableSourcePaths.map(
            (path) =>
              `${AccumulatedOutputsSourcePrefix}$.${sourceNode.id}${path.replace(/^\$/u, "")}`,
          )
        : []),
    ];

    return createElement(
      "div",
      {
        className:
          "rounded-md border border-border-dark bg-[#0f1318] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-center justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "truncate text-sm font-medium text-white" },
                [sourceNode ? `${sourceNode.label} output` : edge.sourceNodeId],
              ),
              createElement("p", { className: "text-xs text-text-secondary" }, [
                `${edge.mapping.mode} · ${edge.mapping.entries.length} mapping${edge.mapping.entries.length === 1 ? "" : "s"}`,
              ]),
            ]),
          ],
        ),
        createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, [
          this.renderInspectorField(
            "Target path",
            this.state.mappingTargetPath,
            (value) => {
              this.setState({ mappingTargetPath: value });
            },
            WorkflowScreenSelector.MappingTargetPathInput,
          ),
          this.renderInspectorSelect(
            "Source path",
            this.state.mappingSourcePath,
            sourcePaths,
            (value) => {
              this.setState({ mappingSourcePath: value });
            },
            sourcePaths.map((path) => ({
              value: path,
              label:
                path === LatestResponseSourcePath
                  ? LatestResponseSourceLabel
                  : path === AccumulatedOutputsSourcePath
                    ? AccumulatedOutputsSourceLabel
                    : path.startsWith(AccumulatedOutputsSourcePrefix)
                      ? `All previous · ${path.slice(AccumulatedOutputsSourcePrefix.length)}`
                      : path,
            })),
            WorkflowScreenSelector.MappingSourcePathInput,
          ),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          className: "mt-3",
          disabled:
            this.state.mappingTargetPath.trim().length === 0 ||
            this.state.mappingSourcePath.trim().length === 0,
          onClick: () => this.handleAddMappingEntry(edge),
          children: "Add mapping",
          dataset: {
            testid: WorkflowScreenSelector.MappingAddEntry,
          },
        }),
        edge.mapping.entries.length === 0
          ? createElement(
              "p",
              { className: "mt-3 text-xs text-text-secondary" },
              [
                "No explicit entries yet. The edge currently forwards the upstream payload.",
              ],
            )
          : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              edge.mapping.entries.map((entry, index) =>
                createElement(
                  "div",
                  {
                    key: `${entry.targetPath}-${index.toString()}`,
                    className:
                      "rounded border border-border-dark px-3 py-2 text-xs text-text-secondary",
                  },
                  [`${entry.targetPath} ← ${readMappingSourceLabel(entry)}`],
                ),
              ),
            ]),
      ],
    );
  }

  private renderAssetInspector(asset: WorkflowAssetRecord): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-4" }, [
      this.renderInspectorField("Asset name", asset.name, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          name: value,
          slug: toSlugValue(value),
        }));
      }),
      this.renderInspectorField("Slug", asset.slug, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          slug: toSlugValue(value),
        }));
      }),
      this.renderInspectorField("Description", asset.description, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          description: value,
        }));
      }),
      this.renderInspectorSelect(
        "Scope",
        asset.scope,
        [WorkflowAssetScope.Project, WorkflowAssetScope.Workspace],
        (value) => {
          const nextScope = readWorkflowAssetScope(value);
          const nextProjectId =
            value === WorkflowAssetScope.Project
              ? this.state.currentProject?.id
              : undefined;
          this.patchAsset(asset.id, (current) => ({
            ...stripOptionalProjectId(current),
            scope: nextScope,
            ...(nextProjectId ? { projectId: nextProjectId } : {}),
          }));
        },
      ),
      this.renderInspectorTextArea("Body", asset.body, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          body: value,
        }));
      }),
      asset.kind === WorkflowAssetKind.Prompt ||
      asset.kind === WorkflowAssetKind.Guardrail
        ? this.renderAssetExecutionPolicyEditor(asset)
        : "",
      asset.kind !== WorkflowAssetKind.Guardrail
        ? this.renderQuickEditorCard({
            title: "Deep editor",
            description:
              "Open a larger modal for prompt/body authoring, output schema JSON sync, and variable insertion.",
            status: "info",
            statusLabel: "Modal",
            buttonLabel: "Open editor",
            testId: `${WorkflowScreenSelector.DeepEditorOpenPrefix}asset`,
            onOpen: () =>
              this.openDeepEditor(
                {
                  type: "asset",
                  id: asset.id,
                },
                "prompt",
              ),
          })
        : "",
      asset.kind === WorkflowAssetKind.Guardrail && asset.guardrail
        ? this.renderGuardrailDefinitionEditor(asset)
        : "",
      asset.outputContract
        ? this.renderOutputContractEditor({
            title: "JSON output contract",
            description:
              "Reusable prompt and instruction assets can publish structured output paths for downstream nodes.",
            contract: asset.outputContract,
            selectors: AssetOutputContractEditorSelectors,
            onRename: (name) => {
              this.patchAsset(asset.id, (current) =>
                current.outputContract
                  ? {
                      ...current,
                      outputContract: {
                        ...current.outputContract,
                        name,
                      },
                    }
                  : current,
              );
            },
            onChangeContract: (updater) => {
              this.patchAsset(asset.id, (current) =>
                current.outputContract
                  ? {
                      ...current,
                      outputContract: updater(current.outputContract),
                    }
                  : current,
              );
            },
          })
        : "",
      createElement(
        "div",
        {
          className:
            "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
        },
        [
          createElement(
            "div",
            { className: "flex items-center justify-between gap-3" },
            [
              createElement(
                "span",
                { className: "text-sm font-medium text-white" },
                ["Usage"],
              ),
              createElement(
                StatusBadge,
                {
                  status:
                    readUsageCount(asset.id, this.state.assetUsages) > 0
                      ? "info"
                      : "warning",
                },
                [`${readUsageCount(asset.id, this.state.assetUsages)} linked`],
              ),
            ],
          ),
          readUsageCount(asset.id, this.state.assetUsages) === 0
            ? createElement(
                "p",
                { className: "mt-2 text-xs text-text-secondary" },
                ["This asset is not linked to any workflow node yet."],
              )
            : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
                this.state.assetUsages
                  .filter((usage) => usage.assetId === asset.id)
                  .map((usage) =>
                    createElement(
                      "div",
                      {
                        key: `${usage.workflowId}-${usage.nodeId}`,
                        className:
                          "rounded-md border border-border-dark px-3 py-2 text-xs text-text-secondary",
                      },
                      [
                        `${usage.workflowId.slice(0, 8)} · ${usage.nodeKind} · ${usage.role}`,
                      ],
                    ),
                  ),
              ]),
        ],
      ),
    ]);
  }

  private renderAssetExecutionPolicyEditor(
    asset: WorkflowAssetRecord,
  ): HTMLElement {
    const policy = normalizeWorkflowAssetExecutionPolicy(asset.executionPolicy);

    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement("p", { className: "text-sm font-medium text-white" }, [
          "Execution policy",
        ]),
        createElement(
          "p",
          { className: "mt-1 text-xs leading-5 text-text-secondary" },
          [
            `Defaults: ${WorkflowAssetDefaultMaxRetries.toString()} retries and ${formatTimeoutMinutes(WorkflowAssetDefaultTimeoutMs)} timeout.`,
          ],
        ),
        createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, [
          this.renderContractNumberField(
            "Max retries",
            policy.maxRetries,
            (value) => {
              this.patchAssetExecutionPolicy(asset.id, {
                maxRetries: value ?? WorkflowAssetDefaultMaxRetries,
              });
            },
            WorkflowScreenSelector.AssetMaxRetriesInput,
          ),
          this.renderContractNumberField(
            "Timeout minutes",
            Math.round(policy.timeoutMs / WorkflowAssetTimeoutMinuteMs),
            (value) => {
              this.patchAssetExecutionPolicy(asset.id, {
                timeoutMs:
                  (value ??
                    Math.round(
                      WorkflowAssetDefaultTimeoutMs /
                        WorkflowAssetTimeoutMinuteMs,
                    )) * WorkflowAssetTimeoutMinuteMs,
              });
            },
            WorkflowScreenSelector.AssetTimeoutMinutesInput,
          ),
        ]),
      ],
    );
  }

  private renderOutputContractEditor(input: {
    title: string;
    description: string;
    contract: JsonOutputContractRecord | null;
    selectors: OutputContractEditorSelectorSet;
    onRename: (name: string) => void;
    onChangeContract: (
      updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord,
    ) => void;
  }): HTMLElement {
    const validation = readJsonContractValidation(input.contract);
    const paths = input.contract
      ? readJsonSchemaPaths(input.contract.schema)
      : [];
    const providerSchema = input.contract
      ? serializeJsonContractForProvider(input.contract)
      : null;

    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-start justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "text-sm font-medium text-white" },
                [input.title],
              ),
              createElement(
                "p",
                { className: "mt-1 text-xs leading-5 text-text-secondary" },
                [input.description],
              ),
            ]),
            createElement(
              StatusBadge,
              {
                status: validation.valid ? "success" : "warning",
              },
              [validation.valid ? "Valid" : "Needs work"],
            ),
          ],
        ),
        input.contract
          ? createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
              this.renderInspectorField(
                "Contract name",
                input.contract.name,
                input.onRename,
                input.selectors.nameInput,
              ),
              createElement(Button, {
                variant: "secondary",
                size: "sm",
                icon: "add",
                onClick: () => {
                  input.onChangeContract((current) => ({
                    ...current,
                    schema: upsertJsonSchemaProperty(current.schema, [], {
                      name: readNextContractPropertyName(current.schema),
                      node: createJsonSchemaNode("string"),
                      required: false,
                    }),
                  }));
                },
                children: "Add property",
                dataset: {
                  testid: input.selectors.addFieldButton,
                },
              }),
              createElement(
                "div",
                {
                  className: `rounded-md border px-3 py-2 text-xs ${validation.valid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-amber-500/40 bg-amber-500/10 text-amber-100"}`,
                  "data-testid": input.selectors.status,
                },
                [validation.message],
              ),
              createElement(
                "div",
                {
                  className:
                    "rounded-md border border-border-dark bg-[#0f1318] px-3 py-3",
                },
                [
                  createElement(
                    "div",
                    {
                      className: "mb-3 flex items-center justify-between gap-3",
                    },
                    [
                      createElement(
                        "p",
                        {
                          className:
                            "text-xs font-semibold uppercase tracking-wide text-text-secondary",
                        },
                        ["Schema tree"],
                      ),
                      createElement(
                        "span",
                        { className: "text-xs text-text-secondary" },
                        [
                          "Objects can nest properties. Arrays expose an editable item schema.",
                        ],
                      ),
                    ],
                  ),
                  this.renderOutputContractSchemaNode({
                    schema: input.contract.schema,
                    path: [],
                    propertyName: null,
                    required: true,
                    selectors: input.selectors,
                    onChangeContract: input.onChangeContract,
                  }),
                ],
              ),
              createElement(
                "div",
                {
                  className:
                    "rounded-md border border-border-dark bg-[#0f1318] px-3 py-2",
                },
                [
                  createElement(
                    "p",
                    {
                      className:
                        "text-xs font-semibold uppercase tracking-wide text-text-secondary",
                    },
                    ["Available paths"],
                  ),
                  paths.length === 0
                    ? createElement(
                        "p",
                        { className: "mt-2 text-xs text-text-secondary" },
                        ["No fields yet."],
                      )
                    : createElement(
                        "div",
                        { className: "mt-2 flex flex-wrap gap-2" },
                        paths.map((path) =>
                          createElement(
                            "span",
                            {
                              key: path,
                              className:
                                "rounded-full border border-border-dark bg-[#151a20] px-2 py-1 text-xs text-slate-200",
                            },
                            [path],
                          ),
                        ),
                      ),
                ],
              ),
              createElement(
                "div",
                {
                  className:
                    "rounded-md border border-border-dark bg-[#0f1318] px-3 py-2",
                },
                [
                  createElement(
                    "p",
                    {
                      className:
                        "text-xs font-semibold uppercase tracking-wide text-text-secondary",
                    },
                    ["Compact provider payload"],
                  ),
                  createElement(
                    "pre",
                    {
                      className:
                        "mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-slate-200",
                    },
                    [
                      providerSchema
                        ? JSON.stringify(providerSchema, null, 2)
                        : "{}",
                    ],
                  ),
                ],
              ),
            ])
          : createElement(
              "p",
              {
                className:
                  "mt-3 rounded-md border border-dashed border-border-dark px-3 py-3 text-xs text-text-secondary",
              },
              ["This node does not expose a JSON output contract."],
            ),
      ],
    );
  }

  private renderOutputContractSchemaNode(input: {
    schema: JsonSchemaNodeRecord;
    path: ReadonlyArray<string>;
    propertyName: string | null;
    required: boolean;
    selectors: OutputContractEditorSelectorSet;
    onChangeContract: (
      updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord,
    ) => void;
  }): HTMLElement {
    const isRoot = input.propertyName === null && input.path.length === 0;
    const propertyToken = toContractPathToken(input.path);
    const parentPath = input.path.slice(0, -1);
    const propertyKey = input.propertyName ?? "";
    const isArrayItem = input.path.at(-1) === JsonSchemaItemsSegment;
    const showPropertyControls = !isRoot && !isArrayItem;
    const typeLabel = isRoot
      ? "Root object"
      : isArrayItem
        ? "Item schema"
        : "Property";
    const childEntries =
      input.schema.type === "object"
        ? Object.entries(input.schema.properties ?? {}).sort(
            ([left], [right]) => left.localeCompare(right),
          )
        : [];

    return createElement(
      "div",
      {
        className: `${isRoot ? "flex flex-col gap-3" : "rounded-md border border-border-dark bg-[#11161d] px-3 py-3"}`,
      },
      [
        isRoot
          ? ""
          : createElement("div", { className: "flex flex-col gap-3" }, [
              createElement(
                "div",
                { className: "flex flex-wrap items-center gap-2" },
                [
                  createElement(
                    "span",
                    {
                      className:
                        "text-xs font-medium uppercase tracking-wide text-text-secondary",
                    },
                    [typeLabel],
                  ),
                  createElement("div", { className: "min-w-[180px] flex-1" }, [
                    showPropertyControls
                      ? this.renderContractInlineInput({
                          value: propertyKey,
                          testId: `${input.selectors.propertyNamePrefix}${propertyToken}`,
                          onCommit: (value) => {
                            const nextName = value.trim();
                            if (
                              nextName.length === 0 ||
                              nextName === propertyKey
                            ) {
                              return;
                            }
                            input.onChangeContract((current) => ({
                              ...current,
                              schema: renameJsonSchemaProperty(
                                current.schema,
                                parentPath,
                                propertyKey,
                                nextName,
                              ),
                            }));
                          },
                        })
                      : createElement(
                          "div",
                          {
                            className:
                              "rounded-md border border-border-dark bg-[#10151b] px-3 py-2 text-sm text-white",
                          },
                          ["Array item"],
                        ),
                  ]),
                  this.renderContractInlineSelect({
                    value: input.schema.type,
                    options: readJsonSchemaTypes(),
                    testId: `${input.selectors.propertyTypePrefix}${propertyToken}`,
                    onChange: (value) => {
                      input.onChangeContract((current) => ({
                        ...current,
                        schema: updateJsonSchemaNode(
                          current.schema,
                          input.path,
                          (node) =>
                            preserveSchemaPresentation(
                              node,
                              createJsonSchemaNode(readJsonSchemaType(value)),
                            ),
                        ),
                      }));
                    },
                  }),
                  showPropertyControls
                    ? createElement(
                        "label",
                        {
                          className:
                            "flex items-center gap-2 rounded-md border border-border-dark bg-[#10151b] px-3 py-2 text-xs text-slate-200",
                        },
                        [
                          createElement("input", {
                            type: "checkbox",
                            checked: input.required,
                            onChange: (event: Event) => {
                              const target = event.target;
                              if (!(target instanceof HTMLInputElement)) {
                                return;
                              }
                              input.onChangeContract((current) => ({
                                ...current,
                                schema: setContractPropertyRequired(
                                  current.schema,
                                  parentPath,
                                  propertyKey,
                                  target.checked,
                                ),
                              }));
                            },
                            "data-testid": `${input.selectors.propertyRequiredPrefix}${propertyToken}`,
                          }),
                          "Required",
                        ],
                      )
                    : "",
                  input.schema.type === "object"
                    ? createElement(IconButton, {
                        icon: "subdirectory_arrow_right",
                        tooltip: "Add nested property",
                        onClick: () => {
                          input.onChangeContract((current) => ({
                            ...current,
                            schema: upsertJsonSchemaProperty(
                              current.schema,
                              input.path,
                              {
                                name: readNextContractPropertyName(
                                  input.schema,
                                ),
                                node: createJsonSchemaNode("string"),
                                required: false,
                              },
                            ),
                          }));
                        },
                        dataset: {
                          testid: `${input.selectors.propertyAddChildPrefix}${propertyToken}`,
                        },
                      })
                    : "",
                  showPropertyControls
                    ? createElement(IconButton, {
                        icon: "delete",
                        tooltip: "Delete property",
                        onClick: () => {
                          input.onChangeContract((current) => ({
                            ...current,
                            schema: removeJsonSchemaProperty(
                              current.schema,
                              parentPath,
                              propertyKey,
                            ),
                          }));
                        },
                        dataset: {
                          testid: `${input.selectors.propertyDeletePrefix}${propertyToken}`,
                        },
                      })
                    : "",
                ],
              ),
              this.renderOutputContractConstraintEditor({
                schema: input.schema,
                path: input.path,
                selectors: input.selectors,
                onChangeContract: input.onChangeContract,
              }),
            ]),
        input.schema.type === "object"
          ? createElement(
              "div",
              {
                className: `${isRoot ? "flex flex-col gap-3" : "mt-3 flex flex-col gap-3 border-l border-border-dark pl-4"}`,
              },
              [
                childEntries.length === 0
                  ? createElement(
                      "p",
                      { className: "text-xs text-text-secondary" },
                      ["No properties yet. Add one to define this object."],
                    )
                  : childEntries.map(([key, value]) =>
                      this.renderOutputContractSchemaNode({
                        schema: value,
                        path: [...input.path, key],
                        propertyName: key,
                        required: (input.schema.required ?? []).includes(key),
                        selectors: input.selectors,
                        onChangeContract: input.onChangeContract,
                      }),
                    ),
              ],
            )
          : "",
        input.schema.type === "array"
          ? createElement(
              "div",
              { className: "mt-3 border-l border-border-dark pl-4" },
              [
                this.renderOutputContractSchemaNode({
                  schema: input.schema.items ?? createJsonSchemaNode("string"),
                  path: [...input.path, JsonSchemaItemsSegment],
                  propertyName: null,
                  required: true,
                  selectors: input.selectors,
                  onChangeContract: input.onChangeContract,
                }),
              ],
            )
          : "",
      ],
    );
  }

  private renderOutputContractConstraintEditor(input: {
    schema: JsonSchemaNodeRecord;
    path: ReadonlyArray<string>;
    selectors: OutputContractEditorSelectorSet;
    onChangeContract: (
      updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord,
    ) => void;
  }): HTMLElement {
    const propertyToken = toContractPathToken(input.path);
    if (input.schema.type === "string") {
      return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
        this.renderContractSelectField(
          "Format",
          input.schema.format ?? "",
          readJsonSchemaFormats(),
          (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  format: readJsonSchemaFormat(value),
                }),
              ),
            }));
          },
          `${input.selectors.propertyFormatPrefix}${propertyToken}`,
          readJsonSchemaFormatLabel,
        ),
        this.renderContractNumberField(
          "Min length",
          input.schema.minLength,
          (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  minLength: value,
                }),
              ),
            }));
          },
          `${input.selectors.propertyMinPrefix}${propertyToken}`,
        ),
        this.renderContractNumberField(
          "Max length",
          input.schema.maxLength,
          (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  maxLength: value,
                }),
              ),
            }));
          },
          `${input.selectors.propertyMaxPrefix}${propertyToken}`,
        ),
        this.renderRegexPatternField({
          value: input.schema.pattern ?? "",
          onCommit: (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  pattern: value.trim().length > 0 ? value : undefined,
                }),
              ),
            }));
          },
          fieldTestId: `${input.selectors.propertyPatternPrefix}${propertyToken}`,
          buttonTestId: `${input.selectors.propertyRegexTestPrefix}${propertyToken}`,
          title: `Pattern · ${readContractPathLabel(input.path)}`,
        }),
      ]);
    }

    if (input.schema.type === "number" || input.schema.type === "integer") {
      return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
        this.renderContractNumberField(
          "Minimum",
          input.schema.minimum,
          (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  minimum: value,
                }),
              ),
            }));
          },
          `${input.selectors.propertyMinPrefix}${propertyToken}`,
        ),
        this.renderContractNumberField(
          "Maximum",
          input.schema.maximum,
          (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  maximum: value,
                }),
              ),
            }));
          },
          `${input.selectors.propertyMaxPrefix}${propertyToken}`,
        ),
      ]);
    }

    if (input.schema.type === "array") {
      return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
        this.renderContractNumberField(
          "Min items",
          input.schema.minItems,
          (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  minItems: value,
                }),
              ),
            }));
          },
          `${input.selectors.propertyMinPrefix}${propertyToken}`,
        ),
        this.renderContractNumberField(
          "Max items",
          input.schema.maxItems,
          (value) => {
            input.onChangeContract((current) => ({
              ...current,
              schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
                patchSchemaNodeOptional(node, {
                  maxItems: value,
                }),
              ),
            }));
          },
          `${input.selectors.propertyMaxPrefix}${propertyToken}`,
        ),
      ]);
    }

    return createElement("div", { className: "text-xs text-text-secondary" }, [
      input.schema.type === "boolean"
        ? "Boolean values only need required/optional semantics."
        : input.schema.type === "object"
          ? "Nested objects can publish additional reusable paths."
          : "Configure this schema through the type selector.",
    ]);
  }

  private renderRegexPatternField(input: {
    value: string;
    onCommit: (value: string) => void;
    fieldTestId: string;
    buttonTestId: string;
    title: string;
  }): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-1" }, [
      createElement("span", { className: "text-xs text-text-secondary" }, [
        "Pattern",
      ]),
      createElement("div", { className: "flex gap-2" }, [
        createElement("input", {
          type: "text",
          value: input.value,
          className: InspectorTextInputClassName,
          "data-testid": input.fieldTestId,
          placeholder: "^[A-Z]{3}-\\d+$",
          onBlur: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement) {
              input.onCommit(target.value);
            }
          },
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement) {
              input.onCommit(target.value);
            }
          },
        }),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          className: "h-10 shrink-0",
          onClick: () =>
            this.openRegexTester({
              title: input.title,
              pattern: input.value,
              flags: DefaultRegexTesterFlags,
              testText: DefaultRegexTesterTestText,
            }),
          children: "Test",
          dataset: {
            testid: input.buttonTestId,
          },
        }),
      ]),
    ]);
  }

  private renderRegexTesterModal(): HTMLElement {
    const tester = this.state.regexTester;
    if (!tester) {
      return createElement("div");
    }

    const result = evaluateWorkflowRegex({
      pattern: tester.pattern,
      flags: tester.flags,
      testText: tester.testText,
    });

    return createElement(
      "div",
      {
        className: "fixed inset-0 z-[60] bg-black/75 p-3 md:p-6",
        onClick: () => this.closeRegexTester(),
        "data-testid": WorkflowScreenSelector.RegexTesterModal,
      },
      [
        createElement(
          "div",
          {
            className:
              "mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-xl border border-border-dark bg-[#0f141a] shadow-2xl",
            onClick: (event: Event) => event.stopPropagation(),
          },
          [
            createElement(
              "div",
              {
                className:
                  "flex items-center justify-between border-b border-border-dark px-4 py-3",
              },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "p",
                    { className: "truncate text-sm font-semibold text-white" },
                    [tester.title],
                  ),
                  createElement(
                    "p",
                    { className: "truncate text-xs text-text-secondary" },
                    [
                      "Regex evaluator with live matches, capture groups, and schema-friendly JavaScript flags.",
                    ],
                  ),
                ]),
                createElement(IconButton, {
                  icon: "close",
                  tooltip: "Close regex tester",
                  onClick: () => this.closeRegexTester(),
                }),
              ],
            ),
            createElement(
              "div",
              {
                className:
                  "grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_380px]",
              },
              [
                createElement(
                  "section",
                  { className: "min-h-0 overflow-y-auto p-4" },
                  [
                    createElement(
                      "div",
                      {
                        className:
                          "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3",
                      },
                      [
                        createElement(
                          "div",
                          {
                            className:
                              "grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]",
                          },
                          [
                            this.renderRegexModalField(
                              "Regular expression",
                              tester.pattern,
                              WorkflowScreenSelector.RegexTesterPatternInput,
                              (value) =>
                                this.patchRegexTester({ pattern: value }),
                            ),
                            this.renderRegexModalField(
                              "Flags",
                              tester.flags,
                              WorkflowScreenSelector.RegexTesterFlagsInput,
                              (value) =>
                                this.patchRegexTester({ flags: value }),
                            ),
                          ],
                        ),
                      ],
                    ),
                    createElement(
                      "label",
                      { className: "mt-4 flex flex-col gap-2" },
                      [
                        createElement(
                          "span",
                          {
                            className:
                              "text-xs font-semibold uppercase tracking-wide text-text-secondary",
                          },
                          ["Test string"],
                        ),
                        createElement("textarea", {
                          className:
                            "min-h-[420px] w-full resize-y rounded-lg border border-border-dark bg-[#0d1117] px-4 py-3 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40",
                          value: tester.testText,
                          onInput: (event: Event) => {
                            const target = event.target;
                            if (target instanceof HTMLTextAreaElement) {
                              this.patchRegexTester({
                                testText: target.value,
                              });
                            }
                          },
                          "data-testid":
                            WorkflowScreenSelector.RegexTesterTextInput,
                        }),
                      ],
                    ),
                  ],
                ),
                createElement(
                  "aside",
                  {
                    className:
                      "min-h-0 overflow-y-auto border-t border-border-dark bg-[#121820] p-4 lg:border-l lg:border-t-0",
                  },
                  [
                    this.renderRegexEvaluationSummary(result),
                    this.renderRegexMatches(result),
                    this.renderRegexQuickReference(),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  private renderRegexModalField(
    label: string,
    value: string,
    testId: string,
    onInput: (value: string) => void,
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement(
        "span",
        {
          className:
            "text-xs font-semibold uppercase tracking-wide text-text-secondary",
        },
        [label],
      ),
      createElement("input", {
        type: "text",
        value,
        className: InspectorTextInputClassName,
        onInput: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onInput(target.value);
          }
        },
        "data-testid": testId,
      }),
    ]);
  }

  private renderRegexEvaluationSummary(
    result: ReturnType<typeof evaluateWorkflowRegex>,
  ): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#0f1318] px-4 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-center justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "text-sm font-medium text-white" },
                ["Evaluation"],
              ),
              createElement(
                "p",
                { className: "mt-1 text-xs text-text-secondary" },
                [
                  result.valid
                    ? `${result.matches.length.toString()} matches${result.truncated ? " · truncated" : ""}`
                    : result.error,
                ],
              ),
            ]),
            createElement(
              StatusBadge,
              { status: result.valid ? "success" : "failed" },
              [result.valid ? "Valid" : "Invalid"],
            ),
          ],
        ),
      ],
    );
  }

  private renderRegexMatches(
    result: ReturnType<typeof evaluateWorkflowRegex>,
  ): HTMLElement {
    if (!result.valid) {
      return createElement(
        "div",
        {
          className:
            "mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100",
        },
        [result.error],
      );
    }

    return createElement(
      "div",
      {
        className:
          "mt-4 rounded-lg border border-border-dark bg-[#0f1318] px-4 py-3",
      },
      [
        createElement("p", { className: "text-sm font-medium text-white" }, [
          "Match information",
        ]),
        result.matches.length === 0
          ? createElement(
              "p",
              { className: "mt-3 text-xs text-text-secondary" },
              ["No matches for this test string."],
            )
          : createElement(
              "div",
              { className: "mt-3 flex flex-col gap-2" },
              result.matches.map((match, index) =>
                this.renderRegexMatchRow(match, index),
              ),
            ),
      ],
    );
  }

  private renderRegexMatchRow(
    match: WorkflowRegexMatchRecord,
    index: number,
  ): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "rounded-md border border-border-dark bg-[#151a20] px-3 py-2",
      },
      [
        createElement(
          "div",
          { className: "flex items-center justify-between gap-3" },
          [
            createElement(
              "span",
              { className: "text-xs font-medium text-white" },
              [`Match ${(index + 1).toString()}`],
            ),
            createElement(
              "span",
              { className: "font-mono text-[11px] text-text-secondary" },
              [`${match.index.toString()}–${match.endIndex.toString()}`],
            ),
          ],
        ),
        createElement(
          "pre",
          {
            className:
              "mt-2 overflow-x-auto rounded bg-[#0d1117] px-2 py-2 font-mono text-[11px] text-slate-200",
          },
          [match.text.length > 0 ? match.text : "empty string"],
        ),
        match.groups.length > 0
          ? createElement(
              "div",
              { className: "mt-2 flex flex-col gap-1" },
              match.groups.map((group, groupIndex) =>
                createElement(
                  "div",
                  {
                    key: `${match.index.toString()}-${groupIndex.toString()}`,
                    className:
                      "flex items-center justify-between gap-2 text-[11px]",
                  },
                  [
                    createElement(
                      "span",
                      { className: "text-text-secondary" },
                      [`Group ${(groupIndex + 1).toString()}`],
                    ),
                    createElement("code", { className: "text-amber-100" }, [
                      group.length > 0 ? group : "empty",
                    ]),
                  ],
                ),
              ),
            )
          : "",
      ],
    );
  }

  private renderRegexQuickReference(): HTMLElement {
    const entries = [
      ["^ / $", "Line anchors"],
      [".", "Any character except line breaks"],
      ["\\d / \\w / \\s", "Digit, word, whitespace"],
      ["[abc] / [^abc]", "Character set / negated set"],
      ["(group)", "Capturing group"],
      ["(?:group)", "Non-capturing group"],
      ["(?=x) / (?!x)", "Lookahead assertions"],
      ["* + ? {n,m}", "Quantifiers"],
    ] as const;

    return createElement(
      "div",
      {
        className:
          "mt-4 rounded-lg border border-border-dark bg-[#0f1318] px-4 py-3",
      },
      [
        createElement("p", { className: "text-sm font-medium text-white" }, [
          "Quick reference",
        ]),
        createElement(
          "div",
          { className: "mt-3 flex flex-col gap-2" },
          entries.map(([token, description]) =>
            createElement(
              "div",
              {
                key: token,
                className:
                  "flex items-center justify-between gap-3 rounded-md border border-border-dark bg-[#151a20] px-3 py-2 text-xs",
              },
              [
                createElement("code", { className: "text-primary" }, [token]),
                createElement("span", { className: "text-text-secondary" }, [
                  description,
                ]),
              ],
            ),
          ),
        ),
      ],
    );
  }

  private renderContractInlineInput(input: {
    value: string;
    onCommit: (value: string) => void;
    testId: string;
  }): HTMLElement {
    const commitValue = (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement) {
        input.onCommit(target.value);
      }
    };

    return createElement("input", {
      type: "text",
      value: input.value,
      className: InspectorTextInputClassName,
      "data-testid": input.testId,
      onBlur: commitValue,
      onChange: commitValue,
    });
  }

  private renderContractInlineSelect(input: {
    value: string;
    options: ReadonlyArray<ContractSelectOption>;
    onChange: (value: string) => void;
    testId: string;
    formatOptionLabel?: (value: string) => string;
  }): HTMLElement {
    return createElement("div", { className: "relative min-w-[128px]" }, [
      createElement(
        "select",
        {
          className: InspectorSelectClassName,
          value: input.value,
          "data-testid": input.testId,
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLSelectElement) {
              input.onChange(target.value);
            }
          },
        },
        input.options.map((option) =>
          renderContractSelectOption(
            option,
            input.formatOptionLabel ?? formatSelectOptionLabel,
          ),
        ),
      ),
      createElement(
        "span",
        {
          className:
            "pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-secondary",
        },
        ["▾"],
      ),
    ]);
  }

  private renderContractNumberField(
    label: string,
    value: number | undefined,
    onCommit: (value: number | undefined) => void,
    testId: string,
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-xs font-medium text-white" }, [
        label,
      ]),
      createElement("input", {
        type: "number",
        value: value === undefined ? "" : value.toString(),
        className: InspectorTextInputClassName,
        "data-testid": testId,
        onBlur: (event: Event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) {
            return;
          }
          onCommit(readOptionalNumber(target.value));
        },
        onChange: (event: Event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) {
            return;
          }
          onCommit(readOptionalNumber(target.value));
        },
      }),
    ]);
  }

  private renderContractSelectField(
    label: string,
    value: string,
    options: ReadonlyArray<ContractSelectOption>,
    onChange: (value: string) => void,
    testId: string,
    formatOptionLabel?: (value: string) => string,
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-xs font-medium text-white" }, [
        label,
      ]),
      this.renderContractInlineSelect({
        value,
        options,
        onChange,
        testId,
        ...(formatOptionLabel ? { formatOptionLabel } : {}),
      }),
    ]);
  }

  private renderGuardrailDefinitionEditor(
    asset: WorkflowAssetRecord,
  ): HTMLElement {
    const guardrail = asset.guardrail;
    if (!guardrail) {
      return createElement(
        "div",
        {
          className:
            "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3 text-sm text-text-secondary",
        },
        ["This guardrail asset has no definition yet."],
      );
    }

    const validity = readGuardrailDefinitionValidity(guardrail);
    const maxReached = guardrail.validations.length >= 4;

    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-start justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "text-sm font-medium text-white" },
                ["Guardrail composition"],
              ),
              createElement(
                "p",
                { className: "mt-1 text-xs leading-5 text-text-secondary" },
                [
                  "Warnings are permissive. Error guardrails block node validity only when one of their validations triggers.",
                ],
              ),
            ]),
            createElement(
              StatusBadge,
              {
                status: validity.blocking
                  ? "failed"
                  : validity.valid
                    ? "success"
                    : "warning",
              },
              [
                validity.blocking
                  ? "Blocking"
                  : validity.valid
                    ? "Ready"
                    : "Permissive",
              ],
            ),
          ],
        ),
        createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, [
          this.renderInspectorSelect(
            "Severity",
            guardrail.severity,
            [
              WorkflowGuardrailSeverity.Warn,
              WorkflowGuardrailSeverity.Error,
              WorkflowGuardrailSeverity.Success,
            ],
            (value) => {
              this.patchGuardrailAsset(asset.id, (current) => ({
                ...current,
                severity: readWorkflowGuardrailSeverity(value),
              }));
            },
            undefined,
            WorkflowScreenSelector.GuardrailSeveritySelect,
          ),
          this.renderInspectorSelect(
            "Operator",
            guardrail.operator,
            [WorkflowGuardrailOperator.All, WorkflowGuardrailOperator.Any],
            (value) => {
              this.patchGuardrailAsset(asset.id, (current) => ({
                ...current,
                operator: readWorkflowGuardrailOperator(value),
              }));
            },
            undefined,
            WorkflowScreenSelector.GuardrailOperatorSelect,
          ),
        ]),
        createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, [
          this.renderInspectorSelect(
            "Validation",
            this.state.guardrailValidationKind,
            readGuardrailValidationKinds(),
            (value) => {
              this.setState({
                guardrailValidationKind: readGuardrailValidationKind(value),
              });
            },
            undefined,
            WorkflowScreenSelector.GuardrailValidationKindSelect,
          ),
          this.renderInspectorSelect(
            "Target",
            this.state.guardrailValidationTarget,
            readGuardrailValidationTargets(),
            (value) => {
              this.setState({
                guardrailValidationTarget: readGuardrailValidationTarget(value),
              });
            },
            undefined,
            WorkflowScreenSelector.GuardrailValidationTargetSelect,
          ),
          this.renderInspectorField(
            "Path",
            this.state.guardrailValidationPath,
            (value) => {
              this.setState({ guardrailValidationPath: value });
            },
            WorkflowScreenSelector.GuardrailValidationPathInput,
          ),
          this.renderGuardrailValidationValueField(),
          this.renderInspectorField(
            "Message",
            this.state.guardrailValidationMessage,
            (value) => {
              this.setState({ guardrailValidationMessage: value });
            },
            WorkflowScreenSelector.GuardrailValidationMessageInput,
          ),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          className: "mt-3",
          disabled:
            maxReached ||
            this.state.guardrailValidationMessage.trim().length === 0,
          onClick: () => this.handleAddGuardrailValidation(asset.id),
          children: maxReached ? "Maximum 4 validations" : "Add validation",
          dataset: {
            testid: WorkflowScreenSelector.GuardrailAddValidation,
          },
        }),
        createElement(
          "div",
          {
            className:
              "mt-3 rounded-md border border-border-dark bg-[#0f1318] px-3 py-2 text-xs text-text-secondary",
          },
          [validity.message],
        ),
        createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
          guardrail.validations.map((validation) =>
            this.renderGuardrailValidationRow(asset, validation),
          ),
        ]),
      ],
    );
  }

  private renderGuardrailValidationValueField(): HTMLElement {
    const label =
      this.state.guardrailValidationKind === "regex" ? "Regex" : "Value";

    return createElement("label", { className: "flex flex-col gap-1" }, [
      createElement("span", { className: "text-xs text-text-secondary" }, [
        label,
      ]),
      createElement("div", { className: "flex gap-2" }, [
        createElement("input", {
          type: "text",
          value: this.state.guardrailValidationValue,
          className: InspectorTextInputClassName,
          "data-testid": WorkflowScreenSelector.GuardrailValidationValueInput,
          onBlur: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement) {
              this.setState({ guardrailValidationValue: target.value });
            }
          },
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement) {
              this.setState({ guardrailValidationValue: target.value });
            }
          },
        }),
        this.state.guardrailValidationKind === "regex"
          ? createElement(Button, {
              variant: "secondary",
              size: "sm",
              className: "h-10 shrink-0",
              onClick: () =>
                this.openRegexTester({
                  title: "Guardrail regex",
                  pattern: this.state.guardrailValidationValue,
                  flags: DefaultRegexTesterFlags,
                  testText: DefaultRegexTesterTestText,
                }),
              children: "Test",
              dataset: {
                testid: WorkflowScreenSelector.GuardrailValidationRegexTest,
              },
            })
          : "",
      ]),
      this.state.guardrailValidationKind === "json_schema"
        ? ""
        : this.renderExpressionUsageHints(
            this.state.guardrailValidationValue,
            WorkflowScreenSelector.GuardrailExpressionHints,
          ),
      this.state.guardrailValidationKind === "json_schema"
        ? ""
        : createElement("div", { className: "flex flex-wrap gap-2" }, [
            readGuardrailVariableTokens().map((token) =>
              createElement(Button, {
                key: token.id,
                variant: "secondary",
                size: "sm",
                onClick: () =>
                  this.handleGuardrailVariableInsert(token.reference),
                children: token.label,
                dataset: {
                  testid: `${WorkflowScreenSelector.GuardrailValidationVariablePrefix}${token.id}`,
                },
              }),
            ),
          ]),
    ]);
  }

  private renderGuardrailValidationRow(
    asset: WorkflowAssetRecord,
    validation: GuardrailValidationRecord,
  ): HTMLElement {
    return createElement(
      "div",
      {
        key: validation.id,
        className:
          "rounded-md border border-border-dark bg-[#0f1318] px-3 py-2",
      },
      [
        createElement(
          "div",
          { className: "flex items-center justify-between gap-3" },
          [
            createElement("div", { className: "min-w-0" }, [
              createElement(
                "p",
                { className: "truncate text-sm font-medium text-white" },
                [validation.kind],
              ),
              createElement("p", { className: "text-xs text-text-secondary" }, [
                `${validation.target}${validation.path ? ` · ${validation.path}` : ""}`,
              ]),
            ]),
            createElement(Button, {
              variant: "danger",
              size: "sm",
              onClick: () =>
                this.handleRemoveGuardrailValidation(asset.id, validation.id),
              children: "Remove",
            }),
          ],
        ),
        createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [
          validation.message,
        ]),
        validation.value !== undefined
          ? createElement(
              "code",
              {
                className:
                  "mt-2 block rounded bg-[#0d1117] px-2 py-2 text-[11px] text-amber-100",
              },
              [String(validation.value)],
            )
          : "",
      ],
    );
  }

  private renderEmbeddedAssetEditor(asset: WorkflowAssetRecord): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-3" }, [
      this.renderInspectorField("Asset name", asset.name, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          name: value,
          slug: toSlugValue(value),
        }));
      }),
      this.renderInspectorTextArea("Body", asset.body, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          body: value,
        }));
      }),
      asset.kind === WorkflowAssetKind.Prompt ||
      asset.kind === WorkflowAssetKind.Guardrail
        ? this.renderAssetExecutionPolicyEditor(asset)
        : "",
      asset.outputContract
        ? this.renderOutputContractEditor({
            title: "Asset output contract",
            description:
              "Expose fields that later nodes can map from this reusable asset.",
            contract: asset.outputContract,
            selectors: AssetOutputContractEditorSelectors,
            onRename: (name) => {
              this.patchAsset(asset.id, (current) =>
                current.outputContract
                  ? {
                      ...current,
                      outputContract: {
                        ...current.outputContract,
                        name,
                      },
                    }
                  : current,
              );
            },
            onChangeContract: (updater) => {
              this.patchAsset(asset.id, (current) =>
                current.outputContract
                  ? {
                      ...current,
                      outputContract: updater(current.outputContract),
                    }
                  : current,
              );
            },
          })
        : "",
    ]);
  }

  private renderAgentConfig(node: WorkflowNodeRecord): HTMLElement {
    const role = node.config.role ?? WorkflowNodeRole.Planner;
    const provider = node.config.provider ?? createFallbackProviderSelection();

    return createElement(
      "div",
      {
        className:
          "flex flex-col gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement("div", { className: "mb-3 flex flex-col gap-1" }, [
          createElement("p", { className: "text-sm font-medium text-white" }, [
            "Agent configuration",
          ]),
          createElement("p", { className: "text-xs text-text-secondary" }, [
            "Set the prompt and runtime profile used by this node.",
          ]),
        ]),
        this.renderInspectorSelect(
          "Role",
          role,
          [
            WorkflowNodeRole.Planner,
            WorkflowNodeRole.Retriever,
            WorkflowNodeRole.Executor,
            WorkflowNodeRole.Reviewer,
          ],
          (value) => {
            this.patchNode(node.id, (current) => ({
              ...current,
              config: {
                ...current.config,
                role: readWorkflowNodeRole(value),
                provider: current.config.provider ?? provider,
              },
            }));
          },
          undefined,
          WorkflowScreenSelector.NodeRoleSelect,
        ),
        this.renderNodePromptField(node),
        this.renderProviderSelectionFields(node, provider),
      ],
    );
  }

  private renderProviderRunConfig(node: WorkflowNodeRecord): HTMLElement {
    const provider = node.config.provider ?? createFallbackProviderSelection();
    const workflowId = this.state.draftWorkflow?.id ?? null;
    const workflowIsRunning = workflowId
      ? this.readWorkflowHasActiveExecution(workflowId)
      : false;

    return createElement(
      "div",
      {
        className:
          "flex flex-col gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement("div", { className: "mb-3 flex flex-col gap-1" }, [
          createElement("p", { className: "text-sm font-medium text-white" }, [
            "Provider run",
          ]),
          createElement("p", { className: "text-xs text-text-secondary" }, [
            "Run one prompt through a selected provider profile.",
          ]),
        ]),
        this.renderNodePromptField(node),
        this.renderProviderSelectionFields(node, provider),
        createElement("p", { className: "mt-3 text-xs text-text-secondary" }, [
          provider.testedAt
            ? `Last provider test: ${formatTimestamp(provider.testedAt)} · ${formatSelectOptionLabel(provider.testStatus ?? "unknown")}`
            : "Run a smoke test to verify this saved workflow node can reach its selected provider profile.",
        ]),
        createElement(Button, {
          variant: "ghost",
          size: "sm",
          disabled:
            this.state.pendingAction !== null ||
            workflowIsRunning ||
            this.state.currentProject === null ||
            this.state.draftWorkflow === null ||
            this.state.dirtyWorkflow ||
            this.state.dirtyAssetIds.length > 0 ||
            !provider.providerId,
          onClick: () => {
            void this.handleTestNodeProvider(node.id);
          },
          children: workflowIsRunning
            ? "Workflow running"
            : this.state.pendingAction === PendingAction.TestProvider &&
                this.state.activeProviderTestNodeId === node.id
              ? "Testing"
              : "Run provider test",
          dataset: {
            testid: WorkflowScreenSelector.NodeProviderTest,
          },
        }),
      ],
    );
  }

  private renderProviderSelectionFields(
    node: WorkflowNodeRecord,
    provider: WorkflowProviderSelectionRecord,
  ): HTMLElement {
    const providerOptions = this.readProviderProfileOptions(
      provider.providerId,
    );

    return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
      this.renderInspectorSelect(
        "Provider profile",
        provider.providerId,
        providerOptions.map((option) => option.value),
        (value) => {
          this.updateNodeProvider(node.id, {
            providerId: value,
          });
        },
        providerOptions,
        WorkflowScreenSelector.NodeProviderSelect,
      ),
      this.renderInspectorField("Model", provider.modelId, (value) => {
        this.updateNodeProvider(node.id, {
          modelId: value,
        });
      }),
      this.renderInspectorSelect(
        "Reasoning",
        provider.reasoningLevel,
        [
          WorkflowReasoningLevel.Low,
          WorkflowReasoningLevel.Medium,
          WorkflowReasoningLevel.High,
          WorkflowReasoningLevel.Max,
        ],
        (value) => {
          this.updateNodeProvider(node.id, {
            reasoningLevel: readWorkflowReasoningLevel(value),
          });
        },
        undefined,
        WorkflowScreenSelector.NodeReasoningSelect,
      ),
      this.renderInspectorField(
        "Temperature",
        provider.temperature.toString(),
        (value) => {
          const parsed = Number.parseFloat(value);
          this.updateNodeProvider(node.id, {
            temperature: Number.isFinite(parsed)
              ? parsed
              : provider.temperature,
          });
        },
      ),
      this.renderInspectorSelect(
        "Verbosity",
        provider.verbosity,
        [
          WorkflowVerbosity.Low,
          WorkflowVerbosity.Medium,
          WorkflowVerbosity.High,
        ],
        (value) => {
          this.updateNodeProvider(node.id, {
            verbosity: readWorkflowVerbosity(value),
          });
        },
        undefined,
        WorkflowScreenSelector.NodeVerbositySelect,
      ),
    ]);
  }

  private renderNodePromptField(node: WorkflowNodeRecord): HTMLElement {
    const prompt = node.config.prompt ?? "";
    const preview =
      prompt.trim().length > 0 ? prompt.trim() : "No prompt written yet.";

    return this.renderQuickEditorCard({
      title: "Prompt",
      description:
        preview.length > 140 ? `${preview.slice(0, 137)}...` : preview,
      status: prompt.trim().length > 0 ? "info" : "warning",
      statusLabel:
        prompt.trim().length > 0
          ? `${prompt.length.toString()} chars`
          : "Empty",
      buttonLabel: "Open editor",
      testId: `${WorkflowScreenSelector.DeepEditorOpenPrefix}prompt`,
      onOpen: () =>
        this.openDeepEditor({
          type: "node",
          id: node.id,
        }),
    });
  }

  private renderReviewConfig(node: WorkflowNodeRecord): HTMLElement {
    const requireHumanDecision =
      node.config.reviewPolicy?.requireHumanDecision ?? true;

    return createElement(
      "label",
      {
        className:
          "flex items-start gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement("input", {
          type: "checkbox",
          checked: requireHumanDecision,
          onChange: (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) {
              return;
            }
            this.patchNode(node.id, (current) => ({
              ...current,
              config: {
                ...current.config,
                reviewPolicy: {
                  requireHumanDecision: target.checked,
                },
              },
            }));
          },
        }),
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement(
            "span",
            { className: "text-sm font-medium text-white" },
            ["Require manual decision"],
          ),
          createElement("span", { className: "text-xs text-text-secondary" }, [
            "This node blocks the workflow until a reviewer approves or requests changes.",
          ]),
        ]),
      ],
    );
  }

  private renderGuardrailAttachmentSection(
    node: WorkflowNodeRecord,
    guardrailAssets: ReadonlyArray<WorkflowAssetRecord>,
  ): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3",
      },
      [
        createElement(
          "div",
          { className: "flex items-center justify-between gap-3" },
          [
            createElement(
              "span",
              { className: "text-sm font-medium text-white" },
              ["Attached guardrails"],
            ),
            createElement(Button, {
              variant: "ghost",
              size: "sm",
              onClick: () => {
                void this.handleCreateAsset(
                  WorkflowAssetKind.Guardrail,
                  node.id,
                  true,
                );
              },
              children: "New guardrail",
              dataset: {
                testid: WorkflowScreenSelector.GuardrailNewForNode,
              },
            }),
          ],
        ),
        createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
          guardrailAssets.length > 0
            ? this.renderInspectorSelect(
                "Attach asset",
                this.state.guardrailAttachAssetId ?? "",
                guardrailAssets.map((asset) => asset.id),
                (value) => {
                  this.setState({ guardrailAttachAssetId: value });
                },
                guardrailAssets.map((asset) => ({
                  value: asset.id,
                  label: asset.name,
                })),
              )
            : createElement("p", { className: "text-xs text-text-secondary" }, [
                "No guardrail assets yet. Create one to attach it to the selected node.",
              ]),
          createElement(Button, {
            variant: "secondary",
            size: "sm",
            disabled: !this.state.guardrailAttachAssetId,
            onClick: () => {
              if (
                !this.state.guardrailAttachAssetId ||
                !this.state.draftWorkflow
              ) {
                return;
              }
              const nextWorkflow = attachGuardrailToNode(
                this.state.draftWorkflow,
                node.id,
                this.state.guardrailAttachAssetId,
              );
              this.updateDraftWorkflow(nextWorkflow);
            },
            children: "Attach selected guardrail",
          }),
          node.attachedGuardrails.length === 0
            ? createElement("p", { className: "text-xs text-text-secondary" }, [
                "This node has no attached guardrails yet.",
              ])
            : node.attachedGuardrails.map((guardrail) => {
                const asset = guardrailAssets.find(
                  (entry) => entry.id === guardrail.assetId,
                );
                return createElement(
                  "div",
                  {
                    key: guardrail.assetId,
                    className:
                      "flex items-center justify-between gap-3 rounded-md border border-border-dark px-3 py-2",
                  },
                  [
                    createElement("div", { className: "min-w-0" }, [
                      createElement(
                        "p",
                        {
                          className: "truncate text-sm font-medium text-white",
                        },
                        [asset?.name ?? guardrail.assetId],
                      ),
                      createElement(
                        "p",
                        { className: "text-xs text-text-secondary" },
                        [asset?.guardrail?.severity ?? "Guardrail"],
                      ),
                    ]),
                    createElement(
                      "div",
                      { className: "flex items-center gap-2" },
                      [
                        createElement(Button, {
                          variant: "ghost",
                          size: "sm",
                          onClick: () => {
                            this.openSelectionEditorModal({
                              type: "asset",
                              id: guardrail.assetId,
                            });
                          },
                          children: "Edit",
                          dataset: {
                            testid: `${WorkflowScreenSelector.GuardrailAttachmentEditPrefix}${guardrail.assetId}`,
                          },
                        }),
                        createElement(Button, {
                          variant: "ghost",
                          size: "sm",
                          onClick: () => {
                            if (!this.state.draftWorkflow) {
                              return;
                            }
                            const nextWorkflow = detachGuardrailFromNode(
                              this.state.draftWorkflow,
                              node.id,
                              guardrail.assetId,
                            );
                            this.updateDraftWorkflow(nextWorkflow);
                          },
                          children: "Detach",
                        }),
                      ],
                    ),
                  ],
                );
              }),
        ]),
      ],
    );
  }

  private renderInspectorField(
    label: string,
    value: string,
    onChange: (value: string) => void,
    testId?: string,
  ): HTMLElement {
    const commitValue = (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement) {
        onChange(target.value);
      }
    };

    return createElement("label", { className: "flex flex-col gap-1.5" }, [
      createElement(
        "span",
        {
          className: "text-[11px] font-medium tracking-[0.08em] text-slate-300",
        },
        [label],
      ),
      createElement("input", {
        type: "text",
        value,
        className: InspectorTextInputClassName,
        ...(testId ? { "data-testid": testId } : {}),
        onBlur: commitValue,
        onChange: commitValue,
      }),
    ]);
  }

  private renderInspectorTextArea(
    label: string,
    value: string,
    onChange: (value: string) => void,
    testId?: string,
  ): HTMLElement {
    const commitValue = (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) {
        onChange(target.value);
      }
    };

    return createElement("label", { className: "flex flex-col gap-1.5" }, [
      createElement(
        "span",
        {
          className: "text-[11px] font-medium tracking-[0.08em] text-slate-300",
        },
        [label],
      ),
      createElement("textarea", {
        value,
        className: InspectorTextAreaClassName,
        ...(testId ? { "data-testid": testId } : {}),
        onBlur: commitValue,
        onChange: commitValue,
      }),
    ]);
  }

  private renderInspectorSelect(
    label: string,
    value: string,
    options: ReadonlyArray<string>,
    onChange: (value: string) => void,
    customLabels?: ReadonlyArray<{ value: string; label: string }>,
    testId?: string,
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-1.5" }, [
      createElement(
        "span",
        {
          className: "text-[11px] font-medium tracking-[0.08em] text-slate-300",
        },
        [label],
      ),
      createElement("div", { className: "relative" }, [
        createElement(
          "select",
          {
            className: InspectorSelectClassName,
            value,
            ...(testId ? { "data-testid": testId } : {}),
            onChange: (event: Event) => {
              const target = event.target;
              if (target instanceof HTMLSelectElement) {
                onChange(target.value);
              }
            },
          },
          [
            createElement("option", { value: "" }, [
              options.length === 0 ? "No options available" : "Select",
            ]),
            ...(customLabels
              ? customLabels.map((option) =>
                  createElement(
                    "option",
                    {
                      key: option.value,
                      value: option.value,
                    },
                    [option.label],
                  ),
                )
              : options.map((option) =>
                  createElement(
                    "option",
                    {
                      key: option,
                      value: option,
                    },
                    [formatSelectOptionLabel(option)],
                  ),
                )),
          ],
        ),
        createElement(
          "span",
          {
            className:
              "material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-text-secondary",
          },
          ["expand_more"],
        ),
      ]),
    ]);
  }

  private renderInlineMetaGrid(
    items: ReadonlyArray<{ label: string; value: string }>,
  ): HTMLElement {
    return createElement(
      "div",
      { className: "grid grid-cols-1 gap-2 sm:grid-cols-2" },
      [items.map((item) => this.renderInlineMetaTile(item.label, item.value))],
    );
  }

  private renderInlineMetaTile(
    label: string,
    value: string,
    testId?: string,
  ): HTMLElement {
    return createElement(
      "div",
      {
        key: label,
        className:
          "rounded-xl border border-border-dark bg-[#0f151c] px-3 py-2.5",
        ...(testId ? { "data-testid": testId } : {}),
      },
      [
        createElement(
          "p",
          {
            className:
              "text-[11px] font-medium tracking-[0.12em] text-text-secondary",
          },
          [label],
        ),
        createElement(
          "p",
          {
            className:
              "mt-1.5 text-sm font-medium leading-5 text-white break-words",
          },
          [value],
        ),
      ],
    );
  }

  private renderReadOnlyBadgeRow(
    kind: WorkflowNodeKindValue,
    inputs: number,
    outputs: number,
  ): HTMLElement {
    return createElement("div", { className: "grid grid-cols-3 gap-3" }, [
      createElement(StatusBadge, { status: "info" }, [readNodeKindLabel(kind)]),
      createElement(StatusBadge, { status: "warning" }, [
        `${inputs} input${inputs === 1 ? "" : "s"}`,
      ]),
      createElement(StatusBadge, { status: "success" }, [
        `${outputs} output${outputs === 1 ? "" : "s"}`,
      ]),
    ]);
  }

  private renderEmptyInspector(): HTMLElement {
    return createElement(
      "div",
      {
        className: "flex h-full items-center justify-center",
        "data-testid": WorkflowScreenSelector.InspectorEmpty,
      },
      [
        createElement(EmptyStatePanel, {
          icon: "tune",
          title: "Select something to edit",
          description:
            "Choose a workflow, node or reusable asset. The inspector stays intentionally empty until there is a concrete target to edit.",
        }),
      ],
    );
  }

  private shouldShowSidebar(): boolean {
    return this.state.isCompactViewport
      ? this.state.compactView === CompactView.Sidebar
      : !this.state.desktopSidebarCollapsed;
  }

  private shouldShowCanvas(): boolean {
    return (
      !this.state.isCompactViewport ||
      this.state.compactView !== CompactView.Sidebar
    );
  }

  private async hydrateState(): Promise<void> {
    this.setState({
      pendingAction: PendingAction.Load,
      errorMessage: null,
      noticeMessage: null,
    });

    try {
      const workspaceState = await this.workspaceStateClient.load();
      const currentProject =
        workspaceState.projects.find(
          (project) => project.id === workspaceState.activeProjectId,
        ) ?? null;
      this.setState({
        workspaceState,
        currentProject,
        pendingAction: null,
        compactView: currentProject ? CompactView.Canvas : CompactView.Sidebar,
      });

      if (currentProject) {
        await this.reloadCatalog(currentProject.id, workspaceState);
        await this.refreshServerLogs();
      }
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(
          error,
          "Could not load the workflow editor.",
        ),
        noticeMessage: null,
      });
    }
  }

  private async reloadCatalog(
    projectId: string,
    workspaceState = this.state.workspaceState,
    options: { preserveLocalDraft?: boolean } = {},
  ): Promise<void> {
    const workspaceId = readWorkspaceId(
      workspaceState,
      this.state.workflows,
      this.state.assets,
    );
    const [workflows, assets, assetUsages, executions] = await Promise.all([
      this.workflowClient.listDefinitions({ projectId }),
      this.workflowClient.listAssets({ projectId, workspaceId }),
      this.workflowClient.listAssetUsages({ projectId }),
      this.workflowClient.listExecutions({ projectId }),
    ]);
    const currentWorkflowId =
      this.readCurrentWorkflowRecord()?.id ?? workflows[0]?.id ?? null;
    const currentWorkflow = currentWorkflowId
      ? (workflows.find((workflow) => workflow.id === currentWorkflowId) ??
        workflows[0] ??
        null)
      : null;

    const nextSelection = currentWorkflow
      ? resolveSelectionAfterReload(
          this.state.selection,
          currentWorkflow,
          assets,
          executions,
          this.state.executionHistoryFilter,
        )
      : ({ type: "workflow", id: null } satisfies WorkflowSelection);
    const debugExecutionId =
      this.state.debugExecutionId &&
      executions.some(
        (execution) => execution.id === this.state.debugExecutionId,
      )
        ? this.state.debugExecutionId
        : nextSelection.type === "execution"
          ? nextSelection.id
          : null;

    const shouldPreserveLocalDraft = options.preserveLocalDraft ?? true;
    const draftState = selectWorkflowDraftAfterCatalogReload({
      currentDraftWorkflow: shouldPreserveLocalDraft
        ? this.state.draftWorkflow
        : null,
      currentWorkflow,
      hasDirtyWorkflow: shouldPreserveLocalDraft && this.state.dirtyWorkflow,
      dirtyAssetIds: shouldPreserveLocalDraft ? this.state.dirtyAssetIds : [],
      toDraftWorkflow: stripDefinitionVersionFields,
    });

    this.setState({
      workflows,
      assets,
      assetUsages,
      executions,
      draftWorkflow: draftState.draftWorkflow,
      pinnedTestOutput: readWorkflowPinnedTestOutputFromDefinition(
        draftState.draftWorkflow,
      ),
      selection: nextSelection,
      debugExecutionId,
      loadingExecutionId: null,
      dirtyWorkflow: draftState.dirtyWorkflow,
      dirtyAssetIds: draftState.dirtyAssetIds,
    });
    this.syncExecutionRefreshPolling();
  }

  private async reloadExecutionCatalog(projectId: string): Promise<void> {
    const executions = await this.workflowClient.listExecutions({ projectId });
    if (
      !shouldApplyWorkflowExecutionsRefresh(this.state.executions, executions)
    ) {
      return;
    }

    this.setState({
      executions,
      debugExecutionId:
        this.state.debugExecutionId &&
        executions.some(
          (execution) => execution.id === this.state.debugExecutionId,
        )
          ? this.state.debugExecutionId
          : null,
      loadingExecutionId:
        this.state.loadingExecutionId &&
        executions.some(
          (execution) => execution.id === this.state.loadingExecutionId,
        )
          ? this.state.loadingExecutionId
          : null,
    });
  }

  private async reloadAssetCatalog(
    projectId: string,
    workspaceState = this.state.workspaceState,
  ): Promise<void> {
    const workspaceId = readWorkspaceId(
      workspaceState,
      this.state.workflows,
      this.state.assets,
    );
    const [assets, assetUsages] = await Promise.all([
      this.workflowClient.listAssets({ projectId, workspaceId }),
      this.workflowClient.listAssetUsages({ projectId }),
    ]);

    this.setState({
      assets,
      assetUsages,
    });
  }

  private async refreshServerLogs(): Promise<void> {
    this.setState({ refreshingLogs: true });

    try {
      const level =
        this.state.workflowLogsFilter === WorkflowLogsFilter.Errors
          ? ServerLogLevel.Warn
          : undefined;
      const runId = this.readActiveLogsRunId();
      const logs = await this.logsClient.query({
        ...(level ? { level } : {}),
        ...(runId ? { runId } : {}),
        limit: 80,
      });
      this.setState({
        serverLogs: [...logs].reverse(),
        refreshingLogs: false,
      });
    } catch {
      this.setState({
        refreshingLogs: false,
      });
    }
  }

  private handleSelectWorkflow(workflowId: string): void {
    const workflow =
      this.state.workflows.find((entry) => entry.id === workflowId) ?? null;
    if (!workflow) {
      return;
    }

    this.setState({
      draftWorkflow: stripDefinitionVersionFields(workflow),
      pinnedTestOutput: readWorkflowPinnedTestOutputFromDefinition(workflow),
      selection: { type: "workflow", id: workflow.id },
      loadingExecutionId: null,
      dirtyWorkflow: false,
      dirtyAssetIds: [],
      pendingConnection: null,
      guardrailAttachAssetId: null,
      debugExecutionId: null,
      compactView: this.state.isCompactViewport
        ? CompactView.Canvas
        : this.state.compactView,
      desktopSidebarCollapsed: false,
    });
    void this.refreshServerLogs();
  }

  private async handleCreateWorkflow(): Promise<void> {
    if (!this.state.currentProject) {
      return;
    }

    this.setState({
      pendingAction: PendingAction.CreateWorkflow,
      errorMessage: null,
      noticeMessage: null,
    });

    try {
      const created = await this.workflowClient.upsertDefinition({
        projectId: this.state.currentProject.id,
        definition: createEmptyWorkflowDefinition({
          projectId: this.state.currentProject.id,
          workspaceId: readWorkspaceId(
            this.state.workspaceState,
            this.state.workflows,
            this.state.assets,
          ),
          name: `Workflow ${this.state.workflows.length + 1}`,
        }),
      });
      await this.reloadCatalog(this.state.currentProject.id, undefined, {
        preserveLocalDraft: false,
      });
      this.handleSelectWorkflow(created.id);
      this.setState({
        pendingAction: null,
        noticeMessage: "Workflow definition created.",
        errorMessage: null,
        selection: { type: "workflow", id: created.id },
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(
          error,
          "Could not create the workflow definition.",
        ),
        noticeMessage: null,
      });
    }
  }

  private async handleRunWorkflow(): Promise<void> {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    if (
      !this.state.currentProject ||
      !currentWorkflow ||
      this.state.dirtyWorkflow ||
      this.state.dirtyAssetIds.length > 0
    ) {
      return;
    }

    this.setState({
      pendingAction: PendingAction.RunWorkflow,
      liveExecution: createLiveExecutionState(currentWorkflow),
      debugExecutionId: null,
      selection: { type: "workflow", id: currentWorkflow.id },
      compactView: this.state.isCompactViewport
        ? CompactView.Canvas
        : this.state.compactView,
      errorMessage: null,
      noticeMessage: null,
    });
    this.cancelLiveExecutionStream();
    this.liveExecutionAbortController = new AbortController();

    try {
      await this.workflowClient.streamWorkflow({
        workflowId: currentWorkflow.id,
        signal: this.liveExecutionAbortController.signal,
        onEvent: (event) => {
          this.handleWorkflowRunStreamEvent(event);
        },
      });
      const completedExecution = this.readCompletedLiveExecution();
      if (!completedExecution) {
        throw new Error(
          "Workflow stream finished without a persisted execution.",
        );
      }
      await this.reloadCatalog(this.state.currentProject.id, undefined, {
        preserveLocalDraft: false,
      });
      await this.handleSelectExecution(completedExecution.id);
      this.setState({
        pendingAction: null,
        liveExecution: null,
        noticeMessage: "Workflow run persisted in execution history.",
        errorMessage: null,
        selection: { type: "execution", id: completedExecution.id },
        debugExecutionId: completedExecution.id,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not run the workflow."),
        noticeMessage: null,
      });
    } finally {
      this.cancelLiveExecutionStream();
      void this.refreshServerLogs();
    }
  }

  private async handleStopWorkflowExecution(): Promise<void> {
    const workflowId =
      this.state.liveExecution?.workflowId ?? this.state.draftWorkflow?.id;
    const executionId = workflowId
      ? this.readWorkflowActiveExecutionId(workflowId)
      : null;
    const selectionUpdate: Partial<WorkflowsScreenState> = workflowId
      ? {
          selection: { type: "workflow", id: workflowId },
        }
      : {};
    if (!executionId) {
      this.cancelLiveExecutionStream();
      this.setState({
        ...selectionUpdate,
        pendingAction: null,
        liveExecution: null,
        errorMessage: null,
        noticeMessage: null,
      });
      return;
    }

    this.setState({
      pendingAction: PendingAction.RunWorkflow,
      noticeMessage: null,
      errorMessage: null,
    });
    try {
      const execution = await this.workflowClient.cancelExecution({
        executionId,
      });
      this.cancelLiveExecutionStream();
      this.setState({
        ...selectionUpdate,
        pendingAction: null,
        liveExecution: null,
        executions: upsertExecutionRecord(this.state.executions, execution),
        debugExecutionId: execution.id,
        selection: { type: "execution", id: execution.id },
        errorMessage: null,
        noticeMessage: null,
      });
      if (this.state.currentProject) {
        void this.reloadExecutionCatalog(this.state.currentProject.id);
      }
    } catch (error) {
      this.cancelLiveExecutionStream();
      this.setState({
        ...selectionUpdate,
        pendingAction: null,
        liveExecution: null,
        errorMessage: readErrorMessage(error, "Could not stop the workflow."),
        noticeMessage: null,
      });
    }
  }

  private async handleTestNodeProvider(nodeId: string): Promise<void> {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    if (
      !this.state.currentProject ||
      !currentWorkflow ||
      this.state.dirtyWorkflow ||
      this.state.dirtyAssetIds.length > 0
    ) {
      return;
    }

    this.setState({
      pendingAction: PendingAction.TestProvider,
      activeProviderTestNodeId: nodeId,
      errorMessage: null,
      noticeMessage: null,
    });

    try {
      const result = await this.workflowClient.testNodeProvider({
        workflowId: currentWorkflow.id,
        nodeId,
      });
      await this.reloadCatalog(this.state.currentProject.id);
      this.handleSelectWorkflow(result.definition.id);
      this.setState({
        pendingAction: null,
        activeProviderTestNodeId: null,
        noticeMessage: result.message,
        errorMessage: null,
        selection: { type: "node", id: nodeId },
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        activeProviderTestNodeId: null,
        errorMessage: readErrorMessage(
          error,
          "Could not test the provider runtime.",
        ),
        noticeMessage: null,
      });
    } finally {
      void this.refreshServerLogs();
    }
  }

  private async handleSaveWorkflow(): Promise<void> {
    if (!this.state.currentProject || !this.state.draftWorkflow) {
      return;
    }

    this.setState({
      pendingAction: PendingAction.SaveWorkflow,
      errorMessage: null,
      noticeMessage: null,
    });

    try {
      const dirtyAssets = this.state.assets.filter((asset) =>
        this.state.dirtyAssetIds.includes(asset.id),
      );
      for (const asset of dirtyAssets) {
        await this.workflowClient.upsertAsset({
          projectId: this.state.currentProject.id,
          asset: stripAssetVersionFields(asset),
        });
      }

      const saved = await this.workflowClient.upsertDefinition({
        projectId: this.state.currentProject.id,
        definition: this.state.draftWorkflow,
      });
      await this.reloadCatalog(this.state.currentProject.id, undefined, {
        preserveLocalDraft: false,
      });
      this.handleSelectWorkflow(saved.id);
      this.setState({
        pendingAction: null,
        noticeMessage: "Workflow saved to the server workspace.",
        errorMessage: null,
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not save the workflow."),
        noticeMessage: null,
      });
    } finally {
      void this.refreshServerLogs();
    }
  }

  private async handleDeleteWorkflow(): Promise<void> {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    if (!this.state.currentProject || !currentWorkflow) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete ${currentWorkflow.name}?`)
    ) {
      return;
    }

    this.setState({
      pendingAction: PendingAction.DeleteWorkflow,
      errorMessage: null,
      noticeMessage: null,
    });

    try {
      await this.workflowClient.deleteDefinition({
        workflowId: currentWorkflow.id,
      });
      await this.reloadCatalog(this.state.currentProject.id);
      this.setState({
        pendingAction: null,
        noticeMessage: "Workflow deleted.",
        errorMessage: null,
        selection: {
          type: "workflow",
          id: this.state.workflows[0]?.id ?? null,
        },
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not delete the workflow."),
        noticeMessage: null,
      });
    } finally {
      void this.refreshServerLogs();
    }
  }

  private async handleAddNode(
    kind: WorkflowNodeKindValue,
    position?: ConnectionPreviewPoint,
  ): Promise<void> {
    if (!this.state.draftWorkflow || !this.state.currentProject) {
      return;
    }

    const assetKind = readNodeAssetKind(kind);
    if (assetKind) {
      const asset = await this.createAssetForNode(
        assetKind,
        undefined,
        kind === WorkflowNodeKind.AssetGuardrail,
        true,
      );
      if (!asset) {
        return;
      }
      const nextDefinition = addWorkflowNode(this.state.draftWorkflow, kind);
      const nextNode = nextDefinition.nodes[nextDefinition.nodes.length - 1];
      if (!nextNode) {
        return;
      }
      const positionedDefinition = position
        ? moveWorkflowNode(nextDefinition, nextNode.id, position)
        : nextDefinition;
      this.updateDraftWorkflow(
        {
          ...positionedDefinition,
          nodes: positionedDefinition.nodes.map((node) =>
            node.id === nextNode.id
              ? {
                  ...node,
                  config: {
                    ...node.config,
                    assetId: asset.id,
                  },
                }
              : node,
          ),
        },
        { type: "node", id: nextNode.id },
      );
      return;
    }

    const nextDefinition = addWorkflowNode(this.state.draftWorkflow, kind);
    const nextNode = nextDefinition.nodes[nextDefinition.nodes.length - 1];
    const positionedDefinition =
      nextNode && position
        ? moveWorkflowNode(nextDefinition, nextNode.id, position)
        : nextDefinition;
    this.updateDraftWorkflow(
      positionedDefinition,
      nextNode ? { type: "node", id: nextNode.id } : undefined,
    );
  }

  private async handleCreateAsset(
    kind: WorkflowAssetKindValue,
    focusNodeId?: string,
    attachToNode = false,
  ): Promise<void> {
    if (!this.state.currentProject) {
      return;
    }

    await this.createAssetForNode(kind, focusNodeId, attachToNode);
  }

  private async createAssetForNode(
    kind: WorkflowAssetKindValue,
    focusNodeId?: string,
    attachToNode = false,
    suppressNotice = false,
  ): Promise<WorkflowAssetRecord | null> {
    if (!this.state.currentProject) {
      return null;
    }

    this.setState({
      pendingAction: PendingAction.CreateAsset,
      errorMessage: null,
      noticeMessage: null,
    });

    try {
      const asset = await this.workflowClient.upsertAsset({
        projectId: this.state.currentProject.id,
        asset: createWorkflowAssetDraft({
          kind,
          projectId: this.state.currentProject.id,
          workspaceId: readWorkspaceId(
            this.state.workspaceState,
            this.state.workflows,
            this.state.assets,
          ),
        }),
      });
      await this.reloadAssetCatalog(this.state.currentProject.id);
      const nextDraftWorkflow =
        attachToNode && focusNodeId && this.state.draftWorkflow
          ? attachGuardrailToNode(
              this.state.draftWorkflow,
              focusNodeId,
              asset.id,
            )
          : this.state.draftWorkflow;
      const nextSelection: WorkflowSelection =
        attachToNode && focusNodeId
          ? { type: "node", id: focusNodeId }
          : { type: "asset", id: asset.id };
      this.setState({
        pendingAction: null,
        noticeMessage: suppressNotice
          ? this.state.noticeMessage
          : `${readAssetKindLabel(kind)} asset created.`,
        errorMessage: null,
        selection: nextSelection,
        guardrailAttachAssetId:
          kind === WorkflowAssetKind.Guardrail
            ? asset.id
            : this.state.guardrailAttachAssetId,
        ...(nextDraftWorkflow
          ? {
              draftWorkflow: nextDraftWorkflow,
              dirtyWorkflow: attachToNode ? true : this.state.dirtyWorkflow,
            }
          : {}),
      });
      return asset;
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(
          error,
          "Could not create the reusable asset.",
        ),
        noticeMessage: null,
      });
      return null;
    }
  }

  private async handleSelectExecution(executionId: string): Promise<void> {
    const execution = this.state.executions.find(
      (entry) => entry.id === executionId,
    );
    if (!execution) {
      return;
    }

    this.setState({
      selection: { type: "execution", id: executionId },
      debugExecutionId: executionId,
      loadingExecutionId: executionId,
      errorMessage: null,
      noticeMessage: null,
      compactView: this.state.isCompactViewport
        ? CompactView.Canvas
        : this.state.compactView,
      desktopSidebarCollapsed: false,
    });

    try {
      const hydratedExecution = await this.workflowClient.getExecution({
        executionId,
      });
      this.setState({
        executions: this.state.executions.map((entry) =>
          entry.id === executionId ? hydratedExecution : entry,
        ),
        loadingExecutionId: null,
        selection: { type: "execution", id: executionId },
        debugExecutionId: executionId,
      });
      void this.refreshServerLogs();
    } catch (error) {
      this.setState({
        loadingExecutionId: null,
        errorMessage: readErrorMessage(
          error,
          "Could not load the selected execution.",
        ),
        noticeMessage: null,
      });
    }
  }

  private async handleDeleteExecution(executionId: string): Promise<void> {
    if (!this.state.currentProject) {
      return;
    }

    this.setState({
      pendingAction: PendingAction.DeleteExecution,
      errorMessage: null,
      noticeMessage: null,
    });

    try {
      await this.workflowClient.deleteExecution({ executionId });
      await this.reloadCatalog(this.state.currentProject.id);
      this.setState({
        pendingAction: null,
        loadingExecutionId:
          this.state.loadingExecutionId === executionId
            ? null
            : this.state.loadingExecutionId,
        noticeMessage: "Execution deleted.",
        errorMessage: null,
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        loadingExecutionId:
          this.state.loadingExecutionId === executionId
            ? null
            : this.state.loadingExecutionId,
        errorMessage: readErrorMessage(
          error,
          "Could not delete the execution record.",
        ),
        noticeMessage: null,
      });
    }
  }

  private handleSelectExecutionFilter(filter: ExecutionHistoryFilter): void {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    if (!currentWorkflow) {
      this.setState({ executionHistoryFilter: filter });
      return;
    }

    const executions = readWorkflowExecutions(
      this.state.executions,
      currentWorkflow.id,
    );
    const filteredExecutions = readFilteredExecutions(executions, filter);
    const selection =
      this.state.selection.type === "execution" &&
      !filteredExecutions.some(
        (execution) => execution.id === this.state.selection.id,
      )
        ? ({
            type: "workflow",
            id: currentWorkflow.id,
          } satisfies WorkflowSelection)
        : this.state.selection;

    this.setState({
      executionHistoryFilter: filter,
      selection,
      loadingExecutionId:
        selection.type === "execution" ? this.state.loadingExecutionId : null,
    });
  }

  private handleExecutionAutoRefreshChange(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    this.setState({
      executionAutoRefreshEnabled: event.target.checked,
    });
    this.syncExecutionRefreshPolling();
  }

  private handleNodePointerDown(event: PointerEvent, nodeId: string): void {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (this.spacePanPressed) {
      this.handleCanvasPointerDown(event);
      return;
    }

    if (
      this.state.selection.type === "execution" ||
      this.state.liveExecution !== null
    ) {
      if (this.state.selection.type === "execution") {
        this.setState({
          debugExecutionId: this.state.selection.id,
          executionNodeModal: null,
          selection: { type: "node", id: nodeId },
          editorModalOpen: true,
        });
        return;
      }

      this.openExecutionNodeModal(nodeId);
      return;
    }

    const shouldOpenEditor = shouldOpenNodeModalFromPointerSequence({
      nodeId,
      eventDetail: event.detail,
      eventTime: event.timeStamp,
      previousNodeId: this.lastNodePointerDown?.nodeId ?? null,
      previousEventTime: this.lastNodePointerDown?.eventTime ?? null,
    });
    this.lastNodePointerDown = {
      nodeId,
      eventTime: event.timeStamp,
    };

    if (shouldOpenEditor) {
      event.preventDefault();
      event.stopPropagation();
      this.draggingNodeId = null;
      this.dragPointerOffset = null;
      this.lastNodePointerDown = null;
      this.openSelectionEditorModal({ type: "node", id: nodeId });
      return;
    }

    if (
      event.target.closest("button") &&
      !event.target.closest("[data-drag-handle]")
    ) {
      return;
    }

    const node = this.state.draftWorkflow?.nodes.find(
      (entry) => entry.id === nodeId,
    );
    if (!node) {
      return;
    }

    const viewport = this.state.draftWorkflow?.viewport;
    const surfaceRect = this.readCanvasSurfaceRect();
    if (!surfaceRect || !viewport) {
      return;
    }

    this.draggingNodeId = nodeId;
    this.dragPointerOffset = {
      x:
        (event.clientX - surfaceRect.left - viewport.x) / viewport.zoom -
        node.position.x,
      y:
        (event.clientY - surfaceRect.top - viewport.y) / viewport.zoom -
        node.position.y,
    };
    this.setState({
      selection: { type: "node", id: nodeId },
      compactView: this.state.isCompactViewport
        ? CompactView.Canvas
        : this.state.compactView,
      desktopSidebarCollapsed: false,
    });
  }

  private handleCanvasDragOver(event: DragEvent): void {
    if (!this.state.draftWorkflow || !event.dataTransfer) {
      return;
    }

    if (this.readDraggedNodeKind(event.dataTransfer) === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  private async handleCanvasDrop(event: DragEvent): Promise<void> {
    if (!this.state.draftWorkflow || !event.dataTransfer) {
      return;
    }

    const kind = this.readDraggedNodeKind(event.dataTransfer);
    if (kind === null) {
      return;
    }

    const position = this.readCanvasPoint(event.clientX, event.clientY);
    if (!position) {
      return;
    }

    event.preventDefault();
    await this.handleAddNode(kind, position);
  }

  private handleNodePaletteDragStart(
    event: DragEvent,
    kind: WorkflowNodeKindValue,
  ): void {
    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(WorkflowNodePaletteDragMimeType, kind);
    event.dataTransfer.setData("text/plain", readNodeKindLabel(kind));
  }

  private readDraggedNodeKind(
    dataTransfer: DataTransfer,
  ): WorkflowNodeKindValue | null {
    const value = dataTransfer.getData(WorkflowNodePaletteDragMimeType);
    return readWorkflowNodeKindDropValue(value);
  }

  private handleCanvasPointerDown(event: PointerEvent): void {
    if (!(event.target instanceof Element) || event.button !== 0) {
      return;
    }

    if (
      this.connectionDragging ||
      event.target.closest("[data-port-handle]") ||
      event.target.closest("button, input, textarea, select")
    ) {
      return;
    }

    if (event.target.closest("[data-node-id]") && !this.spacePanPressed) {
      return;
    }

    const viewport = this.state.draftWorkflow?.viewport;
    if (!viewport) {
      return;
    }

    event.preventDefault();
    this.panning = true;
    this.panOrigin = {
      x: event.clientX,
      y: event.clientY,
    };
    this.panViewportOrigin = { ...viewport };
    this.setState({
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null,
    });
  }

  private handleCanvasWheel(event: WheelEvent): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    event.preventDefault();
    this.handleZoom(event.deltaY > 0 ? -0.08 : 0.08);
  }

  private handleCanvasPointerMove(event: PointerEvent): void {
    if (!this.state.pendingConnection || !this.state.draftWorkflow) {
      return;
    }

    const previewPoint = this.readCanvasPoint(event.clientX, event.clientY);
    if (!previewPoint) {
      return;
    }

    this.setState({
      connectionPreviewPoint: previewPoint,
    });
  }

  private handleCanvasMouseMove(event: MouseEvent): void {
    if (
      this.state.hoveredEdgeId === null ||
      this.connectionDragging ||
      this.state.pendingConnection
    ) {
      return;
    }

    const target =
      event.target instanceof HTMLElement || event.target instanceof SVGElement
        ? event.target
        : null;
    const isStillOnEdgeControl =
      target?.closest(
        "[data-testid^='workflows-edge-hit-'], [data-testid^='workflows-edge-delete-']",
      ) !== null;
    if (isStillOnEdgeControl) {
      return;
    }

    this.setState({ hoveredEdgeId: null });
  }

  private handlePortPointerDown(
    event: MouseEvent,
    nodeId: string,
    portId: string,
    side: PortSide,
  ): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    if (side !== "output") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.connectionDragging = true;
    this.startConnectionMode(nodeId, portId);
    const previewPoint = this.readCanvasPoint(event.clientX, event.clientY);
    if (previewPoint) {
      this.setState({
        connectionPreviewPoint: previewPoint,
      });
    }
  }

  private handlePortPointerUp(
    event: MouseEvent,
    nodeId: string,
    portId: string,
    side: PortSide,
  ): void {
    if (
      side !== "input" ||
      !this.connectionDragging ||
      this.state.pendingConnection === null
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.connectionDragging = false;
    this.completeConnection(nodeId, portId);
  }

  private handleNodeConnectionMouseMove(event: MouseEvent): void {
    if (!this.connectionDragging || this.state.pendingConnection === null) {
      return;
    }

    const hoveredTarget = this.readInputDropTargetAtClientPoint(
      event.clientX,
      event.clientY,
    );
    if (!hoveredTarget) {
      if (this.state.hoveredPort !== null) {
        this.setState({
          hoveredPort: null,
        });
      }
      return;
    }

    const nextHoveredPort: HoveredPort = {
      ...hoveredTarget,
      side: "input",
    };
    const point = this.state.draftWorkflow
      ? readHoveredInputAnchorPoint(
          this.state.draftWorkflow.nodes,
          nextHoveredPort,
        )
      : null;
    this.setState({
      hoveredPort: nextHoveredPort,
      ...(point ? { connectionPreviewPoint: point } : {}),
    });
  }

  private handleNodeConnectionMouseUp(event: MouseEvent): void {
    if (!this.connectionDragging || this.state.pendingConnection === null) {
      return;
    }

    const hoveredTarget = this.readInputDropTargetAtClientPoint(
      event.clientX,
      event.clientY,
    );
    if (!hoveredTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.connectionDragging = false;
    this.completeConnection(hoveredTarget.nodeId, hoveredTarget.portId);
  }

  private handlePortHover(
    nodeId: string,
    portId: string,
    side: PortSide,
  ): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    const nextHoveredPort: HoveredPort = {
      nodeId,
      portId,
      side,
    };

    const nextState: Partial<WorkflowsScreenState> = {
      hoveredPort: nextHoveredPort,
    };

    if (this.state.pendingConnection && side === "input") {
      const point = readHoveredInputAnchorPoint(
        this.state.draftWorkflow.nodes,
        nextHoveredPort,
      );
      if (point) {
        nextState.connectionPreviewPoint = point;
      }
    }

    this.setState(nextState);
  }

  private handlePortHoverEnd(
    nodeId: string,
    portId: string,
    side: PortSide,
  ): void {
    const hoveredPort = this.state.hoveredPort;
    if (!hoveredPort) {
      return;
    }

    if (
      hoveredPort.nodeId !== nodeId ||
      hoveredPort.portId !== portId ||
      hoveredPort.side !== side
    ) {
      return;
    }

    this.setState({
      hoveredPort: null,
    });
  }

  private completeConnection(nodeId: string, portId: string): void {
    if (!this.state.draftWorkflow || !this.state.pendingConnection) {
      return;
    }

    const source = this.state.pendingConnection;
    const nextDefinition = connectWorkflowNodes(this.state.draftWorkflow, {
      sourceNodeId: source.nodeId,
      sourcePortId: source.portId,
      targetNodeId: nodeId,
      targetPortId: portId,
    });
    this.updateDraftWorkflow(nextDefinition, { type: "node", id: nodeId });
    this.setState({
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null,
      errorMessage: null,
    });
  }

  private startConnectionMode(nodeId: string, portId: string): void {
    this.setState({
      pendingConnection: {
        nodeId,
        portId,
      },
      selection: { type: "node", id: nodeId },
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: this.readPortPreviewOrigin(nodeId, portId),
    });
  }

  private handleRemoveEdge(event: Event, edgeId: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.state.draftWorkflow) {
      return;
    }

    this.updateDraftWorkflow(
      removeWorkflowEdge(this.state.draftWorkflow, edgeId),
    );
    this.setState({
      hoveredEdgeId: null,
      noticeMessage: "Connection removed.",
      errorMessage: null,
    });
  }

  private handleAddMappingEntry(
    edge: WorkflowDefinitionUpsertInput["edges"][number],
  ): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    const sourcePath = this.state.mappingSourcePath.trim();
    const mappingEntry: EdgeMappingEntryRecord = {
      targetPath: this.state.mappingTargetPath.trim(),
      source: readMappingSourceRecord(edge.sourceNodeId, sourcePath),
    };
    const nextWorkflow = addWorkflowEdgeMappingEntry(
      this.state.draftWorkflow,
      edge.id,
      mappingEntry,
    );
    this.updateDraftWorkflow(nextWorkflow, this.state.selection);
  }

  private handleAddGuardrailValidation(assetId: string): void {
    const current = this.state.assets.find((asset) => asset.id === assetId);
    if (!current) {
      return;
    }

    const nextBaseAsset = addWorkflowGuardrailValidation(current);
    const nextGuardrail = nextBaseAsset.guardrail;
    if (!nextGuardrail) {
      return;
    }

    const validation =
      nextGuardrail.validations[nextGuardrail.validations.length - 1];
    if (!validation) {
      return;
    }

    this.updateAssetDraft(assetId, {
      ...current,
      guardrail: {
        ...nextGuardrail,
        validations: nextGuardrail.validations.map((entry) =>
          entry.id === validation.id
            ? {
                ...entry,
                kind: this.state.guardrailValidationKind,
                target: this.state.guardrailValidationTarget,
                path: this.state.guardrailValidationPath.trim(),
                ...readGuardrailValidationValue(
                  this.state.guardrailValidationKind,
                  this.state.guardrailValidationValue,
                ),
                message: this.state.guardrailValidationMessage.trim(),
              }
            : entry,
        ),
      },
    });
  }

  private handleRemoveGuardrailValidation(
    assetId: string,
    validationId: string,
  ): void {
    this.patchGuardrailAsset(assetId, (guardrail) => ({
      ...guardrail,
      validations: guardrail.validations.filter(
        (validation) => validation.id !== validationId,
      ),
    }));
  }

  private handleEdgeDeletePointerStart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private handleEdgeHover(edgeId: string): void {
    if (this.state.hoveredEdgeId === edgeId) {
      return;
    }

    this.setState({ hoveredEdgeId: edgeId });
  }

  private handleRemoveSelectedNode(): void {
    const selectedNode = this.readSelectedNode();
    if (!selectedNode) {
      return;
    }

    this.handleRemoveNode(selectedNode.id);
  }

  private handleRemoveNode(nodeId: string): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    const nextDefinition = removeWorkflowNode(this.state.draftWorkflow, nodeId);
    this.setState({ editorModalOpen: false });
    this.updateDraftWorkflow(nextDefinition, {
      type: "workflow",
      id: null,
    });
  }

  private handleZoom(delta: number): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    this.updateDraftWorkflow(
      setWorkflowViewport(this.state.draftWorkflow, {
        ...this.state.draftWorkflow.viewport,
        zoom: this.state.draftWorkflow.viewport.zoom + delta,
      }),
    );
  }

  private handleResetViewport(): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    this.updateDraftWorkflow(
      setWorkflowViewport(this.state.draftWorkflow, {
        x: 96,
        y: 96,
        zoom: 1,
      }),
    );
  }

  private handleFitViewport(): void {
    const workflow = this.state.draftWorkflow;
    if (!workflow) {
      return;
    }

    const nextViewport = readWorkflowFitViewport(workflow);
    this.updateDraftWorkflow(setWorkflowViewport(workflow, nextViewport));
  }

  private updateDraftWorkflow(
    nextDefinition: WorkflowDefinitionUpsertInput,
    nextSelection?: WorkflowSelection,
  ): void {
    const currentDraft = this.state.draftWorkflow;
    const isMeaningfulChange =
      currentDraft !== null &&
      !isWorkflowViewportOnlyChange(currentDraft, nextDefinition) &&
      JSON.stringify(currentDraft) !== JSON.stringify(nextDefinition);
    const workflowEditHistory = isMeaningfulChange
      ? [
          createWorkflowEditHistoryEntry(currentDraft),
          ...this.state.workflowEditHistory,
        ].slice(0, WorkflowEditHistoryLimit)
      : this.state.workflowEditHistory;

    this.setState({
      draftWorkflow: nextDefinition,
      selection: nextSelection ?? this.state.selection,
      workflowEditHistory,
      dirtyWorkflow:
        this.state.dirtyWorkflow ||
        !currentDraft ||
        !isWorkflowViewportOnlyChange(currentDraft, nextDefinition),
    });
  }

  private patchDraftWorkflow(
    update: (
      workflow: WorkflowDefinitionUpsertInput,
    ) => WorkflowDefinitionUpsertInput,
    nextSelection?: WorkflowSelection,
  ): void {
    const current = this.state.draftWorkflow;
    if (!current) {
      return;
    }

    this.updateDraftWorkflow(update(current), nextSelection);
  }

  private updateSelectedNode(node: WorkflowNodeRecord): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    this.updateDraftWorkflow(
      {
        ...this.state.draftWorkflow,
        nodes: this.state.draftWorkflow.nodes.map((entry) =>
          entry.id === node.id ? node : entry,
        ),
      },
      { type: "node", id: node.id },
    );
  }

  private patchNode(
    nodeId: string,
    update: (node: WorkflowNodeRecord) => WorkflowNodeRecord,
  ): void {
    const current = this.state.draftWorkflow?.nodes.find(
      (node) => node.id === nodeId,
    );
    if (!current) {
      return;
    }

    this.updateSelectedNode(update(current));
  }

  private handleRenameNode(nodeId: string): void {
    const node = this.state.draftWorkflow?.nodes.find(
      (entry) => entry.id === nodeId,
    );
    if (!node) {
      return;
    }

    const nextLabel = window.prompt("Rename node", node.label);
    if (!nextLabel || nextLabel.trim().length === 0) {
      return;
    }

    this.patchNode(nodeId, (current) => ({
      ...current,
      label: nextLabel.trim(),
    }));
  }

  private handleDuplicateNode(nodeId: string): void {
    const workflow = this.state.draftWorkflow;
    const node = workflow?.nodes.find((entry) => entry.id === nodeId);
    if (!workflow || !node) {
      return;
    }

    const nextNodeId = crypto.randomUUID();
    const nextNode: WorkflowNodeRecord = {
      ...node,
      id: nextNodeId,
      label: `${node.label} copy`,
      position: {
        x: node.position.x + WorkflowNodeDuplicateOffset,
        y: node.position.y + WorkflowNodeDuplicateOffset,
      },
    };
    this.updateDraftWorkflow(
      {
        ...workflow,
        nodes: [...workflow.nodes, nextNode],
      },
      { type: "node", id: nextNodeId },
    );
  }

  private updateNodeProvider(
    nodeId: string,
    providerPatch: Partial<WorkflowProviderSelectionRecord>,
  ): void {
    this.patchNode(nodeId, (node) => ({
      ...node,
      config: {
        ...node.config,
        provider: {
          ...(node.config.provider ?? createFallbackProviderSelection()),
          ...providerPatch,
        },
      },
    }));
  }

  private updateAssetDraft(
    assetId: string,
    nextAsset: WorkflowAssetRecord,
  ): void {
    this.setState({
      assets: this.state.assets.map((asset) =>
        asset.id === assetId ? nextAsset : asset,
      ),
      dirtyAssetIds: this.state.dirtyAssetIds.includes(assetId)
        ? this.state.dirtyAssetIds
        : [...this.state.dirtyAssetIds, assetId],
      selection: { type: "asset", id: assetId },
      desktopSidebarCollapsed: false,
    });
  }

  private patchAsset(
    assetId: string,
    update: (asset: WorkflowAssetRecord) => WorkflowAssetRecord,
  ): void {
    const current = this.state.assets.find((asset) => asset.id === assetId);
    if (!current) {
      return;
    }

    this.updateAssetDraft(assetId, update(current));
  }

  private patchAssetExecutionPolicy(
    assetId: string,
    patch: Partial<WorkflowAssetExecutionPolicyRecord>,
  ): void {
    this.patchAsset(assetId, (asset) => ({
      ...asset,
      executionPolicy: normalizeWorkflowAssetExecutionPolicy({
        ...normalizeWorkflowAssetExecutionPolicy(asset.executionPolicy),
        ...patch,
      }),
    }));
  }

  private patchGuardrailAsset(
    assetId: string,
    update: (
      guardrail: NonNullable<WorkflowAssetRecord["guardrail"]>,
    ) => NonNullable<WorkflowAssetRecord["guardrail"]>,
  ): void {
    this.patchAsset(assetId, (asset) => {
      const nextAsset = updateWorkflowAssetGuardrail(asset, update);
      if (!nextAsset.guardrail) {
        return asset;
      }

      return {
        ...asset,
        guardrail: nextAsset.guardrail,
      };
    });
  }

  private readCurrentWorkflowRecord(): WorkflowDefinitionRecord | null {
    const draftId = this.state.draftWorkflow?.id;
    if (!draftId) {
      return this.state.workflows[0] ?? null;
    }

    return (
      this.state.workflows.find((workflow) => workflow.id === draftId) ?? null
    );
  }

  private readSelectedNode(): WorkflowNodeRecord | null {
    if (this.state.selection.type !== "node" || !this.state.draftWorkflow) {
      return null;
    }

    return (
      this.state.draftWorkflow.nodes.find(
        (node) => node.id === this.state.selection.id,
      ) ?? null
    );
  }

  private readSelectedAsset(): WorkflowAssetRecord | null {
    if (this.state.selection.type !== "asset") {
      return null;
    }

    return (
      this.state.assets.find((asset) => asset.id === this.state.selection.id) ??
      null
    );
  }

  private readSelectedExecution(): WorkflowExecutionRecord | null {
    if (this.state.selection.type !== "execution") {
      return null;
    }

    return (
      this.state.executions.find(
        (execution) => execution.id === this.state.selection.id,
      ) ?? null
    );
  }

  private readProviderProfileOptions(
    currentProviderId: string,
  ): ReadonlyArray<{ value: string; label: string }> {
    const profiles = this.state.workspaceState?.settings.providerProfiles ?? [];
    const profileOptions = profiles.map((profile) => ({
      value: profile.id,
      label: formatProviderProfileLabel(profile),
    }));
    const fallbackExists = profileOptions.some(
      (option) => option.value === currentProviderId,
    );

    if (currentProviderId.trim().length === 0 || fallbackExists) {
      return profileOptions.length > 0
        ? profileOptions
        : [{ value: ProviderFallbackId, label: "Codex CLI" }];
    }

    return [
      ...profileOptions,
      {
        value: currentProviderId,
        label:
          currentProviderId === ProviderFallbackId
            ? "Codex CLI"
            : currentProviderId,
      },
    ];
  }

  private readInspectorTitle(): string {
    if (
      this.state.liveExecution &&
      this.state.pendingAction === PendingAction.RunWorkflow
    ) {
      return "Live run";
    }

    if (this.state.selection.type === "node") {
      return this.readSelectedNode()?.label ?? "Selected node";
    }

    if (this.state.selection.type === "asset") {
      return this.readSelectedAsset()?.name ?? "Reusable asset";
    }

    if (this.state.selection.type === "execution") {
      const execution = this.readSelectedExecution();
      return execution
        ? readExecutionLabel(execution)
        : this.state.selection.id.slice(0, 8);
    }

    return this.state.draftWorkflow?.name ?? "Workflow";
  }

  private readInspectorSubtitle(): string {
    if (
      this.state.liveExecution &&
      this.state.pendingAction === PendingAction.RunWorkflow
    ) {
      const runningCount = Object.values(
        this.state.liveExecution.nodeRuns,
      ).filter((nodeRun) => nodeRun.status === "running").length;
      return `${formatSelectOptionLabel(this.state.liveExecution.status)} · ${runningCount.toString()} active node${runningCount === 1 ? "" : "s"}`;
    }

    if (this.state.selection.type === "node") {
      const node = this.readSelectedNode();
      return node ? readNodeKindLabel(node.kind) : "No node selected";
    }

    if (this.state.selection.type === "asset") {
      const asset = this.readSelectedAsset();
      return asset
        ? `${readAssetKindLabel(asset.kind)} · ${readAssetScopeLabel(asset.scope)}`
        : "No asset selected";
    }

    if (this.state.selection.type === "execution") {
      const execution = this.readSelectedExecution();
      return execution
        ? `${formatSelectOptionLabel(execution.status)} · ${formatDuration(execution.durationMs)} · ${execution.nodeRuns.length} node run${execution.nodeRuns.length === 1 ? "" : "s"}`
        : "Run detail";
    }

    return "Workflow metadata";
  }

  private readCanvasSurfaceRect(): DOMRect | null {
    const element = this.element?.querySelector(
      `[data-testid="${WorkflowScreenSelector.CanvasViewport}"]`,
    );
    return element instanceof HTMLElement
      ? element.getBoundingClientRect()
      : null;
  }

  private readCanvasPoint(
    clientX: number,
    clientY: number,
  ): ConnectionPreviewPoint | null {
    const viewport = this.state.draftWorkflow?.viewport;
    const surfaceRect = this.readCanvasSurfaceRect();
    if (!viewport || !surfaceRect) {
      return null;
    }

    return {
      x: Number(
        ((clientX - surfaceRect.left - viewport.x) / viewport.zoom).toFixed(2),
      ),
      y: Number(
        ((clientY - surfaceRect.top - viewport.y) / viewport.zoom).toFixed(2),
      ),
    };
  }

  private readPortPreviewOrigin(
    nodeId: string,
    portId: string,
  ): ConnectionPreviewPoint | null {
    const workflow = this.state.draftWorkflow;
    if (!workflow) {
      return null;
    }

    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return null;
    }

    const portIndex = node.outputPorts.findIndex((port) => port.id === portId);
    if (portIndex < 0) {
      return null;
    }

    return readPortAnchorPoint(
      node,
      "output",
      portIndex,
      node.outputPorts.length,
    );
  }

  private readPortHandleAtClientPoint(
    clientX: number,
    clientY: number,
  ): HoveredPort | null {
    if (typeof document === "undefined") {
      return null;
    }

    const element = document.elementFromPoint(clientX, clientY);
    const portHandle =
      element instanceof HTMLElement
        ? element.closest("[data-port-handle='true']")
        : null;
    if (!(portHandle instanceof HTMLElement)) {
      return null;
    }

    const nodeId = portHandle.dataset["portNodeId"];
    const portId = portHandle.dataset["portId"];
    const portSide = portHandle.dataset["portSide"];
    if (!nodeId || !portId || (portSide !== "input" && portSide !== "output")) {
      return null;
    }

    return {
      nodeId,
      portId,
      side: portSide,
    };
  }

  private readInputDropTargetAtClientPoint(
    clientX: number,
    clientY: number,
  ): NodeDropTarget | null {
    const geometricPort = this.readInputPortDropTargetByGeometry(
      clientX,
      clientY,
    );
    if (geometricPort) {
      return geometricPort;
    }

    const explicitPort = this.readPortHandleAtClientPoint(clientX, clientY);
    if (explicitPort?.side === "input") {
      return {
        nodeId: explicitPort.nodeId,
        portId: explicitPort.portId,
      };
    }

    const workflow = this.state.draftWorkflow;
    if (!workflow || typeof document === "undefined") {
      return null;
    }

    const element = document.elementFromPoint(clientX, clientY);
    const nodeElement =
      element instanceof HTMLElement ? element.closest("[data-node-id]") : null;
    if (!(nodeElement instanceof HTMLElement)) {
      return null;
    }

    const nodeId = nodeElement.dataset["nodeId"];
    if (!nodeId) {
      return null;
    }

    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    const inputPorts = node ? readNodeInputPorts(node) : [];
    if (!node || inputPorts.length === 0) {
      return null;
    }

    const nodeRect = nodeElement.getBoundingClientRect();
    const inputSnapWidth = Math.max(72, Math.min(124, nodeRect.width * 0.34));
    const horizontalPadding = 20;
    if (
      clientX > nodeRect.left + inputSnapWidth ||
      clientX < nodeRect.left - horizontalPadding
    ) {
      return null;
    }

    const relativeY = clientY - nodeRect.top;
    const nearestPort = inputPorts.reduce<{
      portId: string;
      distance: number;
    } | null>((closest, port, index) => {
      const portY = readPortOffset(index, inputPorts.length) + 10;
      const distance = Math.abs(relativeY - portY);
      if (!closest || distance < closest.distance) {
        return {
          portId: port.id,
          distance,
        };
      }

      return closest;
    }, null);

    if (!nearestPort) {
      return null;
    }

    return {
      nodeId,
      portId: nearestPort.portId,
    };
  }

  private readInputPortDropTargetByGeometry(
    clientX: number,
    clientY: number,
  ): NodeDropTarget | null {
    if (typeof document === "undefined") {
      return null;
    }

    const inputHandles = Array.from(
      document.querySelectorAll(
        "[data-port-handle='true'][data-port-side='input']",
      ),
    );
    const closest = inputHandles.reduce<{
      nodeId: string;
      portId: string;
      distance: number;
    } | null>((currentClosest, handle) => {
      if (!(handle instanceof HTMLElement)) {
        return currentClosest;
      }

      const nodeId = handle.dataset["portNodeId"];
      const portId = handle.dataset["portId"];
      if (!nodeId || !portId) {
        return currentClosest;
      }

      const rect = handle.getBoundingClientRect();
      const hitPaddingX = 42;
      const hitPaddingY = 18;
      const insideX =
        clientX >= rect.left - hitPaddingX &&
        clientX <= rect.right + hitPaddingX;
      const insideY =
        clientY >= rect.top - hitPaddingY &&
        clientY <= rect.bottom + hitPaddingY;
      if (!insideX || !insideY) {
        return currentClosest;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance =
        Math.abs(clientX - centerX) + Math.abs(clientY - centerY);
      if (!currentClosest || distance < currentClosest.distance) {
        return {
          nodeId,
          portId,
          distance,
        };
      }

      return currentClosest;
    }, null);

    return closest
      ? {
          nodeId: closest.nodeId,
          portId: closest.portId,
        }
      : null;
  }

  private readonly handleResize = (): void => {
    const isCompactViewport = readIsCompactViewport();
    if (isCompactViewport === this.state.isCompactViewport) {
      return;
    }

    this.setState({
      isCompactViewport,
      compactView: isCompactViewport
        ? CompactView.Canvas
        : this.state.compactView,
    });
  };

  private readonly handleGlobalPointerMove = (event: MouseEvent): void => {
    if (
      this.draggingNodeId &&
      this.dragPointerOffset &&
      this.state.draftWorkflow
    ) {
      const surfaceRect = this.readCanvasSurfaceRect();
      if (!surfaceRect) {
        return;
      }
      const viewport = this.state.draftWorkflow.viewport;
      const nextPosition = {
        x:
          (event.clientX - surfaceRect.left - viewport.x) / viewport.zoom -
          this.dragPointerOffset.x,
        y:
          (event.clientY - surfaceRect.top - viewport.y) / viewport.zoom -
          this.dragPointerOffset.y,
      };
      this.updateDraftWorkflow(
        moveWorkflowNode(
          this.state.draftWorkflow,
          this.draggingNodeId,
          nextPosition,
        ),
        { type: "node", id: this.draggingNodeId },
      );
      return;
    }

    if (this.connectionDragging && this.state.pendingConnection) {
      const previewPoint = this.readCanvasPoint(event.clientX, event.clientY);
      const hoveredTarget = this.readInputDropTargetAtClientPoint(
        event.clientX,
        event.clientY,
      );
      const hoveredPort = hoveredTarget
        ? {
            ...hoveredTarget,
            side: "input" as const,
          }
        : null;
      if (previewPoint) {
        this.setState({
          connectionPreviewPoint: previewPoint,
          hoveredPort,
        });
      }
      return;
    }

    if (
      this.panning &&
      this.panOrigin &&
      this.panViewportOrigin &&
      this.state.draftWorkflow
    ) {
      const nextViewport = setWorkflowViewport(this.state.draftWorkflow, {
        x: this.panViewportOrigin.x + (event.clientX - this.panOrigin.x),
        y: this.panViewportOrigin.y + (event.clientY - this.panOrigin.y),
        zoom: this.panViewportOrigin.zoom,
      });
      this.updateDraftWorkflow(nextViewport);
    }
  };

  private readonly handleGlobalPointerUp = (event: MouseEvent): void => {
    if (this.connectionDragging) {
      const hoveredTarget = this.readInputDropTargetAtClientPoint(
        event.clientX,
        event.clientY,
      );
      const hoveredPort = hoveredTarget
        ? {
            ...hoveredTarget,
            side: "input" as const,
          }
        : this.state.hoveredPort;
      if (hoveredPort?.side === "input") {
        this.connectionDragging = false;
        this.completeConnection(hoveredPort.nodeId, hoveredPort.portId);
      } else {
        this.connectionDragging = false;
        this.setState({
          pendingConnection: null,
          hoveredPort: null,
          hoveredEdgeId: null,
          connectionPreviewPoint: null,
        });
      }
    }

    this.draggingNodeId = null;
    this.dragPointerOffset = null;
    this.panning = false;
    this.panOrigin = null;
    this.panViewportOrigin = null;
  };

  private readonly handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if (this.state.editorModalOpen && event.key === "Escape") {
      event.preventDefault();
      this.closeSelectionEditorModal();
      return;
    }

    if (this.state.executionNodeModal) {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeExecutionNodeModal();
        return;
      }

      if (event.key === "ArrowRight" || event.key.toLowerCase() === "l") {
        event.preventDefault();
        this.stepExecutionNodeModal(1);
        return;
      }

      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "h") {
        event.preventDefault();
        this.stepExecutionNodeModal(-1);
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        void this.handlePinExecutionNodeModalSampleOutput();
        return;
      }
    }

    if (event.code === "Space") {
      this.spacePanPressed = true;
      return;
    }

    if (event.key !== "Escape" || this.state.pendingConnection === null) {
      return;
    }

    this.setState({
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null,
      noticeMessage: "Connection mode cancelled.",
      errorMessage: null,
    });
  };

  private readonly handleGlobalKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "Space") {
      this.spacePanPressed = false;
    }
  };

  private readNodeRunVisual(nodeId: string): {
    status: "idle" | "running" | "completed" | "warn" | "failed";
    label: string | null;
    detail: string | null;
    badgeStatus: "info" | "success" | "warning" | "running" | "failed";
  } {
    const liveNodeRun = this.state.liveExecution?.nodeRuns[nodeId];
    if (liveNodeRun?.status === "running") {
      return {
        status: "running",
        label: "Running",
        detail:
          summarizeOutputSnapshot(
            liveNodeRun.outputSnapshot ?? liveNodeRun.outputText,
          ) ?? "Streaming output...",
        badgeStatus: "running",
      };
    }

    if (liveNodeRun?.status === "completed") {
      return {
        status: "completed",
        label: "Done",
        detail:
          summarizeOutputSnapshot(
            liveNodeRun.outputSnapshot ?? liveNodeRun.outputText,
          ) ?? "Completed in current run.",
        badgeStatus: "success",
      };
    }

    if (liveNodeRun?.status === "warn") {
      return {
        status: "warn",
        label: "Warn",
        detail: summarizeOutputSnapshot(
          liveNodeRun.outputSnapshot ?? liveNodeRun.outputText,
        ),
        badgeStatus: "warning",
      };
    }

    if (liveNodeRun?.status === "failed") {
      return {
        status: "failed",
        label: "Error",
        detail:
          summarizeOutputSnapshot(
            liveNodeRun.outputSnapshot ?? liveNodeRun.outputText,
          ) ?? "Node failed during current run.",
        badgeStatus: "failed",
      };
    }

    const execution = this.readWorkflowCanvasExecution();
    const nodeRun =
      execution?.nodeRuns.find((entry) => entry.nodeId === nodeId) ?? null;
    if (!nodeRun) {
      return {
        status: "idle",
        label: null,
        detail: null,
        badgeStatus: "info",
      };
    }

    const detail = summarizeOutputSnapshot(nodeRun.outputSnapshot);
    if (nodeRun.status === "failed") {
      return {
        status: "failed",
        label: "Error",
        detail,
        badgeStatus: "failed",
      };
    }

    if (
      nodeRun.alerts.some(
        (alert) => alert.level === "warn" || alert.level === "error",
      )
    ) {
      return { status: "warn", label: "Warn", detail, badgeStatus: "warning" };
    }

    if (nodeRun.status === "running") {
      return {
        status: "running",
        label: "Running",
        detail,
        badgeStatus: "running",
      };
    }

    if (nodeRun.status === "completed") {
      return {
        status: "completed",
        label: "Done",
        detail,
        badgeStatus: "success",
      };
    }

    return {
      status: "idle",
      label: formatSelectOptionLabel(nodeRun.status),
      detail,
      badgeStatus: "info",
    };
  }

  private handleWorkflowRunStreamEvent(event: WorkflowRunStreamEvent): void {
    const currentLiveExecution = this.state.liveExecution;
    if (!currentLiveExecution) {
      return;
    }

    if (event.type === WorkflowRunStreamEventType.WorkflowStarted) {
      this.setState({
        pendingAction: null,
        liveExecution: {
          ...currentLiveExecution,
          workflowRunId: event.workflowRunId,
          startedAt: event.startedAt,
          status: "running",
          errorMessage: null,
        },
      });
      return;
    }

    if (event.type === WorkflowRunStreamEventType.NodeStarted) {
      this.setState({
        liveExecution: {
          ...currentLiveExecution,
          workflowRunId: event.workflowRunId,
          activeNodeId: event.nodeId,
          nodeRuns: {
            ...currentLiveExecution.nodeRuns,
            [event.nodeId]: {
              ...createPendingLiveNodeRunState(),
              status: "running",
              startedAt: event.startedAt,
            },
          },
        },
      });
      return;
    }

    if (event.type === WorkflowRunStreamEventType.NodeDelta) {
      const existingNodeRun =
        currentLiveExecution.nodeRuns[event.nodeId] ??
        createPendingLiveNodeRunState();
      this.setState({
        liveExecution: {
          ...currentLiveExecution,
          workflowRunId: event.workflowRunId,
          nodeRuns: {
            ...currentLiveExecution.nodeRuns,
            [event.nodeId]: {
              ...existingNodeRun,
              status: "running",
              outputText: `${existingNodeRun.outputText}${event.delta}`,
            },
          },
        },
      });
      return;
    }

    if (event.type === WorkflowRunStreamEventType.NodeCompleted) {
      const nextStatus =
        event.status === "failed"
          ? "failed"
          : event.guardrailFindings.some(
                (finding) => finding.severity === "warn",
              ) ||
              event.alerts.some(
                (alert) => alert.level === "warn" || alert.level === "error",
              )
            ? "warn"
            : "completed";
      this.setState({
        liveExecution: {
          ...currentLiveExecution,
          workflowRunId: event.workflowRunId,
          activeNodeId:
            currentLiveExecution.activeNodeId === event.nodeId
              ? null
              : currentLiveExecution.activeNodeId,
          completedNodeIds: currentLiveExecution.completedNodeIds.includes(
            event.nodeId,
          )
            ? currentLiveExecution.completedNodeIds
            : [...currentLiveExecution.completedNodeIds, event.nodeId],
          nodeRuns: {
            ...currentLiveExecution.nodeRuns,
            [event.nodeId]: {
              status: nextStatus,
              startedAt: event.startedAt,
              finishedAt: event.finishedAt,
              outputText:
                typeof event.outputSnapshot === "string"
                  ? event.outputSnapshot
                  : (currentLiveExecution.nodeRuns[event.nodeId]?.outputText ??
                    ""),
              outputSnapshot: event.outputSnapshot,
              alerts: event.alerts,
              guardrailFindings: event.guardrailFindings,
              ...(event.usage ? { usage: event.usage } : {}),
              ...(event.provider ? { provider: event.provider } : {}),
            },
          },
        },
      });
      return;
    }

    if (event.type === WorkflowRunStreamEventType.NodeFailed) {
      const existingNodeRun =
        currentLiveExecution.nodeRuns[event.nodeId] ??
        createPendingLiveNodeRunState();
      this.setState({
        liveExecution: {
          ...currentLiveExecution,
          workflowRunId: event.workflowRunId,
          activeNodeId: null,
          status: "failed",
          errorMessage: event.message,
          nodeRuns: {
            ...currentLiveExecution.nodeRuns,
            [event.nodeId]: {
              ...existingNodeRun,
              status: "failed",
              startedAt: event.startedAt,
              finishedAt: event.finishedAt,
              outputSnapshot: {
                error: event.message,
              },
              outputText: event.message,
            },
          },
        },
      });
      return;
    }

    if (event.type === WorkflowRunStreamEventType.WorkflowCompleted) {
      this.setState({
        liveExecution: {
          ...currentLiveExecution,
          workflowRunId: event.workflowRunId,
          activeNodeId: null,
          status: "completed",
          errorMessage: null,
        },
        executions: upsertExecutionRecord(
          this.state.executions,
          event.execution,
        ),
        debugExecutionId: event.execution.id,
      });
      return;
    }

    this.setState({
      pendingAction: null,
      liveExecution: {
        ...currentLiveExecution,
        workflowRunId: event.workflowRunId,
        activeNodeId: null,
        status: "failed",
        errorMessage: event.error ?? "Workflow run failed.",
      },
      executions: event.execution
        ? upsertExecutionRecord(this.state.executions, event.execution)
        : this.state.executions,
      debugExecutionId: event.execution?.id ?? this.state.debugExecutionId,
    });
  }

  private readCompletedLiveExecution(): WorkflowExecutionRecord | null {
    return this.state.liveExecution?.workflowRunId
      ? (this.state.executions.find(
          (execution) =>
            execution.id === this.state.liveExecution?.workflowRunId,
        ) ?? null)
      : null;
  }

  private cancelLiveExecutionStream(): void {
    if (this.liveExecutionAbortController) {
      this.liveExecutionAbortController.abort();
      this.liveExecutionAbortController = null;
    }
  }

  private syncExecutionRefreshPolling(): void {
    const action = readExecutionRefreshPollingAction({
      autoRefreshEnabled: this.state.executionAutoRefreshEnabled,
      isPolling: this.executionRefreshIntervalId !== null,
    });

    if (action === "stop") {
      this.stopExecutionRefreshPolling();
      return;
    }

    if (action === "keep") {
      return;
    }

    this.executionRefreshIntervalId = window.setInterval(() => {
      const projectId = this.state.currentProject?.id;
      if (
        !projectId ||
        this.state.pendingAction === PendingAction.RunWorkflow
      ) {
        return;
      }

      void this.reloadExecutionCatalog(projectId);
    }, ExecutionRefreshIntervalMs);
  }

  private stopExecutionRefreshPolling(): void {
    if (this.executionRefreshIntervalId === null) {
      return;
    }

    window.clearInterval(this.executionRefreshIntervalId);
    this.executionRefreshIntervalId = null;
  }
}

const groupAssetsByKind = (
  assets: ReadonlyArray<WorkflowAssetRecord>,
): ReadonlyArray<{
  kind: WorkflowAssetKindValue;
  assets: ReadonlyArray<WorkflowAssetRecord>;
}> =>
  [
    WorkflowAssetKind.Prompt,
    WorkflowAssetKind.Instruction,
    WorkflowAssetKind.Guardrail,
  ].map((kind) => ({
    kind,
    assets: assets.filter((asset) => asset.kind === kind),
  }));

const readUsageCount = (
  assetId: string,
  usages: ReadonlyArray<WorkflowAssetUsageRecord>,
): number => usages.filter((usage) => usage.assetId === assetId).length;

const readNodeSecondaryText = (node: WorkflowNodeRecord): string => {
  if (node.kind === WorkflowNodeKind.AiAgent) {
    return node.config.role ?? "planner";
  }

  if (node.kind === WorkflowNodeKind.AiProviderRun) {
    return node.config.provider?.providerId ?? "provider";
  }

  if (node.kind === WorkflowNodeKind.HumanReview) {
    return node.config.reviewPolicy?.requireHumanDecision
      ? "manual decision required"
      : "manual review";
  }

  return readNodeKindLabel(node.kind);
};

const readNodePaletteDescription = (kind: WorkflowNodeKindValue): string => {
  if (kind === WorkflowNodeKind.TriggerManual) {
    return "Single manual entrypoint for the MVP runtime.";
  }

  if (
    kind === WorkflowNodeKind.AssetPrompt ||
    kind === WorkflowNodeKind.AssetInstruction
  ) {
    return "Server-backed reusable asset node.";
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return "Reusable guardrail pack with severity semantics.";
  }

  if (
    kind === WorkflowNodeKind.AiAgent ||
    kind === WorkflowNodeKind.AiProviderRun
  ) {
    return "Runnable AI node with per-node provider controls.";
  }

  if (kind === WorkflowNodeKind.HumanReview) {
    return "Blocking approval checkpoint with two outputs.";
  }

  if (kind === WorkflowNodeKind.TerminalResponse) {
    return "Final response sink for API consumers.";
  }

  return "Logic helper node for the workflow graph.";
};

const readWorkflowNodeKindDropValue = (
  value: string,
): WorkflowNodeKindValue | null =>
  readNodeKindsForPalette().find((kind) => kind === value) ?? null;

const readNodeInputPorts = (
  node: WorkflowNodeRecord,
): WorkflowNodeRecord["inputPorts"] => {
  if (node.kind !== WorkflowNodeKind.LogicMerge) {
    return node.inputPorts;
  }

  return [
    {
      id: "input",
      name: "Input",
      acceptsMany: true,
    },
  ];
};

const readAccumulatedOutputPath = (nodeId: string, path: string): string => {
  if (path === "$") {
    return `$.${nodeId}`;
  }

  if (path.startsWith("$.")) {
    return `$.${nodeId}.${path.slice(2)}`;
  }

  return `$.${nodeId}.${path}`;
};

const readGuardrailVariableTokens =
  (): ReadonlyArray<WorkflowVariableToken> => [
    {
      id: "current-input-root",
      label: "Current input",
      detail: "Current node input",
      reference: {
        kind: WorkflowExpressionVariableKind.CurrentInput,
        path: "$",
      },
    },
    {
      id: "last-output-result",
      label: "Last output",
      detail: "Latest upstream output result",
      reference: {
        kind: WorkflowExpressionVariableKind.LastNodeOutput,
        path: "$.result",
      },
    },
    {
      id: "accumulated-outputs-root",
      label: "All outputs",
      detail: "Accumulated outputs",
      reference: {
        kind: WorkflowExpressionVariableKind.AccumulatedOutputs,
        path: "$",
      },
    },
  ];

const readMappingSourceLabel = (entry: EdgeMappingEntryRecord): string => {
  if (entry.source.kind === "literal") {
    return String(entry.source.value ?? "Literal");
  }

  if (entry.source.kind === "context_value") {
    return entry.source.path ?? "Workflow context";
  }

  if (entry.source.kind === "accumulated_outputs") {
    return entry.source.path
      ? `${AccumulatedOutputsSourceLabel} · ${entry.source.path}`
      : AccumulatedOutputsSourceLabel;
  }

  if (!entry.source.path || entry.source.path === LatestResponseSourcePath) {
    return LatestResponseSourceLabel;
  }

  return entry.source.path;
};

const readMappingSourceRecord = (
  sourceNodeId: string,
  sourcePath: string,
): EdgeMappingEntryRecord["source"] => {
  if (sourcePath.startsWith(AccumulatedOutputsSourcePrefix)) {
    return {
      kind: "accumulated_outputs",
      path: sourcePath.slice(AccumulatedOutputsSourcePrefix.length),
    };
  }

  if (sourcePath === LatestResponseSourcePath) {
    return {
      kind: "last_node_output",
      path: sourcePath,
    };
  }

  return {
    kind: "node_output",
    nodeId: sourceNodeId,
    path: sourcePath,
  };
};

const readPortOffset = (index: number, total: number): number => {
  const safeTotal = Math.max(total, 1);
  const spacing = 22;
  const start = 30;
  return start + Math.max(0, Math.floor((3 - safeTotal) * 6)) + index * spacing;
};

const readPortAnchorPoint = (
  node: WorkflowNodeRecord,
  side: PortSide,
  index: number,
  total: number,
): ConnectionPreviewPoint => ({
  x:
    side === "output"
      ? node.position.x + WorkflowNodeVisualWidth - 12
      : node.position.x + 12,
  y: node.position.y + readPortOffset(index, total) + 10,
});

const readHoveredInputAnchorPoint = (
  nodes: ReadonlyArray<WorkflowNodeRecord>,
  hoveredPort: HoveredPort,
): ConnectionPreviewPoint | null => {
  const node = nodes.find((entry) => entry.id === hoveredPort.nodeId);
  if (!node || hoveredPort.side !== "input") {
    return null;
  }

  const inputPorts = readNodeInputPorts(node);
  const index = inputPorts.findIndex((port) => port.id === hoveredPort.portId);
  if (index < 0) {
    return null;
  }

  return readPortAnchorPoint(node, "input", index, inputPorts.length);
};

const readEdgeCurvePath = (
  source: ConnectionPreviewPoint,
  target: ConnectionPreviewPoint,
): string => {
  const delta = Math.max(96, Math.abs(target.x - source.x) / 2);
  return `M ${source.x} ${source.y} C ${source.x + delta} ${source.y}, ${target.x - delta} ${target.y}, ${target.x} ${target.y}`;
};

const readEdgeDirectionCenter = (
  source: ConnectionPreviewPoint,
  target: ConnectionPreviewPoint,
): ConnectionPreviewPoint => ({
  x: Number(((source.x + target.x) / 2).toFixed(2)),
  y: Number(((source.y + target.y) / 2).toFixed(2)),
});

const readEdgeDirectionAngle = (
  source: ConnectionPreviewPoint,
  target: ConnectionPreviewPoint,
): number =>
  Number(
    (
      (Math.atan2(target.y - source.y, target.x - source.x) * 180) /
      Math.PI
    ).toFixed(2),
  );

const readEdgeDirectionArrowPath = (
  center: ConnectionPreviewPoint,
  size: number,
): string =>
  `M ${center.x + size} ${center.y} L ${center.x - size} ${center.y - size * 0.72} L ${center.x - size * 0.45} ${center.y} L ${center.x - size} ${center.y + size * 0.72} Z`;

const readEdgeActionPoint = (
  source: ConnectionPreviewPoint,
  target: ConnectionPreviewPoint,
  nodes: ReadonlyArray<WorkflowNodeRecord>,
): ConnectionPreviewPoint => {
  const midpoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2 - EdgeDeleteOffset / 2,
  };
  const candidates: ReadonlyArray<ConnectionPreviewPoint> = [
    midpoint,
    { x: midpoint.x, y: midpoint.y - EdgeDeleteOffset },
    { x: midpoint.x, y: midpoint.y + EdgeDeleteOffset },
    { x: midpoint.x - EdgeDeleteOffset, y: midpoint.y },
    { x: midpoint.x + EdgeDeleteOffset, y: midpoint.y },
    { x: midpoint.x - EdgeDeleteWideOffset, y: midpoint.y - EdgeDeleteOffset },
    { x: midpoint.x + EdgeDeleteWideOffset, y: midpoint.y - EdgeDeleteOffset },
    { x: midpoint.x - EdgeDeleteWideOffset, y: midpoint.y + EdgeDeleteOffset },
    { x: midpoint.x + EdgeDeleteWideOffset, y: midpoint.y + EdgeDeleteOffset },
    { x: source.x + EdgeDeleteOffset, y: source.y - EdgeDeleteOffset },
    { x: source.x + EdgeDeleteWideOffset, y: source.y - EdgeDeleteWideOffset },
    { x: source.x + EdgeDeleteWideOffset, y: source.y + EdgeDeleteWideOffset },
    { x: target.x - EdgeDeleteOffset, y: target.y - EdgeDeleteOffset },
    { x: target.x - EdgeDeleteWideOffset, y: target.y - EdgeDeleteWideOffset },
    { x: target.x - EdgeDeleteWideOffset, y: target.y + EdgeDeleteWideOffset },
  ];
  const preferred =
    candidates.find(
      (candidate) => !edgeDeletePointOverlapsNode(candidate, nodes),
    ) ?? midpoint;

  return {
    x: Number(preferred.x.toFixed(2)),
    y: Number(preferred.y.toFixed(2)),
  };
};

const edgeDeletePointOverlapsNode = (
  point: ConnectionPreviewPoint,
  nodes: ReadonlyArray<WorkflowNodeRecord>,
): boolean =>
  nodes.some((node) => {
    const halfButton = EdgeDeleteButtonSize / 2;
    const left = node.position.x - EdgeDeleteNodeAvoidancePadding - halfButton;
    const right =
      node.position.x +
      WorkflowNodeVisualWidth +
      EdgeDeleteNodeAvoidancePadding +
      halfButton;
    const top = node.position.y - EdgeDeleteNodeAvoidancePadding - halfButton;
    const bottom =
      node.position.y +
      WorkflowNodeApproximateHeight +
      EdgeDeleteNodeAvoidancePadding +
      halfButton;
    return (
      point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
    );
  });

const hoveredPortUsesActiveArrow = (hoveredPort: HoveredPort | null): boolean =>
  hoveredPort?.side === "input";

const createLiveExecutionState = (
  workflow: WorkflowDefinitionRecord,
): LiveExecutionState => ({
  workflowId: workflow.id,
  workflowRunId: null,
  startedAt: new Date().toISOString(),
  activeNodeId: null,
  completedNodeIds: [],
  status: "running",
  errorMessage: null,
  nodeRuns: Object.fromEntries(
    workflow.nodes.map((node) => [node.id, createPendingLiveNodeRunState()]),
  ),
});

const createPendingLiveNodeRunState = (): LiveNodeRunState => ({
  status: "pending",
  outputText: "",
  alerts: [],
  guardrailFindings: [],
});

const DebugTableMaximumRows = 50;

const readWorkflowDebugBadgeStatus = (
  tone: WorkflowDebugStatusTone,
): "info" | "success" | "warning" | "running" | "failed" => {
  if (tone === "success") {
    return "success";
  }

  if (tone === "warning") {
    return "warning";
  }

  if (tone === "failed") {
    return "failed";
  }

  if (tone === "running") {
    return "running";
  }

  return "info";
};

const readWorkflowDebugStatusLabel = (
  tone: WorkflowDebugStatusTone,
): string => {
  if (tone === "success") {
    return "Succeeded";
  }

  if (tone === "warning") {
    return "Warning";
  }

  if (tone === "failed") {
    return "Failed";
  }

  if (tone === "running") {
    return "Running";
  }

  return "Queued";
};

const readWorkflowDebugDotClassName = (
  tone: WorkflowDebugStatusTone,
): string => {
  if (tone === "success") {
    return "bg-emerald-400";
  }

  if (tone === "warning") {
    return "bg-amber-300";
  }

  if (tone === "failed") {
    return "bg-rose-400";
  }

  if (tone === "running") {
    return "bg-sky-300";
  }

  return "bg-slate-500";
};

const readExecutionHistoryAccentClassName = (
  execution: WorkflowExecutionRecord,
): string => {
  if (execution.status === "failed" || execution.errorsCount > 0) {
    return "bg-[#ff5c5c]";
  }

  if (
    execution.status === "running" ||
    execution.status === "awaiting_review" ||
    execution.status === "canceled" ||
    execution.warningsCount > 0
  ) {
    return "bg-[#f7c948]";
  }

  return "bg-[#72dd9b]";
};

const readWorkflowDebugTableColumns = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<string> => {
  const columns = new Set<string>();

  for (const row of rows.slice(0, DebugTableMaximumRows)) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      for (const key of Object.keys(row)) {
        columns.add(key);
      }
    }
  }

  return [...columns].slice(0, 8);
};

const readWorkflowDebugTableCell = (row: unknown, column: string): string => {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return formatOutputSnapshot(row);
  }

  return (
    summarizeOutputSnapshot((row as Record<string, unknown>)[column]) ?? ""
  );
};

const readNodeRunToneClassName = (
  status: "idle" | "running" | "completed" | "warn" | "failed",
): string => {
  if (status === "running") {
    return "border-sky-400/80 shadow-[0_12px_32px_rgba(56,189,248,0.16)]";
  }

  if (status === "completed") {
    return "border-emerald-500/70 shadow-[0_10px_28px_rgba(16,185,129,0.14)]";
  }

  if (status === "warn") {
    return "border-amber-400/80 shadow-[0_10px_28px_rgba(251,191,36,0.14)]";
  }

  if (status === "failed") {
    return "border-rose-500/80 shadow-[0_12px_32px_rgba(244,63,94,0.18)]";
  }

  return "border-border-dark";
};

const readNodeRunCountLabel = (label: string): string => {
  const match = label.match(/\d+/u);
  return match?.[0] ?? "1";
};

const readNodeRunAccentClassName = (
  status: "idle" | "running" | "completed" | "warn" | "failed",
): string | null => {
  if (status === "running") {
    return "from-sky-400 via-cyan-300 to-sky-500";
  }

  if (status === "completed") {
    return "from-emerald-500 via-green-400 to-emerald-400";
  }

  if (status === "warn") {
    return "from-amber-400 via-yellow-300 to-orange-400";
  }

  if (status === "failed") {
    return "from-rose-500 via-red-400 to-pink-500";
  }

  return null;
};

const readOutputSnapshotKindLabel = (value: unknown): string => {
  if (value === null) {
    return "Null";
  }

  if (Array.isArray(value)) {
    return `Array · ${value.length.toString()} item${value.length === 1 ? "" : "s"}`;
  }

  if (value instanceof Error) {
    return "Error";
  }

  if (typeof value === "object") {
    return `Object · ${Object.keys(value).length.toString()} field${Object.keys(value).length === 1 ? "" : "s"}`;
  }

  return formatSelectOptionLabel(typeof value);
};

const summarizeOutputSnapshot = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return "Empty string";
    }

    return trimmed.length > 88 ? `${trimmed.slice(0, 85)}...` : trimmed;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Empty array";
    }

    const preview = value
      .slice(0, 2)
      .map(
        (entry) =>
          summarizeOutputSnapshot(entry) ??
          formatSelectOptionLabel(typeof entry),
      )
      .join(" · ");
    return value.length > 2 ? `${preview}...` : preview;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "Empty object";
    }

    const preview = entries
      .slice(0, 2)
      .map(
        ([key, entryValue]) =>
          `${key}: ${summarizeOutputSnapshot(entryValue) ?? formatSelectOptionLabel(typeof entryValue)}`,
      )
      .join(" · ");
    return entries.length > 2 ? `${preview}...` : preview;
  }

  return null;
};

const formatOutputSnapshot = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "undefined";
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const readLiveNodeRunBadgeStatus = (
  status: LiveNodeRunState["status"],
): "info" | "success" | "warning" | "running" | "failed" => {
  if (status === "running") {
    return "running";
  }

  if (status === "completed") {
    return "success";
  }

  if (status === "warn") {
    return "warning";
  }

  if (status === "failed") {
    return "failed";
  }

  return "info";
};

const readLiveNodeRunMeta = (run: LiveNodeRunState): string => {
  if (run.status === "pending") {
    return "Queued";
  }

  if (run.status === "running") {
    return "Streaming";
  }

  if (run.startedAt && run.finishedAt) {
    return formatDuration(
      new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime(),
    );
  }

  return formatSelectOptionLabel(run.status);
};

const formatProviderLabel = (
  provider: WorkflowProviderSelectionRecord,
): string => {
  const model =
    provider.modelId.trim().length > 0 ? ` · ${provider.modelId}` : "";
  return `${provider.providerId}${model}`;
};

const upsertExecutionRecord = (
  executions: ReadonlyArray<WorkflowExecutionRecord>,
  execution: WorkflowExecutionRecord,
): ReadonlyArray<WorkflowExecutionRecord> => {
  if (executions.some((entry) => entry.id === execution.id)) {
    return executions.map((entry) =>
      entry.id === execution.id ? execution : entry,
    );
  }

  return [execution, ...executions];
};

const createWorkflowEditHistoryEntry = (
  workflow: WorkflowDefinitionUpsertInput,
): WorkflowEditHistoryEntry<WorkflowDefinitionUpsertInput> => {
  const changedAt = new Date().toISOString();
  return {
    id: `${changedAt}-${workflow.id ?? workflow.name}`,
    label: workflow.name,
    changedAt,
    workflow,
  };
};

const readCanvasBackgroundStyle = (
  viewport: WorkflowViewportRecord,
  executionView: boolean,
): string => {
  if (executionView) {
    return "background-color:#202020;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.035) 0,rgba(255,255,255,0.035) 2px,transparent 2px,transparent 10px);";
  }

  const gridSize = Math.max(14, Math.round(24 * viewport.zoom));
  const offsetX = Math.round(viewport.x % gridSize);
  const offsetY = Math.round(viewport.y % gridSize);
  return `background-color:#11161d;background-image:radial-gradient(circle, rgba(120,132,145,0.22) 1px, transparent 1px);background-size:${gridSize}px ${gridSize}px;background-position:${offsetX}px ${offsetY}px;`;
};

const readWorkspaceId = (
  workspaceState: WorkspaceStateSnapshot | null,
  workflows: ReadonlyArray<WorkflowDefinitionRecord>,
  assets: ReadonlyArray<WorkflowAssetRecord>,
): string =>
  workflows[0]?.workspaceId ??
  assets[0]?.workspaceId ??
  workspaceState?.activeProjectId ??
  readDefaultWorkflowWorkspaceId();

const resolveSelectionAfterReload = (
  selection: WorkflowSelection,
  workflow: WorkflowDefinitionRecord,
  assets: ReadonlyArray<WorkflowAssetRecord>,
  executions: ReadonlyArray<WorkflowExecutionRecord>,
  executionHistoryFilter: ExecutionHistoryFilter,
): WorkflowSelection => {
  if (
    selection.type === "node" &&
    workflow.nodes.some((node) => node.id === selection.id)
  ) {
    return selection;
  }

  if (
    selection.type === "asset" &&
    assets.some((asset) => asset.id === selection.id)
  ) {
    return selection;
  }

  if (selection.type === "execution") {
    const workflowExecutions = readWorkflowExecutions(executions, workflow.id);
    const filteredExecutions = readFilteredExecutions(
      workflowExecutions,
      executionHistoryFilter,
    );
    if (filteredExecutions.some((execution) => execution.id === selection.id)) {
      return selection;
    }
  }

  return {
    type: "workflow",
    id: workflow.id,
  };
};

const createFallbackProviderSelection =
  (): WorkflowProviderSelectionRecord => ({
    providerId: ProviderFallbackId,
    modelId: "",
    reasoningLevel: WorkflowReasoningLevel.Medium,
    temperature: 0.2,
    verbosity: WorkflowVerbosity.Medium,
    testStatus: "unknown",
  });

const stripAssetVersionFields = (
  asset: WorkflowAssetRecord,
): WorkflowAssetUpsertInput => ({
  id: asset.id,
  workspaceId: asset.workspaceId,
  ...(asset.projectId ? { projectId: asset.projectId } : {}),
  kind: asset.kind,
  scope: asset.scope,
  name: asset.name,
  slug: asset.slug,
  description: asset.description,
  body: asset.body,
  language: asset.language,
  tags: asset.tags,
  ...(asset.executionPolicy
    ? {
        executionPolicy: normalizeWorkflowAssetExecutionPolicy(
          asset.executionPolicy,
        ),
      }
    : {}),
  ...(asset.outputContract ? { outputContract: asset.outputContract } : {}),
  ...(asset.guardrail ? { guardrail: asset.guardrail } : {}),
  ...(asset.archivedAt ? { archivedAt: asset.archivedAt } : {}),
});

const stripOptionalProjectId = (
  asset: WorkflowAssetRecord,
): Omit<WorkflowAssetRecord, "projectId"> | WorkflowAssetRecord => {
  if (asset.projectId) {
    return asset;
  }

  const { projectId: _projectId, ...rest } = asset;
  return rest;
};

const readWorkflowAssetScope = (value: string): WorkflowAssetScopeValue =>
  value === WorkflowAssetScope.Workspace
    ? WorkflowAssetScope.Workspace
    : WorkflowAssetScope.Project;

const readWorkflowRecordStatus = (value: string): WorkflowRecordStatus =>
  value === WorkflowRecordStatus.Published
    ? WorkflowRecordStatus.Published
    : value === WorkflowRecordStatus.Archived
      ? WorkflowRecordStatus.Archived
      : WorkflowRecordStatus.Draft;

const readWorkflowNodeRole = (value: string): WorkflowNodeRole =>
  value === WorkflowNodeRole.Retriever
    ? WorkflowNodeRole.Retriever
    : value === WorkflowNodeRole.Executor
      ? WorkflowNodeRole.Executor
      : value === WorkflowNodeRole.Reviewer
        ? WorkflowNodeRole.Reviewer
        : WorkflowNodeRole.Planner;

const readWorkflowReasoningLevel = (value: string): WorkflowReasoningLevel =>
  value === WorkflowReasoningLevel.Low
    ? WorkflowReasoningLevel.Low
    : value === WorkflowReasoningLevel.High
      ? WorkflowReasoningLevel.High
      : value === WorkflowReasoningLevel.Max
        ? WorkflowReasoningLevel.Max
        : WorkflowReasoningLevel.Medium;

const readWorkflowVerbosity = (value: string): WorkflowVerbosity =>
  value === WorkflowVerbosity.Low
    ? WorkflowVerbosity.Low
    : value === WorkflowVerbosity.High
      ? WorkflowVerbosity.High
      : WorkflowVerbosity.Medium;

const readWorkflowGuardrailSeverity = (
  value: string,
): WorkflowGuardrailSeverity =>
  value === WorkflowGuardrailSeverity.Warn
    ? WorkflowGuardrailSeverity.Warn
    : value === WorkflowGuardrailSeverity.Success
      ? WorkflowGuardrailSeverity.Success
      : WorkflowGuardrailSeverity.Error;

const readWorkflowGuardrailOperator = (
  value: string,
): WorkflowGuardrailOperator =>
  value === WorkflowGuardrailOperator.Any
    ? WorkflowGuardrailOperator.Any
    : WorkflowGuardrailOperator.All;

const readJsonSchemaTypes = (): ReadonlyArray<JsonSchemaNodeRecord["type"]> => [
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
];

const readJsonSchemaType = (value: string): JsonSchemaNodeRecord["type"] => {
  if (
    value === "number" ||
    value === "integer" ||
    value === "boolean" ||
    value === "array" ||
    value === "object"
  ) {
    return value;
  }

  return "string";
};

const readJsonSchemaFormats = (): ReadonlyArray<ContractSelectOption> => [
  {
    label: "General",
    options: [
      "",
      JsonSchemaStringFormat.Email,
      JsonSchemaStringFormat.Url,
      JsonSchemaStringFormat.Uuid,
      JsonSchemaStringFormat.Nif,
    ],
  },
  {
    label: "Dates",
    options: [
      JsonSchemaStringFormat.Date,
      JsonSchemaStringFormat.DateTime,
      JsonSchemaStringFormat.Time,
      JsonSchemaStringFormat.Duration,
      JsonSchemaStringFormat.Year,
      JsonSchemaStringFormat.YearMonth,
      JsonSchemaStringFormat.MonthDay,
      JsonSchemaStringFormat.DateEu,
      JsonSchemaStringFormat.DateUs,
      JsonSchemaStringFormat.DateEuDash,
      JsonSchemaStringFormat.DateUsDash,
      JsonSchemaStringFormat.DateSlash,
      JsonSchemaStringFormat.DateDot,
      JsonSchemaStringFormat.DateCompact,
      JsonSchemaStringFormat.Rfc2822,
      JsonSchemaStringFormat.UnixSeconds,
      JsonSchemaStringFormat.UnixMilliseconds,
    ],
  },
];

const readJsonSchemaFormat = (
  value: string,
): JsonSchemaNodeRecord["format"] | undefined => {
  for (const format of Object.values(JsonSchemaStringFormat)) {
    if (format === value) {
      return format;
    }
  }

  return undefined;
};

const readJsonSchemaFormatLabel = (value: string): string => {
  if (value.length === 0) {
    return "None";
  }

  if (value === JsonSchemaStringFormat.Date) {
    return "Date · YYYY-MM-DD";
  }

  if (value === JsonSchemaStringFormat.DateTime) {
    return "Date-time · ISO 8601 / RFC 3339";
  }

  if (value === JsonSchemaStringFormat.Time) {
    return "Time · HH:mm[:ss]";
  }

  if (value === JsonSchemaStringFormat.Duration) {
    return "Duration · ISO 8601";
  }

  if (value === JsonSchemaStringFormat.Year) {
    return "Year · YYYY";
  }

  if (value === JsonSchemaStringFormat.YearMonth) {
    return "Year month · YYYY-MM";
  }

  if (value === JsonSchemaStringFormat.MonthDay) {
    return "Month day · MM-DD";
  }

  if (value === JsonSchemaStringFormat.DateEu) {
    return "Date EU · DD/MM/YYYY";
  }

  if (value === JsonSchemaStringFormat.DateUs) {
    return "Date US · MM/DD/YYYY";
  }

  if (value === JsonSchemaStringFormat.DateEuDash) {
    return "Date EU · DD-MM-YYYY";
  }

  if (value === JsonSchemaStringFormat.DateUsDash) {
    return "Date US · MM-DD-YYYY";
  }

  if (value === JsonSchemaStringFormat.DateSlash) {
    return "Date · YYYY/MM/DD";
  }

  if (value === JsonSchemaStringFormat.DateDot) {
    return "Date · DD.MM.YYYY";
  }

  if (value === JsonSchemaStringFormat.DateCompact) {
    return "Date compact · YYYYMMDD";
  }

  if (value === JsonSchemaStringFormat.Rfc2822) {
    return "Date-time · RFC 2822";
  }

  if (value === JsonSchemaStringFormat.UnixSeconds) {
    return "Unix timestamp · seconds";
  }

  if (value === JsonSchemaStringFormat.UnixMilliseconds) {
    return "Unix timestamp · milliseconds";
  }

  return formatSelectOptionLabel(value);
};

const renderContractSelectOption = (
  option: ContractSelectOption,
  formatOptionLabel: (value: string) => string,
): HTMLElement => {
  if (typeof option === "string") {
    return createElement("option", { value: option }, [
      formatOptionLabel(option),
    ]);
  }

  return createElement(
    "optgroup",
    {
      label: option.label,
    },
    option.options.map((nestedOption) =>
      createElement("option", { value: nestedOption }, [
        formatOptionLabel(nestedOption),
      ]),
    ),
  );
};

const readGuardrailValidationKinds =
  (): ReadonlyArray<GuardrailValidationKindValue> => [
    "field_exists",
    "field_equals",
    "contains",
    "not_contains",
    "regex",
    "json_schema",
    "number_gte",
    "number_lte",
  ];

const readGuardrailValidationKind = (
  value: string,
): GuardrailValidationKindValue => {
  if (
    value === "json_schema" ||
    value === "regex" ||
    value === "contains" ||
    value === "not_contains" ||
    value === "field_equals" ||
    value === "number_gte" ||
    value === "number_lte"
  ) {
    return value;
  }

  return "field_exists";
};

const readGuardrailValidationValue = (
  kind: GuardrailValidationKindValue,
  value: string,
): { value?: string | number | boolean } => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {};
  }

  if (kind === "number_gte" || kind === "number_lte") {
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? { value: numericValue } : {};
  }

  if (
    kind === "regex" ||
    kind === "contains" ||
    kind === "not_contains" ||
    kind === "field_equals"
  ) {
    return { value: trimmed };
  }

  return {};
};

const readGuardrailValidationTargets =
  (): ReadonlyArray<GuardrailValidationTargetValue> => [
    "input",
    "output",
    "context",
    "metadata",
  ];

const readGuardrailValidationTarget = (
  value: string,
): GuardrailValidationTargetValue => {
  if (value === "input" || value === "context" || value === "metadata") {
    return value;
  }

  return "output";
};

const isOutputContractCapableNode = (kind: WorkflowNodeKindValue): boolean =>
  kind === WorkflowNodeKind.AssetPrompt ||
  kind === WorkflowNodeKind.AssetInstruction ||
  kind === WorkflowNodeKind.AssetGuardrail ||
  kind === WorkflowNodeKind.AiAgent ||
  kind === WorkflowNodeKind.AiProviderRun;

const formatProviderProfileLabel = (profile: ProviderProfileRecord): string => {
  const model =
    profile.modelId.trim().length > 0 ? ` · ${profile.modelId}` : "";
  return `${profile.name} · ${profile.providerKind}${model}`;
};

const formatSelectOptionLabel = (value: string): string =>
  value.length === 0
    ? "None"
    : value
        .split(/[-_.]/u)
        .filter((part) => part.length > 0)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");

const setContractPropertyRequired = (
  schema: JsonSchemaNodeRecord,
  parentPath: ReadonlyArray<string>,
  propertyName: string,
  required: boolean,
): JsonSchemaNodeRecord =>
  updateJsonSchemaNode(schema, parentPath, (node) => {
    if (node.type !== "object") {
      return node;
    }

    return {
      ...node,
      required: required
        ? [...new Set([...(node.required ?? []), propertyName])]
        : (node.required ?? []).filter((entry) => entry !== propertyName),
    };
  });

const preserveSchemaPresentation = (
  previous: JsonSchemaNodeRecord,
  next: JsonSchemaNodeRecord,
): JsonSchemaNodeRecord => ({
  ...next,
  ...(previous.title ? { title: previous.title } : {}),
  ...(previous.description ? { description: previous.description } : {}),
});

const patchSchemaNodeOptional = (
  node: JsonSchemaNodeRecord,
  patch: {
    format?: JsonSchemaNodeRecord["format"] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    pattern?: string | undefined;
    minimum?: number | undefined;
    maximum?: number | undefined;
    minItems?: number | undefined;
    maxItems?: number | undefined;
  },
): JsonSchemaNodeRecord => {
  const {
    format: _previousFormat,
    minLength: _previousMinLength,
    maxLength: _previousMaxLength,
    pattern: _previousPattern,
    minimum: _previousMinimum,
    maximum: _previousMaximum,
    minItems: _previousMinItems,
    maxItems: _previousMaxItems,
    ...rest
  } = node;
  const {
    format,
    minLength,
    maxLength,
    pattern,
    minimum,
    maximum,
    minItems,
    maxItems,
  } = patch;

  return {
    ...rest,
    ...(!("format" in patch)
      ? _previousFormat !== undefined
        ? { format: _previousFormat }
        : {}
      : format !== undefined
        ? { format }
        : {}),
    ...(minLength !== undefined ? { minLength } : {}),
    ...(!("minLength" in patch) && _previousMinLength !== undefined
      ? { minLength: _previousMinLength }
      : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(!("maxLength" in patch) && _previousMaxLength !== undefined
      ? { maxLength: _previousMaxLength }
      : {}),
    ...(pattern !== undefined ? { pattern } : {}),
    ...(!("pattern" in patch) && _previousPattern !== undefined
      ? { pattern: _previousPattern }
      : {}),
    ...(minimum !== undefined ? { minimum } : {}),
    ...(!("minimum" in patch) && _previousMinimum !== undefined
      ? { minimum: _previousMinimum }
      : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(!("maximum" in patch) && _previousMaximum !== undefined
      ? { maximum: _previousMaximum }
      : {}),
    ...(minItems !== undefined ? { minItems } : {}),
    ...(!("minItems" in patch) && _previousMinItems !== undefined
      ? { minItems: _previousMinItems }
      : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
    ...(!("maxItems" in patch) && _previousMaxItems !== undefined
      ? { maxItems: _previousMaxItems }
      : {}),
  };
};

const readNextContractPropertyName = (schema: JsonSchemaNodeRecord): string => {
  const existingNames = new Set(Object.keys(schema.properties ?? {}));
  let index = existingNames.has("field") ? 2 : 1;
  let candidate = "field";

  while (existingNames.has(candidate)) {
    candidate = `field${index.toString()}`;
    index += 1;
  }

  return candidate;
};

const readOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toContractPathToken = (path: ReadonlyArray<string>): string =>
  path.length === 0
    ? "root"
    : path
        .map((segment) =>
          segment === JsonSchemaItemsSegment ? "items" : segment,
        )
        .join("__")
        .replace(/[^a-zA-Z0-9_-]+/gu, "-");

const readContractPathLabel = (path: ReadonlyArray<string>): string =>
  path.length === 0
    ? "$"
    : `$.${path
        .map((segment) =>
          segment === JsonSchemaItemsSegment ? "items[]" : segment,
        )
        .join(".")}`;

const formatTimeoutMinutes = (timeoutMs: number): string =>
  `${Math.round(timeoutMs / WorkflowAssetTimeoutMinuteMs).toString()} min`;

const readIsCompactViewport = (): boolean =>
  typeof window !== "undefined" &&
  window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH;

const readErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const formatExecutionHistoryTitle = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDuration = (value?: number): string => {
  if (value === undefined || Number.isNaN(value) || value < 0) {
    return "n/a";
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  if (value < 60_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes.toString()}m ${seconds.toString()}s`;
};

const formatEuro = (value: number): string => `€${value.toFixed(4)}`;

const readExecutionLabel = (
  execution: Pick<WorkflowExecutionRecord, "id">,
): string =>
  execution.id.length > 8 ? execution.id.slice(0, 8) : execution.id;

const readWorkflowExecutions = (
  executions: ReadonlyArray<WorkflowExecutionRecord>,
  workflowId: string,
): ReadonlyArray<WorkflowExecutionRecord> =>
  [
    ...executions.filter((execution) => execution.workflowId === workflowId),
  ].sort((left, right) => right.startedAt.localeCompare(left.startedAt));

const readFilteredExecutions = (
  executions: ReadonlyArray<WorkflowExecutionRecord>,
  filter: ExecutionHistoryFilter,
): ReadonlyArray<WorkflowExecutionRecord> => {
  if (filter === ExecutionHistoryFilter.Failed) {
    return executions.filter((execution) => execution.status === "failed");
  }

  if (filter === ExecutionHistoryFilter.Attention) {
    return executions.filter((execution) =>
      readExecutionNeedsAttention(execution),
    );
  }

  return executions;
};

const readExecutionFilterEmptyDescription = (
  filter: ExecutionHistoryFilter,
): string => {
  if (filter === ExecutionHistoryFilter.Failed) {
    return "Saved execution history does not include a failed run for this workflow right now.";
  }

  if (filter === ExecutionHistoryFilter.Attention) {
    return "Saved execution history does not include failed or alerted runs for this workflow right now.";
  }

  return "This workflow has no persisted runs yet.";
};

const readExecutionNeedsAttention = (
  execution: WorkflowExecutionRecord,
): boolean =>
  execution.status === "failed" || readExecutionHasAlerts(execution);

const readExecutionHasAlerts = (execution: WorkflowExecutionRecord): boolean =>
  readExecutionAlertCount(execution) > 0 ||
  execution.warningsCount > 0 ||
  execution.errorsCount > 0;

const readExecutionAlertCount = (execution: WorkflowExecutionRecord): number =>
  execution.nodeRuns.reduce(
    (count, nodeRun) => count + nodeRun.alerts.length,
    0,
  );

const readExecutionBadgeStatus = (
  status:
    | WorkflowExecutionRecord["status"]
    | WorkflowNodeExecutionRecord["status"],
): "info" | "success" | "warning" | "running" | "failed" => {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "awaiting_review" || status === "queued") {
    return "warning";
  }

  if (status === "running") {
    return "running";
  }

  return "info";
};

const readAlertBadgeStatus = (
  level: WorkflowAlertRecord["level"],
): "info" | "success" | "warning" | "failed" => {
  if (level === "success") {
    return "success";
  }

  if (level === "warn") {
    return "warning";
  }

  if (level === "error") {
    return "failed";
  }

  return "info";
};

type WorkflowVariableFilterItem = WorkflowVariableToken & {
  groupLabel: string;
};

const readFilteredWorkflowVariableGroups = (
  groups: ReadonlyArray<WorkflowVariableGroup>,
  query: string,
): ReadonlyArray<WorkflowVariableGroup> => {
  const hasQuery = query.trim().length > 0;

  return groups
    .map((group) => {
      const items: ReadonlyArray<WorkflowVariableFilterItem> = group.tokens.map(
        (token) => ({
          ...token,
          groupLabel: group.label,
        }),
      );

      return {
        ...group,
        tokens: filterWorkflowExpressionItems(items, query),
      };
    })
    .filter((group) => !hasQuery || group.tokens.length > 0);
};

const readWorkflowVariableTokenCount = (
  groups: ReadonlyArray<WorkflowVariableGroup>,
): number => groups.reduce((count, group) => count + group.tokens.length, 0);

const readGuardrailFindingBadgeStatus = (
  severity: WorkflowGuardrailFindingRecord["severity"],
): "success" | "warning" | "failed" => {
  if (severity === "success") {
    return "success";
  }

  if (severity === "warn") {
    return "warning";
  }

  return "failed";
};

const readServerLogBadgeStatus = (
  level: ServerLogLevel,
): "info" | "warning" | "failed" => {
  if (level === ServerLogLevel.Warn) {
    return "warning";
  }

  if (level === ServerLogLevel.Error || level === ServerLogLevel.Fatal) {
    return "failed";
  }

  return "info";
};

const readNodeRunProviderLabel = (
  nodeRun: WorkflowExecutionRecord["nodeRuns"][number],
): string => {
  if (nodeRun.providerId && nodeRun.modelId) {
    return `${nodeRun.providerId} · ${nodeRun.modelId}`;
  }

  if (nodeRun.providerId) {
    return nodeRun.providerId;
  }

  return "No provider data";
};

const readNodeRunOverlayClassName = (status: string): string => {
  if (status === "running") {
    return "border-primary/80 shadow-[0_0_0_1px_rgba(37,99,235,0.5),0_0_32px_rgba(37,99,235,0.22)] animate-pulse";
  }

  if (status === "completed") {
    return "border-emerald-400/70 shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_24px_rgba(52,211,153,0.12)]";
  }

  if (status === "warn") {
    return "border-amber-400/80 shadow-[0_0_0_1px_rgba(251,191,36,0.4),0_0_24px_rgba(251,191,36,0.14)]";
  }

  if (status === "failed") {
    return "border-rose-400/80 shadow-[0_0_0_1px_rgba(251,113,133,0.45),0_0_28px_rgba(251,113,133,0.16)]";
  }

  return "border-transparent";
};

const readWorkflowFitViewport = (
  workflow: WorkflowDefinitionUpsertInput,
): WorkflowViewportRecord => {
  if (workflow.nodes.length === 0) {
    return {
      x: 96,
      y: 96,
      zoom: 1,
    };
  }

  const bounds = workflow.nodes.reduce(
    (current, node) => ({
      minX: Math.min(current.minX, node.position.x),
      minY: Math.min(current.minY, node.position.y),
      maxX: Math.max(current.maxX, node.position.x + WorkflowNodeVisualWidth),
      maxY: Math.max(
        current.maxY,
        node.position.y + WorkflowNodeApproximateHeight,
      ),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  const padding = 112;
  const contentWidth = Math.max(320, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(220, bounds.maxY - bounds.minY);
  const viewportWidth = 1320;
  const viewportHeight = 760;
  const zoom = Math.max(
    0.58,
    Math.min(
      1.08,
      Math.min(
        (viewportWidth - padding * 2) / contentWidth,
        (viewportHeight - padding * 2) / contentHeight,
      ),
    ),
  );
  const centerX = bounds.minX + contentWidth / 2;
  const centerY = bounds.minY + contentHeight / 2;

  return {
    x: Number((viewportWidth / 2 - centerX * zoom).toFixed(2)),
    y: Number((viewportHeight / 2 - centerY * zoom).toFixed(2)),
    zoom: Number(zoom.toFixed(2)),
  };
};

const toSlugValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
