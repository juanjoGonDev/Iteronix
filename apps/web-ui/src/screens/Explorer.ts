import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/WorkbenchPanels.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { ROUTES } from "../shared/constants.js";
import {
  createExplorerClient,
  ExplorerFileEntryKind
} from "../shared/explorer-client.js";
import { readProjectSession } from "../shared/project-session.js";
import { router } from "../shared/Router.js";
import type { ProjectRecord } from "../shared/workbench-types.js";
import {
  buildExplorerTreeNodes,
  filterExplorerTreeNodes,
  flattenExplorerTreeNodes,
  highlightExplorerFileContent,
  mergeExplorerDirectoryChildren,
  readExplorerFileIcon,
  readExplorerLanguageTheme,
  readExplorerTokenClassName,
  toggleExplorerDirectory,
  type ExplorerHighlightToken,
  type ExplorerTreeNode
} from "./explorer-state.js";

const ExplorerPendingAction = {
  Open: "open",
  Directory: "directory",
  File: "file",
  Refresh: "refresh"
} as const;

type ExplorerPendingAction =
  typeof ExplorerPendingAction[keyof typeof ExplorerPendingAction];

const ExplorerSelector = {
  SearchInputTestId: "explorer-search-input"
} as const;

const SearchDebounceMs = 320;

interface ExplorerState {
  sessionRootPath: string;
  sessionProjectName: string;
  currentProject: ProjectRecord | null;
  treeNodes: ReadonlyArray<ExplorerTreeNode>;
  searchTerm: string;
  selectedFilePath: string | null;
  selectedFileContent: string;
  pendingAction: ExplorerPendingAction | null;
  activePath: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

interface ExplorerProps extends ComponentProps {
  className?: string;
}

export class Explorer extends Component<ExplorerProps, ExplorerState> {
  private readonly explorerClient = createExplorerClient();
  private searchDebounceId: number | null = null;
  private searchDraftValue = "";
  private searchSelectionStart: number | null = null;
  private searchSelectionEnd: number | null = null;

