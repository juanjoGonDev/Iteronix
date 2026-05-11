import { Button } from "../components/Button.js";
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
import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowNodeKind,
  WorkflowNodeRole,
  WorkflowReasoningLevel,
  WorkflowRecordStatus,
  WorkflowVerbosity,
  addWorkflowNode,
  attachGuardrailToNode,
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
  createWorkflowAssetDraft,
  detachGuardrailFromNode,
  moveWorkflowNode,
  readAssetKindLabel,
  readAssetScopeLabel,
  readDefaultWorkflowWorkspaceId,
  readNodeAccentClassName,
  readNodeAssetKind,
  readNodeIcon,
  readNodeKindLabel,
  readNodeKindsForPalette,
  removeWorkflowEdge,
  removeWorkflowNode,
  setWorkflowViewport,
  stripDefinitionVersionFields,
  type WorkflowAssetKind as WorkflowAssetKindValue,
  type WorkflowAssetRecord,
  type WorkflowAssetScope as WorkflowAssetScopeValue,
  type WorkflowAssetUsageRecord,
  type WorkflowAssetUpsertInput,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionUpsertInput,
  type WorkflowExecutionRecord,
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
  ConnectionHint: "workflows-connection-hint",
  ConnectionPreview: "workflows-connection-preview",
  EdgeDeletePrefix: "workflows-edge-delete-",
  EdgeHitPrefix: "workflows-edge-hit-",
  SectionWorkflows: "workflows-section-definitions",
  SectionNodes: "workflows-section-nodes",
  SectionAssets: "workflows-section-assets",
  SectionHistory: "workflows-section-history",
  WorkflowNameInput: "workflows-name-input",
  WorkflowDescriptionInput: "workflows-description-input",
  NodeLabelInput: "workflows-node-label-input",
  NodePalettePrefix: "workflows-node-palette-",
  AssetCreatePrefix: "workflows-asset-create-",
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
  | { type: "asset"; id: string };

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

