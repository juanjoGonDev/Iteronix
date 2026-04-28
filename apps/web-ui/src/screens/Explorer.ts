import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/WorkbenchPanels.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { COMPACT_VIEWPORT_MAX_WIDTH, ROUTES } from "../shared/constants.js";
import {
  createExplorerClient,
  ExplorerFileEntryKind,
  type ExplorerFileContentRecord,
  type ExplorerFileSearchMatchRangeRecord,
  type ExplorerFileSearchResultRecord
} from "../shared/explorer-client.js";
import {
  readExplorerWorkspaceState,
  writeExplorerWorkspaceState
} from "../shared/explorer-workspace-session.js";
import { readProjectSession } from "../shared/project-session.js";
import { router } from "../shared/Router.js";
import type { ProjectRecord } from "../shared/workbench-types.js";
import {
  buildExplorerTreeNodes,
  closeAllExplorerOpenFiles,
  collapseExplorerSearchResultPath,
  closeExplorerFileTabsToLeft,
  closeExplorerFileTabsToRight,
  closeExplorerOpenFile,
  filterHiddenExplorerSearchResults,
  flattenExplorerTreeNodes,
  highlightExplorerFileContent,
  hideExplorerSearchResultPath,
  isExplorerSearchResultCollapsed,
  mergeExplorerDirectoryChildren,
  mergeExplorerPreviewWindow,
  openExplorerFile,
  readExplorerFileIcon,
  readExplorerLanguageTheme,
  readExplorerPreviewWindowRequest,
  readExplorerTokenClassName,
  resolveNextExplorerActiveFilePath,
  setExplorerFilePinned,
  setExplorerDirectoryExpanded,
  setExplorerTreeExpansion,
  toggleExplorerDirectory,
  type ExplorerHighlightToken,
  type ExplorerOpenFile,
  ExplorerPreviewLoadDirection,
  type ExplorerTreeNode
} from "./explorer-state.js";

const ExplorerPendingAction = {
  Open: "open",
  Directory: "directory",
  File: "file",
  Refresh: "refresh",
  ExpandAll: "expand-all"
} as const;

type ExplorerPendingAction =
  typeof ExplorerPendingAction[keyof typeof ExplorerPendingAction];

const ExplorerSidebarSection = {
  Explorer: "explorer",
  Search: "search"
} as const;

type ExplorerSidebarSection =
  typeof ExplorerSidebarSection[keyof typeof ExplorerSidebarSection];

const ExplorerCompactView = {
  Panel: "panel",
  Editor: "editor"
} as const;

type ExplorerCompactView =
  typeof ExplorerCompactView[keyof typeof ExplorerCompactView];

type ExplorerSearchSettings = {
  isRegex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
};

const ExplorerSearchSettingKey = {
  IsRegex: "isRegex",
  MatchCase: "matchCase",
  WholeWord: "wholeWord"
} as const;

type ExplorerSearchSettingKey =
  typeof ExplorerSearchSettingKey[keyof typeof ExplorerSearchSettingKey];

const ExplorerTabMenuAction = {
  Close: "close",
  CloseLeft: "close-left",
  CloseRight: "close-right",
  CloseAll: "close-all",
  Pin: "pin",
  Unpin: "unpin"
} as const;

type ExplorerTabMenuAction =
  typeof ExplorerTabMenuAction[keyof typeof ExplorerTabMenuAction];

const ExplorerSelector = {
  WorkspaceTestId: "explorer-workspace",
  ActivityExplorerTestId: "explorer-activity-explorer",
  ActivitySearchTestId: "explorer-activity-search",
  SidebarPanelTestId: "explorer-sidebar-panel",
  SidebarHideTestId: "explorer-sidebar-hide",
  SearchInputTestId: "explorer-search-input",
  SearchResultListTestId: "explorer-search-results",
  SearchToggleRegexTestId: "explorer-search-toggle-regex",
  SearchToggleMatchCaseTestId: "explorer-search-toggle-match-case",
  SearchToggleWholeWordTestId: "explorer-search-toggle-whole-word",
  TreeSurfaceTestId: "explorer-tree-surface",
  TabsBarTestId: "explorer-tabs-bar",
  TabsScrollSurfaceTestId: "explorer-tabs-scroll-surface",
  TabContextMenuTestId: "explorer-tab-context-menu",
  ExpandAllTestId: "explorer-expand-all",
  CollapseAllTestId: "explorer-collapse-all",
  CompactPanelExplorerTestId: "explorer-compact-panel-explorer",
  CompactPanelSearchTestId: "explorer-compact-panel-search",
  CompactPanelEditorTestId: "explorer-compact-panel-editor"
} as const;

const SearchDebounceMs = 320;
const ExplorerLineHighlightDurationMs = 1400;
const ExplorerPreviewLineCount = 240;
const ExplorerPreviewContextRadius = 80;
const ExplorerPreviewLoadThresholdPx = 120;
const ExplorerPreviewBottomLoadProgressRatio = 0.6;

interface ExplorerState {
  sessionRootPath: string;
  sessionProjectName: string;
  currentProject: ProjectRecord | null;
  treeNodes: ReadonlyArray<ExplorerTreeNode>;
  openFiles: ReadonlyArray<ExplorerOpenFile>;
  selectedFilePath: string | null;
  selectedFileContent: string;
  selectedFileStartLine: number;
  selectedFileEndLine: number;
  selectedFileTotalLines: number;
  selectedFileTruncated: boolean;
  highlightedLineNumber: number | null;
  openTabContextMenuPath: string | null;
  pendingAction: ExplorerPendingAction | null;
  activePath: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  isCompactViewport: boolean;
  activeSidebarSection: ExplorerSidebarSection;
  isSidebarVisible: boolean;
  compactView: ExplorerCompactView;
  searchQuery: string;
  searchResults: ReadonlyArray<ExplorerFileSearchResultRecord>;
  searchIsLoading: boolean;
  searchSettings: ExplorerSearchSettings;
  collapsedSearchResultPaths: ReadonlyArray<string>;
  hiddenSearchResultPaths: ReadonlyArray<string>;
}

interface ExplorerProps extends ComponentProps {
  className?: string;
}

export class Explorer extends Component<ExplorerProps, ExplorerState> {
  private readonly explorerClient = createExplorerClient();
  private searchDebounceId: number | null = null;
  private lineHighlightTimeoutId: number | null = null;
  private previewLoadDirection: ExplorerPreviewLoadDirection | null = null;
  private searchRevision = 0;
  private searchDraftValue = "";
  private searchSelectionStart: number | null = null;
  private searchSelectionEnd: number | null = null;
  private searchShouldRestoreFocus = false;

