import { Button, IconButton } from "../components/Button.js";
import { Card, StatusBadge } from "../components/Card.js";
import { PageNoticeStack } from "../components/PageScaffold.js";
import { EmptyStatePanel } from "../components/WorkbenchPanels.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { COMPACT_VIEWPORT_MAX_WIDTH } from "../shared/constants.js";
import { createWorkflowClient } from "../shared/workflow-client.js";
import {
  createWorkspaceStateClient,
  type WorkspaceStateSnapshot
} from "../shared/workspace-state-client.js";
import type { ProjectRecord } from "../shared/workbench-types.js";
import type { ProviderProfileRecord } from "./settings-state.js";
import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowGuardrailOperator,
  WorkflowGuardrailSeverity,
  WorkflowNodeKind,
  WorkflowNodeRole,
  WorkflowReasoningLevel,
  WorkflowRecordStatus,
  WorkflowVerbosity,
  JsonSchemaItemsSegment,
  addWorkflowNode,
  addWorkflowEdgeMappingEntry,
  addWorkflowGuardrailValidation,
  attachGuardrailToNode,
  createJsonSchemaNode,
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
  createWorkflowAssetDraft,
  detachGuardrailFromNode,
  formatJsonOutputContractDocument,
  insertWorkflowExpressionVariable,
  moveWorkflowNode,
  parseJsonOutputContractDocument,
  readJsonSchemaPaths,
  readAssetKindLabel,
  readAssetScopeLabel,
  readDefaultWorkflowWorkspaceId,
  readGuardrailDefinitionValidity,
  readJsonContractValidation,
  readNodeAccentClassName,
  readNodeAssetKind,
  readNodeIcon,
  readNodeKindLabel,
  readNodeKindsForPalette,
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
  WorkflowExpressionVariableKind,
  type EdgeMappingEntryRecord,
  type GuardrailValidationRecord,
  type JsonOutputContractRecord,
  type JsonSchemaNodeRecord,
  type WorkflowAlertRecord,
  type WorkflowAssetKind as WorkflowAssetKindValue,
  type WorkflowAssetRecord,
  type WorkflowAssetScope as WorkflowAssetScopeValue,
  type WorkflowAssetUsageRecord,
  type WorkflowAssetUpsertInput,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionUpsertInput,
  type WorkflowExecutionRecord,
  type WorkflowExpressionVariableReference,
  type WorkflowNodeExecutionRecord,
  type WorkflowNodeKind as WorkflowNodeKindValue,
  type WorkflowNodeRecord,
  type WorkflowProviderSelectionRecord,
  type WorkflowViewportRecord
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
  WorkflowSelect: "workflows-select",
  CanvasZoomOut: "workflows-canvas-zoom-out",
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
  NodeReasoningSelect: "workflows-node-reasoning-select",
  NodeVerbositySelect: "workflows-node-verbosity-select",
  OutputContractNameInput: "workflows-output-contract-name-input",
  OutputContractAddField: "workflows-output-contract-add-field",
  OutputContractStatus: "workflows-output-contract-status",
  OutputContractPropertyNamePrefix: "workflows-output-contract-property-name-",
  OutputContractPropertyTypePrefix: "workflows-output-contract-property-type-",
  OutputContractPropertyRequiredPrefix: "workflows-output-contract-property-required-",
  OutputContractPropertyDeletePrefix: "workflows-output-contract-property-delete-",
  OutputContractPropertyAddChildPrefix: "workflows-output-contract-property-add-child-",
  OutputContractPropertyFormatPrefix: "workflows-output-contract-property-format-",
  OutputContractPropertyMinPrefix: "workflows-output-contract-property-min-",
  OutputContractPropertyMaxPrefix: "workflows-output-contract-property-max-",
  OutputContractPropertyPatternPrefix: "workflows-output-contract-property-pattern-",
  AssetOutputContractNameInput: "workflows-asset-output-contract-name-input",
  AssetOutputContractAddField: "workflows-asset-output-contract-add-field",
  AssetOutputContractStatus: "workflows-asset-output-contract-status",
  AssetOutputContractPropertyNamePrefix: "workflows-asset-output-contract-property-name-",
  AssetOutputContractPropertyTypePrefix: "workflows-asset-output-contract-property-type-",
  AssetOutputContractPropertyRequiredPrefix: "workflows-asset-output-contract-property-required-",
  AssetOutputContractPropertyDeletePrefix: "workflows-asset-output-contract-property-delete-",
  AssetOutputContractPropertyAddChildPrefix: "workflows-asset-output-contract-property-add-child-",
  AssetOutputContractPropertyFormatPrefix: "workflows-asset-output-contract-property-format-",
  AssetOutputContractPropertyMinPrefix: "workflows-asset-output-contract-property-min-",
  AssetOutputContractPropertyMaxPrefix: "workflows-asset-output-contract-property-max-",
  AssetOutputContractPropertyPatternPrefix: "workflows-asset-output-contract-property-pattern-",
  MappingTargetPathInput: "workflows-mapping-target-path-input",
  MappingSourcePathInput: "workflows-mapping-source-path-input",
  MappingAddEntry: "workflows-mapping-add-entry",
  GuardrailNewForNode: "workflows-guardrail-new-for-node",
  GuardrailAttachmentEditPrefix: "workflows-guardrail-attachment-edit-",
  GuardrailSeveritySelect: "workflows-guardrail-severity-select",
  GuardrailOperatorSelect: "workflows-guardrail-operator-select",
  GuardrailValidationKindSelect: "workflows-guardrail-validation-kind-select",
  GuardrailValidationTargetSelect: "workflows-guardrail-validation-target-select",
  GuardrailValidationPathInput: "workflows-guardrail-validation-path-input",
  GuardrailValidationMessageInput: "workflows-guardrail-validation-message-input",
  GuardrailAddValidation: "workflows-guardrail-add-validation",
  DeepEditorOpenPrefix: "workflows-deep-editor-open-",
  DeepEditorModal: "workflows-deep-editor-modal",
  DeepEditorPromptInput: "workflows-deep-editor-prompt-input",
  DeepEditorSampleOutputInput: "workflows-deep-editor-sample-output-input",
  DeepEditorRawJsonInput: "workflows-deep-editor-raw-json-input",
  DeepEditorTabPrompt: "workflows-deep-editor-tab-prompt",
  DeepEditorTabOutput: "workflows-deep-editor-tab-output",
  DeepEditorTabPreview: "workflows-deep-editor-tab-preview",
  DeepEditorOutputTabVisual: "workflows-deep-editor-output-tab-visual",
  DeepEditorOutputTabJson: "workflows-deep-editor-output-tab-json",
  DeepEditorClose: "workflows-deep-editor-close",
  DeepEditorApplyRawJson: "workflows-deep-editor-apply-raw-json",
  VariableTokenPrefix: "workflows-variable-token-",
  NodePalettePrefix: "workflows-node-palette-",
  AssetCreatePrefix: "workflows-asset-create-",
  AssetCardPrefix: "workflows-asset-card-",
  NodeCardPrefix: "workflows-node-card-",
  InspectorEmpty: "workflows-inspector-empty",
  CompactSidebar: "workflows-compact-sidebar",
  CompactCanvas: "workflows-compact-canvas",
  CompactInspector: "workflows-compact-inspector"
} as const;

const EdgeDeleteButtonSize = 20;
const EdgeDeleteNodeAvoidancePadding = 12;
const WorkflowNodeApproximateHeight = 104;
const EdgeDeleteOffset = 34;
const EdgeDeleteWideOffset = 58;
const InspectorInputClassName = "w-full rounded-lg border border-border-dark bg-[#10151b] px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary/40";
const InspectorTextInputClassName = `h-10 ${InspectorInputClassName}`;
const InspectorTextAreaClassName = `min-h-32 resize-y py-3 leading-6 ${InspectorInputClassName}`;
const InspectorSelectClassName = `h-10 appearance-none pr-10 ${InspectorInputClassName}`;
const ProviderFallbackId = "codex-cli";

const SidebarSection = {
  Workflows: "workflows",
  Nodes: "nodes",
  Assets: "assets",
  History: "history"
} as const;

type SidebarSection = typeof SidebarSection[keyof typeof SidebarSection];

const CompactView = {
  Sidebar: "sidebar",
  Canvas: "canvas",
  Inspector: "inspector"
} as const;

type CompactView = typeof CompactView[keyof typeof CompactView];

const PendingAction = {
  Load: "load",
  CreateWorkflow: "create-workflow",
  SaveWorkflow: "save-workflow",
  DeleteWorkflow: "delete-workflow",
  CreateAsset: "create-asset",
  DeleteExecution: "delete-execution"
} as const;

type PendingAction = typeof PendingAction[keyof typeof PendingAction];

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

type DeepEditorState = {
  target: DeepEditorTarget;
  tab: DeepEditorTab;
  outputTab: DeepEditorOutputTab;
  rawContractText: string;
  rawContractError: string | null;
  promptSelectionStart: number;
  promptSelectionEnd: number;
  sampleSelectionStart: number;
  sampleSelectionEnd: number;
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
};

const NodeOutputContractEditorSelectors: OutputContractEditorSelectorSet = {
  nameInput: WorkflowScreenSelector.OutputContractNameInput,
  addFieldButton: WorkflowScreenSelector.OutputContractAddField,
  status: WorkflowScreenSelector.OutputContractStatus,
  propertyNamePrefix: WorkflowScreenSelector.OutputContractPropertyNamePrefix,
  propertyTypePrefix: WorkflowScreenSelector.OutputContractPropertyTypePrefix,
  propertyRequiredPrefix: WorkflowScreenSelector.OutputContractPropertyRequiredPrefix,
  propertyDeletePrefix: WorkflowScreenSelector.OutputContractPropertyDeletePrefix,
  propertyAddChildPrefix: WorkflowScreenSelector.OutputContractPropertyAddChildPrefix,
  propertyFormatPrefix: WorkflowScreenSelector.OutputContractPropertyFormatPrefix,
  propertyMinPrefix: WorkflowScreenSelector.OutputContractPropertyMinPrefix,
  propertyMaxPrefix: WorkflowScreenSelector.OutputContractPropertyMaxPrefix,
  propertyPatternPrefix: WorkflowScreenSelector.OutputContractPropertyPatternPrefix
};

const AssetOutputContractEditorSelectors: OutputContractEditorSelectorSet = {
  nameInput: WorkflowScreenSelector.AssetOutputContractNameInput,
  addFieldButton: WorkflowScreenSelector.AssetOutputContractAddField,
  status: WorkflowScreenSelector.AssetOutputContractStatus,
  propertyNamePrefix: WorkflowScreenSelector.AssetOutputContractPropertyNamePrefix,
  propertyTypePrefix: WorkflowScreenSelector.AssetOutputContractPropertyTypePrefix,
  propertyRequiredPrefix: WorkflowScreenSelector.AssetOutputContractPropertyRequiredPrefix,
  propertyDeletePrefix: WorkflowScreenSelector.AssetOutputContractPropertyDeletePrefix,
  propertyAddChildPrefix: WorkflowScreenSelector.AssetOutputContractPropertyAddChildPrefix,
  propertyFormatPrefix: WorkflowScreenSelector.AssetOutputContractPropertyFormatPrefix,
  propertyMinPrefix: WorkflowScreenSelector.AssetOutputContractPropertyMinPrefix,
  propertyMaxPrefix: WorkflowScreenSelector.AssetOutputContractPropertyMaxPrefix,
  propertyPatternPrefix: WorkflowScreenSelector.AssetOutputContractPropertyPatternPrefix
};

interface WorkflowsScreenState {
  currentProject: ProjectRecord | null;
  workspaceState: WorkspaceStateSnapshot | null;
  workflows: ReadonlyArray<WorkflowDefinitionRecord>;
  assets: ReadonlyArray<WorkflowAssetRecord>;
  assetUsages: ReadonlyArray<WorkflowAssetUsageRecord>;
  executions: ReadonlyArray<WorkflowExecutionRecord>;
  draftWorkflow: WorkflowDefinitionUpsertInput | null;
  selection: WorkflowSelection;
  activeSidebarSection: SidebarSection;
  compactView: CompactView;
  isCompactViewport: boolean;
  pendingAction: PendingAction | null;
  loadingExecutionId: string | null;
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
  guardrailValidationMessage: string;
  deepEditor: DeepEditorState | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

export class WorkflowsScreen extends Component<ComponentProps, WorkflowsScreenState> {
  private readonly workspaceStateClient = createWorkspaceStateClient();
  private readonly workflowClient = createWorkflowClient();
  private draggingNodeId: string | null = null;
  private dragPointerOffset: { x: number; y: number } | null = null;
  private connectionDragging = false;
  private panning = false;
  private panOrigin: { x: number; y: number } | null = null;
  private panViewportOrigin: WorkflowViewportRecord | null = null;

  constructor(props: ComponentProps = {}) {
    super(props, {
      currentProject: null,
      workspaceState: null,
      workflows: [],
      assets: [],
      assetUsages: [],
      executions: [],
      draftWorkflow: null,
      selection: { type: "workflow", id: null },
      activeSidebarSection: SidebarSection.Workflows,
      compactView: CompactView.Canvas,
      isCompactViewport: readIsCompactViewport(),
      pendingAction: null,
      loadingExecutionId: null,
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
      guardrailValidationMessage: "Expected $.result to be present.",
      deepEditor: null,
      errorMessage: null,
      noticeMessage: null
    });
  }

  override onMount(): void {
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pointermove", this.handleGlobalPointerMove);
    window.addEventListener("pointerup", this.handleGlobalPointerUp);
    window.addEventListener("mousemove", this.handleGlobalPointerMove);
    window.addEventListener("mouseup", this.handleGlobalPointerUp);
    window.addEventListener("keydown", this.handleGlobalKeyDown);
    void this.hydrateState();
  }

  override onUnmount(): void {
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointermove", this.handleGlobalPointerMove);
    window.removeEventListener("pointerup", this.handleGlobalPointerUp);
    window.removeEventListener("mousemove", this.handleGlobalPointerMove);
    window.removeEventListener("mouseup", this.handleGlobalPointerUp);
    window.removeEventListener("keydown", this.handleGlobalKeyDown);
  }

  override render(): HTMLElement {
    return createElement("div", {
      className: "flex h-full w-full flex-col bg-[#11161d] text-white",
      "data-testid": WorkflowScreenSelector.Root
    }, [
      createElement(PageNoticeStack, {
        errorMessage: this.state.errorMessage,
        noticeMessage: this.state.noticeMessage
      }),
      this.renderToolbar(),
      this.renderSurface(),
      this.state.deepEditor ? this.renderDeepEditorModal() : ""
    ]);
  }

  private renderToolbar(): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const executionCount = currentWorkflow
      ? this.state.executions.filter((execution) => execution.workflowId === currentWorkflow.id).length
      : 0;
    const hasUnsavedChanges = this.state.dirtyWorkflow || this.state.dirtyAssetIds.length > 0;