  constructor(props: ExplorerProps = {}) {
    const session = readProjectSession();

    super(props, {
      sessionRootPath: session.projectRootPath,
      sessionProjectName: session.projectName,
      currentProject: null,
      treeNodes: [],
      searchTerm: "",
      selectedFilePath: null,
      selectedFileContent: "",
      pendingAction: null,
      activePath: null,
      errorMessage: null,
      noticeMessage: null
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
    const filteredTree = filterExplorerTreeNodes(this.state.treeNodes, this.state.searchTerm);
    const visibleNodes = flattenExplorerTreeNodes(
      filteredTree,
      this.state.searchTerm.trim().length > 0
    );
    const selectedNode = findExplorerNodeByPath(
      this.state.treeNodes,
      this.state.selectedFilePath
    );

    return createElement("div", {
      className: `mx-auto flex w-full max-w-[1580px] flex-col gap-6 p-6 ${this.props.className ?? ""}`
    }, [
      createElement("div", { className: "flex flex-col gap-2" }, [
        createElement("h1", { className: "text-3xl font-semibold text-white" }, ["Explorer"]),
        createElement("p", { className: "max-w-3xl text-sm leading-6 text-text-secondary" }, [
          "Browse the active workspace through the server sandbox from a single integrated view."
        ])
      ]),
      this.renderMessages(),
      this.renderWorkspace(visibleNodes, selectedNode)
    ]);
  }

  override onUnmount(): void {
    this.clearSearchDebounce();
  }

  private renderMessages(): HTMLElement {
    const { errorMessage, noticeMessage } = this.state;

    if (!errorMessage && !noticeMessage) {
      return createElement("div", {});
    }

    return createElement("div", { className: "flex flex-col gap-3" }, [
      errorMessage
        ? createElement("div", {
            className: "rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          }, [errorMessage])
        : "",
      noticeMessage
        ? createElement("div", {
            className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          }, [noticeMessage])
        : ""
    ]);
  }

  private renderWorkspace(
    visibleNodes: ReadonlyArray<ReturnType<typeof flattenExplorerTreeNodes>[number]>,
    selectedNode: ExplorerTreeNode | null
  ): HTMLElement {
    return createElement("div", {
      className: "grid min-h-[820px] overflow-hidden rounded-2xl border border-border-dark bg-surface-dark shadow-[0_30px_80px_rgba(6,10,16,0.32)] xl:grid-cols-[360px_minmax(0,1fr)]",
      "data-testid": "explorer-workspace"
    }, [
      createElement("aside", {
        className: "flex min-h-0 flex-col border-r border-border-dark bg-[#171c23]"
      }, [
        this.renderWorkspaceSidebarHeader(),
        this.renderTreeRegion(visibleNodes)
      ]),
      createElement("section", {
        className: "flex min-h-0 flex-col bg-[#0f141b]"
      }, [
        this.renderPreviewRegion(selectedNode)
      ])
    ]);
  }

  private renderWorkspaceSidebarHeader(): HTMLElement {
    const hasProject = this.state.currentProject !== null;
    const projectLabel = this.state.currentProject?.name ?? "No project selected";
    const projectPath = this.state.currentProject?.rootPath ?? "Use the global selector in the sidebar or open a project from Projects.";

    return createElement("div", {
      className: "flex flex-col gap-4 border-b border-border-dark px-4 py-4"
    }, [
      createElement("div", { className: "flex items-start justify-between gap-3" }, [
        createElement("div", { className: "min-w-0 flex-1" }, [
          createElement("p", {
            className: "text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary"
          }, ["Workspace explorer"]),
          createElement("p", {
            className: "mt-2 truncate text-sm font-semibold text-white",
            "data-testid": "explorer-project-name"
          }, [projectLabel]),
          createElement("p", {
            className: "mt-1 truncate text-xs text-text-secondary"
          }, [projectPath])
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          disabled: !hasProject || this.state.pendingAction === ExplorerPendingAction.Open || this.state.pendingAction === ExplorerPendingAction.Refresh,
          onClick: () => {
            void this.handleRefreshProject();
          },
          children:
            this.state.pendingAction === ExplorerPendingAction.Refresh
              ? "Refreshing"
              : "Reload"
        })
      ]),
      createElement("label", { className: "flex flex-col gap-2" }, [
        createElement("span", {
          className: "text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary"
        }, ["Search"]),
        createElement("input", {
          type: "text",
          value: this.searchDraftValue,
          placeholder: hasProject ? "Search loaded files and folders" : "Open a project to search",
          disabled: !hasProject,
          "data-testid": ExplorerSelector.SearchInputTestId,
          className: "h-11 rounded-xl border border-border-dark bg-[#0f141b] px-3 text-sm text-white placeholder-text-secondary focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          onInput: (event: Event) => this.handleSearchInput(readSearchInputState(event))
        })
      ])
    ]);
  }

  private renderTreeRegion(
    visibleNodes: ReadonlyArray<ReturnType<typeof flattenExplorerTreeNodes>[number]>
  ): HTMLElement {
    if (this.state.currentProject === null) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-5"
      }, [
        createElement(EmptyStatePanel, {
          icon: "folder_open",
          title: "No active project",
          description: "Select a project from the global sidebar button or open one from the Projects screen before browsing the repository."
        })
      ]);
    }

    if (visibleNodes.length === 0) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-5"
      }, [
        createElement("div", {
          className: "rounded-xl border border-dashed border-border-dark px-4 py-5 text-sm text-text-secondary"
        }, [
          this.state.searchTerm.trim().length > 0
            ? "No loaded files match the current search."
            : "No files were returned by the server."
        ])
      ]);
    }