  constructor(props: ExplorerProps = {}) {
    const session = readProjectSession();
    const workspaceState = readExplorerWorkspaceState(session.projectRootPath);

    super(props, {
      sessionRootPath: session.projectRootPath,
      sessionProjectName: session.projectName,
      currentProject: null,
      treeNodes: [],
      openFiles: workspaceState.openFiles,
      selectedFilePath: workspaceState.activeFilePath,
      ...createEmptyExplorerFileViewState(),
      highlightedLineNumber: null,
      openTabContextMenuPath: null,
      pendingAction: null,
      activePath: null,
      errorMessage: null,
      noticeMessage: null,
      isCompactViewport: readIsCompactViewport(),
      activeSidebarSection: ExplorerSidebarSection.Explorer,
      isSidebarVisible: true,
      compactView: ExplorerCompactView.Panel,
      searchQuery: "",
      searchResults: [],
      searchIsLoading: false,
      searchSettings: {
        isRegex: false,
        matchCase: false,
        wholeWord: false
      },
      collapsedSearchResultPaths: [],
      hiddenSearchResultPaths: []
    });

    if (session.projectRootPath.length > 0) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          void this.handleOpenProject(true);
        }, 0);
      });
    }
  }

  override render(): HTMLElement {
    const visibleNodes = flattenExplorerTreeNodes(this.state.treeNodes);
    const selectedFile = readSelectedFileRecord(this.state.selectedFilePath);

    return createElement("div", {
      className: `flex h-full w-full flex-col ${this.props.className ?? ""}`
    }, [
      this.renderLineHighlightStyle(),
      this.renderMessages(),
      this.renderWorkbench(visibleNodes, selectedFile)
    ]);
  }

  override onMount(): void {
    window.addEventListener("resize", this.handleViewportResize);
    window.addEventListener("click", this.handleWindowClick);
  }

  override onUnmount(): void {
    this.clearSearchDebounce();
    this.clearLineHighlight();
    window.removeEventListener("resize", this.handleViewportResize);
    window.removeEventListener("click", this.handleWindowClick);
  }

  private renderLineHighlightStyle(): HTMLElement {
    return createElement("style", {
      textContent: "@keyframes explorer-line-flash {0% {background-color: rgba(251, 191, 36, 0.34);} 70% {background-color: rgba(251, 191, 36, 0.16);} 100% {background-color: transparent;}}"
    });
  }

  private renderMessages(): HTMLElement {
    const { errorMessage, noticeMessage } = this.state;

    if (!errorMessage && !noticeMessage) {
      return createElement("div", {});
    }

    return createElement("div", {
      className: this.state.isCompactViewport ? "px-3 pt-3" : "px-6 pt-6"
    }, [
      createElement("div", { className: "flex flex-col gap-3" }, [
        errorMessage
          ? createElement("div", {
              className: "rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            }, [errorMessage])
          : "",
        noticeMessage
          ? createElement("div", {
              className: "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
            }, [noticeMessage])
          : ""
      ])
    ]);
  }

  private renderWorkbench(
    visibleNodes: ReadonlyArray<ReturnType<typeof flattenExplorerTreeNodes>[number]>,
    selectedFile: ExplorerSelectedFile | null
  ): HTMLElement {
    return createElement("div", {
      className: "flex min-h-0 flex-1 flex-col border-t border-border-dark bg-[#11161d]",
      "data-testid": ExplorerSelector.WorkspaceTestId,
      style: "min-height: calc(100vh - 64px);"
    }, [
      createElement("div", {
        className: "flex min-h-0 flex-1"
      }, [
        this.renderActivityRail(),
        shouldShowExplorerSidebar(this.state)
          ? this.renderSidebarPanel(visibleNodes)
          : "",
        shouldShowExplorerEditor(this.state)
          ? this.renderEditorSurface(selectedFile)
          : ""
      ]),
      this.renderStatusBar(selectedFile)
    ]);
  }

  private renderActivityRail(): HTMLElement {
    return createElement("aside", {
      className: "flex w-12 shrink-0 flex-col items-center border-r border-border-dark bg-[#181c22] py-2"
    }, [
      this.renderActivityButton({
        icon: "folder_open",
        label: "Explorer",
        testId: ExplorerSelector.ActivityExplorerTestId,
        active:
          this.state.activeSidebarSection === ExplorerSidebarSection.Explorer &&
          this.state.isSidebarVisible,
        onClick: () => this.handleSidebarSectionClick(ExplorerSidebarSection.Explorer)
      }),
      this.renderActivityButton({
        icon: "search",
        label: "Search",
        testId: ExplorerSelector.ActivitySearchTestId,
        active:
          this.state.activeSidebarSection === ExplorerSidebarSection.Search &&
          this.state.isSidebarVisible,
        onClick: () => this.handleSidebarSectionClick(ExplorerSidebarSection.Search)
      }),
      this.state.isCompactViewport
        ? createElement("div", {
            className: "mt-auto flex flex-col gap-1 px-1"
          }, [
            this.renderCompactViewButton({
              icon: "folder",
              label: "Panel",
              testId: ExplorerSelector.CompactPanelExplorerTestId,
              active:
                this.state.compactView === ExplorerCompactView.Panel &&
                this.state.activeSidebarSection === ExplorerSidebarSection.Explorer,
              onClick: () => this.setCompactPanelView(ExplorerSidebarSection.Explorer)
            }),
            this.renderCompactViewButton({
              icon: "search",
              label: "Search",
              testId: ExplorerSelector.CompactPanelSearchTestId,
              active:
                this.state.compactView === ExplorerCompactView.Panel &&
                this.state.activeSidebarSection === ExplorerSidebarSection.Search,
              onClick: () => this.setCompactPanelView(ExplorerSidebarSection.Search)
            }),
            this.renderCompactViewButton({
              icon: "code",
              label: "Editor",
              testId: ExplorerSelector.CompactPanelEditorTestId,
              active: this.state.compactView === ExplorerCompactView.Editor,
              onClick: () => this.setState({ compactView: ExplorerCompactView.Editor })
            })
          ])
        : ""
    ]);
  }

  private renderActivityButton(input: {
    icon: string;
    label: string;
    testId: string;
    active: boolean;
    onClick: () => void;
  }): HTMLElement {
    return createElement("button", {
      type: "button",
      title: input.label,
      "data-testid": input.testId,
      className: `group flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
        input.active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-transparent text-text-secondary hover:bg-[#242b34] hover:text-white"
      }`,
      onClick: () => input.onClick()
    }, [
      createElement("span", {
        className: "material-symbols-outlined text-[20px]"
      }, [input.icon])
    ]);
  }

  private renderCompactViewButton(input: {
    icon: string;
    label: string;
    testId: string;
    active: boolean;
    onClick: () => void;
  }): HTMLElement {
    return createElement("button", {
      type: "button",
      title: input.label,
      "data-testid": input.testId,
      className: `flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
        input.active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-transparent text-text-secondary hover:bg-[#242b34] hover:text-white"
      }`,
      onClick: () => input.onClick()
    }, [
      createElement("span", {
        className: "material-symbols-outlined text-[18px]"
      }, [input.icon])
    ]);
  }

  private renderSidebarPanel(
    visibleNodes: ReadonlyArray<ReturnType<typeof flattenExplorerTreeNodes>[number]>
  ): HTMLElement {
    return createElement("aside", {
      className: this.state.isCompactViewport
        ? "flex min-h-0 flex-1 flex-col border-r border-border-dark bg-[#1a1f27]"
        : "flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border-dark bg-[#1a1f27]",
      "data-testid": ExplorerSelector.SidebarPanelTestId
    }, [
      this.renderSidebarPanelHeader(),
      this.state.activeSidebarSection === ExplorerSidebarSection.Explorer
        ? this.renderExplorerPanel(visibleNodes)
        : this.renderSearchPanel()
    ]);
  }

  private renderSidebarPanelHeader(): HTMLElement {
    const title =
      this.state.activeSidebarSection === ExplorerSidebarSection.Explorer
        ? "EXPLORER"
        : "SEARCH";

    return createElement("div", {
      className: "flex items-center justify-between border-b border-border-dark px-3 py-2"
    }, [
      createElement("div", { className: "min-w-0 flex-1" }, [
        createElement("p", {
          className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary"
        }, [title]),
        this.state.currentProject
          ? createElement("p", {
              className: "mt-1 truncate text-xs text-slate-400"
            }, [this.state.currentProject.name])
          : ""
      ]),
      createElement("div", {
        className: "flex items-center gap-1"
      }, [
        this.state.activeSidebarSection === ExplorerSidebarSection.Explorer
          ? this.renderSidebarActionButton({
              icon: "refresh",
              title: "Reload",
              disabled:
                this.state.currentProject === null ||
                this.state.pendingAction === ExplorerPendingAction.Open ||
                this.state.pendingAction === ExplorerPendingAction.Refresh,
              onClick: () => {
                void this.handleRefreshProject();
              }
            })
          : "",
        this.state.activeSidebarSection === ExplorerSidebarSection.Explorer
          ? this.renderSidebarActionButton({
              icon: "unfold_more",
              title: "Expand all",
              disabled:
                this.state.currentProject === null ||
                this.state.pendingAction === ExplorerPendingAction.ExpandAll,
              testId: ExplorerSelector.ExpandAllTestId,
              onClick: () => {
                void this.handleExpandAllDirectories();
              }
            })
          : "",
        this.state.activeSidebarSection === ExplorerSidebarSection.Explorer
          ? this.renderSidebarActionButton({
              icon: "unfold_less",
              title: "Collapse all",
              disabled: this.state.currentProject === null,
              testId: ExplorerSelector.CollapseAllTestId,
              onClick: () => this.handleCollapseAllDirectories()
            })
          : "",
        this.renderSidebarActionButton({
          icon: "left_panel_close",
          title: "Hide sidebar panel",
          testId: ExplorerSelector.SidebarHideTestId,
          onClick: () => this.handleSidebarHide()
        })
      ])
    ]);
  }

  private renderSidebarActionButton(input: {
    icon: string;
    title: string;
    testId?: string;
    disabled?: boolean;
    onClick: () => void;
  }): HTMLElement {
    return createElement("button", {
      type: "button",
      title: input.title,
      ...(input.testId ? { "data-testid": input.testId } : {}),
      className: "flex h-8 w-8 items-center justify-center rounded border border-transparent text-text-secondary transition-colors hover:bg-[#242b34] hover:text-white disabled:opacity-50",
      disabled: input.disabled ?? false,
      onClick: () => input.onClick()
    }, [
      createElement("span", {
        className: "material-symbols-outlined text-[18px]"
      }, [input.icon])
    ]);
  }

  private renderExplorerPanel(
    visibleNodes: ReadonlyArray<ReturnType<typeof flattenExplorerTreeNodes>[number]>
  ): HTMLElement {
    if (this.state.currentProject === null) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-4"
      }, [
        createElement(EmptyStatePanel, {
          icon: "folder_open",
          title: "No active project",
          description: "Select a project from the global sidebar button or open one from the Projects screen before browsing the repository."
        })
      ]);
    }

    return createElement("div", {
      className: "flex min-h-0 flex-1 flex-col"
    }, [
      this.renderOpenEditorsSection(),
      createElement("section", {
        className: "flex min-h-0 flex-1 flex-col"
      }, [
        createElement("div", {
          className: "border-b border-border-dark px-3 py-2"
        }, [
          createElement("p", {
            className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary"
          }, [this.state.currentProject.name]),
          createElement("p", {
            className: "mt-1 truncate text-xs text-slate-400"
          }, [this.state.currentProject.rootPath])
        ]),
        visibleNodes.length === 0
          ? createElement("div", {
              className: "flex flex-1 items-center justify-center p-4 text-sm text-text-secondary"
            }, ["No files were returned by the server."])
          : createElement("div", {
              className: "min-h-0 flex-1 overflow-y-auto py-1",
              "data-testid": ExplorerSelector.TreeSurfaceTestId
            }, [
              visibleNodes.map((item) => this.renderTreeNode(item.node, item.depth))
            ])
      ])
    ]);
  }

  private renderOpenEditorsSection(): HTMLElement {
    return createElement("section", {
      className: "border-b border-border-dark px-3 py-2"
    }, [
      createElement("p", {
        className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary"
      }, ["Open Editors"]),
      this.state.openFiles.length === 0
        ? createElement("p", {
            className: "mt-2 px-2 text-sm text-text-secondary"
          }, ["No open editors"])
        : createElement("div", {
            className: "mt-2 flex flex-col gap-1"
          }, [
            this.state.openFiles.map((openFile) => this.renderOpenEditorRow(openFile))
          ])
    ]);
  }

  private renderOpenEditorRow(openFile: ExplorerOpenFile): HTMLElement {
    const selected = this.state.selectedFilePath === openFile.path;
    const selectedFile = readSelectedFileRecord(openFile.path);
    const theme = readExplorerLanguageTheme(openFile.path);

    return createElement("div", {
      key: `open-editor-${openFile.path}`,
      className: `flex items-center gap-2 rounded px-2 py-1.5 ${selected ? "bg-primary/10 text-white" : "text-slate-300 hover:bg-[#242b34]"}`,
      "data-testid": `explorer-open-editor-${toTestIdSegment(openFile.path)}`
    }, [
      createElement("button", {
        type: "button",
        className: "flex min-w-0 flex-1 items-center gap-2 text-left",
        onClick: () => {
          void this.handleFilePathSelect(openFile.path, false);
        }
      }, [
        createElement("span", {
          className: `material-symbols-outlined text-[18px] ${theme.accentClassName}`
        }, [readExplorerFileIcon(openFile.path)]),
        createElement("span", {
          className: "truncate text-sm"
        }, [selectedFile?.name ?? openFile.path])
      ]),
      createElement("button", {
        type: "button",
        title: openFile.pinned ? "Unpin file" : "Pin file",
        className: `flex h-7 w-7 items-center justify-center rounded border border-transparent transition-colors hover:bg-[#2a3340] ${openFile.pinned ? "text-amber-300" : "text-text-secondary"}`,
        onClick: () => this.handleTabPinToggle(openFile.path)
      }, [
        createElement("span", {
          className: "material-symbols-outlined text-[16px]"
        }, [openFile.pinned ? "keep" : "keep_off"])
      ]),
      createElement("button", {
        type: "button",
        title: "Close file",
        className: "flex h-7 w-7 items-center justify-center rounded border border-transparent text-text-secondary transition-colors hover:bg-[#2a3340] hover:text-white",
        onClick: () => {
          void this.handleTabMenuAction(ExplorerTabMenuAction.Close, openFile.path);
        }
      }, [
        createElement("span", {
          className: "material-symbols-outlined text-[16px]"
        }, ["close"])
      ])
    ]);
  }

  private renderTreeNode(node: ExplorerTreeNode, depth: number): HTMLElement {
    const isDirectory = node.kind === ExplorerFileEntryKind.Directory;
    const isSelected = this.state.selectedFilePath === node.path;
    const isLoading =
      this.state.activePath === node.path &&
      (this.state.pendingAction === ExplorerPendingAction.Directory ||
        this.state.pendingAction === ExplorerPendingAction.File);
    const fileTheme = !isDirectory ? readExplorerLanguageTheme(node.path) : null;
    const paddingLeft = 10 + depth * 14;

    return createElement("button", {
      type: "button",
      key: node.path,
      "data-testid": `explorer-node-${toTestIdSegment(node.path)}`,
      className: `flex w-full items-center gap-1.5 border-l-2 px-3 py-1.5 text-left text-sm transition-colors ${
        isSelected
          ? "border-primary bg-primary/10 text-white"
          : "border-transparent text-slate-300 hover:bg-[#242b34] hover:text-white"
      }`,
      style: `padding-left: ${paddingLeft}px`,
      onClick: (event: Event) => {
        if (event.currentTarget instanceof HTMLElement) {
          event.currentTarget.blur();
        }

        if (isDirectory) {
          void this.handleDirectorySelect(node);
          return;
        }

        void this.handleFilePathSelect(node.path, false);
      }
    }, [
      isDirectory
        ? createElement("span", {
            className: "material-symbols-outlined shrink-0 text-[16px] text-slate-400"
          }, [node.expanded ? "expand_more" : "chevron_right"])
        : createElement("span", {
            className: "w-[16px] shrink-0"
          }),
      createElement("span", {
        className: `material-symbols-outlined shrink-0 text-[18px] ${
          isDirectory ? "text-[#d7ba7d]" : fileTheme?.accentClassName ?? "text-slate-300"
        }`
      }, [readNodeIcon(node, isLoading)]),
      createElement("span", {
        className: `${isDirectory ? "font-medium" : "font-normal"} min-w-0 flex-1 truncate`
      }, [node.name])
    ]);
  }

  private renderSearchPanel(): HTMLElement {
    if (this.state.currentProject === null) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-4"
      }, [
        createElement(EmptyStatePanel, {
          icon: "search",
          title: "No active project",
          description: "Select a project before searching across files."
        })
      ]);
    }

    const visibleResults = filterHiddenExplorerSearchResults(
      this.state.searchResults,
      this.state.hiddenSearchResultPaths
    );

    return createElement("div", {
      className: "flex min-h-0 flex-1 flex-col"
    }, [
      createElement("div", {
        className: "border-b border-border-dark px-3 py-3"
      }, [
        createElement("label", { className: "flex flex-col gap-2" }, [
          createElement("span", {
            className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary"
          }, ["Search"]),
          createElement("input", {
            type: "text",
            value: this.searchDraftValue,
            placeholder: "Search in workspace",
            disabled: this.state.currentProject === null,
            "data-testid": ExplorerSelector.SearchInputTestId,
            className: "h-10 rounded border border-border-dark bg-[#11161d] px-3 text-sm text-white placeholder:text-text-secondary focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            onInput: (event: Event) => this.handleSearchInput(readSearchInputState(event))
          })
        ]),
        createElement("div", {
          className: "mt-3 flex flex-wrap gap-2"
        }, [
          this.renderSearchToggleButton({
            testId: ExplorerSelector.SearchToggleRegexTestId,
            label: ".*",
            active: this.state.searchSettings.isRegex,
            onClick: () => this.handleSearchSettingToggle(ExplorerSearchSettingKey.IsRegex)
          }),
          this.renderSearchToggleButton({
            testId: ExplorerSelector.SearchToggleMatchCaseTestId,
            label: "Aa",
            active: this.state.searchSettings.matchCase,
            onClick: () => this.handleSearchSettingToggle(ExplorerSearchSettingKey.MatchCase)
          }),
          this.renderSearchToggleButton({
            testId: ExplorerSelector.SearchToggleWholeWordTestId,
            label: "ab",
            active: this.state.searchSettings.wholeWord,
            onClick: () => this.handleSearchSettingToggle(ExplorerSearchSettingKey.WholeWord)
          })
        ])
      ]),
      createElement("div", {
        className: "border-b border-border-dark px-3 py-2 text-xs text-text-secondary"
      }, [readSearchResultSummary(this.searchQueryOrDraft(), visibleResults, this.state.searchIsLoading)]),
      this.renderSearchResults()
    ]);
  }

  private renderSearchToggleButton(input: {
    testId: string;
    label: string;
    active: boolean;
    onClick: () => void;
  }): HTMLElement {
    return createElement("button", {
      type: "button",
      "data-testid": input.testId,
      className: `rounded border px-2.5 py-1 text-xs font-semibold transition-colors ${
        input.active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border-dark bg-[#11161d] text-text-secondary hover:bg-[#242b34] hover:text-white"
      }`,
      onClick: () => input.onClick()
    }, [input.label]);
  }

  private renderSearchResults(): HTMLElement {
    const query = this.searchQueryOrDraft().trim();
    const visibleResults = filterHiddenExplorerSearchResults(
      this.state.searchResults,
      this.state.hiddenSearchResultPaths
    );

    if (query.length === 0) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-4"
      }, [
        createElement("div", {
          className: "max-w-xs text-center text-sm text-text-secondary"
        }, ["Search across file names and file contents with regex, case and whole-word toggles."])
      ]);
    }

    if (this.state.searchIsLoading) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-4 text-sm text-text-secondary"
      }, ["Searching workspace..."]);
    }

    if (this.state.searchResults.length === 0) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-4 text-sm text-text-secondary"
      }, ["No results found for the current query."]);
    }

    return createElement("div", {
      className: "min-h-0 flex-1 overflow-y-auto px-2 py-2",
      "data-testid": ExplorerSelector.SearchResultListTestId
    }, [
      visibleResults.map((result) =>
        createElement("section", {
          key: result.path,
          className: "mb-3 overflow-hidden rounded border border-border-dark bg-[#11161d]"
        }, [
          createElement("div", {
            className: "flex items-center gap-2 border-b border-border-dark px-3 py-2"
          }, [
            createElement("button", {
              type: "button",
              className: "flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-white",
              "data-testid": `explorer-search-result-file-${toTestIdSegment(result.path)}`,
              onClick: () => {
                void this.handleFilePathSelect(result.path, true);
              }
            }, [
              createElement("span", {
                className: `material-symbols-outlined text-[18px] ${readExplorerLanguageTheme(result.path).accentClassName}`
              }, [readExplorerFileIcon(result.path)]),
              createElement("div", {
                className: "min-w-0 flex-1"
              }, [
                createElement("p", {
                  className: "truncate text-sm font-medium text-white"
                }, [result.name]),
                createElement("p", {
                  className: "truncate text-xs text-text-secondary"
                }, [result.path])
              ]),
              createElement("span", {
                className: "rounded border border-border-dark bg-[#1d232c] px-2 py-0.5 text-[11px] text-text-secondary"
              }, [`${countExplorerSearchMatches(result)} matches`])
            ]),
            this.renderSearchResultActionButton({
              title: isExplorerSearchResultCollapsed(
                this.state.collapsedSearchResultPaths,
                result.path
              )
                ? "Expand result group"
                : "Collapse result group",
              icon: isExplorerSearchResultCollapsed(
                this.state.collapsedSearchResultPaths,
                result.path
              )
                ? "chevron_right"
                : "expand_more",
              testId: `explorer-search-result-toggle-${toTestIdSegment(result.path)}`,
              onClick: (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.setState({
                  collapsedSearchResultPaths: collapseExplorerSearchResultPath(
                    this.state.collapsedSearchResultPaths,
                    result.path
                  )
                });
              }
            }),
            this.renderSearchResultActionButton({
              title: "Hide result group",
              icon: "close",
              testId: `explorer-search-result-hide-${toTestIdSegment(result.path)}`,
              onClick: (event: Event) => {
                event.preventDefault();
                event.stopPropagation();
                this.setState({
                  hiddenSearchResultPaths: hideExplorerSearchResultPath(
                    this.state.hiddenSearchResultPaths,
                    result.path
                  ),
                  collapsedSearchResultPaths: this.state.collapsedSearchResultPaths.filter(
                    (entry) => entry !== result.path
                  )
                });
              }
            })
          ]),
          isExplorerSearchResultCollapsed(this.state.collapsedSearchResultPaths, result.path)
            ? ""
            : createElement("div", { className: "flex flex-col" }, [
                result.matches.map((match) => this.renderSearchResultMatch(result, match))
              ])
        ])
      )
    ]);
  }

  private renderSearchResultActionButton(input: {
    title: string;
    icon: string;
    testId: string;
    onClick: (event: Event) => void;
  }): HTMLElement {
    return createElement("button", {
      type: "button",
      title: input.title,
      "data-testid": input.testId,
      className: "flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-[#242b34] hover:text-white",
      onClick: (event: Event) => input.onClick(event)
    }, [
      createElement("span", {
        className: "material-symbols-outlined text-[16px]"
      }, [input.icon])
    ]);
  }

  private renderPreviewRangeStatus(): HTMLElement {
    return createElement("span", {
      className: "rounded border border-border-dark bg-[#11161d] px-2 py-1 text-xs text-text-secondary",
      "data-testid": "explorer-preview-range"
    }, [
      `${this.state.selectedFileStartLine}-${this.state.selectedFileEndLine} / ${this.state.selectedFileTotalLines}`
    ]);
  }

  private renderPreviewLoadHint(): HTMLElement {
    if (!this.state.selectedFileTruncated) {
      return createElement("div", {});
    }

    return createElement("div", {
      className: "flex items-center gap-2 border-b border-border-dark bg-[#131922] px-4 py-2"
    }, [
      createElement("span", {
        className: "text-xs text-text-secondary"
      }, ["Large file preview"]),
      createElement("span", {
        className: "text-xs text-slate-400"
      }, ["Scroll to load more lines"])
    ]);
  }

  private renderSearchResultMatch(
    result: ExplorerFileSearchResultRecord,
    match: ExplorerFileSearchResultRecord["matches"][number]
  ): HTMLElement {
    return createElement("button", {
      type: "button",
      key: `${result.path}:${match.lineNumber}`,
      className: "grid w-full grid-cols-[56px_minmax(0,1fr)] gap-2 px-3 py-2 text-left transition-colors hover:bg-[#202733]",
      "data-testid": `explorer-search-result-match-${toTestIdSegment(result.path)}-${match.lineNumber}`,
      onClick: () => {
        void this.handleFilePathSelect(result.path, true, match.lineNumber);
      }
    }, [
      createElement("span", {
        className: "text-xs text-text-secondary"
      }, [String(match.lineNumber)]),
      createElement("span", {
        className: "min-w-0 whitespace-pre-wrap break-words font-mono text-xs text-slate-200"
      }, renderSearchMatchFragments(match.lineText, match.ranges))
    ]);
  }

  private renderEditorSurface(selectedFile: ExplorerSelectedFile | null): HTMLElement {
    if (this.state.currentProject === null) {
      return createElement("section", {
        className: "flex min-h-0 flex-1 items-center justify-center bg-[#0f141b] p-8"
      }, [
        createElement("div", { className: "flex max-w-md flex-col gap-4" }, [
          createElement(EmptyStatePanel, {
            icon: "article",
            title: this.state.pendingAction === ExplorerPendingAction.Open
              ? "Connecting workspace"
              : "Explorer preview unavailable",
            description: this.state.pendingAction === ExplorerPendingAction.Open
              ? "The active project session is being reopened through the server API."
              : "Use the global project selector in the sidebar or the Projects screen before opening files."
          }),
          createElement("div", { className: "flex justify-center" }, [
            createElement(Button, {
              variant: "secondary",
              onClick: () => router.navigate(ROUTES.PROJECTS),
              children: "Open project"
            })
          ])
        ])
      ]);
    }

    if (!selectedFile) {
      return createElement("section", {
        className: "flex min-h-0 flex-1 flex-col bg-[#0f141b]"
      }, [
        this.renderEditorTabsBar(),
        createElement("div", {
          className: "flex flex-1 items-center justify-center p-8"
        }, [
          createElement(EmptyStatePanel, {
            icon: "description",
            title: "Select a file",
            description: "Use Explorer to browse the tree or Search to look inside files and open a result in the editor."
          })
        ])
      ]);
    }

    const theme = readExplorerLanguageTheme(selectedFile.path);
    const highlightedLines = highlightExplorerFileContent(
      selectedFile.path,
      this.state.selectedFileContent
    );
    const isLoading =
      this.state.pendingAction === ExplorerPendingAction.File &&
      this.state.activePath === selectedFile.path;

    return createElement("section", {
      className: "flex min-h-0 flex-1 flex-col bg-[#0f141b]"
    }, [
      this.renderEditorTabsBar(),
      createElement("div", {
        className: "flex items-center gap-3 border-b border-border-dark bg-[#131922] px-4 py-2"
      }, [
        createElement("div", {
          className: "flex min-w-0 items-center gap-2"
        }, [
          createElement("span", {
            className: `material-symbols-outlined text-[18px] ${theme.accentClassName}`
          }, [readExplorerFileIcon(selectedFile.path)]),
          createElement("span", {
            className: "truncate text-sm text-white"
          }, [selectedFile.name])
        ]),
        createElement("div", {
          className: "ml-auto flex items-center gap-2"
        }, [
          createElement("span", {
            className: `rounded border px-2 py-1 text-xs ${theme.badgeClassName} ${theme.accentClassName}`,
            "data-testid": "explorer-language-badge"
          }, [theme.label]),
          this.renderPreviewRangeStatus(),
          createElement("span", {
            className: "rounded border border-border-dark bg-[#11161d] px-2 py-1 text-xs text-text-secondary"
          }, ["Read only"])
        ])
      ]),
      createElement("div", {
        className: "border-b border-border-dark bg-[#11161d] px-4 py-2 text-xs text-text-secondary"
      }, [selectedFile.path]),
      createElement("div", {
        className: `min-h-0 flex-1 overflow-auto ${theme.surfaceClassName}`,
        "data-testid": "explorer-preview-surface",
        onScroll: (event: Event) => {
          void this.handlePreviewSurfaceScroll(event);
        }
      }, [
        isLoading
          ? createElement("div", {
              className: "flex h-full items-center justify-center px-6 py-10 text-sm text-text-secondary"
            }, ["Loading file content..."])
          : createElement("div", {
              className: "flex min-h-full flex-col"
            }, [
              this.renderPreviewLoadHint(),
              this.renderHighlightedFileContent(highlightedLines)
            ])
      ])
    ]);
  }

  private renderEditorTabsBar(): HTMLElement {
    return createElement("div", {
      className: "flex min-w-0 items-center gap-3 overflow-hidden border-b border-border-dark bg-[#181c22] px-3 py-2",
      "data-testid": ExplorerSelector.TabsBarTestId
    }, [
      this.state.isCompactViewport
        ? createElement(Button, {
            variant: "ghost",
            size: "sm",
            onClick: () => this.setCompactPanelView(this.state.activeSidebarSection),
            children: "Panels"
          })
        : "",
      this.state.openFiles.length === 0
        ? createElement("span", {
            className: "rounded border border-border-dark bg-[#11161d] px-3 py-1 text-sm text-text-secondary"
          }, ["No file selected"])
        : createElement("div", {
            className: "relative flex h-10 w-0 flex-1 overflow-x-auto overflow-y-hidden",
            "data-testid": ExplorerSelector.TabsScrollSurfaceTestId
          }, [
            createElement("div", {
              className: "flex min-w-max items-stretch"
            }, [
              this.state.openFiles.map((openFile) => this.renderEditorTab(openFile))
            ])
          ])
    ]);
  }

  private renderEditorTab(openFile: ExplorerOpenFile): HTMLElement {
    const selected = this.state.selectedFilePath === openFile.path;
    const selectedFile = readSelectedFileRecord(openFile.path);
    const theme = readExplorerLanguageTheme(openFile.path);
    const isContextMenuOpen = this.state.openTabContextMenuPath === openFile.path;

    return createElement("div", {
      key: `editor-tab-${openFile.path}`,
      className: `relative flex shrink-0 items-center border-r border-border-dark ${
        selected ? "bg-[#0f141b]" : "bg-[#181c22]"
      }`
    }, [
      createElement("button", {
        type: "button",
        className: `flex h-10 min-w-0 shrink-0 items-center gap-2 px-3 py-0 text-sm transition-colors ${
          selected
            ? "text-white"
            : "text-slate-300 hover:bg-[#1f2630] hover:text-white"
        }`,
        "data-testid": `explorer-tab-${toTestIdSegment(openFile.path)}`,
        onClick: () => {
          void this.handleFilePathSelect(openFile.path, false);
        },
        onContextMenu: (event: Event) => this.handleTabContextMenu(event, openFile.path)
      }, [
        createElement("span", {
          className: `material-symbols-outlined text-[16px] ${theme.accentClassName}`
        }, [readExplorerFileIcon(openFile.path)]),
        createElement("span", {
          className: "max-w-[180px] truncate"
        }, [selectedFile?.name ?? openFile.path]),
        openFile.pinned
          ? createElement("span", {
              className: "material-symbols-outlined text-[14px] text-amber-300"
            }, ["keep"])
          : ""
      ]),
      createElement("button", {
        type: "button",
        title: "Close file",
        className: "mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-[#242b34] hover:text-white",
        "data-testid": `explorer-tab-close-${toTestIdSegment(openFile.path)}`,
        onClick: () => {
          void this.handleTabMenuAction(ExplorerTabMenuAction.Close, openFile.path);
        }
      }, [
        createElement("span", {
          className: "material-symbols-outlined text-[16px]"
        }, ["close"])
      ]),
      isContextMenuOpen ? this.renderTabContextMenu(openFile) : ""
    ]);
  }

  private renderTabContextMenu(openFile: ExplorerOpenFile): HTMLElement {
    return createElement("div", {
      className: "absolute left-0 top-full z-20 mt-1 flex min-w-[180px] flex-col rounded border border-border-dark bg-[#11161d] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.35)]",
      "data-testid": ExplorerSelector.TabContextMenuTestId
    }, [
      this.renderTabContextMenuAction(
        openFile.pinned ? "Unpin" : "Pin",
        openFile.pinned ? ExplorerTabMenuAction.Unpin : ExplorerTabMenuAction.Pin,
        openFile.path
      ),
      this.renderTabContextMenuAction("Close", ExplorerTabMenuAction.Close, openFile.path),
      this.renderTabContextMenuAction("Close to the left", ExplorerTabMenuAction.CloseLeft, openFile.path),
      this.renderTabContextMenuAction("Close to the right", ExplorerTabMenuAction.CloseRight, openFile.path),
      this.renderTabContextMenuAction("Close all", ExplorerTabMenuAction.CloseAll, openFile.path)
    ]);
  }

  private renderTabContextMenuAction(
    label: string,
    action: ExplorerTabMenuAction,
    path: string
  ): HTMLElement {
    return createElement("button", {
      type: "button",
      className: "flex w-full items-center px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-[#202733]",
      onClick: () => {
        void this.handleTabMenuAction(action, path);
      }
    }, [label]);
  }

  private renderHighlightedFileContent(
    highlightedLines: ReadonlyArray<ReadonlyArray<ExplorerHighlightToken>>
  ): HTMLElement {
    return createElement("table", {
      className: "w-full border-collapse font-mono text-sm leading-6",
      "data-testid": "explorer-file-content"
    }, [
      createElement("tbody", {}, [
        highlightedLines.map((line, index) =>
          {
            const lineNumber = this.state.selectedFileStartLine + index;
            const isHighlighted = this.state.highlightedLineNumber === lineNumber;
            return createElement("tr", {
              key: `explorer-line-${lineNumber}`,
              className: `align-top hover:bg-white/[0.02] ${isHighlighted ? "bg-amber-300/10" : ""}`,
              style: isHighlighted
                ? "animation: explorer-line-flash 1.1s ease-out;"
                : undefined,
              "data-line-number": String(lineNumber),
              "data-testid": isHighlighted
                ? "explorer-highlighted-line"
                : `explorer-line-${lineNumber}`
            }, [
              createElement("td", {
                className: `w-14 select-none border-r border-white/5 bg-black/10 px-3 text-right text-xs ${isHighlighted ? "text-amber-200" : "text-slate-500"}`
              }, [String(lineNumber)]),
              createElement("td", {
                className: `px-4 py-0.5 ${isHighlighted ? "bg-amber-300/[0.08]" : ""}`,
                style: "white-space: pre-wrap; overflow-wrap: anywhere;"
              }, [
                line.map((token, tokenIndex) =>
                  createElement("span", {
                    key: `explorer-token-${lineNumber}-${tokenIndex}`,
                    className: readExplorerTokenClassName(token.kind),
                    "data-token-kind": token.kind
                  }, [token.text.length > 0 ? token.text : " "])
                )
              ])
            ]);
          }
        )
      ])
    ]);
  }

  private renderStatusBar(selectedFile: ExplorerSelectedFile | null): HTMLElement {
    const searchCount = this.state.searchResults.reduce(
      (total, result) => total + countExplorerSearchMatches(result),
      0
    );

    return createElement("footer", {
      className: "flex items-center gap-4 border-t border-border-dark bg-[#007acc] px-3 py-1 text-xs text-white"
    }, [
      createElement("span", { className: "font-medium" }, [
        this.state.currentProject?.name ?? "No project"
      ]),
      selectedFile
        ? createElement("span", { className: "truncate text-white/90" }, [selectedFile.path])
        : "",
      this.state.searchQuery.trim().length > 0
        ? createElement("span", { className: "ml-auto text-white/90" }, [
            `${searchCount} matches`
          ])
        : createElement("span", { className: "ml-auto text-white/90" }, [
            this.state.activeSidebarSection === ExplorerSidebarSection.Search
              ? "Search ready"
              : "Explorer ready"
          ])
    ]);
  }

  private async handleOpenProject(silent: boolean): Promise<void> {
    if (this.state.sessionRootPath.trim().length === 0) {
      if (!silent) {
        this.setState({
          errorMessage: "Open a project from the Projects screen before using Explorer.",
          noticeMessage: null
        });
      }
      return;
    }

    this.setState({
      pendingAction: ExplorerPendingAction.Open,
      activePath: null,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const project = await this.explorerClient.openProject({
        rootPath: this.state.sessionRootPath,
        ...(this.state.sessionProjectName.trim().length > 0
          ? { name: this.state.sessionProjectName }
          : {})
      });
      const entries = await this.explorerClient.listFileTree({
        projectId: project.id
      });
      const nextTreeNodes = buildExplorerTreeNodes(entries);
      const workspaceState = readExplorerWorkspaceState(project.rootPath);
      const nextOpenFiles = workspaceState.openFiles;
      const nextActiveFilePath = resolveNextExplorerActiveFilePath(
        nextOpenFiles,
        workspaceState.activeFilePath
      );

      this.setState({
        currentProject: project,
        treeNodes: nextTreeNodes,
        openFiles: nextOpenFiles,
        selectedFilePath: nextActiveFilePath,
        ...createEmptyExplorerFileViewState(),
        highlightedLineNumber: null,
        openTabContextMenuPath: null,
        pendingAction: null,
        activePath: null,
        errorMessage: null,
        noticeMessage: silent ? null : `${project.name} loaded in Explorer.`
      });

      if (nextActiveFilePath) {
        await this.loadWorkspaceActiveFile(
          project,
          nextActiveFilePath,
          nextOpenFiles,
          true,
          nextTreeNodes
        );
      }
    } catch (error: unknown) {
      this.setState({
        currentProject: null,
        treeNodes: [],
        openFiles: [],
        selectedFilePath: null,
        ...createEmptyExplorerFileViewState(),
        highlightedLineNumber: null,
        openTabContextMenuPath: null,
        pendingAction: null,
        activePath: null,
        errorMessage: readErrorMessage(error, "Unable to open the current project session."),
        noticeMessage: null
      });
    }
  }

  private async handleRefreshProject(): Promise<void> {
    if (this.state.currentProject === null && this.state.sessionRootPath.trim().length === 0) {
      this.setState({
        errorMessage: "No project session is available to refresh.",
        noticeMessage: null
      });
      return;
    }

    this.setState({
      pendingAction: ExplorerPendingAction.Refresh,
      activePath: null,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const project =
        this.state.currentProject ??
        await this.explorerClient.openProject({
          rootPath: this.state.sessionRootPath,
          ...(this.state.sessionProjectName.trim().length > 0
            ? { name: this.state.sessionProjectName }
            : {})
        });
      const entries = await this.explorerClient.listFileTree({
        projectId: project.id
      });

      this.setState({
        currentProject: project,
        treeNodes: buildExplorerTreeNodes(entries),
        openFiles: this.state.openFiles,
        pendingAction: null,
        activePath: null,
        errorMessage: null,
        noticeMessage: "Explorer tree reloaded."
      });

      if (this.state.selectedFilePath) {
        await this.reloadSelectedFile(project.id, this.state.selectedFilePath);
      }
    } catch (error: unknown) {
      this.setState({
        pendingAction: null,
        activePath: null,
        errorMessage: readErrorMessage(error, "Unable to refresh Explorer."),
        noticeMessage: null
      });
    }
  }

  private handleSidebarSectionClick(section: ExplorerSidebarSection): void {
    if (
      this.state.activeSidebarSection === section &&
      this.state.isSidebarVisible &&
      !this.state.isCompactViewport
    ) {
      this.setState({
        isSidebarVisible: false
      });
      return;
    }

    this.setState({
      activeSidebarSection: section,
      isSidebarVisible: true,
      compactView: this.state.isCompactViewport
        ? ExplorerCompactView.Panel
        : this.state.compactView
    });
  }

  private handleSidebarHide(): void {
    this.setState({
      isSidebarVisible: false,
      compactView: this.state.isCompactViewport
        ? ExplorerCompactView.Editor
        : this.state.compactView
    });
  }

  private setCompactPanelView(section: ExplorerSidebarSection): void {
    this.setState({
      activeSidebarSection: section,
      isSidebarVisible: true,
      compactView: ExplorerCompactView.Panel
    });
  }

  private async handleExpandAllDirectories(): Promise<void> {
    if (this.state.currentProject === null) {
      return;
    }

    this.setState({
      pendingAction: ExplorerPendingAction.ExpandAll,
      activePath: null,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      this.searchRevision += 1;
      const completeTree = await this.loadCompleteTree(
        this.state.currentProject.id,
        this.state.treeNodes,
        this.searchRevision
      );

      this.setState({
        treeNodes: setExplorerTreeExpansion(completeTree, true),
        pendingAction: null,
        activePath: null,
        errorMessage: null,
        noticeMessage: null,
        activeSidebarSection: ExplorerSidebarSection.Explorer,
        isSidebarVisible: true,
        compactView: this.state.isCompactViewport
          ? ExplorerCompactView.Panel
          : this.state.compactView
      });
    } catch (error: unknown) {
      this.setState({
        pendingAction: null,
        activePath: null,
        errorMessage: readErrorMessage(error, "Unable to expand the repository tree."),
        noticeMessage: null
      });
    }
  }

  private handleCollapseAllDirectories(): void {
    this.setState({
      treeNodes: setExplorerTreeExpansion(this.state.treeNodes, false),
      errorMessage: null,
      noticeMessage: null,
      activeSidebarSection: ExplorerSidebarSection.Explorer,
      isSidebarVisible: true,
      compactView: this.state.isCompactViewport
        ? ExplorerCompactView.Panel
        : this.state.compactView
    });
  }

  private handleSearchInput(input: SearchInputState): void {
    this.searchDraftValue = input.value;
    this.searchSelectionStart = input.selectionStart;
    this.searchSelectionEnd = input.selectionEnd;
    this.searchShouldRestoreFocus = true;
    this.queueSearch(input.value, this.state.searchSettings);
  }

  private handleSearchSettingToggle(key: ExplorerSearchSettingKey): void {
    const nextSearchSettings = {
      ...this.state.searchSettings,
      [key]: !this.state.searchSettings[key]
    };

    this.setState({
      searchSettings: nextSearchSettings,
      activeSidebarSection: ExplorerSidebarSection.Search,
      isSidebarVisible: true,
      compactView: this.state.isCompactViewport
        ? ExplorerCompactView.Panel
        : this.state.compactView
    });

    if (this.searchDraftValue.trim().length > 0) {
      this.queueSearch(this.searchDraftValue, nextSearchSettings);
    }
  }

  private queueSearch(
    value: string,
    settings: ExplorerSearchSettings
  ): void {
    this.searchRevision += 1;
    this.clearSearchDebounce();

    if (value.trim().length === 0) {
      this.setState({
        searchQuery: "",
        searchResults: [],
        collapsedSearchResultPaths: [],
        hiddenSearchResultPaths: [],
        searchIsLoading: false,
        errorMessage: null
      });
      return;
    }

    const revision = this.searchRevision;
    this.searchDebounceId = window.setTimeout(() => {
      void this.applySearchDebounce(value, revision, settings);
    }, SearchDebounceMs);
  }

  private async applySearchDebounce(
    value: string,
    revision: number,
    settings: ExplorerSearchSettings
  ): Promise<void> {
    const query = value.trim();
    const shouldRestoreFocus = this.searchShouldRestoreFocus || this.isSearchInputFocused();
    const selectionStart = this.searchSelectionStart;
    const selectionEnd = this.searchSelectionEnd;

    if (query.length === 0) {
      if (revision !== this.searchRevision) {
        return;
      }

      this.setState({
        searchQuery: "",
        searchResults: [],
        collapsedSearchResultPaths: [],
        hiddenSearchResultPaths: [],
        searchIsLoading: false,
        errorMessage: null
      });
      this.searchDebounceId = null;
      return;
    }

    if (this.state.currentProject === null) {
      if (revision !== this.searchRevision) {
        return;
      }

      this.setState({
        searchQuery: query,
        searchResults: [],
        collapsedSearchResultPaths: [],
        hiddenSearchResultPaths: [],
        searchIsLoading: false
      });
      this.searchDebounceId = null;
      return;
    }

    try {
      this.setState({
        searchQuery: query,
        searchIsLoading: true,
        errorMessage: null
      });
      const results = await this.explorerClient.searchFiles({
        projectId: this.state.currentProject.id,
        query,
        isRegex: settings.isRegex,
        matchCase: settings.matchCase,
        wholeWord: settings.wholeWord
      });

      if (revision !== this.searchRevision) {
        return;
      }

      this.setState({
        searchQuery: query,
        searchResults: results,
        collapsedSearchResultPaths: [],
        hiddenSearchResultPaths: [],
        searchIsLoading: false,
        errorMessage: null
      });
    } catch (error: unknown) {
      if (revision !== this.searchRevision) {
        return;
      }

      this.setState({
        searchQuery: query,
        searchResults: [],
        collapsedSearchResultPaths: [],
        hiddenSearchResultPaths: [],
        searchIsLoading: false,
        errorMessage: readErrorMessage(error, "Unable to search the workspace.")
      });
    } finally {
      if (revision === this.searchRevision) {
        if (shouldRestoreFocus) {
          requestAnimationFrame(() => {
            this.restoreSearchInputFocus(selectionStart, selectionEnd);
          });
        }
        this.searchShouldRestoreFocus = false;
        this.searchDebounceId = null;
      }
    }
  }

  private async handleDirectorySelect(node: ExplorerTreeNode): Promise<void> {
    if (this.state.currentProject === null) {
      return;
    }

    const treeScrollTop = this.readTreeScrollTop();

    if (node.loaded) {
      this.setState({
        treeNodes: toggleExplorerDirectory(this.state.treeNodes, node.path),
        noticeMessage: null,
        errorMessage: null,
        activeSidebarSection: ExplorerSidebarSection.Explorer,
        isSidebarVisible: true,
        compactView: this.state.isCompactViewport
          ? ExplorerCompactView.Panel
          : this.state.compactView
      });
      this.scheduleTreeScrollRestore(treeScrollTop);
      return;
    }

    this.setState({
      pendingAction: ExplorerPendingAction.Directory,
      activePath: node.path,
      errorMessage: null,
      noticeMessage: null,
      activeSidebarSection: ExplorerSidebarSection.Explorer,
      isSidebarVisible: true,
      compactView: this.state.isCompactViewport
        ? ExplorerCompactView.Panel
        : this.state.compactView
    });

    try {
      const entries = await this.explorerClient.listFileTree({
        projectId: this.state.currentProject.id,
        path: node.path
      });

      this.setState({
        treeNodes: mergeExplorerDirectoryChildren(this.state.treeNodes, node.path, entries),
        pendingAction: null,
        activePath: null,
        errorMessage: null,
        noticeMessage: null
      });
      this.scheduleTreeScrollRestore(treeScrollTop);
    } catch (error: unknown) {
      this.setState({
        pendingAction: null,
        activePath: null,
        errorMessage: readErrorMessage(error, `Unable to open ${node.path}.`),
        noticeMessage: null
      });
    }
  }

  private async handleFilePathSelect(
    path: string,
    revealInTree: boolean,
    targetLineNumber?: number
  ): Promise<void> {
    if (this.state.currentProject === null || path.trim().length === 0) {
      return;
    }

    const nextOpenFiles = openExplorerFile(this.state.openFiles, path);
    const treeScrollTop = !revealInTree ? this.readTreeScrollTop() : null;

    this.setState({
      pendingAction: ExplorerPendingAction.File,
      activePath: path,
      openFiles: nextOpenFiles,
      selectedFilePath: path,
      ...createEmptyExplorerFileViewState(),
      openTabContextMenuPath: null,
      errorMessage: null,
      noticeMessage: null
    });
    if (treeScrollTop !== null) {
      this.scheduleTreeScrollRestore(treeScrollTop);
    }

    try {
      const file = await this.explorerClient.readFile({
        projectId: this.state.currentProject.id,
        path,
        ...createExplorerFileReadWindow(targetLineNumber)
      });

      const nextTreeNodes = revealInTree
        ? await this.revealTreePath(this.state.currentProject.id, this.state.treeNodes, path)
        : this.state.treeNodes;

      this.setState({
        treeNodes: nextTreeNodes,
        openFiles: nextOpenFiles,
        selectedFilePath: path,
        ...readExplorerFileViewState(file),
        highlightedLineNumber: targetLineNumber ?? null,
        pendingAction: null,
        activePath: null,
        errorMessage: null,
        noticeMessage: null,
        compactView: this.state.isCompactViewport
          ? ExplorerCompactView.Editor
          : this.state.compactView
      });
      this.persistWorkspaceState(nextOpenFiles, path);
      requestAnimationFrame(() => {
        this.scrollEditorTabIntoView(path);
      });
      if (treeScrollTop !== null) {
        this.scheduleTreeScrollRestore(treeScrollTop);
      }
      this.scheduleLineHighlight(targetLineNumber);
      if (targetLineNumber) {
        requestAnimationFrame(() => {
          this.scrollEditorLineIntoView(targetLineNumber);
        });
      }
    } catch (error: unknown) {
      this.setState({
        pendingAction: null,
        activePath: null,
        errorMessage: readErrorMessage(error, `Unable to read ${path}.`),
        noticeMessage: null
      });
    }
  }

  private async reloadSelectedFile(projectId: string, path: string): Promise<void> {
    try {
      const file = await this.explorerClient.readFile({
        projectId,
        path,
        ...createExplorerTopPreviewWindow()
      });

      this.setState({
        ...readExplorerFileViewState(file),
        selectedFilePath: path,
        highlightedLineNumber: null
      });
    } catch {
      this.setState({
        selectedFilePath: null,
        ...createEmptyExplorerFileViewState(),
        highlightedLineNumber: null
      });
    }
  }

  private async revealTreePath(
    projectId: string,
    nodes: ReadonlyArray<ExplorerTreeNode>,
    path: string
  ): Promise<ReadonlyArray<ExplorerTreeNode>> {
    const segments = path.split("/").slice(0, -1);
    let nextNodes = nodes;
    let currentPath = "";

    for (const segment of segments) {
      currentPath = currentPath.length > 0 ? `${currentPath}/${segment}` : segment;
      let directory = findExplorerNodeByPath(nextNodes, currentPath);

      if (!directory || directory.kind !== ExplorerFileEntryKind.Directory) {
        return nextNodes;
      }

      if (!directory.loaded) {
        const entries = await this.explorerClient.listFileTree({
          projectId,
          path: currentPath
        });
        nextNodes = mergeExplorerDirectoryChildren(nextNodes, currentPath, entries);
        directory = findExplorerNodeByPath(nextNodes, currentPath);
        if (!directory || directory.kind !== ExplorerFileEntryKind.Directory) {
          return nextNodes;
        }
      }

      nextNodes = setExplorerDirectoryExpanded(nextNodes, currentPath, true);
    }

    return nextNodes;
  }

  private async loadCompleteTree(
    projectId: string,
    nodes: ReadonlyArray<ExplorerTreeNode>,
    revision: number
  ): Promise<ReadonlyArray<ExplorerTreeNode>> {
    const loadedNodes: ExplorerTreeNode[] = [];

    for (const node of nodes) {
      if (revision !== this.searchRevision) {
        return nodes;
      }

      loadedNodes.push(await this.loadCompleteNode(projectId, node, revision));
    }

    return loadedNodes;
  }

  private async loadCompleteNode(
    projectId: string,
    node: ExplorerTreeNode,
    revision: number
  ): Promise<ExplorerTreeNode> {
    if (node.kind !== ExplorerFileEntryKind.Directory) {
      return node;
    }

    if (revision !== this.searchRevision) {
      return node;
    }

    const childEntries = node.loaded
      ? node.children
      : buildExplorerTreeNodes(
          await this.explorerClient.listFileTree({
            projectId,
            path: node.path
          })
        );
    const loadedChildren: ExplorerTreeNode[] = [];

    for (const child of childEntries) {
      loadedChildren.push(await this.loadCompleteNode(projectId, child, revision));
    }

    return {
      ...node,
      loaded: true,
      children: loadedChildren
    };
  }

  private clearSearchDebounce(): void {
    if (this.searchDebounceId !== null) {
      window.clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }
  }

  private clearLineHighlight(): void {
    if (this.lineHighlightTimeoutId !== null) {
      window.clearTimeout(this.lineHighlightTimeoutId);
      this.lineHighlightTimeoutId = null;
    }
  }

  private async handleTabMenuAction(
    action: ExplorerTabMenuAction,
    path: string
  ): Promise<void> {
    if (action === ExplorerTabMenuAction.Pin) {
      this.handleTabPinState(path, true);
      return;
    }

    if (action === ExplorerTabMenuAction.Unpin) {
      this.handleTabPinState(path, false);
      return;
    }

    const nextOpenFiles = readNextOpenFilesFromTabAction(this.state.openFiles, action, path);
    const nextActiveFilePath = readNextActivePathFromTabAction(
      nextOpenFiles,
      this.state.selectedFilePath,
      path
    );

    this.setState({
      openFiles: nextOpenFiles,
      selectedFilePath: nextActiveFilePath,
      ...(nextActiveFilePath === this.state.selectedFilePath
        ? readExplorerFileViewState({
            content: this.state.selectedFileContent,
            startLine: this.state.selectedFileStartLine,
            endLine: this.state.selectedFileEndLine,
            totalLines: this.state.selectedFileTotalLines,
            truncated: this.state.selectedFileTruncated
          })
        : createEmptyExplorerFileViewState()),
      highlightedLineNumber: null,
      openTabContextMenuPath: null
    });
    this.persistWorkspaceState(nextOpenFiles, nextActiveFilePath);

    if (
      nextActiveFilePath &&
      nextActiveFilePath !== this.state.selectedFilePath &&
      this.state.currentProject
    ) {
      await this.loadWorkspaceActiveFile(
        this.state.currentProject,
        nextActiveFilePath,
        nextOpenFiles,
        false
      );
    }
  }

  private handleTabPinToggle(path: string): void {
    const nextPinnedState = !this.state.openFiles.find((entry) => entry.path === path)?.pinned;
    this.handleTabPinState(path, nextPinnedState);
  }

  private handleTabPinState(path: string, pinned: boolean): void {
    const nextOpenFiles = setExplorerFilePinned(this.state.openFiles, path, pinned);
    this.setState({
      openFiles: nextOpenFiles,
      openTabContextMenuPath: null
    });
    this.persistWorkspaceState(nextOpenFiles, this.state.selectedFilePath);
  }

  private handleTabContextMenu(event: Event, path: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.setState({
      openTabContextMenuPath: path
    });
  }

  private readonly handleViewportResize = (): void => {
    const isCompactViewport = readIsCompactViewport();
    if (isCompactViewport === this.state.isCompactViewport) {
      return;
    }

    this.setState({
      isCompactViewport,
      compactView: isCompactViewport
        ? this.state.selectedFilePath
          ? ExplorerCompactView.Editor
          : ExplorerCompactView.Panel
        : this.state.compactView,
      isSidebarVisible: isCompactViewport ? true : this.state.isSidebarVisible
    });
  };

  private isSearchInputFocused(): boolean {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLInputElement &&
      activeElement.dataset["testid"] === ExplorerSelector.SearchInputTestId;
  }

  private restoreSearchInputFocus(
    selectionStart: number | null,
    selectionEnd: number | null
  ): void {
    const input = document.querySelector(
      `[data-testid="${ExplorerSelector.SearchInputTestId}"]`
    );
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.focus();
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  private searchQueryOrDraft(): string {
    return this.searchDraftValue.length > 0 ? this.searchDraftValue : this.state.searchQuery;
  }

  private readonly handleWindowClick = (): void => {
    if (this.state.openTabContextMenuPath === null) {
      return;
    }

    this.setState({
      openTabContextMenuPath: null
    });
  };

  private persistWorkspaceState(
    openFiles: ReadonlyArray<ExplorerOpenFile>,
    activeFilePath: string | null
  ): void {
    const rootPath = this.state.currentProject?.rootPath ?? this.state.sessionRootPath;
    if (rootPath.trim().length === 0) {
      return;
    }

    writeExplorerWorkspaceState(rootPath, {
      openFiles,
      activeFilePath
    });
  }

  private async loadWorkspaceActiveFile(
    project: ProjectRecord,
    path: string,
    openFiles: ReadonlyArray<ExplorerOpenFile>,
    revealInTree: boolean,
    baseTreeNodes?: ReadonlyArray<ExplorerTreeNode>
  ): Promise<void> {
    try {
      const file = await this.explorerClient.readFile({
        projectId: project.id,
        path,
        ...createExplorerTopPreviewWindow()
      });
      const nextTreeNodes = revealInTree
        ? await this.revealTreePath(project.id, baseTreeNodes ?? this.state.treeNodes, path)
        : baseTreeNodes ?? this.state.treeNodes;

      this.setState({
        treeNodes: nextTreeNodes,
        openFiles,
        selectedFilePath: path,
        ...readExplorerFileViewState(file),
        highlightedLineNumber: null
      });
      this.persistWorkspaceState(openFiles, path);
      requestAnimationFrame(() => {
        this.scrollEditorTabIntoView(path);
      });
    } catch {
      const nextOpenFiles = closeExplorerOpenFile(openFiles, path);
      const nextActiveFilePath = resolveNextExplorerActiveFilePath(nextOpenFiles, path);

      this.setState({
        openFiles: nextOpenFiles,
        selectedFilePath: nextActiveFilePath,
        ...createEmptyExplorerFileViewState(),
        highlightedLineNumber: null
      });
      this.persistWorkspaceState(nextOpenFiles, nextActiveFilePath);
    }
  }

  private async handlePreviewSurfaceScroll(_event: Event): Promise<void> {
    if (
      this.previewLoadDirection !== null ||
      this.state.currentProject === null ||
      this.state.selectedFilePath === null
    ) {
      return;
    }

    const surface = this.readPreviewSurfaceElement();
    if (!(surface instanceof HTMLElement)) {
      return;
    }

    const distanceToTop = surface.scrollTop;
    const maxScrollTop = Math.max(0, surface.scrollHeight - surface.clientHeight);
    const scrollProgress = maxScrollTop > 0
      ? surface.scrollTop / maxScrollTop
      : 0;

    if (distanceToTop <= ExplorerPreviewLoadThresholdPx) {
      await this.loadPreviewWindow(ExplorerPreviewLoadDirection.Previous);
      return;
    }

    if (scrollProgress >= ExplorerPreviewBottomLoadProgressRatio) {
      await this.loadPreviewWindow(ExplorerPreviewLoadDirection.Next);
    }
  }

  private async loadPreviewWindow(
    direction: ExplorerPreviewLoadDirection
  ): Promise<void> {
    if (this.state.currentProject === null || this.state.selectedFilePath === null) {
      return;
    }

    const window = readExplorerPreviewWindowRequest(
      {
        content: this.state.selectedFileContent,
        startLine: this.state.selectedFileStartLine,
        endLine: this.state.selectedFileEndLine,
        totalLines: this.state.selectedFileTotalLines,
        truncated: this.state.selectedFileTruncated
      },
      direction,
      ExplorerPreviewLineCount
    );
    if (window === null) {
      return;
    }

    const previousMetrics = this.readPreviewSurfaceMetrics();
    this.previewLoadDirection = direction;

    try {
      const file = await this.explorerClient.readFile({
        projectId: this.state.currentProject.id,
        path: this.state.selectedFilePath,
        ...window
      });
      const mergedWindow = mergeExplorerPreviewWindow(
        {
          content: this.state.selectedFileContent,
          startLine: this.state.selectedFileStartLine,
          endLine: this.state.selectedFileEndLine,
          totalLines: this.state.selectedFileTotalLines,
          truncated: this.state.selectedFileTruncated
        },
        file,
        direction
      );

      this.setState({
        ...readExplorerFileViewState({
          content: mergedWindow.content,
          startLine: mergedWindow.startLine,
          endLine: mergedWindow.endLine,
          totalLines: mergedWindow.totalLines,
          truncated: mergedWindow.truncated
        }),
        highlightedLineNumber: this.state.highlightedLineNumber
      });
      this.schedulePreviewScrollRestore(previousMetrics, direction);
    } catch (error: unknown) {
      this.setState({
        errorMessage: readErrorMessage(error, `Unable to read ${this.state.selectedFilePath}.`),
        noticeMessage: null
      });
    } finally {
      this.previewLoadDirection = null;
    }
  }

  private scheduleLineHighlight(lineNumber: number | undefined): void {
    this.clearLineHighlight();
    if (!lineNumber) {
      return;
    }

    this.lineHighlightTimeoutId = window.setTimeout(() => {
      const scrollPosition = this.readPreviewScrollPosition();
      this.setState({
        highlightedLineNumber: null
      });
      requestAnimationFrame(() => {
        this.restorePreviewScrollPosition(scrollPosition);
      });
      this.lineHighlightTimeoutId = null;
    }, ExplorerLineHighlightDurationMs);
  }

  private scrollEditorLineIntoView(lineNumber: number): void {
    const lineElement = document.querySelector(
      `[data-line-number="${lineNumber}"]`
    );
    if (!(lineElement instanceof HTMLElement)) {
      return;
    }

    lineElement.scrollIntoView({
      block: "center",
      inline: "nearest"
    });
  }

  private scrollEditorTabIntoView(path: string): void {
    const tab = document.querySelector(
      `[data-testid="explorer-tab-${toTestIdSegment(path)}"]`
    );
    const surface = document.querySelector(
      `[data-testid="${ExplorerSelector.TabsScrollSurfaceTestId}"]`
    );
    if (!(tab instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
      return;
    }

    const tabLeft = tab.offsetLeft;
    const tabRight = tabLeft + tab.offsetWidth;
    const surfaceLeft = surface.scrollLeft;
    const surfaceRight = surfaceLeft + surface.clientWidth;

    if (tabLeft < surfaceLeft) {
      surface.scrollLeft = tabLeft;
      return;
    }

    if (tabRight > surfaceRight) {
      surface.scrollLeft = tabRight - surface.clientWidth;
    }
  }

  private readTreeScrollTop(): number {
    const treeSurface = document.querySelector(
      `[data-testid="${ExplorerSelector.TreeSurfaceTestId}"]`
    );
    if (!(treeSurface instanceof HTMLElement)) {
      return 0;
    }

    return treeSurface.scrollTop;
  }

  private scheduleTreeScrollRestore(scrollTop: number): void {
    const restore = (): void => {
      this.restoreTreeScrollTop(scrollTop);
    };

    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(() => {
        restore();
      });
    });
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 48);
  }

  private restoreTreeScrollTop(scrollTop: number): void {
    const treeSurface = document.querySelector(
      `[data-testid="${ExplorerSelector.TreeSurfaceTestId}"]`
    );
    if (!(treeSurface instanceof HTMLElement)) {
      return;
    }

    treeSurface.scrollTop = scrollTop;
  }

  private readPreviewScrollPosition(): {
    top: number;
    left: number;
  } {
    const previewSurface = this.readPreviewSurfaceElement();
    if (!(previewSurface instanceof HTMLElement)) {
      return {
        top: 0,
        left: 0
      };
    }

    return {
      top: previewSurface.scrollTop,
      left: previewSurface.scrollLeft
    };
  }

  private restorePreviewScrollPosition(position: {
    top: number;
    left: number;
  }): void {
    const previewSurface = this.readPreviewSurfaceElement();
    if (!(previewSurface instanceof HTMLElement)) {
      return;
    }

    previewSurface.scrollTop = position.top;
    previewSurface.scrollLeft = position.left;
  }

  private readPreviewSurfaceMetrics(): {
    top: number;
    left: number;
    scrollHeight: number;
  } {
    const previewSurface = this.readPreviewSurfaceElement();
    if (!(previewSurface instanceof HTMLElement)) {
      return {
        top: 0,
        left: 0,
        scrollHeight: 0
      };
    }

    return {
      top: previewSurface.scrollTop,
      left: previewSurface.scrollLeft,
      scrollHeight: previewSurface.scrollHeight
    };
  }

  private schedulePreviewScrollRestore(
    previousMetrics: {
      top: number;
      left: number;
      scrollHeight: number;
    },
    direction: ExplorerPreviewLoadDirection
  ): void {
    const restore = (): void => {
      if (direction === ExplorerPreviewLoadDirection.Previous) {
        this.restorePreviewScrollAfterPrepend(previousMetrics);
        return;
      }

      this.restorePreviewScrollPosition({
        top: previousMetrics.top,
        left: previousMetrics.left
      });
    };

    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(() => {
        restore();
      });
    });
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 48);
  }

  private restorePreviewScrollAfterPrepend(previousMetrics: {
    top: number;
    left: number;
    scrollHeight: number;
  }): void {
    const previewSurface = this.readPreviewSurfaceElement();
    if (!(previewSurface instanceof HTMLElement)) {
      return;
    }

    const scrollHeightDelta = previewSurface.scrollHeight - previousMetrics.scrollHeight;
    previewSurface.scrollTop = previousMetrics.top + scrollHeightDelta;
    previewSurface.scrollLeft = previousMetrics.left;
  }

  private readPreviewSurfaceElement(): Element | null {
    return document.querySelector('[data-testid="explorer-preview-surface"]');
  }
}