    return createElement("div", {
      className: "flex min-h-14 items-center justify-between gap-4 border-b border-border-dark bg-[#171c22] px-4"
    }, [
      createElement("div", { className: "flex min-w-0 items-center gap-3" }, [
        createElement("div", { className: "flex min-w-0 flex-col" }, [
          createElement("span", { className: "truncate text-sm font-semibold text-white" }, [
            currentWorkflow?.name ?? "Workflows"
          ]),
          createElement("span", { className: "truncate text-xs text-text-secondary" }, [
            this.state.currentProject
              ? `${this.state.currentProject.name} · ${this.state.currentProject.rootPath ?? "workflow-only project"}`
              : "Select a project from the global sidebar to load the workflow editor."
          ])
        ]),
        currentWorkflow
          ? createElement(StatusBadge, {
              status: hasUnsavedChanges ? "warning" : "success"
            }, [hasUnsavedChanges ? "unsaved" : "saved"])
          : "",
        currentWorkflow
          ? createElement(StatusBadge, {
              status: "info"
            }, [`${executionCount} run${executionCount === 1 ? "" : "s"}`])
          : ""
      ]),
      createElement("div", { className: "flex items-center gap-2" }, [
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          disabled: this.state.currentProject === null || this.state.pendingAction !== null,
          onClick: () => {
            void this.handleCreateWorkflow();
          },
          children: this.state.pendingAction === PendingAction.CreateWorkflow ? "Creating" : "New workflow",
          dataset: {
            testid: WorkflowScreenSelector.WorkflowCreate
          }
        }),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          disabled: this.state.draftWorkflow === null || this.state.pendingAction !== null || !hasUnsavedChanges,
          onClick: () => {
            void this.handleSaveWorkflow();
          },
          children: this.state.pendingAction === PendingAction.SaveWorkflow ? "Saving" : "Save",
          dataset: {
            testid: WorkflowScreenSelector.WorkflowSave
          }
        }),
        createElement(Button, {
          variant: "danger",
          size: "sm",
          disabled: currentWorkflow === null || this.state.pendingAction !== null,
          onClick: () => {
            void this.handleDeleteWorkflow();
          },
          children: this.state.pendingAction === PendingAction.DeleteWorkflow ? "Deleting" : "Delete",
          dataset: {
            testid: WorkflowScreenSelector.WorkflowDelete
          }
        })
      ])
    ]);
  }

  private renderSurface(): HTMLElement {
    if (this.state.currentProject === null) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-6"
      }, [
        createElement(EmptyStatePanel, {
          icon: "account_tree",
          title: "No active project",
          description: "Open or create a project from the Projects screen. Workflow-only projects are supported, but the editor stays server-first and needs an active project ID."
        })
      ]);
    }

    return createElement("div", {
      className: "flex min-h-0 flex-1"
    }, [
      this.renderActivityRail(),
      this.shouldShowSidebar() ? this.renderSidebarPanel() : "",
      this.shouldShowCanvas() ? this.renderCanvasPanel() : "",
      this.shouldShowInspector() ? this.renderInspectorPanel() : ""
    ]);
  }

  private renderActivityRail(): HTMLElement {
    return createElement("aside", {
      className: "flex w-12 shrink-0 flex-col items-center border-r border-border-dark bg-[#181d24] py-2",
      "data-testid": WorkflowScreenSelector.SidebarRail
    }, [
      this.renderRailButton("list", "Definitions", this.state.activeSidebarSection === SidebarSection.Workflows, () => this.setState({ activeSidebarSection: SidebarSection.Workflows, compactView: CompactView.Sidebar }), WorkflowScreenSelector.SectionWorkflows),
      this.renderRailButton("deployed_code", "Nodes", this.state.activeSidebarSection === SidebarSection.Nodes, () => this.setState({ activeSidebarSection: SidebarSection.Nodes, compactView: CompactView.Sidebar }), WorkflowScreenSelector.SectionNodes),
      this.renderRailButton("library_books", "Assets", this.state.activeSidebarSection === SidebarSection.Assets, () => this.setState({ activeSidebarSection: SidebarSection.Assets, compactView: CompactView.Sidebar }), WorkflowScreenSelector.SectionAssets),
      this.renderRailButton("history", "History", this.state.activeSidebarSection === SidebarSection.History, () => this.setState({ activeSidebarSection: SidebarSection.History, compactView: CompactView.Sidebar }), WorkflowScreenSelector.SectionHistory),
      this.state.isCompactViewport
        ? createElement("div", { className: "mt-auto flex flex-col gap-1 px-1" }, [
            this.renderRailButton("left_panel_open", "Sidebar", this.state.compactView === CompactView.Sidebar, () => this.setState({ compactView: CompactView.Sidebar }), WorkflowScreenSelector.CompactSidebar),
            this.renderRailButton("grid_view", "Canvas", this.state.compactView === CompactView.Canvas, () => this.setState({ compactView: CompactView.Canvas }), WorkflowScreenSelector.CompactCanvas),
            this.renderRailButton("tune", "Inspector", this.state.compactView === CompactView.Inspector, () => this.setState({ compactView: CompactView.Inspector }), WorkflowScreenSelector.CompactInspector)
          ])
        : ""
    ]);
  }

  private renderRailButton(
    icon: string,
    title: string,
    active: boolean,
    onClick: () => void,
    testId?: string
  ): HTMLElement {
    return createElement("button", {
      type: "button",
      title,
      ...(testId ? { "data-testid": testId } : {}),
      className: `flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${active ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-text-secondary hover:bg-[#242b34] hover:text-white"}`,
      onClick
    }, [
      createElement("span", {
        className: "material-symbols-outlined text-[19px]"
      }, [icon])
    ]);
  }

  private renderSidebarPanel(): HTMLElement {
    return createElement("aside", {
      className: this.state.isCompactViewport
        ? "flex min-h-0 flex-1 flex-col border-r border-border-dark bg-[#1a1f27]"
        : "flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border-dark bg-[#1a1f27]",
      "data-testid": WorkflowScreenSelector.SidebarPanel
    }, [
      this.renderSidebarHeader(),
      this.renderSidebarSection()
    ]);
  }

  private renderSidebarHeader(): HTMLElement {
    return createElement("div", {
      className: "flex items-center justify-between border-b border-border-dark px-3 py-2"
    }, [
      createElement("div", { className: "min-w-0 flex-1" }, [
        createElement("p", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary" }, [
          this.state.activeSidebarSection.toUpperCase()
        ]),
        createElement("p", { className: "mt-1 truncate text-xs text-slate-400" }, [
          this.state.currentProject?.name ?? "No project"
        ])
      ])
    ]);
  }

  private renderSidebarSection(): HTMLElement {
    if (this.state.activeSidebarSection === SidebarSection.Nodes) {
      return this.renderNodePaletteSection();
    }

    if (this.state.activeSidebarSection === SidebarSection.Assets) {
      return this.renderAssetLibrarySection();
    }

    if (this.state.activeSidebarSection === SidebarSection.History) {
      return this.renderExecutionSection();
    }

    return this.renderWorkflowListSection();
  }

  private renderWorkflowListSection(): HTMLElement {
    return createElement("div", {
      className: "flex min-h-0 flex-1 flex-col"
    }, [
      createElement("div", { className: "border-b border-border-dark px-3 py-3" }, [
        createElement("label", { className: "flex flex-col gap-2" }, [
          createElement("span", { className: "text-xs font-semibold uppercase tracking-wide text-text-secondary" }, ["Active workflow"]),
          createElement("select", {
            className: "h-10 rounded-lg border border-border-dark bg-[#11161d] px-3 text-sm text-white focus:border-primary focus:outline-none",
            value: this.readCurrentWorkflowRecord()?.id ?? "",
            "data-testid": WorkflowScreenSelector.WorkflowSelect,
            onChange: (event: Event) => {
              const target = event.target;
              if (target instanceof HTMLSelectElement) {
                this.handleSelectWorkflow(target.value);
              }
            }
          }, [
            this.state.workflows.length === 0
              ? createElement("option", { value: "" }, ["No workflows yet"])
              : this.state.workflows.map((workflow) =>
                  createElement("option", {
                    key: workflow.id,
                    value: workflow.id
                  }, [workflow.name])
                )
          ])
        ])
      ]),
      this.state.workflows.length === 0
        ? createElement("div", { className: "flex flex-1 items-center justify-center p-4" }, [
            createElement(EmptyStatePanel, {
              icon: "account_tree",
              title: "No workflow definitions",
              description: "Create the first workflow from the toolbar. Definitions persist in the server workspace and reload across browser contexts."
            })
          ])
        : createElement("div", { className: "min-h-0 flex-1 overflow-y-auto p-3" }, [
            this.state.workflows
              .slice()
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
              .map((workflow) =>
                createElement("button", {
                  type: "button",
                  key: workflow.id,
                  className: `mb-2 flex w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left transition-colors ${workflow.id === this.readCurrentWorkflowRecord()?.id ? "border-primary bg-primary/10" : "border-border-dark bg-[#11161d] hover:bg-[#20262f]"}`,
                  onClick: () => this.handleSelectWorkflow(workflow.id)
                }, [
                  createElement("div", { className: "flex items-center justify-between gap-3" }, [
                    createElement("span", { className: "truncate text-sm font-medium text-white" }, [workflow.name]),
                    createElement(StatusBadge, {
                      status: workflow.status === WorkflowRecordStatus.Published ? "success" : workflow.status === WorkflowRecordStatus.Archived ? "paused" : "info"
                    }, [workflow.status])
                  ]),
                  createElement("span", { className: "truncate text-xs text-text-secondary" }, [workflow.description || "No description yet"]),
                  createElement("span", { className: "text-[11px] text-text-secondary" }, [
                    `${workflow.nodes.length} nodes · ${workflow.edges.length} connections · v${workflow.version}`
                  ])
                ])
              )
          ])
    ]);
  }

  private renderNodePaletteSection(): HTMLElement {
    return createElement("div", {
      className: "min-h-0 flex-1 overflow-y-auto p-3"
    }, [
      createElement("div", { className: "mb-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3 text-sm text-text-secondary" }, [
        "Add the MVP node set to the canvas. Asset-backed nodes create project-scoped assets server-side before they are placed."
      ]),
      readNodeKindsForPalette().map((kind) =>
        createElement("button", {
          type: "button",
          key: kind,
          className: "mb-2 flex w-full items-center gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3 text-left transition-colors hover:bg-[#20262f]",
          disabled: this.state.currentProject === null || this.state.pendingAction !== null,
          onClick: () => {
            void this.handleAddNode(kind);
          },
          dataset: {
            testid: `${WorkflowScreenSelector.NodePalettePrefix}${kind}`
          }
        }, [
          createElement("span", {
            className: "material-symbols-outlined text-[20px] text-white"
          }, [readNodeIcon(kind)]),
          createElement("div", { className: "flex min-w-0 flex-1 flex-col" }, [
            createElement("span", { className: "truncate text-sm font-medium text-white" }, [readNodeKindLabel(kind)]),
            createElement("span", { className: "text-xs text-text-secondary" }, [readNodePaletteDescription(kind)])
          ])
        ])
      )
    ]);
  }

  private renderAssetLibrarySection(): HTMLElement {
    return createElement("div", {
      className: "flex min-h-0 flex-1 flex-col"
    }, [
      createElement("div", { className: "border-b border-border-dark px-3 py-3" }, [
        createElement("div", { className: "grid gap-2 sm:grid-cols-3" }, [
          this.renderCreateAssetButton(WorkflowAssetKind.Prompt),
          this.renderCreateAssetButton(WorkflowAssetKind.Instruction),
          this.renderCreateAssetButton(WorkflowAssetKind.Guardrail)
        ])
      ]),
      createElement("div", { className: "min-h-0 flex-1 overflow-y-auto p-3" }, [
        this.state.assets.length === 0
          ? createElement(EmptyStatePanel, {
              icon: "library_add",
              title: "No reusable assets",
              description: "Create project-scoped prompt, instruction or guardrail assets here before reusing them across workflow definitions."
            })
          : groupAssetsByKind(this.state.assets).map((group) =>
              createElement("section", {
                key: group.kind,
                className: "mb-4 flex flex-col gap-2"
              }, [
                createElement("div", { className: "flex items-center justify-between" }, [
                  createElement("h3", { className: "text-xs font-semibold uppercase tracking-wide text-text-secondary" }, [
                    readAssetKindLabel(group.kind)
                  ]),
                  createElement("span", { className: "text-[11px] text-text-secondary" }, [
                    `${group.assets.length} asset${group.assets.length === 1 ? "" : "s"}`
                  ])
                ]),
                group.assets.map((asset) =>
                  createElement("button", {
                    type: "button",
                    key: asset.id,
                    className: `flex w-full flex-col gap-1 rounded-lg border px-3 py-3 text-left transition-colors ${this.state.selection.type === "asset" && this.state.selection.id === asset.id ? "border-primary bg-primary/10" : "border-border-dark bg-[#11161d] hover:bg-[#20262f]"}`,
                    onClick: () => this.setState({ selection: { type: "asset", id: asset.id } }),
                    dataset: {
                      testid: `${WorkflowScreenSelector.AssetCardPrefix}${asset.id}`
                    }
                  }, [
                    createElement("div", { className: "flex items-center justify-between gap-3" }, [
                      createElement("span", { className: "truncate text-sm font-medium text-white" }, [asset.name]),
                      createElement(StatusBadge, {
                        status: asset.scope === WorkflowAssetScope.Workspace ? "info" : "warning"
                      }, [readAssetScopeLabel(asset.scope)])
                    ]),
                    createElement("span", { className: "truncate text-xs text-text-secondary" }, [asset.description || asset.slug]),
                    createElement("span", { className: "text-[11px] text-text-secondary" }, [
                      `${readUsageCount(asset.id, this.state.assetUsages)} use${readUsageCount(asset.id, this.state.assetUsages) === 1 ? "" : "s"}`
                    ])
                  ])
                )
              ])
            )
      ])
    ]);
  }

  private renderExecutionSection(): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const executions = currentWorkflow
      ? [...this.state.executions
        .filter((execution) => execution.workflowId === currentWorkflow.id)]
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      : [];

    return createElement("div", {
      className: "min-h-0 flex-1 overflow-y-auto p-3"
    }, [
      currentWorkflow === null
        ? createElement(EmptyStatePanel, {
            icon: "history",
            title: "Select a workflow",
            description: "Pick a workflow first. Execution observability stays scoped to the selected definition only."
          })
        : executions.length === 0
          ? createElement(EmptyStatePanel, {
              icon: "history_toggle_off",
              title: "No recorded runs",
              description: "This workflow has no persisted runs yet. When the server records executions, this rail will show them here."
            })
          : createElement("div", { className: "flex flex-col gap-3" }, [
              createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
                createElement("div", { className: "flex items-center justify-between gap-3" }, [
                  createElement("div", { className: "min-w-0" }, [
                    createElement("p", { className: "text-sm font-medium text-white" }, ["Persisted runs"]),
                    createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
                      "Inspect runtime, tokens, EUR cost, warnings and node alerts. No live run controls in this slice."
                    ])
                  ]),
                  createElement(StatusBadge, {
                    status: executions.some((execution) => execution.status === "failed")
                      ? "failed"
                      : executions.some((execution) => execution.status === "running")
                        ? "running"
                        : "info"
                  }, [`${executions.length} run${executions.length === 1 ? "" : "s"}`])
                ])
              ]),
              executions.map((execution) =>
              createElement(Card, {
                key: execution.id,
                className: `border border-border-dark bg-[#11161d] ${this.state.selection.type === "execution" && this.state.selection.id === execution.id ? "border-primary bg-primary/10" : ""}`,
                padding: "md",
                hover: true,
                active: this.state.selection.type === "execution" && this.state.selection.id === execution.id,
                children: [
                  createElement("button", {
                    type: "button",
                    className: "flex w-full flex-col gap-3 text-left",
                    onClick: () => {
                      void this.handleSelectExecution(execution.id);
                    },
                    "data-testid": `${WorkflowScreenSelector.ExecutionCardPrefix}${execution.id}`
                  }, [
                    createElement("div", { className: "flex items-center justify-between gap-3" }, [
                      createElement("div", { className: "min-w-0" }, [
                        createElement("p", { className: "truncate text-sm font-medium text-white" }, [readExecutionLabel(execution)]),
                        createElement("p", { className: "text-xs text-text-secondary" }, [formatTimestamp(execution.startedAt)])
                      ]),
                      createElement(StatusBadge, {
                        status: readExecutionBadgeStatus(execution.status),
                        pulse: execution.status === "running"
                      }, [formatSelectOptionLabel(execution.status)])
                    ]),
                    createElement("div", { className: "grid grid-cols-2 gap-2 text-xs text-text-secondary" }, [
                      createElement("span", {}, [formatDuration(execution.durationMs)]),
                      createElement("span", {}, [`${execution.totals.totalTokens.toLocaleString()} tokens`]),
                      createElement("span", {}, [formatEuro(execution.totals.estimatedCostEur)]),
                      createElement("span", {}, [`${execution.warningsCount} warnings · ${execution.errorsCount} errors`])
                    ])
                  ]),
                  createElement(Button, {
                    variant: "ghost",
                    size: "sm",
                    disabled: this.state.pendingAction !== null,
                    onClick: () => {
                      void this.handleDeleteExecution(execution.id);
                    },
                    children: this.state.pendingAction === PendingAction.DeleteExecution ? "Deleting" : "Delete run",
                    dataset: {
                      testid: `${WorkflowScreenSelector.ExecutionDeletePrefix}${execution.id}`
                    }
                  })
                ]
              })
            )
            ])
    ]);
  }

  private renderCreateAssetButton(kind: WorkflowAssetKindValue): HTMLElement {
    return createElement(Button, {
      variant: "secondary",
      size: "sm",
      disabled: this.state.currentProject === null || this.state.pendingAction !== null,
      onClick: () => {
        void this.handleCreateAsset(kind);
      },
      children: `Add ${readAssetKindLabel(kind)}`,
      dataset: {
        testid: `${WorkflowScreenSelector.AssetCreatePrefix}${kind}`
      }
    });
  }

  private renderCanvasPanel(): HTMLElement {
    const workflow = this.state.draftWorkflow;
    const viewport = workflow?.viewport ?? { x: 0, y: 0, zoom: 1 };
    const previewPath = workflow ? this.readConnectionPreviewPath(workflow) : null;

    return createElement("section", {
      className: "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#11161d]"
    }, [
      this.renderCanvasHeader(),
      workflow
        ? createElement("div", {
            className: "relative min-h-0 flex-1 overflow-hidden",
            onPointerDown: (event: Event) => this.handleCanvasPointerDown(event as PointerEvent),
            onPointerMove: (event: Event) => this.handleCanvasPointerMove(event as PointerEvent),
            onMouseMove: (event: Event) => this.handleCanvasMouseMove(event as MouseEvent),
            onWheel: (event: Event) => this.handleCanvasWheel(event as WheelEvent),
            "data-testid": WorkflowScreenSelector.CanvasViewport,
            style: readCanvasBackgroundStyle(viewport)
          }, [
            createElement("div", {
              className: "absolute inset-0"
            }, [
              createElement("svg", {
                className: "absolute left-0 top-0 overflow-visible",
                width: "3200",
                height: "2200",
                viewBox: "0 0 3200 2200",
                preserveAspectRatio: "xMinYMin meet",
                style: `transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom}); transform-origin: 0 0;`
              }, [
                createElement("defs", {}, [
                  createElement("marker", {
                    id: "workflows-edge-arrow",
                    markerWidth: "8",
                    markerHeight: "8",
                    refX: "7",
                    refY: "4",
                    orient: "auto",
                    markerUnits: "userSpaceOnUse"
                  }, [
                    createElement("path", {
                      d: "M 0 0 L 8 4 L 0 8 z",
                      fill: "#6f7f92"
                    })
                  ]),
                  createElement("marker", {
                    id: "workflows-preview-arrow",
                    markerWidth: "9",
                    markerHeight: "9",
                    refX: "8",
                    refY: "4.5",
                    orient: "auto",
                    markerUnits: "userSpaceOnUse"
                  }, [
                    createElement("path", {
                      d: "M 0 0 L 9 4.5 L 0 9 z",
                      fill: "#f59e0b"
                    })
                  ]),
                  createElement("marker", {
                    id: "workflows-preview-arrow-active",
                    markerWidth: "9",
                    markerHeight: "9",
                    refX: "8",
                    refY: "4.5",
                    orient: "auto",
                    markerUnits: "userSpaceOnUse"
                  }, [
                    createElement("path", {
                      d: "M 0 0 L 9 4.5 L 0 9 z",
                      fill: "#60a5fa"
                    })
                  ])
                ]),
                createElement("g", {}, [
                  workflow.edges.map((edge) => this.renderEdgePath(edge, workflow.nodes)),
                  previewPath
                    ? createElement("g", {
                        "data-testid": WorkflowScreenSelector.ConnectionPreview
                      }, [
                        createElement("path", {
                          d: previewPath.path,
                          stroke: previewPath.stroke,
                          "stroke-width": "4",
                          "stroke-linecap": "round",
                          "stroke-dasharray": "10 8",
                          "marker-end": hoveredPortUsesActiveArrow(this.state.hoveredPort) ? "url(#workflows-preview-arrow-active)" : "url(#workflows-preview-arrow)",
                          fill: "none"
                        }),
                        createElement("circle", {
                          cx: String(previewPath.target.x),
                          cy: String(previewPath.target.y),
                          r: "8",
                          fill: previewPath.stroke,
                          opacity: "0.28"
                        }),
                        createElement("circle", {
                          cx: String(previewPath.target.x),
                          cy: String(previewPath.target.y),
                          r: "3.5",
                          fill: previewPath.stroke
                        })
                      ])
                    : ""
                ])
            ]),
            createElement("div", {
              className: "pointer-events-none absolute inset-0",
              style: `transform: translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom}); transform-origin: 0 0;`
            }, [
              workflow.nodes.map((node) => this.renderCanvasNode(node)),
              workflow.edges.map((edge) => this.renderEdgeDeleteControl(edge, workflow.nodes))
            ])
            ]),
            this.renderConnectionHint(),
            this.renderCanvasFooter()
          ])
        : createElement("div", {
            className: "flex flex-1 items-center justify-center p-6"
          }, [
            createElement(EmptyStatePanel, {
              icon: "account_tree",
              title: "No workflow loaded",
              description: "Create a workflow or select one from the definitions panel to start editing the canvas."
            })
          ])
    ]);
  }

  private renderCanvasHeader(): HTMLElement {
    return createElement("div", {
      className: "flex items-center justify-between border-b border-border-dark bg-[#151a20] px-4 py-2"
    }, [
      createElement("div", { className: "flex items-center gap-3" }, [
        createElement("span", { className: "text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary" }, ["Canvas"]),
        this.state.pendingConnection
          ? createElement(StatusBadge, {
              status: "warning"
            }, ["Select an input port"])
          : createElement(StatusBadge, {
              status: "info"
            }, ["Drag from output"])
      ]),
      createElement("div", { className: "flex min-w-0 items-center gap-3" }, [
        this.state.pendingConnection
          ? createElement("span", { className: "truncate text-xs text-amber-200" }, [
              "Connection mode active. Choose a compatible input port or press Esc to cancel."
            ])
          : ""
      ]),
      createElement("div", { className: "flex items-center gap-1" }, [
        createElement(IconButton, {
          icon: "zoom_out",
          tooltip: "Zoom out",
          disabled: this.state.draftWorkflow === null,
          onClick: () => this.handleZoom(-0.1),
          className: "h-9 w-9 rounded-md border border-transparent hover:border-border-dark hover:bg-[#20262f]",
          dataset: {
            testid: WorkflowScreenSelector.CanvasZoomOut
          }
        }),
        createElement(IconButton, {
          icon: "center_focus_strong",
          tooltip: "Reset view",
          disabled: this.state.draftWorkflow === null,
          onClick: () => this.handleResetViewport(),
          className: "h-9 w-9 rounded-md border border-transparent hover:border-border-dark hover:bg-[#20262f]",
          dataset: {
            testid: WorkflowScreenSelector.CanvasResetView
          }
        }),
        createElement(IconButton, {
          icon: "zoom_in",
          tooltip: "Zoom in",
          disabled: this.state.draftWorkflow === null,
          onClick: () => this.handleZoom(0.1),
          className: "h-9 w-9 rounded-md border border-transparent hover:border-border-dark hover:bg-[#20262f]",
          dataset: {
            testid: WorkflowScreenSelector.CanvasZoomIn
          }
        })
      ])
    ]);
  }

  private renderCanvasFooter(): HTMLElement {
    const viewport = this.state.draftWorkflow?.viewport;
    const footerLabel = this.readCanvasFooterLabel();

    return createElement("div", {
      className: "absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-border-dark bg-[#151a20] px-3 py-2 text-xs text-text-secondary"
    }, [
      createElement("span", {}, [viewport ? `${Math.round(viewport.zoom * 100)}%` : "100%"]),
      createElement("span", { className: "text-slate-500" }, ["•"]),
      createElement("span", {}, [footerLabel])
    ]);
  }

  private renderConnectionHint(): HTMLElement {
    const hintTitle = this.state.pendingConnection
      ? "Connection mode"
      : "Connect nodes";
    const hintBody = this.state.pendingConnection
      ? "Pick an input port on another node. Hover highlights valid targets and the preview wire follows the cursor."
      : "Drag from any output port into a target input port. Ports stay visible on every node so the graph behaves like n8n.";

    return createElement("div", {
      className: "pointer-events-none absolute left-4 top-4 max-w-md rounded-xl border border-border-dark bg-[#151a20]/95 px-4 py-3 shadow-[0_12px_32px_rgba(3,7,18,0.28)]",
      "data-testid": WorkflowScreenSelector.ConnectionHint
    }, [
      createElement("div", { className: "flex items-center gap-2" }, [
        createElement("span", {
          className: `material-symbols-outlined text-[18px] ${this.state.pendingConnection ? "text-amber-300" : "text-primary"}`
        }, [this.state.pendingConnection ? "alt_route" : "tips_and_updates"]),
        createElement("span", { className: "text-sm font-semibold text-white" }, [hintTitle])
      ]),
      createElement("p", { className: "mt-2 text-xs leading-5 text-text-secondary" }, [hintBody])
    ]);
  }

  private renderCanvasNode(node: WorkflowNodeRecord): HTMLElement {
    const selected = this.state.selection.type === "node" && this.state.selection.id === node.id;
    const asset = node.config.assetId ? this.state.assets.find((entry) => entry.id === node.config.assetId) ?? null : null;
    const canAcceptConnection = this.state.pendingConnection !== null && node.inputPorts.length > 0;
    const highlightedInputNode = this.state.hoveredPort?.side === "input" && this.state.hoveredPort.nodeId === node.id;

    return createElement("div", {
      key: node.id,
      className: `pointer-events-auto absolute flex flex-col rounded-xl border bg-[#1a1f27] shadow-[0_8px_24px_rgba(3,7,18,0.28)] transition-colors ${selected ? "border-primary ring-1 ring-primary/30" : canAcceptConnection ? "border-slate-500/90 shadow-[0_10px_30px_rgba(59,130,246,0.12)]" : "border-border-dark hover:border-slate-500"}`,
      style: `left:${node.position.x}px; top:${node.position.y}px; width:${node.width}px;`,
      onPointerMove: (event: Event) => this.handleNodeConnectionMouseMove(event as PointerEvent),
      onPointerUp: (event: Event) => this.handleNodeConnectionMouseUp(event as PointerEvent),
      dataset: {
        nodeId: node.id,
        testid: `${WorkflowScreenSelector.NodeCardPrefix}${node.id}`
      }
    }, [
      createElement("div", {
        className: `h-1.5 rounded-t-xl ${readNodeAccentClassName(node.kind)}`
      }),
      canAcceptConnection
        ? createElement("div", {
            className: `pointer-events-none absolute inset-y-6 left-0 w-16 rounded-l-xl border-r transition-colors ${highlightedInputNode ? "border-primary/70 bg-primary/10" : "border-slate-500/20 bg-slate-500/5"}`
          })
        : "",
      createElement("div", {
        className: "cursor-move px-3 py-3",
        dataset: {
          dragHandle: node.id
        },
        onPointerDown: (event: Event) => this.handleNodePointerDown(event as PointerEvent, node.id)
      }, [
        createElement("div", { className: "flex items-start justify-between gap-3" }, [
          createElement("div", { className: "min-w-0 flex-1" }, [
            createElement("div", { className: "flex items-center gap-2" }, [
              createElement("span", { className: "material-symbols-outlined text-[18px] text-white/90" }, [readNodeIcon(node.kind)]),
              createElement("span", { className: "truncate text-sm font-semibold text-white" }, [node.label])
            ]),
            createElement("p", { className: "mt-1 truncate text-xs text-text-secondary" }, [asset ? asset.name : readNodeSecondaryText(node)])
          ]),
          createElement(Button, {
            variant: "ghost",
            size: "sm",
            onClick: () => this.setState({ selection: { type: "node", id: node.id }, compactView: CompactView.Inspector }),
            children: selected ? "Selected" : "Edit"
          })
        ])
      ]),
      createElement("div", {
        className: "flex items-center justify-between border-t border-border-dark/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"
      }, [
        createElement("span", {}, [node.inputPorts.length === 0 ? "No inputs" : `${node.inputPorts.length} input${node.inputPorts.length === 1 ? "" : "s"}`]),
        createElement("span", {}, [node.outputPorts.length === 0 ? "No outputs" : `${node.outputPorts.length} output${node.outputPorts.length === 1 ? "" : "s"}`])
      ]),
      node.inputPorts.map((port, index) => this.renderNodePort(node, port.id, port.name, "input", index, node.inputPorts.length)),
      node.outputPorts.map((port, index) => this.renderNodePort(node, port.id, port.name, "output", index, node.outputPorts.length))
    ]);
  }

  private renderNodePort(
    node: WorkflowNodeRecord,
    portId: string,
    name: string,
    side: PortSide,
    index: number,
    total: number
  ): HTMLElement {
    const topOffset = readPortOffset(index, total);
    const active = this.state.pendingConnection?.nodeId === node.id && this.state.pendingConnection?.portId === portId;
    const hovered = this.state.hoveredPort?.nodeId === node.id &&
      this.state.hoveredPort?.portId === portId &&
      this.state.hoveredPort.side === side;
    const compatibleTarget = side === "input" && this.state.pendingConnection !== null;
    const incompatiblePort = side === "output" && this.state.pendingConnection !== null && !active;
    const labelClassName = active
      ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
      : hovered
        ? side === "input"
          ? "border-primary/60 bg-primary/10 text-white"
          : "border-emerald-400/60 bg-emerald-400/10 text-white"
        : compatibleTarget
          ? "border-primary/30 bg-[#182130] text-slate-100"
          : "border-border-dark bg-[#11161d] text-text-secondary";
    const pinClassName = active
      ? "border-amber-300 bg-amber-400 shadow-[0_0_0_6px_rgba(245,158,11,0.18)]"
      : hovered
        ? side === "input"
          ? "border-sky-200 bg-primary shadow-[0_0_0_6px_rgba(59,130,246,0.18)]"
          : "border-emerald-200 bg-emerald-400 shadow-[0_0_0_6px_rgba(52,211,153,0.18)]"
        : compatibleTarget
          ? "border-sky-300 bg-sky-500/80"
          : side === "input"
            ? "border-slate-300 bg-slate-500"
            : incompatiblePort
              ? "border-emerald-200/40 bg-emerald-400/40"
              : "border-emerald-200 bg-emerald-400";
    const stemClassName = active
      ? "bg-amber-400/70"
      : hovered
        ? side === "input"
          ? "bg-primary/80"
          : "bg-emerald-400/80"
        : compatibleTarget
          ? "bg-primary/50"
          : "bg-slate-600";

    return createElement("button", {
      type: "button",
      title: `${side} · ${name}`,
      className: `absolute flex items-center gap-2 cursor-crosshair select-none transition-transform duration-150 ${side === "input" ? "-left-6 pl-1" : "-right-6 pr-1"} ${hovered || active ? "scale-[1.06]" : ""}`,
      style: `top: ${topOffset}px;`,
      onPointerDown: (event: Event) => this.handlePortPointerDown(event as PointerEvent, node.id, portId, side),
      onPointerUp: (event: Event) => this.handlePortPointerUp(event as PointerEvent, node.id, portId, side),
      onMouseDown: (event: Event) => this.handlePortPointerDown(event as MouseEvent, node.id, portId, side),
      onMouseUp: (event: Event) => this.handlePortPointerUp(event as MouseEvent, node.id, portId, side),
      onMouseEnter: () => this.handlePortHover(node.id, portId, side),
      onMouseLeave: () => this.handlePortHoverEnd(node.id, portId, side),
      dataset: {
        portHandle: "true",
        portNodeId: node.id,
        portId,
        portSide: side
      }
    }, [
      side === "output"
        ? createElement("span", { className: `rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${labelClassName}` }, [name])
        : "",
      createElement("span", {
        className: `block h-px w-4 ${stemClassName}`
      }),
      createElement("span", {
        className: `block h-6 w-6 rounded-full border-2 transition-all duration-150 ${pinClassName}`
      }),
      createElement("span", {
        className: `block h-px w-4 ${stemClassName}`
      }),
      side === "input"
        ? createElement("span", { className: `rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${labelClassName}` }, [name])
        : ""
    ]);
  }

  private renderEdgePath(
    edge: WorkflowDefinitionRecord["edges"][number],
    nodes: ReadonlyArray<WorkflowNodeRecord>
  ): HTMLElement {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    const targetNode = nodes.find((node) => node.id === edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      return createElement("g", {});
    }

    const sourcePortIndex = sourceNode.outputPorts.findIndex((port) => port.id === edge.sourcePortId);
    const targetPortIndex = targetNode.inputPorts.findIndex((port) => port.id === edge.targetPortId);
    const source = readPortAnchorPoint(sourceNode, "output", Math.max(sourcePortIndex, 0), sourceNode.outputPorts.length);
    const target = readPortAnchorPoint(targetNode, "input", Math.max(targetPortIndex, 0), targetNode.inputPorts.length);
    const path = readEdgeCurvePath(source, target);
    const hovered = this.state.hoveredEdgeId === edge.id;

    return createElement("g", {
      key: edge.id,
      className: "pointer-events-auto",
      onMouseEnter: () => this.handleEdgeHover(edge.id)
    }, [
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
        "data-testid": `${WorkflowScreenSelector.EdgeHitPrefix}${edge.id}`
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
        "data-testid": "workflows-edge"
      }),
    ]);
  }

  private renderEdgeDeleteControl(
    edge: WorkflowDefinitionRecord["edges"][number],
    nodes: ReadonlyArray<WorkflowNodeRecord>
  ): HTMLElement {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    const targetNode = nodes.find((node) => node.id === edge.targetNodeId);
    if (!sourceNode || !targetNode) {
      return createElement("span", {});
    }

    const sourcePortIndex = sourceNode.outputPorts.findIndex((port) => port.id === edge.sourcePortId);
    const targetPortIndex = targetNode.inputPorts.findIndex((port) => port.id === edge.targetPortId);
    const source = readPortAnchorPoint(sourceNode, "output", Math.max(sourcePortIndex, 0), sourceNode.outputPorts.length);
    const target = readPortAnchorPoint(targetNode, "input", Math.max(targetPortIndex, 0), targetNode.inputPorts.length);
    const point = readEdgeActionPoint(source, target, nodes);
    const hovered = this.state.hoveredEdgeId === edge.id;

    return createElement("button", {
      type: "button",
      title: "Remove connection",
      className: `absolute grid h-5 w-5 place-items-center rounded border border-rose-400/80 bg-[#151a20] text-[13px] leading-none text-rose-200 transition-opacity ${hovered ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`,
      style: `left:${point.x - 10}px; top:${point.y - 10}px;`,
      onMouseMove: () => this.handleEdgeHover(edge.id),
      onMouseEnter: () => this.handleEdgeHover(edge.id),
      onMouseDown: (event: Event) => this.handleEdgeDeletePointerStart(event),
      onPointerDown: (event: Event) => this.handleEdgeDeletePointerStart(event),
      onClick: (event: Event) => this.handleRemoveEdge(event, edge.id),
      "data-testid": `${WorkflowScreenSelector.EdgeDeletePrefix}${edge.id}`
    }, [
      createElement("span", {
        className: "material-symbols-outlined text-[13px]"
      }, ["delete"])
    ]);
  }

  private readConnectionPreviewPath(
    workflow: WorkflowDefinitionUpsertInput
  ): { path: string; stroke: string; target: ConnectionPreviewPoint } | null {
    const source = this.state.pendingConnection;
    if (!source) {
      return null;
    }

    const sourceNode = workflow.nodes.find((node) => node.id === source.nodeId);
    if (!sourceNode) {
      return null;
    }

    const sourcePortIndex = sourceNode.outputPorts.findIndex((port) => port.id === source.portId);
    if (sourcePortIndex < 0) {
      return null;
    }

    const sourcePoint = readPortAnchorPoint(sourceNode, "output", sourcePortIndex, sourceNode.outputPorts.length);
    const hoveredInput = this.state.hoveredPort?.side === "input" ? this.state.hoveredPort : null;
    const targetPoint = hoveredInput
      ? readHoveredInputAnchorPoint(workflow.nodes, hoveredInput)
      : this.state.connectionPreviewPoint;

    if (!targetPoint) {
      return null;
    }

    return {
      path: readEdgeCurvePath(sourcePoint, targetPoint),
      stroke: hoveredInput ? "#60a5fa" : "#f59e0b",
      target: targetPoint
    };
  }

  private readCanvasFooterLabel(): string {
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

    return "Drag the canvas, drag nodes, or drag from outputs to create connections";
  }

  private renderInspectorPanel(): HTMLElement {
    return createElement("aside", {
      className: this.state.isCompactViewport
        ? "flex min-h-0 flex-1 flex-col border-l border-border-dark bg-[#1a1f27]"
        : "flex min-h-0 w-[420px] shrink-0 flex-col border-l border-border-dark bg-[#1a1f27] xl:w-[460px]",
      "data-testid": WorkflowScreenSelector.InspectorPanel
    }, [
      createElement("div", {
        className: "flex items-center justify-between border-b border-border-dark px-4 py-3"
      }, [
        createElement("div", { className: "flex min-w-0 flex-col" }, [
          createElement("span", { className: "text-sm font-semibold text-white" }, [this.readInspectorTitle()]),
          createElement("span", { className: "truncate text-xs text-text-secondary" }, [this.readInspectorSubtitle()])
        ]),
        this.state.selection.type === "node"
          ? createElement(Button, {
              variant: "danger",
              size: "sm",
              onClick: () => this.handleRemoveSelectedNode(),
              children: "Delete node"
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
                children: this.state.pendingAction === PendingAction.DeleteExecution ? "Deleting" : "Delete run"
              });
              })()
          : ""
      ]),
      createElement("div", {
        className: "min-h-0 flex-1 overflow-y-auto p-4",
        "data-preserve-scroll-key": "workflows-inspector-scroll"
      }, [this.renderInspectorBody()])
    ]);
  }

  private renderInspectorBody(): HTMLElement {
    if (this.state.selection.type === "node") {
      const node = this.readSelectedNode();
      return node ? this.renderNodeInspector(node) : this.renderEmptyInspector();
    }

    if (this.state.selection.type === "asset") {
      const asset = this.readSelectedAsset();
      return asset ? this.renderAssetInspector(asset) : this.renderEmptyInspector();
    }

    if (this.state.selection.type === "execution") {
      const execution = this.readSelectedExecution();
      return execution ? this.renderExecutionInspector(execution) : this.renderEmptyInspector();
    }

    const workflow = this.state.draftWorkflow;
    return workflow ? this.renderWorkflowInspector(workflow) : this.renderEmptyInspector();
  }

  private renderExecutionInspector(execution: WorkflowExecutionRecord): HTMLElement {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    const nodeLookup = new Map((currentWorkflow?.nodes ?? []).map((node) => [node.id, node]));
    const hasAlerts = execution.nodeRuns.some((nodeRun) => nodeRun.alerts.length > 0);

    return createElement("div", {
      className: "flex flex-col gap-4",
      "data-testid": WorkflowScreenSelector.ExecutionInspector
    }, [
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
        createElement("div", { className: "flex items-center justify-between gap-3" }, [
          createElement("div", { className: "min-w-0" }, [
            createElement("p", { className: "truncate text-sm font-medium text-white" }, [readExecutionLabel(execution)]),
            createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
              `Started ${formatTimestamp(execution.startedAt)}`
            ])
          ]),
          createElement(StatusBadge, {
            status: readExecutionBadgeStatus(execution.status),
            pulse: execution.status === "running"
          }, [formatSelectOptionLabel(execution.status)])
        ]),
        createElement("div", { className: "mt-3 grid grid-cols-2 gap-3" }, [
          this.renderInlineMetaTile("Runtime", formatDuration(execution.durationMs)),
          this.renderInlineMetaTile("Tokens", execution.totals.totalTokens.toLocaleString()),
          this.renderInlineMetaTile("EUR", formatEuro(execution.totals.estimatedCostEur)),
          this.renderInlineMetaTile("Latency", formatDuration(execution.totals.latencyMs)),
          this.renderInlineMetaTile("Warnings", execution.warningsCount.toString()),
          this.renderInlineMetaTile("Errors", execution.errorsCount.toString())
        ])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Run context"]),
        createElement("div", { className: "mt-3 grid grid-cols-2 gap-3" }, [
          this.renderInlineMetaTile("Trigger", formatSelectOptionLabel(execution.triggerKind)),
          this.renderInlineMetaTile("Session", execution.contextSessionId),
          this.renderInlineMetaTile("Prompt", execution.totals.promptTokens.toLocaleString()),
          this.renderInlineMetaTile("Completion", execution.totals.completionTokens.toLocaleString())
        ])
      ]),
      hasAlerts
        ? createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
            createElement("p", { className: "text-sm font-medium text-white" }, ["Run alerts"]),
            createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              execution.nodeRuns.flatMap((nodeRun) =>
                nodeRun.alerts.map((alert) =>
                  createElement("div", {
                    key: alert.id,
                    className: "rounded-md border border-border-dark bg-[#161b22] px-3 py-2"
                  }, [
                    createElement("div", { className: "flex items-center justify-between gap-3" }, [
                      createElement("span", { className: "text-xs font-medium text-white" }, [
                        `${nodeLookup.get(nodeRun.nodeId)?.label ?? nodeRun.nodeId} · ${formatSelectOptionLabel(alert.source)}`
                      ]),
                      createElement(StatusBadge, {
                        status: readAlertBadgeStatus(alert.level)
                      }, [formatSelectOptionLabel(alert.level)])
                    ]),
                    createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [alert.message])
                  ])
                )
              )
            ])
          ])
        : "",
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
        createElement("div", { className: "flex items-center justify-between gap-3" }, [
          createElement("div", { className: "min-w-0" }, [
            createElement("p", { className: "text-sm font-medium text-white" }, ["Node runs"]),
            createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
              "Per-node runtime, provider usage and alert visibility."
            ])
          ]),
          this.state.loadingExecutionId === execution.id
            ? createElement(StatusBadge, {
                status: "running",
                pulse: true
              }, ["Refreshing"])
            : ""
        ]),
        createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
          execution.nodeRuns.map((nodeRun) => {
            const nodeLabel = nodeLookup.get(nodeRun.nodeId)?.label ?? nodeRun.nodeId;
            return createElement("div", {
              key: nodeRun.id,
              className: "rounded-md border border-border-dark bg-[#161b22] px-3 py-3",
              "data-testid": `${WorkflowScreenSelector.ExecutionNodeRunPrefix}${nodeRun.id}`
            }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("div", { className: "min-w-0" }, [
                  createElement("p", { className: "truncate text-sm font-medium text-white" }, [nodeLabel]),
                  createElement("p", { className: "truncate text-xs text-text-secondary" }, [
                    `${readNodeKindLabel(nodeRun.nodeKind)} · ${formatDuration(nodeRun.durationMs)}`
                  ])
                ]),
                createElement(StatusBadge, {
                  status: readExecutionBadgeStatus(nodeRun.status)
                }, [formatSelectOptionLabel(nodeRun.status)])
              ]),
              createElement("div", { className: "mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary" }, [
                createElement("span", {}, [readNodeRunProviderLabel(nodeRun)]),
                createElement("span", {}, [nodeRun.usage ? `${nodeRun.usage.totalTokens.toLocaleString()} tokens` : "No token data"]),
                createElement("span", {}, [nodeRun.usage ? formatEuro(nodeRun.usage.estimatedCostEur) : "No EUR data"]),
                createElement("span", {}, [`${nodeRun.alerts.length} alert${nodeRun.alerts.length === 1 ? "" : "s"}`])
              ]),
              nodeRun.alerts.length > 0
                ? createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
                    nodeRun.alerts.map((alert) =>
                      createElement("div", {
                        key: alert.id,
                        className: "rounded border border-border-dark bg-[#11161d] px-3 py-2"
                      }, [
                        createElement("div", { className: "flex items-center justify-between gap-2" }, [
                          createElement("span", { className: "text-xs text-white" }, [alert.message]),
                          createElement(StatusBadge, {
                            status: readAlertBadgeStatus(alert.level)
                          }, [formatSelectOptionLabel(alert.level)])
                        ]),
                        createElement("p", { className: "mt-1 text-[11px] text-text-secondary" }, [
                          `${formatSelectOptionLabel(alert.source)} · ${formatTimestamp(alert.createdAt)}`
                        ])
                      ])
                    )
                  ])
                : createElement("p", { className: "mt-3 text-xs text-text-secondary" }, ["No node alerts."])
            ]);
          })
        ])
      ])
    ]);
  }

  private renderWorkflowInspector(workflow: WorkflowDefinitionUpsertInput): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-4" }, [
      this.renderInspectorField("Workflow name", workflow.name, (value) => {
        this.patchDraftWorkflow((current) => ({
          ...current,
          name: value
        }));
      }, WorkflowScreenSelector.WorkflowNameInput),
      this.renderInspectorTextArea("Description", workflow.description, (value) => {
        this.patchDraftWorkflow((current) => ({
          ...current,
          description: value
        }));
      }, WorkflowScreenSelector.WorkflowDescriptionInput),
      this.renderInspectorSelect("Status", workflow.status, [
        WorkflowRecordStatus.Draft,
        WorkflowRecordStatus.Published,
        WorkflowRecordStatus.Archived
      ], (value) => {
        this.patchDraftWorkflow((current) => ({
          ...current,
          status: readWorkflowRecordStatus(value)
        }));
      }),
      this.renderInspectorField("Language", workflow.defaultContextPolicy.language, (value) => {
        this.updateDraftWorkflow({
          ...workflow,
          defaultContextPolicy: {
            ...workflow.defaultContextPolicy,
            language: value
          }
        });
      }),
      this.renderInlineMetaGrid([
        { label: "Nodes", value: String(workflow.nodes.length) },
        { label: "Connections", value: String(workflow.edges.length) },
        { label: "Zoom", value: `${Math.round(workflow.viewport.zoom * 100)}%` },
        { label: "Workspace", value: workflow.workspaceId }
      ])
    ]);
  }

  private renderNodeInspector(node: WorkflowNodeRecord): HTMLElement {
    const compatibleAssetKind = readNodeAssetKind(node.kind);
    const compatibleAssets = compatibleAssetKind
      ? this.state.assets.filter((asset) => asset.kind === compatibleAssetKind)
      : [];
    const guardrailAssets = this.state.assets.filter((asset) => asset.kind === WorkflowAssetKind.Guardrail);
    const linkedAsset = node.config.assetId
      ? compatibleAssets.find((asset) => asset.id === node.config.assetId) ?? null
      : null;

    return createElement("div", { className: "flex flex-col gap-4" }, [
      this.renderInspectorField("Node label", node.label, (value) => {
        this.patchNode(node.id, (current) => ({
          ...current,
          label: value
        }));
      }, WorkflowScreenSelector.NodeLabelInput),
      this.renderReadOnlyBadgeRow(node.kind, node.inputPorts.length, node.outputPorts.length),
      compatibleAssetKind
        ? createElement("div", { className: "flex flex-col gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
            createElement("div", { className: "flex items-center justify-between gap-3" }, [
              createElement("span", { className: "text-sm font-medium text-white" }, [`${readAssetKindLabel(compatibleAssetKind)} binding`]),
              createElement(Button, {
                variant: "ghost",
                size: "sm",
                onClick: () => {
                  void this.handleCreateAsset(compatibleAssetKind, node.id);
                },
                children: "New asset"
              })
            ]),
            this.renderInspectorSelect("Asset", linkedAsset?.id ?? "", compatibleAssets.map((asset) => asset.id), (value) => {
              const asset = compatibleAssets.find((entry) => entry.id === value);
              if (!asset) {
                return;
              }
              this.patchNode(node.id, (current) => ({
                ...current,
                config: {
                  ...current.config,
                  assetId: asset.id
                }
              }));
              this.setState({ selection: { type: "node", id: node.id } });
            }, compatibleAssets.map((asset) => ({ value: asset.id, label: asset.name }))),
            linkedAsset ? this.renderEmbeddedAssetEditor(linkedAsset) : createElement("p", { className: "text-xs text-text-secondary" }, ["Select or create an asset to author this node."])
          ])
        : "",
      node.kind === WorkflowNodeKind.AiAgent ? this.renderAgentConfig(node) : "",
      node.kind === WorkflowNodeKind.AiProviderRun ? this.renderProviderRunConfig(node) : "",
      node.kind === WorkflowNodeKind.HumanReview ? this.renderReviewConfig(node) : "",
      isOutputContractCapableNode(node.kind)
        ? this.renderNodeOutputContractSection(node)
        : "",
      this.renderNodeInputMappingSection(node),
      node.kind !== WorkflowNodeKind.TriggerManual && node.kind !== WorkflowNodeKind.TerminalResponse
        ? this.renderGuardrailAttachmentSection(node, guardrailAssets)
        : ""
    ]);
  }

  private renderNodeOutputContractSection(node: WorkflowNodeRecord): HTMLElement {
    const contract = node.outputContract ?? null;
    const validation = readJsonContractValidation(contract);
    const pathCount = contract ? readJsonSchemaPaths(contract.schema).length : 0;

    return this.renderQuickEditorCard({
      title: "JSON output contract",
      description: validation.valid
        ? `${pathCount.toString()} paths available for downstream mappings.`
        : validation.message,
      status: validation.valid ? "success" : "warning",
      statusLabel: validation.valid ? "Valid" : "Needs work",
      buttonLabel: "Open editor",
      testId: `${WorkflowScreenSelector.DeepEditorOpenPrefix}contract`,
      onOpen: () => this.openDeepEditor({
        type: "node",
        id: node.id
      }, "output")
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
    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("div", { className: "flex items-start justify-between gap-3" }, [
        createElement("div", { className: "min-w-0" }, [
          createElement("p", { className: "text-sm font-medium text-white" }, [input.title]),
          createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [input.description])
        ]),
        createElement(StatusBadge, { status: input.status }, [input.statusLabel])
      ]),
      createElement("div", { className: "mt-3 flex justify-end" }, [
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          onClick: input.onOpen,
          children: input.buttonLabel,
          dataset: {
            testid: input.testId
          }
        })
      ])
    ]);
  }

  private openDeepEditor(
    target: DeepEditorTarget,
    initialTab: DeepEditorTab = "prompt"
  ): void {
    const contract = this.readDeepEditorContract(target);
    this.setState({
      deepEditor: {
        target,
        tab: initialTab,
        outputTab: initialTab === "output" ? "visual" : "visual",
        rawContractText: contract ? formatJsonOutputContractDocument(contract) : "",
        rawContractError: null,
        promptSelectionStart: 0,
        promptSelectionEnd: 0,
        sampleSelectionStart: 0,
        sampleSelectionEnd: 0
      },
      errorMessage: null
    });
  }

  private closeDeepEditor(): void {
    this.setState({
      deepEditor: null
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
    const sampleOutputValue = contract?.sampleOutput ?? "";

    return createElement("div", {
      className: "fixed inset-0 z-50 bg-black/70 p-3 md:p-6",
      onClick: () => this.closeDeepEditor(),
      "data-testid": WorkflowScreenSelector.DeepEditorModal
    }, [
      createElement("div", {
        className: "mx-auto flex h-full w-full max-w-[1460px] flex-col overflow-hidden rounded-xl border border-border-dark bg-[#0f141a] shadow-2xl",
        onClick: (event: Event) => event.stopPropagation()
      }, [
        createElement("div", {
          className: "flex items-center justify-between border-b border-border-dark px-4 py-3"
        }, [
          createElement("div", { className: "min-w-0" }, [
            createElement("p", { className: "truncate text-sm font-semibold text-white" }, [targetTitle]),
            createElement("p", { className: "truncate text-xs text-text-secondary" }, [
              "Deep authoring modal. Quick edits stay in inspector; full prompt/schema work happens here."
            ])
          ]),
          createElement(IconButton, {
            icon: "close",
            tooltip: "Close editor",
            onClick: () => this.closeDeepEditor(),
            dataset: {
              testid: WorkflowScreenSelector.DeepEditorClose
            }
          })
        ]),
        createElement("div", {
          className: "flex items-center gap-2 border-b border-border-dark px-4 py-2"
        }, [
          this.renderDeepEditorTabButton("Prompt", "prompt", WorkflowScreenSelector.DeepEditorTabPrompt),
          this.renderDeepEditorTabButton("Output", "output", WorkflowScreenSelector.DeepEditorTabOutput),
          this.renderDeepEditorTabButton("Preview", "preview", WorkflowScreenSelector.DeepEditorTabPreview)
        ]),
        createElement("div", {
          className: "grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]"
        }, [
          createElement("div", {
            className: "min-h-0 overflow-y-auto p-4"
          }, [
            deepEditor.tab === "prompt"
              ? this.renderDeepEditorPromptPane(promptValue)
              : deepEditor.tab === "output"
                ? this.renderDeepEditorOutputPane(contract, sampleOutputValue)
                : this.renderDeepEditorPreviewPane(promptValue, contract)
          ]),
          createElement("aside", {
            className: "min-h-0 overflow-y-auto border-t border-border-dark bg-[#121820] p-4 lg:border-l lg:border-t-0"
          }, [
            createElement("p", { className: "text-sm font-medium text-white" }, ["Variables"]),
            createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [
              "Click or drag variables into prompt or output template fields. Raw schema JSON stays explicit and recoverable."
            ]),
            createElement("div", { className: "mt-4 flex flex-col gap-3" }, [
              variableGroups.map((group) => this.renderVariableGroup(group))
            ])
          ])
        ])
      ])
    ]);
  }

  private renderDeepEditorTabButton(
    label: string,
    tab: DeepEditorTab,
    testId: string
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
            tab
          }
        });
      },
      children: label,
      dataset: {
        testid: testId
      }
    });
  }

  private renderDeepEditorPromptPane(promptValue: string): HTMLElement {
    return createElement("div", { className: "flex h-full flex-col gap-4" }, [
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Prompt or body"]),
        createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [
          "Use variables from prior outputs, current input, workflow context, or reusable assets. Canonical insertion tokens stay compact for downstream providers."
        ])
      ]),
      createElement("textarea", {
        className: "min-h-[420px] w-full resize-y rounded-lg border border-border-dark bg-[#0d1117] px-4 py-3 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40",
        value: promptValue,
        onInput: (event: Event) => {
          const target = event.target;
          if (!(target instanceof HTMLTextAreaElement)) {
            return;
          }
          this.updateDeepEditorPromptValue(target.value);
          this.setDeepEditorSelection("prompt", target.selectionStart, target.selectionEnd);
        },
        onClick: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLTextAreaElement) {
            this.setDeepEditorSelection("prompt", target.selectionStart, target.selectionEnd);
          }
        },
        onKeyUp: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLTextAreaElement) {
            this.setDeepEditorSelection("prompt", target.selectionStart, target.selectionEnd);
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
        "data-testid": WorkflowScreenSelector.DeepEditorPromptInput
      })
    ]);
  }

  private renderDeepEditorOutputPane(
    contract: JsonOutputContractRecord | null,
    sampleOutputValue: string
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
            testid: WorkflowScreenSelector.DeepEditorOutputTabVisual
          }
        }),
        createElement(Button, {
          variant: deepEditor.outputTab === "json" ? "secondary" : "ghost",
          size: "sm",
          onClick: () => this.setDeepEditorOutputTab("json"),
          children: "Raw JSON",
          dataset: {
            testid: WorkflowScreenSelector.DeepEditorOutputTabJson
          }
        })
      ]),
      deepEditor.outputTab === "visual" && contract
        ? this.renderOutputContractEditor({
            title: "JSON output contract",
            description: "Visual tree and raw JSON share one canonical schema model.",
            contract,
            selectors: NodeOutputContractEditorSelectors,
            onRename: (name) => this.updateDeepEditorContract((current) => ({
              ...current,
              name
            })),
            onChangeContract: (updater) => this.updateDeepEditorContract(updater)
          })
        : "",
      deepEditor.outputTab === "json"
        ? createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3" }, [
            createElement("div", { className: "flex items-center justify-between gap-3" }, [
              createElement("div", { className: "min-w-0" }, [
                createElement("p", { className: "text-sm font-medium text-white" }, ["Raw contract JSON"]),
                createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [
                  "Fallback editor chosen after validating that raw ESM runtime makes Monaco/CodeMirror integration risky for this slice."
                ])
              ]),
              createElement(Button, {
                variant: "secondary",
                size: "sm",
                onClick: () => this.applyDeepEditorRawJson(),
                children: "Apply JSON",
                dataset: {
                  testid: WorkflowScreenSelector.DeepEditorApplyRawJson
                }
              })
            ]),
            createElement("textarea", {
              className: "mt-3 min-h-[360px] w-full resize-y rounded-lg border border-border-dark bg-[#0d1117] px-4 py-3 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40",
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
                        rawContractError: null
                      }
                    : null
                });
              },
              "data-testid": WorkflowScreenSelector.DeepEditorRawJsonInput
            }),
            deepEditor.rawContractError
              ? createElement("p", { className: "mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100" }, [deepEditor.rawContractError])
              : createElement("p", { className: "mt-3 text-xs text-text-secondary" }, ["Apply updates after editing raw JSON to keep schema tree and provider payload in sync."])
          ])
        : "",
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Output template / sample"]),
        createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [
          "Optional sample payload or template. Click or drag variables into this field."
        ]),
        createElement("textarea", {
          className: "mt-3 min-h-[180px] w-full resize-y rounded-lg border border-border-dark bg-[#0d1117] px-4 py-3 font-mono text-sm leading-6 text-white outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40",
          value: sampleOutputValue,
          onInput: (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLTextAreaElement)) {
              return;
            }
            this.updateDeepEditorContract((current) => ({
              ...current,
              sampleOutput: target.value
            }));
            this.setDeepEditorSelection("sample", target.selectionStart, target.selectionEnd);
          },
          onClick: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLTextAreaElement) {
              this.setDeepEditorSelection("sample", target.selectionStart, target.selectionEnd);
            }
          },
          onKeyUp: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLTextAreaElement) {
              this.setDeepEditorSelection("sample", target.selectionStart, target.selectionEnd);
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
          "data-testid": WorkflowScreenSelector.DeepEditorSampleOutputInput
        })
      ])
    ]);
  }

  private renderDeepEditorPreviewPane(
    promptValue: string,
    contract: JsonOutputContractRecord | null
  ): HTMLElement {
    const paths = contract ? readJsonSchemaPaths(contract.schema) : [];
    const providerSchema = contract ? serializeJsonContractForProvider(contract) : null;

    return createElement("div", { className: "flex flex-col gap-4" }, [
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Prompt preview"]),
        createElement("pre", {
          className: "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border-dark bg-[#0d1117] px-3 py-3 font-mono text-xs leading-6 text-slate-200"
        }, [promptValue.length > 0 ? promptValue : "No prompt text yet."])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Available output paths"]),
        paths.length === 0
          ? createElement("p", { className: "mt-2 text-xs text-text-secondary" }, ["No contract paths yet."])
          : createElement("div", { className: "mt-3 flex flex-wrap gap-2" }, [
              paths.map((path) =>
                createElement("span", {
                  key: path,
                  className: "rounded-md border border-border-dark bg-[#0d1117] px-2 py-1 font-mono text-xs text-slate-200"
                }, [path])
              )
            ])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-4 py-3" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Compact provider payload"]),
        createElement("pre", {
          className: "mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border-dark bg-[#0d1117] px-3 py-3 font-mono text-[11px] leading-5 text-slate-200"
        }, [providerSchema ? JSON.stringify(providerSchema, null, 2) : "{}"])
      ])
    ]);
  }

  private renderVariableGroup(group: WorkflowVariableGroup): HTMLElement {
    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#0f141a] px-3 py-3" }, [
      createElement("p", { className: "text-xs font-semibold uppercase tracking-wide text-text-secondary" }, [group.label]),
      group.tokens.length === 0
        ? createElement("p", { className: "mt-2 text-xs text-text-secondary" }, ["No variables available."])
        : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
            group.tokens.map((token) =>
              createElement("button", {
                key: token.id,
                type: "button",
                className: "rounded-md border border-border-dark bg-[#151b22] px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-[#19212b]",
                draggable: true,
                onClick: () => this.handleVariableTokenInsert(token.id, this.state.deepEditor?.tab === "output" ? "sample" : "prompt"),
                onDragstart: (event: DragEvent) => {
                  event.dataTransfer?.setData("text/plain", token.id);
                },
                "data-testid": `${WorkflowScreenSelector.VariableTokenPrefix}${token.id}`
              }, [
                createElement("span", { className: "block font-mono text-xs text-slate-100" }, [token.label]),
                createElement("span", { className: "mt-1 block text-[11px] text-text-secondary" }, [token.detail])
              ])
            )
          ])
    ]);
  }

  private setDeepEditorOutputTab(outputTab: DeepEditorOutputTab): void {
    if (!this.state.deepEditor) {
      return;
    }

    this.setState({
      deepEditor: {
        ...this.state.deepEditor,
        outputTab
      }
    });
  }

  private setDeepEditorSelection(
    field: "prompt" | "sample",
    selectionStart: number,
    selectionEnd: number
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
              promptSelectionEnd: selectionEnd
            }
          : {
              sampleSelectionStart: selectionStart,
              sampleSelectionEnd: selectionEnd
            })
      }
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
          prompt: value
        }
      }));
      return;
    }

    this.patchAsset(deepEditor.target.id, (current) => ({
      ...current,
      body: value
    }));
  }

  private updateDeepEditorContract(
    updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord
  ): void {
    const deepEditor = this.state.deepEditor;
    if (!deepEditor) {
      return;
    }

    if (deepEditor.target.type === "node") {
      if (!this.state.draftWorkflow) {
        return;
      }
      const nextWorkflow = updateWorkflowNodeOutputContract(this.state.draftWorkflow, deepEditor.target.id, updater);
      const nextNode = nextWorkflow.nodes.find((node) => node.id === deepEditor.target.id);
      this.updateDraftWorkflow(nextWorkflow, { type: "node", id: deepEditor.target.id });
      this.setState({
        deepEditor: {
          ...deepEditor,
          rawContractText: nextNode?.outputContract
            ? formatJsonOutputContractDocument(nextNode.outputContract)
            : deepEditor.rawContractText,
          rawContractError: null
        }
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
        outputContract: nextContract
      };
    });
    const asset = this.state.assets.find((entry) => entry.id === deepEditor.target.id);
    const nextContract = asset?.outputContract ? updater(asset.outputContract) : null;
    this.setState({
      deepEditor: {
        ...deepEditor,
        rawContractText: nextContract ? formatJsonOutputContractDocument(nextContract) : deepEditor.rawContractText,
        rawContractError: null
      }
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

    const parsed = parseJsonOutputContractDocument(deepEditor.rawContractText, contract);
    if (!parsed.success) {
      this.setState({
        deepEditor: {
          ...deepEditor,
          rawContractError: parsed.error
        }
      });
      return;
    }

    this.updateDeepEditorContract(() => parsed.contract);
  }

  private handleVariableTokenInsert(
    tokenId: string,
    targetField: "prompt" | "sample"
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
        reference: token.reference
      });
      this.updateDeepEditorPromptValue(inserted.value);
      this.setState({
        deepEditor: {
          ...deepEditor,
          promptSelectionStart: inserted.value.length,
          promptSelectionEnd: inserted.value.length
        }
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
      reference: token.reference
    });
    this.updateDeepEditorContract((current) => ({
      ...current,
      sampleOutput: inserted.value
    }));
    this.setState({
      deepEditor: {
        ...deepEditor,
        sampleSelectionStart: inserted.value.length,
        sampleSelectionEnd: inserted.value.length
      }
    });
  }

  private readDeepEditorTitle(target: DeepEditorTarget): string {
    if (target.type === "node") {
      const node = this.state.draftWorkflow?.nodes.find((entry) => entry.id === target.id);
      return node ? `${node.label} editor` : "Node editor";
    }

    const asset = this.state.assets.find((entry) => entry.id === target.id);
    return asset ? `${asset.name} editor` : "Asset editor";
  }

  private readDeepEditorPromptValue(target: DeepEditorTarget): string {
    if (target.type === "node") {
      return this.state.draftWorkflow?.nodes.find((entry) => entry.id === target.id)?.config.prompt ?? "";
    }

    return this.state.assets.find((entry) => entry.id === target.id)?.body ?? "";
  }

  private readDeepEditorContract(target: DeepEditorTarget): JsonOutputContractRecord | null {
    if (target.type === "node") {
      return this.state.draftWorkflow?.nodes.find((entry) => entry.id === target.id)?.outputContract ?? null;
    }

    return this.state.assets.find((entry) => entry.id === target.id)?.outputContract ?? null;
  }

  private readDeepEditorVariableGroups(target: DeepEditorTarget): ReadonlyArray<WorkflowVariableGroup> {
    const workflow = this.state.draftWorkflow;
    const targetNodeId = target.type === "node" ? target.id : null;
    const upstreamTokens = workflow
      ? workflow.nodes
          .filter((node) => node.id !== targetNodeId && node.outputContract)
          .flatMap((node) =>
            readJsonSchemaPaths(node.outputContract?.schema ?? createJsonSchemaNode("object")).map((path) => ({
              id: `node-${node.id}-${path}`,
              label: `${node.label} · ${path}`,
              detail: "Previous node output",
              reference: {
                kind: WorkflowExpressionVariableKind.NodeOutput,
                sourceId: node.id,
                path
              } satisfies WorkflowExpressionVariableReference
            }))
          )
      : [];
    const incomingTokens = workflow && targetNodeId
      ? workflow.edges
          .filter((edge) => edge.targetNodeId === targetNodeId)
          .flatMap((edge) => {
            const sourceNode = workflow.nodes.find((node) => node.id === edge.sourceNodeId);
            const paths = sourceNode?.outputContract ? readJsonSchemaPaths(sourceNode.outputContract.schema) : ["$"];
            return paths.map((path) => ({
              id: `input-${edge.id}-${path}`,
              label: path,
              detail: sourceNode ? `Current input via ${sourceNode.label}` : "Current input",
              reference: {
                kind: WorkflowExpressionVariableKind.CurrentInput,
                path
              } satisfies WorkflowExpressionVariableReference
            }));
          })
      : [];
    const contextTokens: ReadonlyArray<WorkflowVariableToken> = [
      {
        id: "context-workflow-name",
        label: "$.workflow.name",
        detail: "Workflow context",
        reference: {
          kind: WorkflowExpressionVariableKind.WorkflowContext,
          path: "$.workflow.name"
        }
      },
      {
        id: "context-workflow-language",
        label: "$.workflow.language",
        detail: "Workflow context",
        reference: {
          kind: WorkflowExpressionVariableKind.WorkflowContext,
          path: "$.workflow.language"
        }
      }
    ];
    const assetTokens = this.state.assets
      .filter((asset) => asset.outputContract)
      .flatMap((asset) =>
        readJsonSchemaPaths(asset.outputContract?.schema ?? createJsonSchemaNode("object")).map((path) => ({
          id: `asset-${asset.id}-${path}`,
          label: `${asset.name} · ${path}`,
          detail: "Reusable asset output",
          reference: {
            kind: WorkflowExpressionVariableKind.AssetOutput,
            sourceId: asset.id,
            path
          } satisfies WorkflowExpressionVariableReference
        }))
      );

    return [
      {
        id: "current-input",
        label: "Current input",
        tokens: incomingTokens
      },
      {
        id: "previous-outputs",
        label: "Previous node outputs",
        tokens: upstreamTokens
      },
      {
        id: "workflow-context",
        label: "Workflow context",
        tokens: contextTokens
      },
      {
        id: "reusable-assets",
        label: "Reusable assets",
        tokens: assetTokens
      }
    ];
  }

  private renderNodeInputMappingSection(node: WorkflowNodeRecord): HTMLElement {
    const workflow = this.state.draftWorkflow;
    const incomingEdges = workflow?.edges.filter((edge) => edge.targetNodeId === node.id) ?? [];

    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("div", { className: "flex items-start justify-between gap-3" }, [
        createElement("div", { className: "min-w-0" }, [
          createElement("p", { className: "text-sm font-medium text-white" }, ["Input mapping"]),
          createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [
            "Map prior node outputs into this node input. Passthrough remains valid when no explicit entry is configured."
          ])
        ]),
        createElement(StatusBadge, { status: incomingEdges.length > 0 ? "info" : "warning" }, [
          `${incomingEdges.length} input${incomingEdges.length === 1 ? "" : "s"}`
        ])
      ]),
      createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
        incomingEdges.length === 0
          ? createElement("p", { className: "rounded-md border border-dashed border-border-dark px-3 py-3 text-xs text-text-secondary" }, [
              "Connect an upstream node before configuring mappings."
            ])
          : incomingEdges.map((edge) => this.renderEdgeMappingEditor(edge))
      ])
    ]);
  }

  private renderEdgeMappingEditor(edge: WorkflowDefinitionUpsertInput["edges"][number]): HTMLElement {
    const workflow = this.state.draftWorkflow;
    const sourceNode = workflow?.nodes.find((node) => node.id === edge.sourceNodeId);
    const sourcePaths = sourceNode?.outputContract
      ? readJsonSchemaPaths(sourceNode.outputContract.schema)
      : ["$.result"];

    return createElement("div", { className: "rounded-md border border-border-dark bg-[#0f1318] px-3 py-3" }, [
      createElement("div", { className: "flex items-center justify-between gap-3" }, [
        createElement("div", { className: "min-w-0" }, [
          createElement("p", { className: "truncate text-sm font-medium text-white" }, [
            sourceNode ? `${sourceNode.label} output` : edge.sourceNodeId
          ]),
          createElement("p", { className: "text-xs text-text-secondary" }, [
            `${edge.mapping.mode} · ${edge.mapping.entries.length} mapping${edge.mapping.entries.length === 1 ? "" : "s"}`
          ])
        ])
      ]),
      createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, [
        this.renderInspectorField("Target path", this.state.mappingTargetPath, (value) => {
          this.setState({ mappingTargetPath: value });
        }, WorkflowScreenSelector.MappingTargetPathInput),
        this.renderInspectorSelect("Source path", this.state.mappingSourcePath, sourcePaths, (value) => {
          this.setState({ mappingSourcePath: value });
        }, sourcePaths.map((path) => ({ value: path, label: path })), WorkflowScreenSelector.MappingSourcePathInput)
      ]),
      createElement(Button, {
        variant: "secondary",
        size: "sm",
        className: "mt-3",
        disabled: this.state.mappingTargetPath.trim().length === 0 || this.state.mappingSourcePath.trim().length === 0,
        onClick: () => this.handleAddMappingEntry(edge),
        children: "Add mapping",
        dataset: {
          testid: WorkflowScreenSelector.MappingAddEntry
        }
      }),
      edge.mapping.entries.length === 0
        ? createElement("p", { className: "mt-3 text-xs text-text-secondary" }, ["No explicit entries yet. The edge currently forwards the upstream payload."])
        : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
            edge.mapping.entries.map((entry, index) =>
              createElement("div", {
                key: `${entry.targetPath}-${index.toString()}`,
                className: "rounded border border-border-dark px-3 py-2 text-xs text-text-secondary"
              }, [
                `${entry.targetPath} ← ${entry.source.path ?? entry.source.value ?? entry.source.kind}`
              ])
            )
          ])
    ]);
  }

  private renderAssetInspector(asset: WorkflowAssetRecord): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-4" }, [
      this.renderInspectorField("Asset name", asset.name, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          name: value,
          slug: toSlugValue(value)
        }));
      }),
      this.renderInspectorField("Slug", asset.slug, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          slug: toSlugValue(value)
        }));
      }),
      this.renderInspectorField("Description", asset.description, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          description: value
        }));
      }),
      this.renderInspectorSelect("Scope", asset.scope, [
        WorkflowAssetScope.Project,
        WorkflowAssetScope.Workspace
      ], (value) => {
        const nextScope = readWorkflowAssetScope(value);
        const nextProjectId = value === WorkflowAssetScope.Project
          ? this.state.currentProject?.id
          : undefined;
        this.patchAsset(asset.id, (current) => ({
          ...stripOptionalProjectId(current),
          scope: nextScope,
          ...(nextProjectId ? { projectId: nextProjectId } : {})
        }));
      }),
      this.renderInspectorTextArea("Body", asset.body, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          body: value
        }));
      }),
      asset.kind !== WorkflowAssetKind.Guardrail
        ? this.renderQuickEditorCard({
            title: "Deep editor",
            description: "Open a larger modal for prompt/body authoring, output schema JSON sync, and variable insertion.",
            status: "info",
            statusLabel: "Modal",
            buttonLabel: "Open editor",
            testId: `${WorkflowScreenSelector.DeepEditorOpenPrefix}asset`,
            onOpen: () => this.openDeepEditor({
              type: "asset",
              id: asset.id
            }, "prompt")
          })
        : "",
      asset.kind === WorkflowAssetKind.Guardrail && asset.guardrail
        ? this.renderGuardrailDefinitionEditor(asset)
        : "",
      asset.outputContract
        ? this.renderOutputContractEditor({
            title: "JSON output contract",
            description: "Reusable prompt and instruction assets can publish structured output paths for downstream nodes.",
            contract: asset.outputContract,
            selectors: AssetOutputContractEditorSelectors,
            onRename: (name) => {
              this.patchAsset(asset.id, (current) => current.outputContract
                ? {
                    ...current,
                    outputContract: {
                      ...current.outputContract,
                      name
                    }
                  }
                : current);
            },
            onChangeContract: (updater) => {
              this.patchAsset(asset.id, (current) => current.outputContract
                ? {
                    ...current,
                    outputContract: updater(current.outputContract)
                  }
                : current);
            }
          })
        : "",
      createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
        createElement("div", { className: "flex items-center justify-between gap-3" }, [
          createElement("span", { className: "text-sm font-medium text-white" }, ["Usage"]),
          createElement(StatusBadge, {
            status: readUsageCount(asset.id, this.state.assetUsages) > 0 ? "info" : "warning"
          }, [`${readUsageCount(asset.id, this.state.assetUsages)} linked`])
        ]),
        readUsageCount(asset.id, this.state.assetUsages) === 0
          ? createElement("p", { className: "mt-2 text-xs text-text-secondary" }, ["This asset is not linked to any workflow node yet."])
          : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              this.state.assetUsages
                .filter((usage) => usage.assetId === asset.id)
                .map((usage) =>
                  createElement("div", {
                    key: `${usage.workflowId}-${usage.nodeId}`,
                    className: "rounded-md border border-border-dark px-3 py-2 text-xs text-text-secondary"
                  }, [`${usage.workflowId.slice(0, 8)} · ${usage.nodeKind} · ${usage.role}`])
                )
            ])
      ])
    ]);
  }

  private renderOutputContractEditor(input: {
    title: string;
    description: string;
    contract: JsonOutputContractRecord | null;
    selectors: OutputContractEditorSelectorSet;
    onRename: (name: string) => void;
    onChangeContract: (updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord) => void;
  }): HTMLElement {
    const validation = readJsonContractValidation(input.contract);
    const paths = input.contract ? readJsonSchemaPaths(input.contract.schema) : [];
    const providerSchema = input.contract ? serializeJsonContractForProvider(input.contract) : null;

    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("div", { className: "flex items-start justify-between gap-3" }, [
        createElement("div", { className: "min-w-0" }, [
          createElement("p", { className: "text-sm font-medium text-white" }, [input.title]),
          createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [input.description])
        ]),
        createElement(StatusBadge, {
          status: validation.valid ? "success" : "warning"
        }, [validation.valid ? "Valid" : "Needs work"])
      ]),
      input.contract
        ? createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
            this.renderInspectorField("Contract name", input.contract.name, input.onRename, input.selectors.nameInput),
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
                    required: false
                  })
                }));
              },
              children: "Add property",
              dataset: {
                testid: input.selectors.addFieldButton
              }
            }),
            createElement("div", {
              className: `rounded-md border px-3 py-2 text-xs ${validation.valid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-amber-500/40 bg-amber-500/10 text-amber-100"}`,
              "data-testid": input.selectors.status
            }, [validation.message]),
            createElement("div", { className: "rounded-md border border-border-dark bg-[#0f1318] px-3 py-3" }, [
              createElement("div", { className: "mb-3 flex items-center justify-between gap-3" }, [
                createElement("p", { className: "text-xs font-semibold uppercase tracking-wide text-text-secondary" }, ["Schema tree"]),
                createElement("span", { className: "text-xs text-text-secondary" }, ["Objects can nest properties. Arrays expose an editable item schema."])
              ]),
              this.renderOutputContractSchemaNode({
                schema: input.contract.schema,
                path: [],
                propertyName: null,
                required: true,
                selectors: input.selectors,
                onChangeContract: input.onChangeContract
              })
            ]),
            createElement("div", { className: "rounded-md border border-border-dark bg-[#0f1318] px-3 py-2" }, [
              createElement("p", { className: "text-xs font-semibold uppercase tracking-wide text-text-secondary" }, ["Available paths"]),
              paths.length === 0
                ? createElement("p", { className: "mt-2 text-xs text-text-secondary" }, ["No fields yet."])
                : createElement("div", { className: "mt-2 flex flex-wrap gap-2" }, paths.map((path) =>
                    createElement("span", {
                      key: path,
                      className: "rounded-full border border-border-dark bg-[#151a20] px-2 py-1 text-xs text-slate-200"
                    }, [path])
                  ))
            ]),
            createElement("div", { className: "rounded-md border border-border-dark bg-[#0f1318] px-3 py-2" }, [
              createElement("p", { className: "text-xs font-semibold uppercase tracking-wide text-text-secondary" }, ["Compact provider payload"]),
              createElement("pre", {
                className: "mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-slate-200"
              }, [providerSchema ? JSON.stringify(providerSchema, null, 2) : "{}"])
            ])
          ])
        : createElement("p", { className: "mt-3 rounded-md border border-dashed border-border-dark px-3 py-3 text-xs text-text-secondary" }, [
            "This node does not expose a JSON output contract."
          ])
    ]);
  }

  private renderOutputContractSchemaNode(input: {
    schema: JsonSchemaNodeRecord;
    path: ReadonlyArray<string>;
    propertyName: string | null;
    required: boolean;
    selectors: OutputContractEditorSelectorSet;
    onChangeContract: (updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord) => void;
  }): HTMLElement {
    const isRoot = input.propertyName === null && input.path.length === 0;
    const propertyToken = toContractPathToken(input.path);
    const parentPath = input.path.slice(0, -1);
    const propertyKey = input.propertyName ?? "";
    const isArrayItem = input.path.at(-1) === JsonSchemaItemsSegment;
    const showPropertyControls = !isRoot && !isArrayItem;
    const typeLabel = isRoot ? "Root object" : isArrayItem ? "Item schema" : "Property";
    const childEntries = input.schema.type === "object"
      ? Object.entries(input.schema.properties ?? {}).sort(([left], [right]) => left.localeCompare(right))
      : [];

    return createElement("div", {
      className: `${isRoot ? "flex flex-col gap-3" : "rounded-md border border-border-dark bg-[#11161d] px-3 py-3"}`
    }, [
      isRoot
        ? ""
        : createElement("div", { className: "flex flex-col gap-3" }, [
            createElement("div", { className: "flex flex-wrap items-center gap-2" }, [
              createElement("span", { className: "text-xs font-medium uppercase tracking-wide text-text-secondary" }, [typeLabel]),
              createElement("div", { className: "min-w-[180px] flex-1" }, [
                showPropertyControls
                  ? this.renderContractInlineInput({
                      value: propertyKey,
                      testId: `${input.selectors.propertyNamePrefix}${propertyToken}`,
                      onCommit: (value) => {
                        const nextName = value.trim();
                        if (nextName.length === 0 || nextName === propertyKey) {
                          return;
                        }
                        input.onChangeContract((current) => ({
                          ...current,
                          schema: renameJsonSchemaProperty(current.schema, parentPath, propertyKey, nextName)
                        }));
                      }
                    })
                  : createElement("div", { className: "rounded-md border border-border-dark bg-[#10151b] px-3 py-2 text-sm text-white" }, [
                      "Array item"
                    ])
              ]),
              this.renderContractInlineSelect({
                value: input.schema.type,
                options: readJsonSchemaTypes(),
                testId: `${input.selectors.propertyTypePrefix}${propertyToken}`,
                onChange: (value) => {
                  input.onChangeContract((current) => ({
                    ...current,
                    schema: updateJsonSchemaNode(current.schema, input.path, (node) => preserveSchemaPresentation(node, createJsonSchemaNode(readJsonSchemaType(value))))
                  }));
                }
              }),
              showPropertyControls
                ? createElement("label", { className: "flex items-center gap-2 rounded-md border border-border-dark bg-[#10151b] px-3 py-2 text-xs text-slate-200" }, [
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
                          schema: setContractPropertyRequired(current.schema, parentPath, propertyKey, target.checked)
                        }));
                      },
                      "data-testid": `${input.selectors.propertyRequiredPrefix}${propertyToken}`
                    }),
                    "Required"
                  ])
                : "",
              input.schema.type === "object"
                ? createElement(IconButton, {
                    icon: "subdirectory_arrow_right",
                    tooltip: "Add nested property",
                    onClick: () => {
                      input.onChangeContract((current) => ({
                        ...current,
                        schema: upsertJsonSchemaProperty(current.schema, input.path, {
                          name: readNextContractPropertyName(input.schema),
                          node: createJsonSchemaNode("string"),
                          required: false
                        })
                      }));
                    },
                    dataset: {
                      testid: `${input.selectors.propertyAddChildPrefix}${propertyToken}`
                    }
                  })
                : "",
              showPropertyControls
                ? createElement(IconButton, {
                    icon: "delete",
                    tooltip: "Delete property",
                    onClick: () => {
                      input.onChangeContract((current) => ({
                        ...current,
                        schema: removeJsonSchemaProperty(current.schema, parentPath, propertyKey)
                      }));
                    },
                    dataset: {
                      testid: `${input.selectors.propertyDeletePrefix}${propertyToken}`
                    }
                  })
                : ""
            ]),
            this.renderOutputContractConstraintEditor({
              schema: input.schema,
              path: input.path,
              selectors: input.selectors,
              onChangeContract: input.onChangeContract
            })
          ]),
      input.schema.type === "object"
        ? createElement("div", { className: `${isRoot ? "flex flex-col gap-3" : "mt-3 flex flex-col gap-3 border-l border-border-dark pl-4"}` }, [
            childEntries.length === 0
              ? createElement("p", { className: "text-xs text-text-secondary" }, ["No properties yet. Add one to define this object."])
              : childEntries.map(([key, value]) =>
                  this.renderOutputContractSchemaNode({
                    schema: value,
                    path: [...input.path, key],
                    propertyName: key,
                    required: (input.schema.required ?? []).includes(key),
                    selectors: input.selectors,
                    onChangeContract: input.onChangeContract
                  })
                )
          ])
        : "",
      input.schema.type === "array"
        ? createElement("div", { className: "mt-3 border-l border-border-dark pl-4" }, [
            this.renderOutputContractSchemaNode({
              schema: input.schema.items ?? createJsonSchemaNode("string"),
              path: [...input.path, JsonSchemaItemsSegment],
              propertyName: null,
              required: true,
              selectors: input.selectors,
              onChangeContract: input.onChangeContract
            })
          ])
        : ""
    ]);
  }

  private renderOutputContractConstraintEditor(input: {
    schema: JsonSchemaNodeRecord;
    path: ReadonlyArray<string>;
    selectors: OutputContractEditorSelectorSet;
    onChangeContract: (updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord) => void;
  }): HTMLElement {
    const propertyToken = toContractPathToken(input.path);
    if (input.schema.type === "string") {
      return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
        this.renderContractSelectField("Format", input.schema.format ?? "", readJsonSchemaFormats(), (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                format: readJsonSchemaFormat(value)
              })
            )
          }));
        }, `${input.selectors.propertyFormatPrefix}${propertyToken}`),
        this.renderContractNumberField("Min length", input.schema.minLength, (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                minLength: value
              })
            )
          }));
        }, `${input.selectors.propertyMinPrefix}${propertyToken}`),
        this.renderContractNumberField("Max length", input.schema.maxLength, (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                maxLength: value
              })
            )
          }));
        }, `${input.selectors.propertyMaxPrefix}${propertyToken}`),
        this.renderContractTextField("Pattern", input.schema.pattern ?? "", (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                pattern: value.trim().length > 0 ? value : undefined
              })
            )
          }));
        }, `${input.selectors.propertyPatternPrefix}${propertyToken}`)
      ]);
    }

    if (input.schema.type === "number" || input.schema.type === "integer") {
      return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
        this.renderContractNumberField("Minimum", input.schema.minimum, (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                minimum: value
              })
            )
          }));
        }, `${input.selectors.propertyMinPrefix}${propertyToken}`),
        this.renderContractNumberField("Maximum", input.schema.maximum, (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                maximum: value
              })
            )
          }));
        }, `${input.selectors.propertyMaxPrefix}${propertyToken}`)
      ]);
    }

    if (input.schema.type === "array") {
      return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
        this.renderContractNumberField("Min items", input.schema.minItems, (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                minItems: value
              })
            )
          }));
        }, `${input.selectors.propertyMinPrefix}${propertyToken}`),
        this.renderContractNumberField("Max items", input.schema.maxItems, (value) => {
          input.onChangeContract((current) => ({
            ...current,
            schema: updateJsonSchemaNode(current.schema, input.path, (node) =>
              patchSchemaNodeOptional(node, {
                maxItems: value
              })
            )
          }));
        }, `${input.selectors.propertyMaxPrefix}${propertyToken}`)
      ]);
    }

    return createElement("div", { className: "text-xs text-text-secondary" }, [
      input.schema.type === "boolean"
        ? "Boolean values only need required/optional semantics."
        : input.schema.type === "object"
          ? "Nested objects can publish additional reusable paths."
          : "Configure this schema through the type selector."
    ]);
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
      onChange: commitValue
    });
  }

  private renderContractInlineSelect(input: {
    value: string;
    options: ReadonlyArray<string>;
    onChange: (value: string) => void;
    testId: string;
  }): HTMLElement {
    return createElement("div", { className: "relative min-w-[128px]" }, [
      createElement("select", {
        className: InspectorSelectClassName,
        value: input.value,
        "data-testid": input.testId,
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLSelectElement) {
            input.onChange(target.value);
          }
        }
      }, input.options.map((option) =>
        createElement("option", { value: option }, [formatSelectOptionLabel(option)])
      )),
      createElement("span", {
        className: "pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-secondary"
      }, ["▾"])
    ]);
  }

  private renderContractTextField(
    label: string,
    value: string,
    onCommit: (value: string) => void,
    testId: string
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-xs font-medium text-white" }, [label]),
      this.renderContractInlineInput({
        value,
        onCommit,
        testId
      })
    ]);
  }

  private renderContractNumberField(
    label: string,
    value: number | undefined,
    onCommit: (value: number | undefined) => void,
    testId: string
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-xs font-medium text-white" }, [label]),
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
        }
      })
    ]);
  }

  private renderContractSelectField(
    label: string,
    value: string,
    options: ReadonlyArray<string>,
    onChange: (value: string) => void,
    testId: string
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-xs font-medium text-white" }, [label]),
      this.renderContractInlineSelect({
        value,
        options,
        onChange,
        testId
      })
    ]);
  }

  private renderGuardrailDefinitionEditor(asset: WorkflowAssetRecord): HTMLElement {
    const guardrail = asset.guardrail;
    if (!guardrail) {
      return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3 text-sm text-text-secondary" }, [
        "This guardrail asset has no definition yet."
      ]);
    }

    const validity = readGuardrailDefinitionValidity(guardrail);
    const maxReached = guardrail.validations.length >= 4;

    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("div", { className: "flex items-start justify-between gap-3" }, [
        createElement("div", { className: "min-w-0" }, [
          createElement("p", { className: "text-sm font-medium text-white" }, ["Guardrail composition"]),
          createElement("p", { className: "mt-1 text-xs leading-5 text-text-secondary" }, [
            "Warnings are permissive. Error guardrails block node validity only when one of their validations triggers."
          ])
        ]),
        createElement(StatusBadge, {
          status: validity.blocking ? "failed" : validity.valid ? "success" : "warning"
        }, [validity.blocking ? "Blocking" : validity.valid ? "Ready" : "Permissive"])
      ]),
      createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, [
        this.renderInspectorSelect("Severity", guardrail.severity, [
          WorkflowGuardrailSeverity.Warn,
          WorkflowGuardrailSeverity.Error,
          WorkflowGuardrailSeverity.Success
        ], (value) => {
          this.patchGuardrailAsset(asset.id, (current) => ({
            ...current,
            severity: readWorkflowGuardrailSeverity(value)
          }));
        }, undefined, WorkflowScreenSelector.GuardrailSeveritySelect),
        this.renderInspectorSelect("Operator", guardrail.operator, [
          WorkflowGuardrailOperator.All,
          WorkflowGuardrailOperator.Any
        ], (value) => {
          this.patchGuardrailAsset(asset.id, (current) => ({
            ...current,
            operator: readWorkflowGuardrailOperator(value)
          }));
        }, undefined, WorkflowScreenSelector.GuardrailOperatorSelect)
      ]),
      createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-2" }, [
        this.renderInspectorSelect("Validation", this.state.guardrailValidationKind, readGuardrailValidationKinds(), (value) => {
          this.setState({ guardrailValidationKind: readGuardrailValidationKind(value) });
        }, undefined, WorkflowScreenSelector.GuardrailValidationKindSelect),
        this.renderInspectorSelect("Target", this.state.guardrailValidationTarget, readGuardrailValidationTargets(), (value) => {
          this.setState({ guardrailValidationTarget: readGuardrailValidationTarget(value) });
        }, undefined, WorkflowScreenSelector.GuardrailValidationTargetSelect),
        this.renderInspectorField("Path", this.state.guardrailValidationPath, (value) => {
          this.setState({ guardrailValidationPath: value });
        }, WorkflowScreenSelector.GuardrailValidationPathInput),
        this.renderInspectorField("Message", this.state.guardrailValidationMessage, (value) => {
          this.setState({ guardrailValidationMessage: value });
        }, WorkflowScreenSelector.GuardrailValidationMessageInput)
      ]),
      createElement(Button, {
        variant: "secondary",
        size: "sm",
        className: "mt-3",
        disabled: maxReached || this.state.guardrailValidationMessage.trim().length === 0,
        onClick: () => this.handleAddGuardrailValidation(asset.id),
        children: maxReached ? "Maximum 4 validations" : "Add validation",
        dataset: {
          testid: WorkflowScreenSelector.GuardrailAddValidation
        }
      }),
      createElement("div", { className: "mt-3 rounded-md border border-border-dark bg-[#0f1318] px-3 py-2 text-xs text-text-secondary" }, [
        validity.message
      ]),
      createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
        guardrail.validations.map((validation) => this.renderGuardrailValidationRow(asset, validation))
      ])
    ]);
  }

  private renderGuardrailValidationRow(
    asset: WorkflowAssetRecord,
    validation: GuardrailValidationRecord
  ): HTMLElement {
    return createElement("div", {
      key: validation.id,
      className: "rounded-md border border-border-dark bg-[#0f1318] px-3 py-2"
    }, [
      createElement("div", { className: "flex items-center justify-between gap-3" }, [
        createElement("div", { className: "min-w-0" }, [
          createElement("p", { className: "truncate text-sm font-medium text-white" }, [validation.kind]),
          createElement("p", { className: "text-xs text-text-secondary" }, [
            `${validation.target}${validation.path ? ` · ${validation.path}` : ""}`
          ])
        ]),
        createElement(Button, {
          variant: "danger",
          size: "sm",
          onClick: () => this.handleRemoveGuardrailValidation(asset.id, validation.id),
          children: "Remove"
        })
      ]),
      createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [validation.message])
    ]);
  }

  private renderEmbeddedAssetEditor(asset: WorkflowAssetRecord): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-3" }, [
      this.renderInspectorField("Asset name", asset.name, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          name: value,
          slug: toSlugValue(value)
        }));
      }),
      this.renderInspectorTextArea("Body", asset.body, (value) => {
        this.patchAsset(asset.id, (current) => ({
          ...current,
          body: value
        }));
      }),
      asset.outputContract
        ? this.renderOutputContractEditor({
            title: "Asset output contract",
            description: "Expose fields that later nodes can map from this reusable asset.",
            contract: asset.outputContract,
            selectors: AssetOutputContractEditorSelectors,
            onRename: (name) => {
              this.patchAsset(asset.id, (current) => current.outputContract
                ? {
                    ...current,
                    outputContract: {
                      ...current.outputContract,
                      name
                    }
                  }
                : current);
            },
            onChangeContract: (updater) => {
              this.patchAsset(asset.id, (current) => current.outputContract
                ? {
                    ...current,
                    outputContract: updater(current.outputContract)
                  }
                : current);
            }
          })
        : ""
    ]);
  }

  private renderAgentConfig(node: WorkflowNodeRecord): HTMLElement {
    const role = node.config.role ?? WorkflowNodeRole.Planner;
    const provider = node.config.provider ?? createFallbackProviderSelection();

    return createElement("div", { className: "flex flex-col gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("div", { className: "mb-3 flex flex-col gap-1" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Agent configuration"]),
        createElement("p", { className: "text-xs text-text-secondary" }, ["Set the prompt and runtime profile used by this node."])
      ]),
      this.renderInspectorSelect("Role", role, [
        WorkflowNodeRole.Planner,
        WorkflowNodeRole.Retriever,
        WorkflowNodeRole.Executor,
        WorkflowNodeRole.Reviewer
      ], (value) => {
        this.patchNode(node.id, (current) => ({
          ...current,
          config: {
            ...current.config,
            role: readWorkflowNodeRole(value),
            provider: current.config.provider ?? provider
          }
        }));
      }, undefined, WorkflowScreenSelector.NodeRoleSelect),
      this.renderNodePromptField(node),
      this.renderProviderSelectionFields(node, provider)
    ]);
  }

  private renderProviderRunConfig(node: WorkflowNodeRecord): HTMLElement {
    const provider = node.config.provider ?? createFallbackProviderSelection();

    return createElement("div", { className: "flex flex-col gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("div", { className: "mb-3 flex flex-col gap-1" }, [
        createElement("p", { className: "text-sm font-medium text-white" }, ["Provider run"]),
        createElement("p", { className: "text-xs text-text-secondary" }, ["Run one prompt through a selected provider profile."])
      ]),
      this.renderNodePromptField(node),
      this.renderProviderSelectionFields(node, provider),
      createElement("p", { className: "mt-3 text-xs text-text-secondary" }, [
        "Provider capability tests land in phase 06.6. This MVP persists per-node provider, model, reasoning, temperature and verbosity now, but the connection test action remains disabled with explanation."
      ]),
      createElement(Button, {
        variant: "ghost",
        size: "sm",
        disabled: true,
        children: "Provider test in 06.6"
      })
    ]);
  }

  private renderProviderSelectionFields(
    node: WorkflowNodeRecord,
    provider: WorkflowProviderSelectionRecord
  ): HTMLElement {
    const providerOptions = this.readProviderProfileOptions(provider.providerId);

    return createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
      this.renderInspectorSelect("Provider profile", provider.providerId, providerOptions.map((option) => option.value), (value) => {
        this.updateNodeProvider(node.id, {
          providerId: value
        });
      }, providerOptions, WorkflowScreenSelector.NodeProviderSelect),
      this.renderInspectorField("Model", provider.modelId, (value) => {
        this.updateNodeProvider(node.id, {
          modelId: value
        });
      }),
      this.renderInspectorSelect("Reasoning", provider.reasoningLevel, [
        WorkflowReasoningLevel.Low,
        WorkflowReasoningLevel.Medium,
        WorkflowReasoningLevel.High,
        WorkflowReasoningLevel.Max
      ], (value) => {
        this.updateNodeProvider(node.id, {
          reasoningLevel: readWorkflowReasoningLevel(value)
        });
      }, undefined, WorkflowScreenSelector.NodeReasoningSelect),
      this.renderInspectorField("Temperature", provider.temperature.toString(), (value) => {
        const parsed = Number.parseFloat(value);
        this.updateNodeProvider(node.id, {
          temperature: Number.isFinite(parsed) ? parsed : provider.temperature
        });
      }),
      this.renderInspectorSelect("Verbosity", provider.verbosity, [
        WorkflowVerbosity.Low,
        WorkflowVerbosity.Medium,
        WorkflowVerbosity.High
      ], (value) => {
        this.updateNodeProvider(node.id, {
          verbosity: readWorkflowVerbosity(value)
        });
      }, undefined, WorkflowScreenSelector.NodeVerbositySelect)
    ]);
  }

  private renderNodePromptField(node: WorkflowNodeRecord): HTMLElement {
    const prompt = node.config.prompt ?? "";
    const preview = prompt.trim().length > 0 ? prompt.trim() : "No prompt written yet.";

    return this.renderQuickEditorCard({
      title: "Prompt",
      description: preview.length > 140 ? `${preview.slice(0, 137)}...` : preview,
      status: prompt.trim().length > 0 ? "info" : "warning",
      statusLabel: prompt.trim().length > 0 ? `${prompt.length.toString()} chars` : "Empty",
      buttonLabel: "Open editor",
      testId: `${WorkflowScreenSelector.DeepEditorOpenPrefix}prompt`,
      onOpen: () => this.openDeepEditor({
        type: "node",
        id: node.id
      })
    });
  }

  private renderReviewConfig(node: WorkflowNodeRecord): HTMLElement {
    const requireHumanDecision = node.config.reviewPolicy?.requireHumanDecision ?? true;

    return createElement("label", {
      className: "flex items-start gap-3 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3"
    }, [
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
                requireHumanDecision: target.checked
              }
            }
          }));
        }
      }),
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("span", { className: "text-sm font-medium text-white" }, ["Require manual decision"]),
        createElement("span", { className: "text-xs text-text-secondary" }, ["This node blocks the workflow until a reviewer approves or requests changes."])
      ])
    ]);
  }

  private renderGuardrailAttachmentSection(
    node: WorkflowNodeRecord,
    guardrailAssets: ReadonlyArray<WorkflowAssetRecord>
  ): HTMLElement {
    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("div", { className: "flex items-center justify-between gap-3" }, [
        createElement("span", { className: "text-sm font-medium text-white" }, ["Attached guardrails"]),
        createElement(Button, {
          variant: "ghost",
          size: "sm",
          onClick: () => {
            void this.handleCreateAsset(WorkflowAssetKind.Guardrail, node.id, true);
          },
          children: "New guardrail",
          dataset: {
            testid: WorkflowScreenSelector.GuardrailNewForNode
          }
        })
      ]),
      createElement("div", { className: "mt-3 flex flex-col gap-3" }, [
        guardrailAssets.length > 0
          ? this.renderInspectorSelect("Attach asset", this.state.guardrailAttachAssetId ?? "", guardrailAssets.map((asset) => asset.id), (value) => {
              this.setState({ guardrailAttachAssetId: value });
            }, guardrailAssets.map((asset) => ({ value: asset.id, label: asset.name })))
          : createElement("p", { className: "text-xs text-text-secondary" }, ["No guardrail assets yet. Create one to attach it to the selected node."]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          disabled: !this.state.guardrailAttachAssetId,
          onClick: () => {
            if (!this.state.guardrailAttachAssetId || !this.state.draftWorkflow) {
              return;
            }
            const nextWorkflow = attachGuardrailToNode(this.state.draftWorkflow, node.id, this.state.guardrailAttachAssetId);
            this.updateDraftWorkflow(nextWorkflow);
          },
          children: "Attach selected guardrail"
        }),
        node.attachedGuardrails.length === 0
          ? createElement("p", { className: "text-xs text-text-secondary" }, ["This node has no attached guardrails yet."])
          : node.attachedGuardrails.map((guardrail) => {
              const asset = guardrailAssets.find((entry) => entry.id === guardrail.assetId);
              return createElement("div", {
                key: guardrail.assetId,
                className: "flex items-center justify-between gap-3 rounded-md border border-border-dark px-3 py-2"
              }, [
                createElement("div", { className: "min-w-0" }, [
                  createElement("p", { className: "truncate text-sm font-medium text-white" }, [asset?.name ?? guardrail.assetId]),
                  createElement("p", { className: "text-xs text-text-secondary" }, [asset?.guardrail?.severity ?? "Guardrail"])
                ]),
                createElement("div", { className: "flex items-center gap-2" }, [
                  createElement(Button, {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => {
                      this.setState({ selection: { type: "asset", id: guardrail.assetId }, compactView: CompactView.Inspector });
                    },
                    children: "Edit",
                    dataset: {
                      testid: `${WorkflowScreenSelector.GuardrailAttachmentEditPrefix}${guardrail.assetId}`
                    }
                  }),
                  createElement(Button, {
                    variant: "ghost",
                    size: "sm",
                    onClick: () => {
                      if (!this.state.draftWorkflow) {
                        return;
                      }
                      const nextWorkflow = detachGuardrailFromNode(this.state.draftWorkflow, node.id, guardrail.assetId);
                      this.updateDraftWorkflow(nextWorkflow);
                    },
                    children: "Detach"
                  })
                ])
              ]);
            })
      ])
    ]);
  }

  private renderInspectorField(
    label: string,
    value: string,
    onChange: (value: string) => void,
    testId?: string
  ): HTMLElement {
    const commitValue = (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement) {
        onChange(target.value);
      }
    };

    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-sm font-medium text-white" }, [label]),
      createElement("input", {
        type: "text",
        value,
        className: InspectorTextInputClassName,
        ...(testId ? { "data-testid": testId } : {}),
        onBlur: commitValue,
        onChange: commitValue
      })
    ]);
  }

  private renderInspectorTextArea(
    label: string,
    value: string,
    onChange: (value: string) => void,
    testId?: string
  ): HTMLElement {
    const commitValue = (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) {
        onChange(target.value);
      }
    };

    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-sm font-medium text-white" }, [label]),
      createElement("textarea", {
        value,
        className: InspectorTextAreaClassName,
        ...(testId ? { "data-testid": testId } : {}),
        onBlur: commitValue,
        onChange: commitValue
      })
    ]);
  }

  private renderInspectorSelect(
    label: string,
    value: string,
    options: ReadonlyArray<string>,
    onChange: (value: string) => void,
    customLabels?: ReadonlyArray<{ value: string; label: string }>,
    testId?: string
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-sm font-medium text-white" }, [label]),
      createElement("div", { className: "relative" }, [
        createElement("select", {
          className: InspectorSelectClassName,
          value,
          ...(testId ? { "data-testid": testId } : {}),
          onChange: (event: Event) => {
            const target = event.target;
            if (target instanceof HTMLSelectElement) {
              onChange(target.value);
            }
          }
        }, [
          createElement("option", { value: "" }, [options.length === 0 ? "No options available" : "Select"]),
          ...(customLabels
            ? customLabels.map((option) =>
                createElement("option", {
                  key: option.value,
                  value: option.value
                }, [option.label])
              )
            : options.map((option) =>
                createElement("option", {
                  key: option,
                  value: option
                }, [formatSelectOptionLabel(option)])
              ))
        ]),
        createElement("span", {
          className: "material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-text-secondary"
        }, ["expand_more"])
      ])
    ]);
  }

  private renderInlineMetaGrid(items: ReadonlyArray<{ label: string; value: string }>): HTMLElement {
    return createElement("div", { className: "grid grid-cols-2 gap-3" }, [
      items.map((item) => this.renderInlineMetaTile(item.label, item.value))
    ]);
  }

  private renderInlineMetaTile(label: string, value: string): HTMLElement {
    return createElement("div", {
      key: label,
      className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3"
    }, [
      createElement("p", { className: "text-[11px] uppercase tracking-wide text-text-secondary" }, [label]),
      createElement("p", { className: "mt-2 text-sm font-medium text-white break-words" }, [value])
    ]);
  }

  private renderReadOnlyBadgeRow(kind: WorkflowNodeKindValue, inputs: number, outputs: number): HTMLElement {
    return createElement("div", { className: "grid grid-cols-3 gap-3" }, [
      createElement(StatusBadge, { status: "info" }, [readNodeKindLabel(kind)]),
      createElement(StatusBadge, { status: "warning" }, [`${inputs} input${inputs === 1 ? "" : "s"}`]),
      createElement(StatusBadge, { status: "success" }, [`${outputs} output${outputs === 1 ? "" : "s"}`])
    ]);
  }

  private renderEmptyInspector(): HTMLElement {
    return createElement("div", {
      className: "flex h-full items-center justify-center",
      "data-testid": WorkflowScreenSelector.InspectorEmpty
    }, [
      createElement(EmptyStatePanel, {
        icon: "tune",
        title: "Select something to edit",
        description: "Choose a workflow, node or reusable asset. The inspector stays intentionally empty until there is a concrete target to edit."
      })
    ]);
  }

  private shouldShowSidebar(): boolean {
    return !this.state.isCompactViewport || this.state.compactView === CompactView.Sidebar;
  }

  private shouldShowCanvas(): boolean {
    return !this.state.isCompactViewport || this.state.compactView === CompactView.Canvas;
  }

  private shouldShowInspector(): boolean {
    return !this.state.isCompactViewport || this.state.compactView === CompactView.Inspector;
  }

  private async hydrateState(): Promise<void> {
    this.setState({ pendingAction: PendingAction.Load, errorMessage: null, noticeMessage: null });

    try {
      const workspaceState = await this.workspaceStateClient.load();
      const currentProject = workspaceState.projects.find((project) => project.id === workspaceState.activeProjectId) ?? null;
      this.setState({
        workspaceState,
        currentProject,
        pendingAction: null,
        compactView: currentProject ? CompactView.Canvas : CompactView.Sidebar
      });

      if (currentProject) {
        await this.reloadCatalog(currentProject.id, workspaceState);
      }
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not load the workflow editor."),
        noticeMessage: null
      });
    }
  }

  private async reloadCatalog(projectId: string, workspaceState = this.state.workspaceState): Promise<void> {
    const workspaceId = readWorkspaceId(workspaceState, this.state.workflows, this.state.assets);
    const [workflows, assets, assetUsages, executions] = await Promise.all([
      this.workflowClient.listDefinitions({ projectId }),
      this.workflowClient.listAssets({ projectId, workspaceId }),
      this.workflowClient.listAssetUsages({ projectId }),
      this.workflowClient.listExecutions({ projectId })
    ]);
    const currentWorkflowId = this.readCurrentWorkflowRecord()?.id ?? workflows[0]?.id ?? null;
    const currentWorkflow = currentWorkflowId
      ? workflows.find((workflow) => workflow.id === currentWorkflowId) ?? workflows[0] ?? null
      : null;

    this.setState({
      workflows,
      assets,
      assetUsages,
      executions,
      draftWorkflow: currentWorkflow ? stripDefinitionVersionFields(currentWorkflow) : null,
      selection: currentWorkflow
        ? resolveSelectionAfterReload(this.state.selection, currentWorkflow, assets, executions)
        : { type: "workflow", id: null },
      loadingExecutionId: null,
      dirtyWorkflow: false,
      dirtyAssetIds: []
    });
  }

  private async reloadAssetCatalog(projectId: string, workspaceState = this.state.workspaceState): Promise<void> {
    const workspaceId = readWorkspaceId(workspaceState, this.state.workflows, this.state.assets);
    const [assets, assetUsages] = await Promise.all([
      this.workflowClient.listAssets({ projectId, workspaceId }),
      this.workflowClient.listAssetUsages({ projectId })
    ]);

    this.setState({
      assets,
      assetUsages
    });
  }

  private handleSelectWorkflow(workflowId: string): void {
    const workflow = this.state.workflows.find((entry) => entry.id === workflowId) ?? null;
    if (!workflow) {
      return;
    }

    this.setState({
      draftWorkflow: stripDefinitionVersionFields(workflow),
      selection: { type: "workflow", id: workflow.id },
      loadingExecutionId: null,
      dirtyWorkflow: false,
      dirtyAssetIds: [],
      pendingConnection: null,
      guardrailAttachAssetId: null,
      compactView: this.state.isCompactViewport ? CompactView.Canvas : this.state.compactView
    });
  }

  private async handleCreateWorkflow(): Promise<void> {
    if (!this.state.currentProject) {
      return;
    }

    this.setState({ pendingAction: PendingAction.CreateWorkflow, errorMessage: null, noticeMessage: null });

    try {
      const created = await this.workflowClient.upsertDefinition({
        projectId: this.state.currentProject.id,
        definition: createEmptyWorkflowDefinition({
          projectId: this.state.currentProject.id,
          workspaceId: readWorkspaceId(this.state.workspaceState, this.state.workflows, this.state.assets),
          name: `Workflow ${this.state.workflows.length + 1}`
        })
      });
      await this.reloadCatalog(this.state.currentProject.id);
      this.handleSelectWorkflow(created.id);
      this.setState({
        pendingAction: null,
        noticeMessage: "Workflow definition created.",
        errorMessage: null,
        selection: { type: "workflow", id: created.id }
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not create the workflow definition."),
        noticeMessage: null
      });
    }
  }

  private async handleSaveWorkflow(): Promise<void> {
    if (!this.state.currentProject || !this.state.draftWorkflow) {
      return;
    }

    this.setState({ pendingAction: PendingAction.SaveWorkflow, errorMessage: null, noticeMessage: null });

    try {
      const dirtyAssets = this.state.assets.filter((asset) => this.state.dirtyAssetIds.includes(asset.id));
      for (const asset of dirtyAssets) {
        await this.workflowClient.upsertAsset({
          projectId: this.state.currentProject.id,
          asset: stripAssetVersionFields(asset)
        });
      }

      const saved = await this.workflowClient.upsertDefinition({
        projectId: this.state.currentProject.id,
        definition: this.state.draftWorkflow
      });
      await this.reloadCatalog(this.state.currentProject.id);
      this.handleSelectWorkflow(saved.id);
      this.setState({
        pendingAction: null,
        noticeMessage: "Workflow saved to the server workspace.",
        errorMessage: null
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not save the workflow."),
        noticeMessage: null
      });
    }
  }

  private async handleDeleteWorkflow(): Promise<void> {
    const currentWorkflow = this.readCurrentWorkflowRecord();
    if (!this.state.currentProject || !currentWorkflow) {
      return;
    }

    if (typeof window !== "undefined" && !window.confirm(`Delete ${currentWorkflow.name}?`)) {
      return;
    }

    this.setState({ pendingAction: PendingAction.DeleteWorkflow, errorMessage: null, noticeMessage: null });

    try {
      await this.workflowClient.deleteDefinition({
        workflowId: currentWorkflow.id
      });
      await this.reloadCatalog(this.state.currentProject.id);
      this.setState({
        pendingAction: null,
        noticeMessage: "Workflow deleted.",
        errorMessage: null,
        selection: { type: "workflow", id: this.state.workflows[0]?.id ?? null }
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not delete the workflow."),
        noticeMessage: null
      });
    }
  }

  private async handleAddNode(kind: WorkflowNodeKindValue): Promise<void> {
    if (!this.state.draftWorkflow || !this.state.currentProject) {
      return;
    }

    const assetKind = readNodeAssetKind(kind);
    if (assetKind) {
      const asset = await this.createAssetForNode(assetKind, undefined, kind === WorkflowNodeKind.AssetGuardrail);
      if (!asset) {
        return;
      }
      const nextDefinition = addWorkflowNode(this.state.draftWorkflow, kind);
      const nextNode = nextDefinition.nodes[nextDefinition.nodes.length - 1];
      if (!nextNode) {
        return;
      }
      this.updateDraftWorkflow({
        ...nextDefinition,
        nodes: nextDefinition.nodes.map((node) =>
          node.id === nextNode.id
            ? {
                ...node,
                config: {
                  ...node.config,
                  assetId: asset.id
                }
              }
            : node
        )
      }, { type: "node", id: nextNode.id });
      return;
    }

    const nextDefinition = addWorkflowNode(this.state.draftWorkflow, kind);
    const nextNode = nextDefinition.nodes[nextDefinition.nodes.length - 1];
    this.updateDraftWorkflow(nextDefinition, nextNode ? { type: "node", id: nextNode.id } : undefined);
  }

  private async handleCreateAsset(
    kind: WorkflowAssetKindValue,
    focusNodeId?: string,
    attachToNode = false
  ): Promise<void> {
    if (!this.state.currentProject) {
      return;
    }

    await this.createAssetForNode(kind, focusNodeId, attachToNode);
  }

  private async createAssetForNode(
    kind: WorkflowAssetKindValue,
    focusNodeId?: string,
    attachToNode = false
  ): Promise<WorkflowAssetRecord | null> {
    if (!this.state.currentProject) {
      return null;
    }

    this.setState({ pendingAction: PendingAction.CreateAsset, errorMessage: null, noticeMessage: null });

    try {
      const asset = await this.workflowClient.upsertAsset({
        projectId: this.state.currentProject.id,
        asset: createWorkflowAssetDraft({
          kind,
          projectId: this.state.currentProject.id,
          workspaceId: readWorkspaceId(this.state.workspaceState, this.state.workflows, this.state.assets)
        })
      });
      await this.reloadAssetCatalog(this.state.currentProject.id);
      const nextDraftWorkflow = attachToNode && focusNodeId && this.state.draftWorkflow
        ? attachGuardrailToNode(this.state.draftWorkflow, focusNodeId, asset.id)
        : this.state.draftWorkflow;
      const nextSelection: WorkflowSelection = attachToNode && focusNodeId
        ? { type: "node", id: focusNodeId }
        : { type: "asset", id: asset.id };
      this.setState({
        pendingAction: null,
        noticeMessage: `${readAssetKindLabel(kind)} asset created.`,
        errorMessage: null,
        selection: nextSelection,
        guardrailAttachAssetId: kind === WorkflowAssetKind.Guardrail ? asset.id : this.state.guardrailAttachAssetId,
        ...(nextDraftWorkflow
          ? {
              draftWorkflow: nextDraftWorkflow,
              dirtyWorkflow: attachToNode ? true : this.state.dirtyWorkflow
            }
          : {})
      });
      return asset;
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: readErrorMessage(error, "Could not create the reusable asset."),
        noticeMessage: null
      });
      return null;
    }
  }

  private async handleSelectExecution(executionId: string): Promise<void> {
    const execution = this.state.executions.find((entry) => entry.id === executionId);
    if (!execution) {
      return;
    }

    this.setState({
      selection: { type: "execution", id: executionId },
      loadingExecutionId: executionId,
      errorMessage: null,
      noticeMessage: null,
      compactView: this.state.isCompactViewport ? CompactView.Inspector : this.state.compactView
    });

    try {
      const hydratedExecution = await this.workflowClient.getExecution({ executionId });
      this.setState({
        executions: this.state.executions.map((entry) => entry.id === executionId ? hydratedExecution : entry),
        loadingExecutionId: null,
        selection: { type: "execution", id: executionId }
      });
    } catch (error) {
      this.setState({
        loadingExecutionId: null,
        errorMessage: readErrorMessage(error, "Could not load the selected execution."),
        noticeMessage: null
      });
    }
  }

  private async handleDeleteExecution(executionId: string): Promise<void> {
    if (!this.state.currentProject) {
      return;
    }

    this.setState({ pendingAction: PendingAction.DeleteExecution, errorMessage: null, noticeMessage: null });

    try {
      await this.workflowClient.deleteExecution({ executionId });
      await this.reloadCatalog(this.state.currentProject.id);
      this.setState({
        pendingAction: null,
        loadingExecutionId: this.state.loadingExecutionId === executionId ? null : this.state.loadingExecutionId,
        noticeMessage: "Execution deleted.",
        errorMessage: null
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        loadingExecutionId: this.state.loadingExecutionId === executionId ? null : this.state.loadingExecutionId,
        errorMessage: readErrorMessage(error, "Could not delete the execution record."),
        noticeMessage: null
      });
    }
  }

  private handleNodePointerDown(event: PointerEvent, nodeId: string): void {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (event.target.closest("button") && !event.target.closest("[data-drag-handle]")) {
      return;
    }

    const node = this.state.draftWorkflow?.nodes.find((entry) => entry.id === nodeId);
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
      x: (event.clientX - surfaceRect.left - viewport.x) / viewport.zoom - node.position.x,
      y: (event.clientY - surfaceRect.top - viewport.y) / viewport.zoom - node.position.y
    };
    this.setState({ selection: { type: "node", id: nodeId }, compactView: this.state.isCompactViewport ? CompactView.Inspector : this.state.compactView });
  }

  private handleCanvasPointerDown(event: PointerEvent): void {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (this.connectionDragging || event.target.closest("[data-port-handle]")) {
      return;
    }

    if (event.target.closest("[data-node-id]")) {
      return;
    }

    const viewport = this.state.draftWorkflow?.viewport;
    if (!viewport) {
      return;
    }

    this.panning = true;
    this.panOrigin = {
      x: event.clientX,
      y: event.clientY
    };
    this.panViewportOrigin = { ...viewport };
    this.setState({
      selection: { type: "workflow", id: this.readCurrentWorkflowRecord()?.id ?? null },
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null
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
      connectionPreviewPoint: previewPoint
    });
  }

  private handleCanvasMouseMove(event: MouseEvent): void {
    if (this.state.hoveredEdgeId === null || this.connectionDragging || this.state.pendingConnection) {
      return;
    }

    const target = event.target instanceof HTMLElement || event.target instanceof SVGElement
      ? event.target
      : null;
    const isStillOnEdgeControl = target?.closest("[data-testid^='workflows-edge-hit-'], [data-testid^='workflows-edge-delete-']") !== null;
    if (isStillOnEdgeControl) {
      return;
    }

    this.setState({ hoveredEdgeId: null });
  }

  private handlePortPointerDown(
    event: MouseEvent,
    nodeId: string,
    portId: string,
    side: PortSide
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
        connectionPreviewPoint: previewPoint
      });
    }
  }

  private handlePortPointerUp(
    event: MouseEvent,
    nodeId: string,
    portId: string,
    side: PortSide
  ): void {
    if (side !== "input" || !this.connectionDragging || this.state.pendingConnection === null) {
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

    const hoveredTarget = this.readInputDropTargetAtClientPoint(event.clientX, event.clientY);
    if (!hoveredTarget) {
      if (this.state.hoveredPort !== null) {
        this.setState({
          hoveredPort: null
        });
      }
      return;
    }

    const nextHoveredPort: HoveredPort = {
      ...hoveredTarget,
      side: "input"
    };
    const point = this.state.draftWorkflow
      ? readHoveredInputAnchorPoint(this.state.draftWorkflow.nodes, nextHoveredPort)
      : null;
    this.setState({
      hoveredPort: nextHoveredPort,
      ...(point ? { connectionPreviewPoint: point } : {})
    });
  }

  private handleNodeConnectionMouseUp(event: MouseEvent): void {
    if (!this.connectionDragging || this.state.pendingConnection === null) {
      return;
    }

    const hoveredTarget = this.readInputDropTargetAtClientPoint(event.clientX, event.clientY);
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
    side: PortSide
  ): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    const nextHoveredPort: HoveredPort = {
      nodeId,
      portId,
      side
    };

    const nextState: Partial<WorkflowsScreenState> = {
      hoveredPort: nextHoveredPort
    };

    if (this.state.pendingConnection && side === "input") {
      const point = readHoveredInputAnchorPoint(this.state.draftWorkflow.nodes, nextHoveredPort);
      if (point) {
        nextState.connectionPreviewPoint = point;
      }
    }

    this.setState(nextState);
  }

  private handlePortHoverEnd(
    nodeId: string,
    portId: string,
    side: PortSide
  ): void {
    const hoveredPort = this.state.hoveredPort;
    if (!hoveredPort) {
      return;
    }

    if (hoveredPort.nodeId !== nodeId || hoveredPort.portId !== portId || hoveredPort.side !== side) {
      return;
    }

    this.setState({
      hoveredPort: null
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
      targetPortId: portId
    });
    this.updateDraftWorkflow(nextDefinition, { type: "node", id: nodeId });
    this.setState({
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null,
      noticeMessage: "Connection added.",
      errorMessage: null
    });
  }

  private startConnectionMode(nodeId: string, portId: string): void {
    this.setState({
      pendingConnection: {
        nodeId,
        portId
      },
      selection: { type: "node", id: nodeId },
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: this.readPortPreviewOrigin(nodeId, portId)
    });
  }

  private handleRemoveEdge(event: Event, edgeId: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.state.draftWorkflow) {
      return;
    }

    this.updateDraftWorkflow(removeWorkflowEdge(this.state.draftWorkflow, edgeId));
    this.setState({
      hoveredEdgeId: null,
      noticeMessage: "Connection removed.",
      errorMessage: null
    });
  }

  private handleAddMappingEntry(edge: WorkflowDefinitionUpsertInput["edges"][number]): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    const mappingEntry: EdgeMappingEntryRecord = {
      targetPath: this.state.mappingTargetPath.trim(),
      source: {
        kind: "node_output",
        nodeId: edge.sourceNodeId,
        path: this.state.mappingSourcePath.trim()
      }
    };
    const nextWorkflow = addWorkflowEdgeMappingEntry(this.state.draftWorkflow, edge.id, mappingEntry);
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

    const validation = nextGuardrail.validations[nextGuardrail.validations.length - 1];
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
                message: this.state.guardrailValidationMessage.trim()
              }
            : entry
        )
      }
    });
  }

  private handleRemoveGuardrailValidation(assetId: string, validationId: string): void {
    this.patchGuardrailAsset(assetId, (guardrail) => ({
      ...guardrail,
      validations: guardrail.validations.filter((validation) => validation.id !== validationId)
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
    if (!selectedNode || !this.state.draftWorkflow) {
      return;
    }

    const nextDefinition = removeWorkflowNode(this.state.draftWorkflow, selectedNode.id);
    this.updateDraftWorkflow(nextDefinition, { type: "workflow", id: this.readCurrentWorkflowRecord()?.id ?? null });
  }

  private handleZoom(delta: number): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    this.updateDraftWorkflow(setWorkflowViewport(this.state.draftWorkflow, {
      ...this.state.draftWorkflow.viewport,
      zoom: this.state.draftWorkflow.viewport.zoom + delta
    }));
  }

  private handleResetViewport(): void {
    if (!this.state.draftWorkflow) {
      return;
    }

    this.updateDraftWorkflow(setWorkflowViewport(this.state.draftWorkflow, {
      x: 96,
      y: 96,
      zoom: 1
    }));
  }

  private updateDraftWorkflow(nextDefinition: WorkflowDefinitionUpsertInput, nextSelection?: WorkflowSelection): void {
    this.setState({
      draftWorkflow: nextDefinition,
      selection: nextSelection ?? this.state.selection,
      dirtyWorkflow: true
    });
  }

  private patchDraftWorkflow(
    update: (workflow: WorkflowDefinitionUpsertInput) => WorkflowDefinitionUpsertInput,
    nextSelection?: WorkflowSelection
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

    this.updateDraftWorkflow({
      ...this.state.draftWorkflow,
      nodes: this.state.draftWorkflow.nodes.map((entry) =>
        entry.id === node.id ? node : entry
      )
    }, { type: "node", id: node.id });
  }

  private patchNode(
    nodeId: string,
    update: (node: WorkflowNodeRecord) => WorkflowNodeRecord
  ): void {
    const current = this.state.draftWorkflow?.nodes.find((node) => node.id === nodeId);
    if (!current) {
      return;
    }

    this.updateSelectedNode(update(current));
  }

  private updateNodeProvider(
    nodeId: string,
    providerPatch: Partial<WorkflowProviderSelectionRecord>
  ): void {
    this.patchNode(nodeId, (node) => ({
      ...node,
      config: {
        ...node.config,
        provider: {
          ...(node.config.provider ?? createFallbackProviderSelection()),
          ...providerPatch
        }
      }
    }));
  }

  private updateAssetDraft(assetId: string, nextAsset: WorkflowAssetRecord): void {
    this.setState({
      assets: this.state.assets.map((asset) => asset.id === assetId ? nextAsset : asset),
      dirtyAssetIds: this.state.dirtyAssetIds.includes(assetId)
        ? this.state.dirtyAssetIds
        : [...this.state.dirtyAssetIds, assetId],
      selection: { type: "asset", id: assetId }
    });
  }

  private patchAsset(
    assetId: string,
    update: (asset: WorkflowAssetRecord) => WorkflowAssetRecord
  ): void {
    const current = this.state.assets.find((asset) => asset.id === assetId);
    if (!current) {
      return;
    }

    this.updateAssetDraft(assetId, update(current));
  }

  private patchGuardrailAsset(
    assetId: string,
    update: (guardrail: NonNullable<WorkflowAssetRecord["guardrail"]>) => NonNullable<WorkflowAssetRecord["guardrail"]>
  ): void {
    this.patchAsset(assetId, (asset) => {
      const nextAsset = updateWorkflowAssetGuardrail(asset, update);
      if (!nextAsset.guardrail) {
        return asset;
      }

      return {
        ...asset,
        guardrail: nextAsset.guardrail
      };
    });
  }

  private readCurrentWorkflowRecord(): WorkflowDefinitionRecord | null {
    const draftId = this.state.draftWorkflow?.id;
    if (!draftId) {
      return this.state.workflows[0] ?? null;
    }

    return this.state.workflows.find((workflow) => workflow.id === draftId) ?? null;
  }

  private readSelectedNode(): WorkflowNodeRecord | null {
    if (this.state.selection.type !== "node" || !this.state.draftWorkflow) {
      return null;
    }

    return this.state.draftWorkflow.nodes.find((node) => node.id === this.state.selection.id) ?? null;
  }

  private readSelectedAsset(): WorkflowAssetRecord | null {
    if (this.state.selection.type !== "asset") {
      return null;
    }

    return this.state.assets.find((asset) => asset.id === this.state.selection.id) ?? null;
  }

  private readSelectedExecution(): WorkflowExecutionRecord | null {
    if (this.state.selection.type !== "execution") {
      return null;
    }

    return this.state.executions.find((execution) => execution.id === this.state.selection.id) ?? null;
  }

  private readProviderProfileOptions(currentProviderId: string): ReadonlyArray<{ value: string; label: string }> {
    const profiles = this.state.workspaceState?.settings.providerProfiles ?? [];
    const profileOptions = profiles.map((profile) => ({
      value: profile.id,
      label: formatProviderProfileLabel(profile)
    }));
    const fallbackExists = profileOptions.some((option) => option.value === currentProviderId);

    if (currentProviderId.trim().length === 0 || fallbackExists) {
      return profileOptions.length > 0
        ? profileOptions
        : [{ value: ProviderFallbackId, label: "Codex CLI" }];
    }

    return [
      ...profileOptions,
      { value: currentProviderId, label: currentProviderId === ProviderFallbackId ? "Codex CLI" : currentProviderId }
    ];
  }

  private readInspectorTitle(): string {
    if (this.state.selection.type === "node") {
      return this.readSelectedNode()?.label ?? "Selected node";
    }

    if (this.state.selection.type === "asset") {
      return this.readSelectedAsset()?.name ?? "Reusable asset";
    }

    if (this.state.selection.type === "execution") {
      const execution = this.readSelectedExecution();
      return execution ? readExecutionLabel(execution) : this.state.selection.id.slice(0, 8);
    }

    return this.state.draftWorkflow?.name ?? "Workflow";
  }

  private readInspectorSubtitle(): string {
    if (this.state.selection.type === "node") {
      const node = this.readSelectedNode();
      return node ? readNodeKindLabel(node.kind) : "No node selected";
    }

    if (this.state.selection.type === "asset") {
      const asset = this.readSelectedAsset();
      return asset ? `${readAssetKindLabel(asset.kind)} · ${readAssetScopeLabel(asset.scope)}` : "No asset selected";
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
    const element = this.element?.querySelector(`[data-testid="${WorkflowScreenSelector.CanvasViewport}"]`);
    return element instanceof HTMLElement ? element.getBoundingClientRect() : null;
  }

  private readCanvasPoint(clientX: number, clientY: number): ConnectionPreviewPoint | null {
    const viewport = this.state.draftWorkflow?.viewport;
    const surfaceRect = this.readCanvasSurfaceRect();
    if (!viewport || !surfaceRect) {
      return null;
    }

    return {
      x: Number((((clientX - surfaceRect.left) - viewport.x) / viewport.zoom).toFixed(2)),
      y: Number((((clientY - surfaceRect.top) - viewport.y) / viewport.zoom).toFixed(2))
    };
  }

  private readPortPreviewOrigin(nodeId: string, portId: string): ConnectionPreviewPoint | null {
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

    return readPortAnchorPoint(node, "output", portIndex, node.outputPorts.length);
  }

  private readPortHandleAtClientPoint(clientX: number, clientY: number): HoveredPort | null {
    if (typeof document === "undefined") {
      return null;
    }

    const element = document.elementFromPoint(clientX, clientY);
    const portHandle = element instanceof HTMLElement
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
      side: portSide
    };
  }

  private readInputDropTargetAtClientPoint(clientX: number, clientY: number): NodeDropTarget | null {
    const geometricPort = this.readInputPortDropTargetByGeometry(clientX, clientY);
    if (geometricPort) {
      return geometricPort;
    }

    const explicitPort = this.readPortHandleAtClientPoint(clientX, clientY);
    if (explicitPort?.side === "input") {
      return {
        nodeId: explicitPort.nodeId,
        portId: explicitPort.portId
      };
    }

    const workflow = this.state.draftWorkflow;
    if (!workflow || typeof document === "undefined") {
      return null;
    }

    const element = document.elementFromPoint(clientX, clientY);
    const nodeElement = element instanceof HTMLElement
      ? element.closest("[data-node-id]")
      : null;
    if (!(nodeElement instanceof HTMLElement)) {
      return null;
    }

    const nodeId = nodeElement.dataset["nodeId"];
    if (!nodeId) {
      return null;
    }

    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    if (!node || node.inputPorts.length === 0) {
      return null;
    }

    const nodeRect = nodeElement.getBoundingClientRect();
    const inputSnapWidth = Math.max(72, Math.min(124, nodeRect.width * 0.34));
    const horizontalPadding = 20;
    if (clientX > nodeRect.left + inputSnapWidth || clientX < nodeRect.left - horizontalPadding) {
      return null;
    }

    const relativeY = clientY - nodeRect.top;
    const nearestPort = node.inputPorts.reduce<{
      portId: string;
      distance: number;
    } | null>((closest, port, index) => {
      const portY = readPortOffset(index, node.inputPorts.length) + 10;
      const distance = Math.abs(relativeY - portY);
      if (!closest || distance < closest.distance) {
        return {
          portId: port.id,
          distance
        };
      }

      return closest;
    }, null);

    if (!nearestPort) {
      return null;
    }

    return {
      nodeId,
      portId: nearestPort.portId
    };
  }

  private readInputPortDropTargetByGeometry(clientX: number, clientY: number): NodeDropTarget | null {
    if (typeof document === "undefined") {
      return null;
    }

    const inputHandles = Array.from(document.querySelectorAll("[data-port-handle='true'][data-port-side='input']"));
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
      const insideX = clientX >= rect.left - hitPaddingX && clientX <= rect.right + hitPaddingX;
      const insideY = clientY >= rect.top - hitPaddingY && clientY <= rect.bottom + hitPaddingY;
      if (!insideX || !insideY) {
        return currentClosest;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(clientX - centerX) + Math.abs(clientY - centerY);
      if (!currentClosest || distance < currentClosest.distance) {
        return {
          nodeId,
          portId,
          distance
        };
      }

      return currentClosest;
    }, null);

    return closest
      ? {
          nodeId: closest.nodeId,
          portId: closest.portId
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
      compactView: isCompactViewport ? CompactView.Canvas : this.state.compactView
    });
  };

  private readonly handleGlobalPointerMove = (event: MouseEvent): void => {
    if (this.draggingNodeId && this.dragPointerOffset && this.state.draftWorkflow) {
      const surfaceRect = this.readCanvasSurfaceRect();
      if (!surfaceRect) {
        return;
      }
      const viewport = this.state.draftWorkflow.viewport;
      const nextPosition = {
        x: (event.clientX - surfaceRect.left - viewport.x) / viewport.zoom - this.dragPointerOffset.x,
        y: (event.clientY - surfaceRect.top - viewport.y) / viewport.zoom - this.dragPointerOffset.y
      };
      this.updateDraftWorkflow(moveWorkflowNode(this.state.draftWorkflow, this.draggingNodeId, nextPosition), { type: "node", id: this.draggingNodeId });
      return;
    }

    if (this.connectionDragging && this.state.pendingConnection) {
      const previewPoint = this.readCanvasPoint(event.clientX, event.clientY);
      const hoveredTarget = this.readInputDropTargetAtClientPoint(event.clientX, event.clientY);
      const hoveredPort = hoveredTarget
        ? {
            ...hoveredTarget,
            side: "input" as const
          }
        : null;
      if (previewPoint) {
        this.setState({
          connectionPreviewPoint: previewPoint,
          hoveredPort
        });
      }
      return;
    }

    if (this.panning && this.panOrigin && this.panViewportOrigin && this.state.draftWorkflow) {
      const nextViewport = setWorkflowViewport(this.state.draftWorkflow, {
        x: this.panViewportOrigin.x + (event.clientX - this.panOrigin.x),
        y: this.panViewportOrigin.y + (event.clientY - this.panOrigin.y),
        zoom: this.panViewportOrigin.zoom
      });
      this.updateDraftWorkflow(nextViewport);
    }
  };

  private readonly handleGlobalPointerUp = (event: MouseEvent): void => {
    if (this.connectionDragging) {
      const hoveredTarget = this.readInputDropTargetAtClientPoint(event.clientX, event.clientY);
      const hoveredPort = hoveredTarget
        ? {
            ...hoveredTarget,
            side: "input" as const
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
          connectionPreviewPoint: null
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
    if (event.key !== "Escape" || this.state.pendingConnection === null) {
      return;
    }

    this.setState({
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null,
      noticeMessage: "Connection mode cancelled.",
      errorMessage: null
    });
  };
}

const groupAssetsByKind = (
  assets: ReadonlyArray<WorkflowAssetRecord>
): ReadonlyArray<{
  kind: WorkflowAssetKindValue;
  assets: ReadonlyArray<WorkflowAssetRecord>;
}> => [
  WorkflowAssetKind.Prompt,
  WorkflowAssetKind.Instruction,
  WorkflowAssetKind.Guardrail
].map((kind) => ({
  kind,
  assets: assets.filter((asset) => asset.kind === kind)
}));

const readUsageCount = (
  assetId: string,
  usages: ReadonlyArray<WorkflowAssetUsageRecord>
): number => usages.filter((usage) => usage.assetId === assetId).length;

const readNodeSecondaryText = (node: WorkflowNodeRecord): string => {
  if (node.kind === WorkflowNodeKind.AiAgent) {
    return node.config.role ?? "planner";
  }

  if (node.kind === WorkflowNodeKind.AiProviderRun) {
    return node.config.provider?.providerId ?? "provider";
  }

  if (node.kind === WorkflowNodeKind.HumanReview) {
    return node.config.reviewPolicy?.requireHumanDecision ? "manual decision required" : "manual review";
  }

  return readNodeKindLabel(node.kind);
};

const readNodePaletteDescription = (kind: WorkflowNodeKindValue): string => {
  if (kind === WorkflowNodeKind.TriggerManual) {
    return "Single manual entrypoint for the MVP runtime.";
  }

  if (kind === WorkflowNodeKind.AssetPrompt || kind === WorkflowNodeKind.AssetInstruction) {
    return "Server-backed reusable asset node.";
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return "Reusable guardrail pack with severity semantics.";
  }

  if (kind === WorkflowNodeKind.AiAgent || kind === WorkflowNodeKind.AiProviderRun) {
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

const readPortOffset = (index: number, total: number): number => {
  const safeTotal = Math.max(total, 1);
  const spacing = 44;
  const start = 60;
  return start + Math.max(0, Math.floor((3 - safeTotal) * 10)) + index * spacing;
};

const readPortAnchorPoint = (
  node: WorkflowNodeRecord,
  side: PortSide,
  index: number,
  total: number
): ConnectionPreviewPoint => ({
  x: side === "output" ? node.position.x + node.width + 4 : node.position.x - 4,
  y: node.position.y + readPortOffset(index, total) + 10
});

const readHoveredInputAnchorPoint = (
  nodes: ReadonlyArray<WorkflowNodeRecord>,
  hoveredPort: HoveredPort
): ConnectionPreviewPoint | null => {
  const node = nodes.find((entry) => entry.id === hoveredPort.nodeId);
  if (!node || hoveredPort.side !== "input") {
    return null;
  }

  const index = node.inputPorts.findIndex((port) => port.id === hoveredPort.portId);
  if (index < 0) {
    return null;
  }

  return readPortAnchorPoint(node, "input", index, node.inputPorts.length);
};

const readEdgeCurvePath = (
  source: ConnectionPreviewPoint,
  target: ConnectionPreviewPoint
): string => {
  const delta = Math.max(96, Math.abs(target.x - source.x) / 2);
  return `M ${source.x} ${source.y} C ${source.x + delta} ${source.y}, ${target.x - delta} ${target.y}, ${target.x} ${target.y}`;
};

const readEdgeActionPoint = (
  source: ConnectionPreviewPoint,
  target: ConnectionPreviewPoint,
  nodes: ReadonlyArray<WorkflowNodeRecord>
): ConnectionPreviewPoint => {
  const midpoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2 - EdgeDeleteOffset / 2
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
    { x: target.x - EdgeDeleteWideOffset, y: target.y + EdgeDeleteWideOffset }
  ];
  const preferred = candidates.find((candidate) => !edgeDeletePointOverlapsNode(candidate, nodes)) ?? midpoint;

  return {
    x: Number(preferred.x.toFixed(2)),
    y: Number(preferred.y.toFixed(2))
  };
};

const edgeDeletePointOverlapsNode = (
  point: ConnectionPreviewPoint,
  nodes: ReadonlyArray<WorkflowNodeRecord>
): boolean => nodes.some((node) => {
  const halfButton = EdgeDeleteButtonSize / 2;
  const left = node.position.x - EdgeDeleteNodeAvoidancePadding - halfButton;
  const right = node.position.x + node.width + EdgeDeleteNodeAvoidancePadding + halfButton;
  const top = node.position.y - EdgeDeleteNodeAvoidancePadding - halfButton;
  const bottom = node.position.y + WorkflowNodeApproximateHeight + EdgeDeleteNodeAvoidancePadding + halfButton;
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
});

const hoveredPortUsesActiveArrow = (hoveredPort: HoveredPort | null): boolean =>
  hoveredPort?.side === "input";

const readCanvasBackgroundStyle = (viewport: WorkflowViewportRecord): string => {
  const gridSize = Math.max(14, Math.round(24 * viewport.zoom));
  const offsetX = Math.round(viewport.x % gridSize);
  const offsetY = Math.round(viewport.y % gridSize);
  return `background-color:#11161d;background-image:radial-gradient(circle, rgba(120,132,145,0.22) 1px, transparent 1px);background-size:${gridSize}px ${gridSize}px;background-position:${offsetX}px ${offsetY}px;`;
};

const readWorkspaceId = (
  workspaceState: WorkspaceStateSnapshot | null,
  workflows: ReadonlyArray<WorkflowDefinitionRecord>,
  assets: ReadonlyArray<WorkflowAssetRecord>
): string => workflows[0]?.workspaceId ?? assets[0]?.workspaceId ?? workspaceState?.activeProjectId ?? readDefaultWorkflowWorkspaceId();

const resolveSelectionAfterReload = (
  selection: WorkflowSelection,
  workflow: WorkflowDefinitionRecord,
  assets: ReadonlyArray<WorkflowAssetRecord>,
  executions: ReadonlyArray<WorkflowExecutionRecord>
): WorkflowSelection => {
  if (selection.type === "node" && workflow.nodes.some((node) => node.id === selection.id)) {
    return selection;
  }

  if (selection.type === "asset" && assets.some((asset) => asset.id === selection.id)) {
    return selection;
  }

  if (selection.type === "execution" && executions.some((execution) => execution.id === selection.id && execution.workflowId === workflow.id)) {
    return selection;
  }

  return {
    type: "workflow",
    id: workflow.id
  };
};

const createFallbackProviderSelection = (): WorkflowProviderSelectionRecord => ({
  providerId: ProviderFallbackId,
  modelId: "",
  reasoningLevel: WorkflowReasoningLevel.Medium,
  temperature: 0.2,
  verbosity: WorkflowVerbosity.Medium,
  testStatus: "unknown"
});

const stripAssetVersionFields = (
  asset: WorkflowAssetRecord
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
  ...(asset.outputContract ? { outputContract: asset.outputContract } : {}),
  ...(asset.guardrail ? { guardrail: asset.guardrail } : {}),
  ...(asset.archivedAt ? { archivedAt: asset.archivedAt } : {})
});

const stripOptionalProjectId = (
  asset: WorkflowAssetRecord
): Omit<WorkflowAssetRecord, "projectId"> | WorkflowAssetRecord => {
  if (asset.projectId) {
    return asset;
  }

  const { projectId: _projectId, ...rest } = asset;
  return rest;
};

const readWorkflowAssetScope = (value: string): WorkflowAssetScopeValue =>
  value === WorkflowAssetScope.Workspace ? WorkflowAssetScope.Workspace : WorkflowAssetScope.Project;

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

const readWorkflowGuardrailSeverity = (value: string): WorkflowGuardrailSeverity =>
  value === WorkflowGuardrailSeverity.Warn
    ? WorkflowGuardrailSeverity.Warn
    : value === WorkflowGuardrailSeverity.Success
      ? WorkflowGuardrailSeverity.Success
      : WorkflowGuardrailSeverity.Error;

const readWorkflowGuardrailOperator = (value: string): WorkflowGuardrailOperator =>
  value === WorkflowGuardrailOperator.Any ? WorkflowGuardrailOperator.Any : WorkflowGuardrailOperator.All;

const readJsonSchemaTypes = (): ReadonlyArray<JsonSchemaNodeRecord["type"]> => [
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object"
];

const readJsonSchemaType = (value: string): JsonSchemaNodeRecord["type"] => {
  if (value === "number" || value === "integer" || value === "boolean" || value === "array" || value === "object") {
    return value;
  }

  return "string";
};

const readJsonSchemaFormats = (): ReadonlyArray<string> => [
  "",
  "email",
  "url",
  "uuid",
  "nif"
];

const readJsonSchemaFormat = (
  value: string
): JsonSchemaNodeRecord["format"] | undefined => {
  if (value === "email" || value === "url" || value === "uuid" || value === "nif") {
    return value;
  }

  return undefined;
};

const readGuardrailValidationKinds = (): ReadonlyArray<GuardrailValidationKindValue> => [
  "field_exists",
  "field_equals",
  "contains",
  "not_contains",
  "regex",
  "json_schema",
  "number_gte",
  "number_lte"
];

const readGuardrailValidationKind = (value: string): GuardrailValidationKindValue => {
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

const readGuardrailValidationTargets = (): ReadonlyArray<GuardrailValidationTargetValue> => [
  "input",
  "output",
  "context",
  "metadata"
];

const readGuardrailValidationTarget = (value: string): GuardrailValidationTargetValue => {
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
  const model = profile.modelId.trim().length > 0 ? ` · ${profile.modelId}` : "";
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
  required: boolean
): JsonSchemaNodeRecord => updateJsonSchemaNode(schema, parentPath, (node) => {
  if (node.type !== "object") {
    return node;
  }

  return {
    ...node,
    required: required
      ? [...new Set([...(node.required ?? []), propertyName])]
      : (node.required ?? []).filter((entry) => entry !== propertyName)
  };
});

const preserveSchemaPresentation = (
  previous: JsonSchemaNodeRecord,
  next: JsonSchemaNodeRecord
): JsonSchemaNodeRecord => ({
  ...next,
  ...(previous.title ? { title: previous.title } : {}),
  ...(previous.description ? { description: previous.description } : {})
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
  }
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
    maxItems
  } = patch;

  return {
    ...rest,
    ...(!("format" in patch) ? (_previousFormat !== undefined ? { format: _previousFormat } : {}) : format !== undefined ? { format } : {}),
    ...(minLength !== undefined ? { minLength } : {}),
    ...(!("minLength" in patch) && _previousMinLength !== undefined ? { minLength: _previousMinLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(!("maxLength" in patch) && _previousMaxLength !== undefined ? { maxLength: _previousMaxLength } : {}),
    ...(pattern !== undefined ? { pattern } : {}),
    ...(!("pattern" in patch) && _previousPattern !== undefined ? { pattern: _previousPattern } : {}),
    ...(minimum !== undefined ? { minimum } : {}),
    ...(!("minimum" in patch) && _previousMinimum !== undefined ? { minimum: _previousMinimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(!("maximum" in patch) && _previousMaximum !== undefined ? { maximum: _previousMaximum } : {}),
    ...(minItems !== undefined ? { minItems } : {}),
    ...(!("minItems" in patch) && _previousMinItems !== undefined ? { minItems: _previousMinItems } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
    ...(!("maxItems" in patch) && _previousMaxItems !== undefined ? { maxItems: _previousMaxItems } : {})
  };
};

const readNextContractPropertyName = (
  schema: JsonSchemaNodeRecord
): string => {
  const existingNames = new Set(Object.keys(schema.properties ?? {}));
  let index = existingNames.has("field") ? 2 : 1;
  let candidate = "field";

  while (existingNames.has(candidate)) {
    candidate = `field${index.toString()}`;
    index += 1;
  }

  return candidate;
};

const readOptionalNumber = (
  value: string
): number | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toContractPathToken = (
  path: ReadonlyArray<string>
): string =>
  path.length === 0
    ? "root"
    : path
      .map((segment) => segment === JsonSchemaItemsSegment ? "items" : segment)
      .join("__")
      .replace(/[^a-zA-Z0-9_-]+/gu, "-");

const readIsCompactViewport = (): boolean =>
  typeof window !== "undefined" && window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH;

const readErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
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

const readExecutionLabel = (execution: Pick<WorkflowExecutionRecord, "id">): string =>
  execution.id.length > 8 ? execution.id.slice(0, 8) : execution.id;

const readExecutionBadgeStatus = (
  status: WorkflowExecutionRecord["status"] | WorkflowNodeExecutionRecord["status"]
): "info" | "success" | "warning" | "running" | "failed" => {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "awaiting_review") {
    return "warning";
  }

  if (status === "running") {
    return "running";
  }

  return "info";
};

const readAlertBadgeStatus = (
  level: WorkflowAlertRecord["level"]
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

const readNodeRunProviderLabel = (nodeRun: WorkflowExecutionRecord["nodeRuns"][number]): string => {
  if (nodeRun.providerId && nodeRun.modelId) {
    return `${nodeRun.providerId} · ${nodeRun.modelId}`;
  }

  if (nodeRun.providerId) {
    return nodeRun.providerId;
  }

  return "No provider data";
};

const toSlugValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