    return createElement("div", {
      className: "flex min-h-0 flex-1 flex-col"
    }, [
      createElement("div", {
        className: "border-b border-border-dark px-4 py-3"
      }, [
        createElement("p", {
          className: "text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary"
        }, ["Files"])
      ]),
      createElement("div", {
        className: "min-h-0 flex-1 overflow-y-auto py-2"
      }, [
        visibleNodes.map((item) => this.renderTreeNode(item.node, item.depth))
      ])
    ]);
  }

  private renderTreeNode(node: ExplorerTreeNode, depth: number): HTMLElement {
    const isDirectory = node.kind === ExplorerFileEntryKind.Directory;
    const isSelected = this.state.selectedFilePath === node.path;
    const isLoading = this.state.activePath === node.path && (
      this.state.pendingAction === ExplorerPendingAction.Directory ||
      this.state.pendingAction === ExplorerPendingAction.File
    );
    const fileTheme = !isDirectory ? readExplorerLanguageTheme(node.path) : null;
    const paddingLeft = 14 + depth * 18;

    return createElement("button", {
      type: "button",
      key: node.path,
      "data-testid": `explorer-node-${toTestIdSegment(node.path)}`,
      className: `flex w-full items-center gap-2 border-r-2 px-4 py-2 text-left transition-colors ${
        isSelected
          ? "border-primary bg-primary/10 text-white"
          : "border-transparent text-text-secondary hover:bg-[#212934] hover:text-white"
      }`,
      style: `padding-left: ${paddingLeft}px`,
      onClick: () => {
        if (isDirectory) {
          void this.handleDirectorySelect(node);
          return;
        }

        void this.handleFileSelect(node);
      }
    }, [
      isDirectory
        ? createElement("span", {
            className: "material-symbols-outlined shrink-0 text-[16px] text-text-secondary"
          }, [node.expanded ? "expand_more" : "chevron_right"])
        : createElement("span", {
            className: "w-[16px] shrink-0"
          }),
      createElement("span", {
        className: `material-symbols-outlined shrink-0 text-[18px] ${
          isDirectory
            ? "text-primary"
            : fileTheme?.accentClassName ?? "text-text-secondary"
        }`
      }, [readNodeIcon(node, isLoading)]),
      createElement("span", {
        className: `${isDirectory ? "font-medium" : "font-normal"} truncate text-sm`
      }, [node.name]),
      !isDirectory && isSelected
        ? createElement("span", {
            className: "ml-auto rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
          }, ["open"])
        : ""
    ]);
  }

  private renderPreviewRegion(selectedNode: ExplorerTreeNode | null): HTMLElement {
    if (this.state.currentProject === null) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-8"
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

    if (!selectedNode || selectedNode.kind !== ExplorerFileEntryKind.File) {
      return createElement("div", {
        className: "flex flex-1 items-center justify-center p-8"
      }, [
        createElement(EmptyStatePanel, {
          icon: "description",
          title: "Select a file",
          description: "Choose a file from the repository tree to inspect its content in the read-only editor view."
        })
      ]);
    }

    const theme = readExplorerLanguageTheme(selectedNode.path);
    const highlightedLines = highlightExplorerFileContent(
      selectedNode.path,
      this.state.selectedFileContent
    );
    const isLoading =
      this.state.pendingAction === ExplorerPendingAction.File &&
      this.state.activePath === selectedNode.path;

    return createElement("div", {
      className: "flex min-h-0 flex-1 flex-col"
    }, [
      createElement("div", {
        className: "flex items-center gap-3 border-b border-border-dark bg-[#11161e] px-5 py-4"
      }, [
        createElement("span", {
          className: `material-symbols-outlined text-[18px] ${theme.accentClassName}`
        }, [readExplorerFileIcon(selectedNode.path)]),
        createElement("div", {
          className: "min-w-0 flex-1"
        }, [
          createElement("p", {
            className: "truncate text-sm font-semibold text-white"
          }, [selectedNode.name]),
          createElement("p", {
            className: "truncate text-xs text-text-secondary"
          }, [selectedNode.path])
        ]),
        createElement("span", {
          className: `rounded-md border px-2 py-1 text-xs ${theme.badgeClassName} ${theme.accentClassName}`,
          "data-testid": "explorer-language-badge"
        }, [theme.label]),
        createElement("span", {
          className: "rounded-md border border-border-dark bg-background-dark/40 px-2 py-1 text-xs text-text-secondary"
        }, ["Read only"])
      ]),
      createElement("div", {
        className: "border-b border-border-dark bg-[#0d1219] px-5 py-3 text-sm text-text-secondary"
      }, [
        "Editing is intentionally disabled in this slice. Explorer is focused on repository browsing and inspection."
      ]),
      createElement("div", {
        className: `min-h-0 flex-1 overflow-auto ${theme.surfaceClassName}`,
        "data-testid": "explorer-preview-surface"
      }, [
        isLoading
          ? createElement("div", {
              className: "flex h-full items-center justify-center px-6 py-10 text-sm text-text-secondary"
            }, ["Loading file content..."])
          : this.renderHighlightedFileContent(highlightedLines)
      ])
    ]);
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
          createElement("tr", {
            key: `explorer-line-${index + 1}`,
            className: "align-top hover:bg-white/[0.02]"
          }, [
            createElement("td", {
              className: "w-14 select-none border-r border-white/5 bg-black/10 px-3 text-right text-xs text-slate-500"
            }, [String(index + 1)]),
            createElement("td", {
              className: "px-4 py-0.5 whitespace-pre"
            }, [
              line.map((token, tokenIndex) =>
                createElement("span", {
                  key: `explorer-token-${index + 1}-${tokenIndex}`,
                  className: readExplorerTokenClassName(token.kind),
                  "data-token-kind": token.kind
                }, [token.text.length > 0 ? token.text : " "])
              )
            ])
          ])
        )
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

      this.setState({
        currentProject: project,
        treeNodes: buildExplorerTreeNodes(entries),
        selectedFilePath: null,
        selectedFileContent: "",
        pendingAction: null,
        activePath: null,
        errorMessage: null,
        noticeMessage: silent ? null : `${project.name} loaded in Explorer.`
      });
    } catch (error: unknown) {
      this.setState({
        currentProject: null,
        treeNodes: [],
        selectedFilePath: null,
        selectedFileContent: "",
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
      const project = this.state.currentProject ?? await this.explorerClient.openProject({
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

  private handleSearchInput(input: SearchInputState): void {
    this.searchDraftValue = input.value;
    this.searchSelectionStart = input.selectionStart;
    this.searchSelectionEnd = input.selectionEnd;
    this.clearSearchDebounce();
    this.searchDebounceId = window.setTimeout(() => {
      const shouldRestoreFocus = this.isSearchInputFocused();
      const selectionStart = this.searchSelectionStart;
      const selectionEnd = this.searchSelectionEnd;
      this.setState({
        searchTerm: input.value.toLowerCase()
      });
      if (shouldRestoreFocus) {
        requestAnimationFrame(() => {
          this.restoreSearchInputFocus(selectionStart, selectionEnd);
        });
      }
      this.searchDebounceId = null;
    }, SearchDebounceMs);
  }

  private async handleDirectorySelect(node: ExplorerTreeNode): Promise<void> {
    if (this.state.currentProject === null) {
      return;
    }

    if (node.loaded) {
      this.setState({
        treeNodes: toggleExplorerDirectory(this.state.treeNodes, node.path),
        noticeMessage: null,
        errorMessage: null
      });
      return;
    }

    this.setState({
      pendingAction: ExplorerPendingAction.Directory,
      activePath: node.path,
      errorMessage: null,
      noticeMessage: null
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
    } catch (error: unknown) {
      this.setState({
        pendingAction: null,
        activePath: null,
        errorMessage: readErrorMessage(error, `Unable to open ${node.path}.`),
        noticeMessage: null
      });
    }
  }

  private async handleFileSelect(node: ExplorerTreeNode): Promise<void> {
    if (this.state.currentProject === null) {
      return;
    }

    this.setState({
      pendingAction: ExplorerPendingAction.File,
      activePath: node.path,
      selectedFilePath: node.path,
      selectedFileContent: "",
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const file = await this.explorerClient.readFile({
        projectId: this.state.currentProject.id,
        path: node.path
      });

      this.setState({
        selectedFilePath: node.path,
        selectedFileContent: file.content,
        pendingAction: null,
        activePath: null,
        errorMessage: null,
        noticeMessage: null
      });
    } catch (error: unknown) {
      this.setState({
        pendingAction: null,
        activePath: null,
        errorMessage: readErrorMessage(error, `Unable to read ${node.path}.`),
        noticeMessage: null
      });
    }
  }

  private async reloadSelectedFile(projectId: string, path: string): Promise<void> {
    try {
      const file = await this.explorerClient.readFile({
        projectId,
        path
      });

      this.setState({
        selectedFileContent: file.content,
        selectedFilePath: path
      });
    } catch {
      this.setState({
        selectedFilePath: null,
        selectedFileContent: ""
      });
    }
  }

  private clearSearchDebounce(): void {
    if (this.searchDebounceId !== null) {
      window.clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }
  }

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
}

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

type SearchInputState = {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
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