type ExplorerSelectedFile = {
  path: string;
  name: string;
};

type SearchInputState = {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

const createEmptyExplorerFileViewState = (): Pick<
  ExplorerState,
  | "selectedFileContent"
  | "selectedFileStartLine"
  | "selectedFileEndLine"
  | "selectedFileTotalLines"
  | "selectedFileTruncated"
> => ({
  selectedFileContent: "",
  selectedFileStartLine: 1,
  selectedFileEndLine: 1,
  selectedFileTotalLines: 1,
  selectedFileTruncated: false
});

const readExplorerFileViewState = (
  file: ExplorerFileContentRecord
): Pick<
  ExplorerState,
  | "selectedFileContent"
  | "selectedFileStartLine"
  | "selectedFileEndLine"
  | "selectedFileTotalLines"
  | "selectedFileTruncated"
> => ({
  selectedFileContent: file.content,
  selectedFileStartLine: file.startLine,
  selectedFileEndLine: file.endLine,
  selectedFileTotalLines: file.totalLines,
  selectedFileTruncated: file.truncated
});

const createExplorerTopPreviewWindow = (): {
  startLine: number;
  lineCount: number;
} => ({
  startLine: 1,
  lineCount: ExplorerPreviewLineCount
});

const createExplorerFileReadWindow = (
  targetLineNumber?: number
): {
  startLine: number;
  lineCount: number;
} => {
  if (!targetLineNumber) {
    return createExplorerTopPreviewWindow();
  }

  return {
    startLine: Math.max(1, targetLineNumber - ExplorerPreviewContextRadius),
    lineCount: ExplorerPreviewLineCount
  };
};

const shouldShowExplorerSidebar = (state: ExplorerState): boolean => {
  if (!state.isSidebarVisible) {
    return false;
  }

  if (state.isCompactViewport && state.compactView === ExplorerCompactView.Editor) {
    return false;
  }

  return true;
};

const shouldShowExplorerEditor = (state: ExplorerState): boolean => {
  if (!state.isCompactViewport) {
    return true;
  }

  return state.compactView === ExplorerCompactView.Editor;
};

const readNodeIcon = (node: ExplorerTreeNode, isLoading: boolean): string => {
  if (isLoading) {
    return "progress_activity";
  }

  if (node.kind === ExplorerFileEntryKind.Directory) {
    return node.expanded ? "folder_open" : "folder";
  }

  return readExplorerFileIcon(node.path);
};

const findExplorerNodeByPath = (
  nodes: ReadonlyArray<ExplorerTreeNode>,
  path: string | null
): ExplorerTreeNode | null => {
  if (!path) {
    return null;
  }

  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }

    const child = findExplorerNodeByPath(node.children, path);
    if (child) {
      return child;
    }
  }

  return null;
};