type NodeDropTarget = {
  nodeId: string;
  portId: string;
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
  dirtyWorkflow: boolean;
  dirtyAssetIds: ReadonlyArray<string>;
  pendingConnection: PendingConnection | null;
  hoveredPort: HoveredPort | null;
  hoveredEdgeId: string | null;
  connectionPreviewPoint: ConnectionPreviewPoint | null;
  guardrailAttachAssetId: string | null;
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
      dirtyWorkflow: false,
      dirtyAssetIds: [],
      pendingConnection: null,
      hoveredPort: null,
      hoveredEdgeId: null,
      connectionPreviewPoint: null,
      guardrailAttachAssetId: null,
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
      this.renderSurface()
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
                    onClick: () => this.setState({ selection: { type: "asset", id: asset.id } })
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
      ? this.state.executions.filter((execution) => execution.workflowId === currentWorkflow.id)
      : [];

    return createElement("div", {
      className: "min-h-0 flex-1 overflow-y-auto p-3"
    }, [
      currentWorkflow === null
        ? createElement(EmptyStatePanel, {
            icon: "history",
            title: "Select a workflow",
            description: "Execution history is already server-backed, but detailed run controls land in phase 06.5. This panel stays read-only for now."
          })
        : executions.length === 0
          ? createElement(EmptyStatePanel, {
              icon: "history_toggle_off",
              title: "No recorded runs",
              description: "The execution rail remains read-only in 06.3. Run history will become first-class in 06.5."
            })
          : executions.map((execution) =>
              createElement(Card, {
                key: execution.id,
                className: "mb-3 border border-border-dark bg-[#11161d]",
                padding: "md",
                children: [
                  createElement("div", { className: "flex items-center justify-between gap-3" }, [
                    createElement("div", { className: "min-w-0" }, [
                      createElement("p", { className: "truncate text-sm font-medium text-white" }, [execution.id.slice(0, 8)]),
                      createElement("p", { className: "text-xs text-text-secondary" }, [formatTimestamp(execution.startedAt)])
                    ]),
                    createElement(StatusBadge, {
                      status: execution.status === "completed" ? "success" : execution.status === "failed" ? "failed" : execution.status === "awaiting_review" ? "warning" : "info"
                    }, [execution.status])
                  ]),
                  createElement("div", { className: "mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary" }, [
                    createElement("span", {}, [`${execution.totals.totalTokens} tokens`]),
                    createElement("span", {}, [`€${execution.totals.estimatedCostEur.toFixed(4)}`]),
                    createElement("span", {}, [`${execution.warningsCount} warnings`]),
                    createElement("span", {}, [`${execution.errorsCount} errors`])
                  ]),
                  createElement(Button, {
                    variant: "ghost",
                    size: "sm",
                    disabled: this.state.pendingAction !== null,
                    onClick: () => {
                      void this.handleDeleteExecution(execution.id);
                    },
                    children: this.state.pendingAction === PendingAction.DeleteExecution ? "Deleting" : "Delete run"
                  })
                ]
              })
            )
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
      createElement("div", { className: "flex items-center gap-2" }, [
        createElement(Button, {
          variant: "ghost",
          size: "sm",
          disabled: this.state.draftWorkflow === null,
          onClick: () => this.handleZoom(-0.1),
          children: "Zoom out"
        }),
        createElement(Button, {
          variant: "ghost",
          size: "sm",
          disabled: this.state.draftWorkflow === null,
          onClick: () => this.handleResetViewport(),
          children: "Reset view"
        }),
        createElement(Button, {
          variant: "ghost",
          size: "sm",
          disabled: this.state.draftWorkflow === null,
          onClick: () => this.handleZoom(0.1),
          children: "Zoom in"
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
        : "flex min-h-0 w-[360px] shrink-0 flex-col border-l border-border-dark bg-[#1a1f27]",
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
          : ""
      ]),
      createElement("div", {
        className: "min-h-0 flex-1 overflow-y-auto p-4"
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

    const workflow = this.state.draftWorkflow;
    return workflow ? this.renderWorkflowInspector(workflow) : this.renderEmptyInspector();
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
      node.kind === WorkflowNodeKind.LogicCondition || node.kind === WorkflowNodeKind.LogicMerge
        ? createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3 text-sm text-text-secondary" }, [
            "Mapping editors and structured branch expressions land in phase 06.4. The current MVP keeps these nodes connectable and label-editable, but advanced data routing is intentionally disabled with explanation."
          ])
        : "",
      node.kind !== WorkflowNodeKind.TriggerManual && node.kind !== WorkflowNodeKind.TerminalResponse
        ? this.renderGuardrailAttachmentSection(node, guardrailAssets)
        : ""
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
      asset.kind === WorkflowAssetKind.Guardrail && asset.guardrail
        ? createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
            createElement("p", { className: "text-sm font-medium text-white" }, ["Guardrail validations"]),
            createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
              `${asset.guardrail.validations.length} validation${asset.guardrail.validations.length === 1 ? "" : "s"} · ${asset.guardrail.severity} severity`
            ]),
            createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              asset.guardrail.validations.map((validation) =>
                createElement("div", {
                  key: validation.id,
                  className: "rounded-md border border-border-dark px-3 py-2"
                }, [
                  createElement("p", { className: "text-sm font-medium text-white" }, [validation.kind]),
                  createElement("p", { className: "text-xs text-text-secondary" }, [validation.message])
                ])
              )
            ])
          ])
        : "",
      asset.outputContract
        ? createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3 text-sm text-text-secondary" }, [
            createElement("p", { className: "text-sm font-medium text-white" }, ["JSON output contract"]),
            createElement("pre", { className: "mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border-dark bg-[#0f1318] px-3 py-3 text-xs text-slate-300" }, [
              JSON.stringify(asset.outputContract.schema, null, 2)
            ]),
            createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [
              "The visual JSON contract editor is reserved for phase 06.4. The MVP keeps the server-backed schema visible and persisted, but editing is intentionally disabled here."
            ])
          ])
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
      })
    ]);
  }

  private renderAgentConfig(node: WorkflowNodeRecord): HTMLElement {
    const role = node.config.role ?? WorkflowNodeRole.Planner;
    const provider = node.config.provider ?? createFallbackProviderSelection();

    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("p", { className: "mb-3 text-sm font-medium text-white" }, ["Agent configuration"]),
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
      }),
      this.renderProviderSelectionFields(node, provider)
    ]);
  }

  private renderProviderRunConfig(node: WorkflowNodeRecord): HTMLElement {
    const provider = node.config.provider ?? createFallbackProviderSelection();

    return createElement("div", { className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3" }, [
      createElement("p", { className: "mb-3 text-sm font-medium text-white" }, ["Provider run"]),
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
    return createElement("div", { className: "grid gap-3" }, [
      this.renderInspectorField("Provider", provider.providerId, (value) => {
        this.updateNodeProvider(node.id, {
          ...provider,
          providerId: value
        });
      }),
      this.renderInspectorField("Model", provider.modelId, (value) => {
        this.updateNodeProvider(node.id, {
          ...provider,
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
          ...provider,
          reasoningLevel: readWorkflowReasoningLevel(value)
        });
      }),
      this.renderInspectorField("Temperature", provider.temperature.toString(), (value) => {
        const parsed = Number.parseFloat(value);
        this.updateNodeProvider(node.id, {
          ...provider,
          temperature: Number.isFinite(parsed) ? parsed : provider.temperature
        });
      }),
      this.renderInspectorSelect("Verbosity", provider.verbosity, [
        WorkflowVerbosity.Low,
        WorkflowVerbosity.Medium,
        WorkflowVerbosity.High
      ], (value) => {
        this.updateNodeProvider(node.id, {
          ...provider,
          verbosity: readWorkflowVerbosity(value)
        });
      })
    ]);
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
          children: "New guardrail"
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
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-sm font-medium text-white" }, [label]),
      createElement("input", {
        type: "text",
        value,
        className: "h-11 rounded-lg border border-border-dark bg-[#11161d] px-3 text-sm text-white focus:border-primary focus:outline-none",
        ...(testId ? { "data-testid": testId } : {}),
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        }
      })
    ]);
  }

  private renderInspectorTextArea(
    label: string,
    value: string,
    onChange: (value: string) => void,
    testId?: string
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-sm font-medium text-white" }, [label]),
      createElement("textarea", {
        className: "min-h-32 rounded-lg border border-border-dark bg-[#11161d] px-3 py-3 text-sm text-white focus:border-primary focus:outline-none",
        ...(testId ? { "data-testid": testId } : {}),
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLTextAreaElement) {
            onChange(target.value);
          }
        }
      }, [value])
    ]);
  }

  private renderInspectorSelect(
    label: string,
    value: string,
    options: ReadonlyArray<string>,
    onChange: (value: string) => void,
    customLabels?: ReadonlyArray<{ value: string; label: string }>
  ): HTMLElement {
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("span", { className: "text-sm font-medium text-white" }, [label]),
      createElement("select", {
        className: "h-11 rounded-lg border border-border-dark bg-[#11161d] px-3 text-sm text-white focus:border-primary focus:outline-none",
        value,
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
              }, [option])
            ))
      ])
    ]);
  }

  private renderInlineMetaGrid(items: ReadonlyArray<{ label: string; value: string }>): HTMLElement {
    return createElement("div", { className: "grid grid-cols-2 gap-3" }, [
      items.map((item) =>
        createElement("div", {
          key: item.label,
          className: "rounded-lg border border-border-dark bg-[#11161d] px-3 py-3"
        }, [
          createElement("p", { className: "text-[11px] uppercase tracking-wide text-text-secondary" }, [item.label]),
          createElement("p", { className: "mt-2 text-sm font-medium text-white" }, [item.value])
        ])
      )
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
        ? resolveSelectionAfterReload(this.state.selection, currentWorkflow, assets)
        : { type: "workflow", id: null },
      dirtyWorkflow: false,
      dirtyAssetIds: []
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
      await this.reloadCatalog(this.state.currentProject.id);
      const nextSelection: WorkflowSelection = attachToNode && focusNodeId
        ? { type: "node", id: focusNodeId }
        : { type: "asset", id: asset.id };
      this.setState({
        pendingAction: null,
        noticeMessage: `${readAssetKindLabel(kind)} asset created.`,
        errorMessage: null,
        selection: nextSelection
      });
      if (attachToNode && focusNodeId && this.state.draftWorkflow) {
        const nextWorkflow = attachGuardrailToNode(this.state.draftWorkflow, focusNodeId, asset.id);
        this.updateDraftWorkflow(nextWorkflow, { type: "node", id: focusNodeId });
      }
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
        noticeMessage: "Execution deleted.",
        errorMessage: null
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
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
    provider: WorkflowProviderSelectionRecord
  ): void {
    this.patchNode(nodeId, (node) => ({
      ...node,
      config: {
        ...node.config,
        provider
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

  private readInspectorTitle(): string {
    if (this.state.selection.type === "node") {
      return this.readSelectedNode()?.label ?? "Selected node";
    }

    if (this.state.selection.type === "asset") {
      return this.readSelectedAsset()?.name ?? "Reusable asset";
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
  assets: ReadonlyArray<WorkflowAssetRecord>
): WorkflowSelection => {
  if (selection.type === "node" && workflow.nodes.some((node) => node.id === selection.id)) {
    return selection;
  }

  if (selection.type === "asset" && assets.some((asset) => asset.id === selection.id)) {
    return selection;
  }

  return {
    type: "workflow",
    id: workflow.id
  };
};

const createFallbackProviderSelection = (): WorkflowProviderSelectionRecord => ({
  providerId: "codex-cli",
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

const readIsCompactViewport = (): boolean =>
  typeof window !== "undefined" && window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH;

const readErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const toSlugValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
