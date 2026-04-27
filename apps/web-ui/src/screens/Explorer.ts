import { Button } from "../components/Button.js";
import {
  EmptyStatePanel,
  SectionPanel
} from "../components/WorkbenchPanels.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { ROUTES } from "../shared/constants.js";
import {
  createExplorerClient,
  ExplorerFileEntryKind,
} from "../shared/explorer-client.js";
import { readProjectSession } from "../shared/project-session.js";
import { router } from "../shared/Router.js";
import { readServerConnection } from "../shared/server-config.js";
import type { ProjectRecord } from "../shared/workbench-types.js";
import {
  buildExplorerTreeNodes,
  filterExplorerTreeNodes,
  flattenExplorerTreeNodes,
  mergeExplorerDirectoryChildren,
  readExplorerFileLanguage,
  toggleExplorerDirectory,
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

interface ExplorerState {
  sessionRootPath: string;
  sessionProjectName: string;
  currentProject: ProjectRecord | null;
  treeNodes: ReadonlyArray<ExplorerTreeNode>;
  searchTerm: string;
  selectedFilePath: string | null;
  selectedFileContent: string;
  selectedDirectoryPath: string | null;
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
      selectedDirectoryPath: null,
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
    const connection = readServerConnection();
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
      className: `mx-auto flex w-full max-w-[1480px] flex-col gap-6 p-6 ${this.props.className ?? ""}`
    }, [
      createElement("div", { className: "flex flex-col gap-2" }, [
        createElement("h1", { className: "text-3xl font-semibold text-white" }, ["Explorer"]),
        createElement("p", { className: "max-w-3xl text-sm leading-6 text-text-secondary" }, [
          "Browse the currently opened project through the server sandbox and inspect repository files in a read-only preview."
        ])
      ]),
      this.renderMessages(),
      createElement("div", { className: "grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]" }, [
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderSessionPanel(connection.serverUrl),
          this.renderTreePanel(visibleNodes)
        ]),
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderPreviewPanel(selectedNode)
        ])
      ])
    ]);
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

  private renderSessionPanel(serverUrl: string): HTMLElement {
    const currentProject = this.state.currentProject;
    const hasSession = this.state.sessionRootPath.length > 0;

    return createElement(SectionPanel, {
      title: "Project session",
      subtitle: `Server ${serverUrl}`,
      actions: createElement("div", { className: "flex items-center gap-2" }, [
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          onClick: () => router.navigate(ROUTES.PROJECTS),
          children: "Go to Projects"
        }),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          disabled: !hasSession || this.state.pendingAction === ExplorerPendingAction.Open || this.state.pendingAction === ExplorerPendingAction.Refresh,
          onClick: () => {
            void this.handleRefreshProject();
          },
          children: this.state.pendingAction === ExplorerPendingAction.Refresh ? "Refreshing" : "Reload"
        })
      ]),
      children: currentProject
        ? createElement("div", { className: "flex flex-col gap-4" }, [
            createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
              createElement("p", { className: "text-sm font-semibold text-white" }, [currentProject.name]),
              createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [currentProject.rootPath])
            ]),
            createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
              renderMetaCell("Project ID", currentProject.id.slice(0, 8)),
              renderMetaCell("Mode", "Read only")
            ])
          ])
        : hasSession
          ? createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary" }, [
              "The Explorer will reconnect to the current project session as soon as the project is reopened."
            ])
          : createElement(EmptyStatePanel, {
              icon: "folder_open",
              title: "No active project session",
              description: "Open a project from the Projects screen first. Explorer reuses that session instead of asking for a second project context."
            })
    });
  }

  private renderTreePanel(
    visibleNodes: ReadonlyArray<ReturnType<typeof flattenExplorerTreeNodes>[number]>
  ): HTMLElement {
    const currentProject = this.state.currentProject;

    return createElement(SectionPanel, {
      title: "Repository tree",
      subtitle: currentProject
        ? "Search the loaded tree and expand folders on demand."
        : "Requires an opened project session",
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        createElement("input", {
          type: "text",
          value: this.state.searchTerm,
          placeholder: "Search loaded files and folders",
          disabled: currentProject === null,
          "data-testid": "explorer-search-input",
          className: "h-10 rounded-lg border border-border-dark bg-background-dark/40 px-3 text-sm text-white placeholder-text-secondary disabled:cursor-not-allowed disabled:opacity-50",
          onChange: (event: Event) => this.handleSearchChange(readInputValue(event))
        }),
        currentProject === null
          ? createElement(EmptyStatePanel, {
              icon: "source",
              title: "Repository unavailable",
              description: "Open a project session before browsing the file tree."
            })
          : visibleNodes.length === 0
            ? createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary" }, [
                this.state.searchTerm.trim().length > 0
                  ? "No loaded files match the current search."
                  : "No files were returned by the server."
              ])
            : createElement("div", {
                className: "max-h-[720px] overflow-y-auto rounded-lg border border-border-dark bg-background-dark/30 py-2"
              }, [
                visibleNodes.map((item) => this.renderTreeNode(item.node, item.depth))
              ])
      ])
    });
  }

  private renderTreeNode(node: ExplorerTreeNode, depth: number): HTMLElement {
    const isDirectory = node.kind === ExplorerFileEntryKind.Directory;
    const isSelected = this.state.selectedFilePath === node.path;
    const isLoading = this.state.activePath === node.path && (
      this.state.pendingAction === ExplorerPendingAction.Directory ||
      this.state.pendingAction === ExplorerPendingAction.File
    );
    const paddingLeft = 16 + depth * 20;

    return createElement("button", {
      type: "button",
      key: node.path,
      "data-testid": `explorer-node-${toTestIdSegment(node.path)}`,
      className: `flex w-full items-center gap-2 border-r-2 px-4 py-2 text-left transition-colors ${
        isSelected
          ? "border-primary bg-primary/10 text-white"
          : "border-transparent text-text-secondary hover:bg-surface-dark-hover hover:text-white"
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
      createElement("span", {
        className: `material-symbols-outlined text-[18px] ${
          isSelected ? "text-primary" : isDirectory ? "text-primary" : "text-text-secondary"
        }`
      }, [readNodeIcon(node, isLoading)]),
      createElement("span", {
        className: `${isDirectory ? "font-medium" : "font-normal"} truncate text-sm`
      }, [node.name]),
      !isDirectory && isSelected
        ? createElement("span", {
            className: "ml-auto text-[10px] font-semibold uppercase tracking-wide text-primary"
          }, ["open"])
        : ""
    ]);
  }

  private renderPreviewPanel(selectedNode: ExplorerTreeNode | null): HTMLElement {
    const currentProject = this.state.currentProject;

    if (currentProject === null) {
      return createElement(EmptyStatePanel, {
        icon: "description",
        title: "Read-only preview unavailable",
        description: "Explorer needs the active project session before it can render any file content."
      });
    }

    if (!selectedNode || selectedNode.kind !== ExplorerFileEntryKind.File) {
      return createElement(EmptyStatePanel, {
        icon: "article",
        title: "Select a file",
        description: "Choose a file from the repository tree to load its content through the server API."
      });
    }

    const isLoading =
      this.state.pendingAction === ExplorerPendingAction.File &&
      this.state.activePath === selectedNode.path;

    return createElement(SectionPanel, {
      title: selectedNode.name,
      subtitle: selectedNode.path,
      actions: createElement("div", { className: "flex items-center gap-2" }, [
        createElement("span", {
          className: "rounded-md border border-border-dark bg-background-dark/40 px-2 py-1 text-xs text-text-secondary"
        }, [readExplorerFileLanguage(selectedNode.path)]),
        createElement("span", {
          className: "rounded-md border border-border-dark bg-background-dark/40 px-2 py-1 text-xs text-text-secondary"
        }, ["Read only"])
      ]),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-4 py-3 text-sm text-text-secondary" }, [
          "Editing is intentionally disabled in this slice. Explorer is wired for browsing and inspection only."
        ]),
        createElement("pre", {
          "data-testid": "explorer-file-content",
          className: "min-h-[680px] overflow-auto rounded-lg border border-border-dark bg-[#111418] p-4 font-mono text-sm leading-6 text-slate-100"
        }, [
          isLoading ? "Loading file content..." : this.state.selectedFileContent
        ])
      ])
    });
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
        selectedDirectoryPath: null,
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
        selectedDirectoryPath: null,
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
        selectedDirectoryPath: null,
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

  private handleSearchChange(value: string): void {
    this.setState({
      searchTerm: value
    });
  }

  private async handleDirectorySelect(node: ExplorerTreeNode): Promise<void> {
    if (this.state.currentProject === null) {
      return;
    }

    if (node.loaded) {
      this.setState({
        treeNodes: toggleExplorerDirectory(this.state.treeNodes, node.path),
        selectedDirectoryPath: node.path,
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
        selectedDirectoryPath: node.path,
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
}

const renderMetaCell = (label: string, value: string): HTMLElement =>
  createElement("div", {
    className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3"
  }, [
    createElement("p", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [label]),
    createElement("p", { className: "mt-1 text-sm font-semibold text-white" }, [value])
  ]);

const readNodeIcon = (node: ExplorerTreeNode, isLoading: boolean): string => {
  if (isLoading) {
    return "progress_activity";
  }

  if (node.kind === ExplorerFileEntryKind.Directory) {
    return node.expanded ? "folder_open" : "folder";
  }

  return "description";
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

const readInputValue = (event: Event): string => {
  if (event.target instanceof HTMLInputElement) {
    return event.target.value;
  }

  return "";
};

const readErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
};

const toTestIdSegment = (path: string): string =>
  path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