const readNextOpenFilesFromTabAction = (
  openFiles: ReadonlyArray<ExplorerOpenFile>,
  action: ExplorerTabMenuAction,
  path: string
): ReadonlyArray<ExplorerOpenFile> => {
  if (action === ExplorerTabMenuAction.Close) {
    return closeExplorerOpenFile(openFiles, path);
  }

  if (action === ExplorerTabMenuAction.CloseLeft) {
    return closeExplorerFileTabsToLeft(openFiles, path);
  }

  if (action === ExplorerTabMenuAction.CloseRight) {
    return closeExplorerFileTabsToRight(openFiles, path);
  }

  if (action === ExplorerTabMenuAction.CloseAll) {
    return closeAllExplorerOpenFiles();
  }

  return openFiles;
};

const readNextActivePathFromTabAction = (
  nextOpenFiles: ReadonlyArray<ExplorerOpenFile>,
  currentActivePath: string | null,
  actionPath: string
): string | null => {
  if (nextOpenFiles.some((entry) => entry.path === currentActivePath)) {
    return currentActivePath;
  }

  return resolveNextExplorerActiveFilePath(
    nextOpenFiles,
    currentActivePath,
    actionPath
  );
};

const readSelectedFileRecord = (path: string | null): ExplorerSelectedFile | null => {
  if (!path) {
    return null;
  }

  const segments = path.split("/");
  const name = segments.at(-1);
  if (!name) {
    return null;
  }

  return {
    path,
    name
  };
};

const renderSearchMatchFragments = (
  lineText: string,
  ranges: ReadonlyArray<ExplorerFileSearchMatchRangeRecord>
): Array<HTMLElement> => {
  const segments: HTMLElement[] = [];
  let lastIndex = 0;

  for (const range of ranges) {
    if (range.start > lastIndex) {
      segments.push(
        createElement("span", {
          key: `search-fragment-${lastIndex}`,
          className: "text-slate-200"
        }, [lineText.slice(lastIndex, range.start)])
      );
    }

    segments.push(
      createElement("span", {
        key: `search-fragment-${range.start}-${range.end}`,
        className: "rounded bg-primary/20 text-primary"
      }, [lineText.slice(range.start, range.end)])
    );
    lastIndex = range.end;
  }

  if (lastIndex < lineText.length) {
    segments.push(
      createElement("span", {
        key: `search-fragment-tail-${lastIndex}`,
        className: "text-slate-200"
      }, [lineText.slice(lastIndex)])
    );
  }

  if (segments.length === 0) {
    return [
      createElement("span", {
        key: "search-fragment-empty",
        className: "text-slate-200"
      }, [lineText])
    ];
  }

  return segments;
};

const countExplorerSearchMatches = (
  result: ExplorerFileSearchResultRecord
): number =>
  result.matches.reduce((total, match) => total + match.ranges.length, 0);

const readSearchResultSummary = (
  query: string,
  results: ReadonlyArray<ExplorerFileSearchResultRecord>,
  isLoading: boolean
): string => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return "Search by file content or path.";
  }

  if (isLoading) {
    return `Searching for "${normalizedQuery}"...`;
  }

  const fileCount = results.length;
  const matchCount = results.reduce(
    (total, result) => total + countExplorerSearchMatches(result),
    0
  );

  return `${matchCount} matches in ${fileCount} files`;
};

const readSearchInputState = (event: Event): SearchInputState => {
  if (event.target instanceof HTMLInputElement) {
    return {
      value: event.target.value,
      selectionStart: event.target.selectionStart,
      selectionEnd: event.target.selectionEnd
    };
  }

  return {
    value: "",
    selectionStart: null,
    selectionEnd: null
  };
};

const readErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
};

const toTestIdSegment = (path: string): string =>
  path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();

const readIsCompactViewport = (): boolean =>
  typeof window !== "undefined" && window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH;
