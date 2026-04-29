import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { Button } from "../components/Button.js";
import { StatusBadge } from "../components/Card.js";
import {
  PageFrame,
  PageIntro,
  PageNoticeStack
} from "../components/PageScaffold.js";
import {
  EmptyStatePanel,
  SectionPanel,
  renderWorkbenchMetaCell as renderMetaCell,
  renderWorkbenchTextField as renderInputField
} from "../components/WorkbenchPanels.js";
import {
  clearProjectSession,
  createProjectSessionStorage,
  writeProjectSession,
  type RecentProjectEntry
} from "../shared/project-session.js";
import { createGitClient } from "../shared/git-client.js";
import { createQualityGatesClient } from "../shared/quality-gates-client.js";
import { readServerConnection } from "../shared/server-config.js";
import {
  countSelectedGitEntries,
  DefaultSelectedGates,
  filterGitDiffByPath,
  GitStatusSection,
  GitWorkspaceAction,
  groupGitStatusEntries,
  mergeRunEvents,
  readGateExecutionState,
  readGitBranchValidationMessage,
  readGitCommitValidationMessage,
  readGitPublishValidationMessage,
  readGitPushValidationMessage,
  readGitSectionBulkAction,
  readGitSectionActions,
  readSelectedRun,
  readStreamingRunId,
  resolveGitFocusedPath,
  resolveGitDiffScope,
  resolveSelectedRunId,
  retainGitPathSelection,
  sortQualityGates,
  toggleGitPathSelection,
  type GateExecutionState
} from "./projects-state.js";
import type {
  GitBranchListRecord,
  GitCommitRecord,
  GitDiffRecord,
  GitDiffScope as GitDiffScopeValue,
  GitRepositoryRecord,
  ProjectRecord,
  QualityGateEventRecord,
  QualityGateRunRecord
} from "../shared/workbench-types.js";
import {
  GitDiffScope,
  QualityGateId,
  type QualityGateId as QualityGateKey
} from "../shared/workbench-types.js";

const PollIntervalMs = 2000;
const HistoryLimit = 20;

const PendingAction = {
  Open: "open",
  Run: "run",
  Refresh: "refresh"
} as const;

type PendingAction = typeof PendingAction[keyof typeof PendingAction];

const StreamState = {
  Idle: "idle",
  Live: "live"
} as const;

type StreamState = typeof StreamState[keyof typeof StreamState];

const GitPendingAction = {
  Refresh: "refresh",
  Diff: "diff",
  Commit: "commit",
  BranchCreate: "branch-create",
  BranchCheckout: "branch-checkout",
  BranchPublish: "branch-publish",
  BranchPush: "branch-push",
  Stage: GitWorkspaceAction.Stage,
  Unstage: GitWorkspaceAction.Unstage,
  Revert: GitWorkspaceAction.Revert
} as const;

type GitPendingAction = typeof GitPendingAction[keyof typeof GitPendingAction];

interface GitDiffState {
  staged: GitDiffRecord | null;
  unstaged: GitDiffRecord | null;
}

interface ProjectsScreenState {
  projectRootPath: string;
  projectName: string;
  currentProject: ProjectRecord | null;
  recentProjects: ReadonlyArray<RecentProjectEntry>;
  selectedGates: ReadonlyArray<QualityGateKey>;
  runs: ReadonlyArray<QualityGateRunRecord>;
  selectedRunId: string | null;
  selectedRunEvents: ReadonlyArray<QualityGateEventRecord>;
  pendingAction: PendingAction | null;
  streamState: StreamState;
  gitRepository: GitRepositoryRecord | null;
  gitBranches: GitBranchListRecord | null;
  gitDiffs: GitDiffState;
  selectedGitDiffScope: GitDiffScopeValue;
  selectedGitPaths: ReadonlyArray<string>;
  focusedGitDiffPath: string | null;
  gitBranchName: string;
  gitCommitMessage: string;
  gitPendingAction: GitPendingAction | null;
  gitPendingPath: string | null;
  lastGitCommit: GitCommitRecord | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

export class ProjectsScreen extends Component<ComponentProps, ProjectsScreenState> {
  private readonly gitClient = createGitClient();
  private readonly qualityGatesClient = createQualityGatesClient();
  private readonly projectSession = createProjectSessionStorage();
  private pollGeneration = 0;
  private streamAbortController: AbortController | null = null;
  private streamedRunId: string | null = null;

  constructor(props: ComponentProps = {}) {
    const session = createProjectSessionStorage().load();

    super(props, {
      projectRootPath: session.projectRootPath,
      projectName: session.projectName,
      currentProject: null,
      recentProjects: session.recentProjects,
      selectedGates: [...DefaultSelectedGates],
      runs: [],
      selectedRunId: null,
      selectedRunEvents: [],
      pendingAction: null,
      streamState: StreamState.Idle,
      gitRepository: null,
      gitBranches: null,
      gitDiffs: {
        staged: null,
        unstaged: null
      },
      selectedGitDiffScope: GitDiffScope.Staged,
      selectedGitPaths: [],
      focusedGitDiffPath: null,
      gitBranchName: "",
      gitCommitMessage: "",
      gitPendingAction: null,
      gitPendingPath: null,
      lastGitCommit: null,
      errorMessage: null,
      noticeMessage: null
    });

    if (session.projectRootPath.length > 0) {
      setTimeout(() => {
        void this.handleOpenProject(undefined, true);
      }, 0);
    }
  }

  override render(): HTMLElement {
    const connection = readServerConnection();

    return createElement(PageFrame, {}, [
      createElement(PageIntro, {
        title: "Projects",
        description: "Open a project inside the configured workspace, inspect Git status and diffs, create Conventional Commits, and follow quality gates from the same server-first screen."
      }),
      createElement(PageNoticeStack, {
        errorMessage: this.state.errorMessage,
        noticeMessage: this.state.noticeMessage
      }),
      createElement("div", { className: "grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]" }, [
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderProjectPanel(connection.serverUrl),
          this.renderGitWorkspacePanel(),
          this.renderGateLauncherPanel(),
          this.renderHistoryListPanel()
        ]),
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderGitReviewPanel(),
          this.renderRunSummaryPanel(),
          this.renderRunEventsPanel()
        ])
      ])
    ]);
  }

  private renderProjectPanel(serverUrl: string): HTMLElement {
    const currentProject = this.state.currentProject;

    return createElement(SectionPanel, {
      title: "Current project",
      subtitle: `Server ${serverUrl}`,
      actions: createElement("div", { className: "flex items-center gap-2" }, [
        currentProject
          ? createElement(Button, {
              variant: "ghost",
              size: "sm",
              onClick: () => this.handleClearProject(),
              children: "Clear"
            })
          : "",
        createElement(Button, {
          variant: "primary",
          size: "sm",
          disabled: this.state.pendingAction === PendingAction.Open,
          onClick: () => {
            void this.handleOpenProject();
          },
          children: this.state.pendingAction === PendingAction.Open ? "Opening" : "Open project"
        })
      ]),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        renderInputField({
          label: "Root path",
          value: this.state.projectRootPath,
          placeholder: "D:/projects/Iteronix",
          testId: "quality-gates-project-root",
          onChange: (value) => this.setState({ projectRootPath: value })
        }),
        renderInputField({
          label: "Display name",
          value: this.state.projectName,
          placeholder: "Optional",
          testId: "quality-gates-project-name",
          onChange: (value) => this.setState({ projectName: value })
        }),
        currentProject
          ? createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("div", { className: "flex flex-col gap-1" }, [
                  createElement("p", { className: "text-sm font-semibold text-white" }, [currentProject.name]),
                  createElement("p", { className: "text-xs text-text-secondary" }, [currentProject.rootPath])
                ]),
                createElement(StatusBadge, {
                  status: "success"
                }, ["opened"])
              ]),
              createElement("dl", { className: "mt-3 grid gap-3 sm:grid-cols-3" }, [
                renderMetaCell("Project ID", currentProject.id.slice(0, 8)),
                renderMetaCell("Opened", formatTimestamp(currentProject.updatedAt)),
                renderMetaCell("History", `${this.state.runs.length} runs`)
              ])
            ])
          : createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary" }, [
              "Open a project inside the server workspace before launching quality gates or Git actions."
            ]),
        this.state.recentProjects.length > 0
          ? createElement("div", { className: "flex flex-col gap-2" }, [
              createElement("p", { className: "text-xs uppercase tracking-wide text-text-secondary" }, ["Recent projects"]),
              createElement("div", { className: "flex flex-col gap-2" }, [
                this.state.recentProjects.map((project) =>
                  createElement("button", {
                    type: "button",
                    key: project.rootPath,
                    className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3 text-left transition-colors hover:bg-surface-dark-hover",
                    onClick: () => {
                      this.setState({
                        projectRootPath: project.rootPath,
                        projectName: project.name
                      });
                      void this.handleOpenProject(project);
                    }
                  }, [
                    createElement("p", { className: "truncate text-sm font-medium text-white" }, [project.name || project.rootPath]),
                    createElement("p", { className: "mt-1 truncate text-xs text-text-secondary" }, [project.rootPath])
                  ])
                )
              ])
            ])
          : ""
      ])
    });
  }

  private renderGitWorkspacePanel(): HTMLElement {
    const currentProject = this.state.currentProject;
    const repository = this.state.gitRepository;
    const branchValidationMessage = readGitBranchValidationMessage(
      this.state.gitBranchName,
      this.state.gitBranches
    );
    const pushValidationMessage = readGitPushValidationMessage(repository);
    const publishValidationMessage = readGitPublishValidationMessage(repository);

    return createElement(SectionPanel, {
      title: "Git workspace",
      subtitle: currentProject
        ? "Repository status comes from the server-side Git adapter."
        : "Requires an opened project",
      actions: createElement("div", { className: "flex items-center gap-2" }, [
        repository
          ? createElement(StatusBadge, {
              status: repository.clean ? "success" : "warning"
            }, [repository.clean ? "clean" : "changes"])
          : "",
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          disabled: currentProject === null || this.state.gitPendingAction === GitPendingAction.Refresh,
          onClick: () => {
            void this.refreshGitWorkspace(undefined, true);
          },
          children: this.state.gitPendingAction === GitPendingAction.Refresh ? "Refreshing" : "Refresh"
        })
      ]),
      children: currentProject === null
        ? createElement(EmptyStatePanel, {
            icon: "source",
            title: "No repository loaded",
            description: "Open a project inside the workspace to inspect staged and unstaged Git changes."
          })
        : repository === null
          ? createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary" }, [
              "Git status will load as soon as the project is opened."
            ])
          : renderGitWorkspaceContent({
              repository,
              branches: this.state.gitBranches,
              branchName: this.state.gitBranchName,
              branchValidationMessage,
              pushValidationMessage,
              publishValidationMessage,
              selectedPaths: this.state.selectedGitPaths,
              focusedPath: this.state.focusedGitDiffPath,
              pendingAction: this.state.gitPendingAction,
              pendingPath: this.state.gitPendingPath,
              onBranchNameChange: (value) => {
                this.setState({
                  gitBranchName: value
                });
              },
              onCreateBranch: () => {
                void this.handleCreateGitBranch();
              },
              onCheckoutBranch: (branchName) => {
                void this.handleCheckoutGitBranch(branchName);
              },
              onPublishBranch: () => {
                void this.handlePublishGitBranch();
              },
              onPushBranch: () => {
                void this.handlePushGitBranch();
              },
              onToggleSelection: (path) => this.handleGitSelectionToggle(path),
              onBulkAction: (section) => {
                void this.handleGitBulkAction(section);
              },
              onFocusDiff: (path, scope) => {
                void this.handleGitDiffFocus(path, scope);
              },
              onAction: (action, path) => {
                void this.handleGitWorkspaceAction(action, path);
              }
            })
    });
  }

  private renderGateLauncherPanel(): HTMLElement {
    const currentProject = this.state.currentProject;
    const selectedRun = readSelectedRun(this.state.runs, this.state.selectedRunId);
    const runDisabled =
      currentProject === null ||
      this.state.selectedGates.length === 0 ||
      this.state.pendingAction === PendingAction.Run;

    return createElement(SectionPanel, {
      title: "Quality gates",
      subtitle: currentProject
        ? `Launches against ${currentProject.name}`
        : "Requires an opened project",
      actions: createElement("div", { className: "flex items-center gap-2" }, [
        createElement(StatusBadge, {
          status: this.state.streamState === StreamState.Live ? "running" : "info"
        }, [this.state.streamState === StreamState.Live ? "live stream" : "polling"]),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          disabled: runDisabled,
          onClick: () => {
            void this.handleRunQualityGates();
          },
          children: this.state.pendingAction === PendingAction.Run ? "Starting" : "Run selected"
        })
      ]),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
          DefaultSelectedGates.map((gate) => renderGateToggle({
            gate,
            checked: this.state.selectedGates.includes(gate),
            onChange: () => this.toggleGate(gate)
          }))
        ]),
        createElement("div", { className: "flex flex-wrap gap-2" }, [
          createElement(Button, {
            variant: "secondary",
            size: "sm",
            onClick: () => this.setState({ selectedGates: [...DefaultSelectedGates] }),
            children: "Select all"
          }),
          createElement(Button, {
            variant: "ghost",
            size: "sm",
            onClick: () => this.setState({ selectedGates: [] }),
            children: "Clear selection"
          })
        ]),
        selectedRun
          ? createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("div", { className: "flex flex-col gap-1" }, [
                  createElement("p", { className: "text-sm font-semibold text-white" }, ["Latest run"]),
                  createElement("p", { className: "text-xs text-text-secondary" }, [formatTimestamp(selectedRun.updatedAt)])
                ]),
                renderRunStatusBadge(selectedRun.status)
              ]),
              createElement("div", { className: "mt-3 grid gap-3 sm:grid-cols-3" }, [
                renderMetaCell("Passed", `${selectedRun.passedCount}/${selectedRun.gates.length}`),
                renderMetaCell("Current", selectedRun.currentGate ?? "—"),
                renderMetaCell("Failed", selectedRun.failedGate ?? "—")
              ])
            ])
          : createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary" }, [
              "No quality gate runs recorded for this project yet."
            ])
      ])
    });
  }

  private renderHistoryListPanel(): HTMLElement {
    return createElement(SectionPanel, {
      title: "Run history",
      subtitle: this.state.currentProject
        ? "The list polls the server while the detail panel keeps events in sync."
        : "Open a project to load history",
      actions: createElement(Button, {
        variant: "secondary",
        size: "sm",
        disabled: this.state.currentProject === null || this.state.pendingAction === PendingAction.Refresh,
        onClick: () => {
          void this.refreshProjectRuns(true);
        },
        children: this.state.pendingAction === PendingAction.Refresh ? "Refreshing" : "Refresh"
      }),
      children: this.state.currentProject === null
        ? createElement(EmptyStatePanel, {
            icon: "folder_open",
            title: "No project opened",
            description: "Select a workspace root first. The run history is filtered per opened project."
          })
        : this.state.runs.length === 0
          ? createElement(EmptyStatePanel, {
              icon: "rule",
              title: "No runs yet",
              description: "Launch one or more quality gates to populate the project history."
            })
          : createElement("div", { className: "flex flex-col gap-3" }, [
              this.state.runs.map((run) => renderRunListItem({
                run,
                selected: run.id === this.state.selectedRunId,
                onClick: () => {
                  this.setState({
                    selectedRunId: run.id,
                    selectedRunEvents: []
                  });
                  void this.refreshSelectedRunEvents(run.id);
                  this.ensureRunStream(readStreamingRunId(this.state.runs, run.id));
                }
              }))
            ])
    });
  }

  private renderGitReviewPanel(): HTMLElement {
    const currentProject = this.state.currentProject;
    const repository = this.state.gitRepository;
    const selectedScope = resolveGitDiffScope(repository, this.state.selectedGitDiffScope);
    const activeDiff = readGitDiff(this.state.gitDiffs, selectedScope);
    const focusedPath = resolveGitFocusedPath(
      repository,
      selectedScope,
      this.state.focusedGitDiffPath
    );
    const validationMessage = readGitCommitValidationMessage(
      this.state.gitCommitMessage,
      repository
    );
    const hasSelectedDiff =
      repository !== null &&
      readGitDiffCount(repository, selectedScope) > 0;
    const visibleDiff = activeDiff
      ? filterGitDiffByPath(activeDiff.diff, focusedPath)
      : null;

    return createElement(SectionPanel, {
      title: "Git review",
      subtitle: currentProject
        ? "Inspect repository diffs and create a Conventional Commit from the server workspace."
        : "Requires an opened project",
      actions: createElement("div", { className: "flex items-center gap-2" }, [
        repository
          ? createElement(StatusBadge, {
              status: repository.stagedCount > 0 ? "running" : "info"
            }, [`${repository.stagedCount} staged`])
          : "",
        this.state.lastGitCommit
          ? createElement(StatusBadge, {
              status: "success"
            }, [this.state.lastGitCommit.hash.slice(0, 8)])
          : ""
      ]),
      children: currentProject === null
        ? createElement(EmptyStatePanel, {
            icon: "commit",
            title: "Git actions unavailable",
            description: "Open a project first. Diff loading and commit creation stay scoped to that project."
          })
        : createElement("div", { className: "flex flex-col gap-5" }, [
            createElement("div", { className: "flex flex-wrap items-center gap-2" }, [
                renderGitDiffScopeButton({
                  scope: GitDiffScope.Staged,
                  selected: selectedScope === GitDiffScope.Staged,
                  disabled: repository === null || repository.stagedCount === 0 || this.state.gitPendingAction === GitPendingAction.Diff,
                  count: repository?.stagedCount ?? 0,
                onClick: () => {
                  void this.loadGitDiff(GitDiffScope.Staged);
                }
              }),
              renderGitDiffScopeButton({
                scope: GitDiffScope.Unstaged,
                selected: selectedScope === GitDiffScope.Unstaged,
                disabled: repository === null || repository.unstagedCount === 0 || this.state.gitPendingAction === GitPendingAction.Diff,
                count: repository?.unstagedCount ?? 0,
                onClick: () => {
                  void this.loadGitDiff(GitDiffScope.Unstaged);
                }
              })
            ]),
            createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("div", { className: "flex flex-col gap-1" }, [
                  createElement("h3", { className: "text-sm font-semibold text-white" }, [
                    readGitDiffHeading(selectedScope)
                  ]),
                  createElement("p", { className: "text-xs text-text-secondary" }, [
                    hasSelectedDiff
                      ? readGitDiffDescription(selectedScope)
                      : `No ${selectedScope} diff is available for this project.`
                  ])
                ]),
                createElement(StatusBadge, {
                  status: this.state.gitPendingAction === GitPendingAction.Diff ? "running" : "info"
                }, [this.state.gitPendingAction === GitPendingAction.Diff ? "loading" : "ready"])
              ]),
              focusedPath
                ? createElement("div", { className: "mt-4 flex flex-wrap items-center gap-2" }, [
                    createElement(StatusBadge, {
                      status: "info"
                    }, ["file focus"]),
                    createElement("p", {
                      className: "text-xs text-text-secondary",
                      dataset: {
                        testid: "git-focused-path"
                      }
                    }, [
                      focusedPath
                    ]),
                    createElement(Button, {
                      variant: "ghost",
                      size: "sm",
                      onClick: () => this.setState({ focusedGitDiffPath: null }),
                      children: "Show scope diff"
                    })
                  ])
                : "",
              hasSelectedDiff && visibleDiff
                ? createElement("pre", {
                    className: "mt-4 overflow-x-auto rounded-lg border border-border-dark bg-[#11161f] px-4 py-4 font-mono text-xs leading-6 text-slate-200",
                    dataset: {
                      testid: "git-diff-output"
                    }
                  }, [visibleDiff])
                : createElement("div", {
                    className: "mt-4 rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary"
                  }, [
                    hasSelectedDiff
                      ? "Select a diff scope to load the current patch."
                      : `No ${selectedScope} diff is available.`
                  ]),
              repository !== null && repository.untrackedCount > 0
                ? createElement("p", { className: "mt-3 text-xs text-text-secondary" }, [
                    "Untracked files appear in repository status and do not produce an unstaged diff until they are added."
                  ])
                : ""
            ]),
            createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("div", { className: "flex flex-col gap-1" }, [
                  createElement("h3", { className: "text-sm font-semibold text-white" }, ["Create commit"]),
                  createElement("p", { className: "text-xs text-text-secondary" }, [
                    "The server enforces Conventional Commits. The UI validates the message before sending it."
                  ])
                ]),
                createElement(Button, {
                  variant: "primary",
                  size: "sm",
                  disabled: validationMessage !== null || this.state.gitPendingAction === GitPendingAction.Commit,
                  onClick: () => {
                    void this.handleCreateGitCommit();
                  },
                  children: this.state.gitPendingAction === GitPendingAction.Commit ? "Committing" : "Create commit"
                })
              ]),
              createElement("label", { className: "mt-4 flex flex-col gap-2" }, [
                createElement("span", { className: "text-sm font-medium text-white" }, ["Commit message"]),
                createElement("input", {
                  type: "text",
                  value: this.state.gitCommitMessage,
                  placeholder: "feat(projects): add git workspace panel",
                  className: "h-11 rounded-lg border border-border-dark bg-background-dark/40 px-3 text-sm text-white placeholder-text-secondary focus:border-primary focus:outline-none",
                  dataset: {
                    testid: "git-commit-message"
                  },
                  onChange: (event: Event) => {
                    const target = event.target;
                    if (target instanceof HTMLInputElement) {
                      this.setState({
                        gitCommitMessage: target.value
                      });
                    }
                  }
                })
              ]),
              createElement("p", {
                className: `mt-3 text-sm ${validationMessage ? "text-amber-300" : "text-text-secondary"}`
              }, [
                validationMessage ?? "Example: feat(projects): add git workspace panel"
              ])
            ])
          ])
    });
  }

  private renderRunSummaryPanel(): HTMLElement {
    const selectedRun = readSelectedRun(this.state.runs, this.state.selectedRunId);

    if (!selectedRun) {
      return createElement(EmptyStatePanel, {
        icon: "playlist_play",
        title: "Select a run",
        description: "Pick a quality gate run from the history list to inspect its progress, gate-by-gate outcome and timestamps."
      });
    }

    return createElement(SectionPanel, {
      title: "Run detail",
      subtitle: `${selectedRun.id.slice(0, 8)} • ${formatTimestamp(selectedRun.createdAt)}`,
      actions: renderRunStatusBadge(selectedRun.status),
      children: createElement("div", { className: "flex flex-col gap-5" }, [
        createElement("div", { className: "grid gap-3 md:grid-cols-4" }, [
          renderMetaCell("Passed", `${selectedRun.passedCount}/${selectedRun.gates.length}`),
          renderMetaCell("Current gate", selectedRun.currentGate ?? "—"),
          renderMetaCell("Failed gate", selectedRun.failedGate ?? "—"),
          renderMetaCell("Updated", formatTimestamp(selectedRun.updatedAt))
        ]),
        createElement("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" }, [
          selectedRun.gates.map((gate, index) =>
            renderGateStatusCell({
              gate,
              status: readGateExecutionState(selectedRun, gate, index)
            })
          )
        ])
      ])
    });
  }

  private renderRunEventsPanel(): HTMLElement {
    const selectedRun = readSelectedRun(this.state.runs, this.state.selectedRunId);

    if (!selectedRun) {
      return createElement(EmptyStatePanel, {
        icon: "notes",
        title: "Event detail pending",
        description: "Run or select a quality gate execution to inspect streamed stdout, stderr and completion markers."
      });
    }

    return createElement(SectionPanel, {
      title: "Event detail",
      subtitle: `${this.state.selectedRunEvents.length} event${this.state.selectedRunEvents.length === 1 ? "" : "s"} loaded`,
      actions: createElement(StatusBadge, {
        status: this.state.streamState === StreamState.Live ? "running" : "info"
      }, [this.state.streamState === StreamState.Live ? "SSE live" : "polling only"]),
      children: this.state.selectedRunEvents.length === 0
        ? createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary" }, [
            "No events recorded yet. If the run is still starting, wait for the stream or refresh cycle to populate this panel."
          ])
        : createElement("div", { className: "flex flex-col gap-3" }, [
            this.state.selectedRunEvents.map((event) => renderEventItem(event))
          ])
    });
  }

  private async handleOpenProject(
    recentProject?: RecentProjectEntry,
    silent = false
  ): Promise<void> {
    const rootPath = (recentProject?.rootPath ?? this.state.projectRootPath).trim();
    const projectName = (recentProject?.name ?? this.state.projectName).trim();

    if (rootPath.length === 0) {
      this.setState({
        errorMessage: "A project root path is required.",
        noticeMessage: null
      });
      return;
    }

    this.setState({
      pendingAction: PendingAction.Open,
      errorMessage: null,
      ...(silent ? {} : { noticeMessage: null })
    });

    try {
      const project = await this.qualityGatesClient.openProject({
        rootPath,
        ...(projectName.length > 0 ? { name: projectName } : {})
      });
      const recentState = this.projectSession.saveRecentProject({
        rootPath: project.rootPath,
        name: project.name
      });
      const session = writeProjectSession({
        projectRootPath: project.rootPath,
        projectName: project.name,
        recentProjects: recentState.recentProjects
      });

      this.stopRunStream();
      this.pollGeneration += 1;

      this.setState({
        projectRootPath: session.projectRootPath,
        projectName: session.projectName,
        currentProject: project,
        recentProjects: session.recentProjects,
        runs: [],
        selectedRunId: null,
        selectedRunEvents: [],
        pendingAction: null,
        streamState: StreamState.Idle,
        gitRepository: null,
        gitBranches: null,
        gitDiffs: {
          staged: null,
          unstaged: null
        },
        selectedGitDiffScope: GitDiffScope.Staged,
        selectedGitPaths: [],
        focusedGitDiffPath: null,
        gitBranchName: "",
        gitCommitMessage: "",
        gitPendingAction: null,
        gitPendingPath: null,
        lastGitCommit: null,
        errorMessage: null,
        ...(silent ? {} : { noticeMessage: `Project ${project.name} opened.` })
      });

      this.startProjectPolling(project.id);
      await Promise.all([
        this.refreshProjectRuns(false, project.id),
        this.refreshGitWorkspace(project.id, false)
      ]);
    } catch (error) {
      this.stopRunStream();
      this.pollGeneration += 1;
      this.setState({
        currentProject: null,
        runs: [],
        selectedRunId: null,
        selectedRunEvents: [],
        pendingAction: null,
        streamState: StreamState.Idle,
        gitRepository: null,
        gitBranches: null,
        gitDiffs: {
          staged: null,
          unstaged: null
        },
        selectedGitDiffScope: GitDiffScope.Staged,
        selectedGitPaths: [],
        focusedGitDiffPath: null,
        gitBranchName: "",
        gitCommitMessage: "",
        gitPendingAction: null,
        gitPendingPath: null,
        lastGitCommit: null,
        errorMessage: error instanceof Error ? error.message : "Could not open the project.",
        ...(silent ? {} : { noticeMessage: null })
      });
    }
  }

  private handleClearProject(): void {
    this.stopRunStream();
    this.pollGeneration += 1;
    const session = clearProjectSession();

    this.setState({
      projectRootPath: "",
      projectName: "",
      currentProject: null,
      recentProjects: session.recentProjects,
      runs: [],
      selectedRunId: null,
      selectedRunEvents: [],
      pendingAction: null,
      streamState: StreamState.Idle,
      gitRepository: null,
      gitBranches: null,
      gitDiffs: {
        staged: null,
        unstaged: null
      },
      selectedGitDiffScope: GitDiffScope.Staged,
      selectedGitPaths: [],
      focusedGitDiffPath: null,
      gitBranchName: "",
      gitCommitMessage: "",
      gitPendingAction: null,
      gitPendingPath: null,
      lastGitCommit: null,
      errorMessage: null,
      noticeMessage: "Project selection cleared."
    });
  }

  private async handleRunQualityGates(): Promise<void> {
    const currentProject = this.state.currentProject;
    if (!currentProject) {
      return;
    }

    if (this.state.selectedGates.length === 0) {
      this.setState({
        errorMessage: "Select at least one quality gate before launching a run.",
        noticeMessage: null
      });
      return;
    }

    this.setState({
      pendingAction: PendingAction.Run,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const run = await this.qualityGatesClient.runQualityGates({
        projectId: currentProject.id,
        gates: this.state.selectedGates
      });
      this.setState({
        runs: [run, ...this.state.runs.filter((item) => item.id !== run.id)],
        selectedRunId: run.id,
        selectedRunEvents: [],
        pendingAction: null,
        noticeMessage: "Quality gates launched.",
        errorMessage: null
      });

      this.ensureRunStream(run.id);
      await this.refreshSelectedRunEvents(run.id);
      await this.refreshProjectRuns(false);
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: error instanceof Error ? error.message : "Could not start the quality gates run.",
        noticeMessage: null
      });
    }
  }

  private async refreshProjectRuns(
    manual = false,
    projectIdOverride?: string
  ): Promise<void> {
    const projectId = projectIdOverride ?? this.state.currentProject?.id;
    if (!projectId) {
      return;
    }

    if (manual) {
      this.setState({
        pendingAction: PendingAction.Refresh,
        errorMessage: null
      });
    }

    try {
      const runs = await this.qualityGatesClient.listQualityGateRuns({
        projectId,
        limit: HistoryLimit
      });
      const selectedRunId = resolveSelectedRunId(this.state.selectedRunId, runs);
      const selectedRunEvents = selectedRunId
        ? await this.qualityGatesClient.listQualityGateEvents({
            runId: selectedRunId
          })
        : [];

      this.setState({
        runs,
        selectedRunId,
        selectedRunEvents,
        ...(manual
          ? {
              pendingAction: null,
              noticeMessage: "Run history refreshed.",
              errorMessage: null
            }
          : {
              pendingAction: this.state.pendingAction === PendingAction.Refresh ? null : this.state.pendingAction
            })
      });

      this.ensureRunStream(readStreamingRunId(runs, selectedRunId));
    } catch (error) {
      if (manual) {
        this.setState({
          pendingAction: null,
          errorMessage: error instanceof Error ? error.message : "Could not refresh the run history.",
          noticeMessage: null
        });
      }
    }
  }

  private async refreshSelectedRunEvents(runId: string): Promise<void> {
    try {
      const events = await this.qualityGatesClient.listQualityGateEvents({
        runId
      });

      if (this.state.selectedRunId === runId) {
        this.setState({
          selectedRunEvents: events
        });
      }
    } catch (error) {
      if (this.state.selectedRunId === runId) {
        this.setState({
          errorMessage: error instanceof Error ? error.message : "Could not load run events.",
          noticeMessage: null
        });
      }
    }
  }

  private async handleGitWorkspaceAction(
    action: GitWorkspaceAction,
    path: string
  ): Promise<void> {
    const currentProject = this.state.currentProject;
    if (!currentProject || this.state.gitPendingAction !== null) {
      return;
    }

    if (
      action === GitWorkspaceAction.Revert &&
      !window.confirm(readGitActionConfirmMessage(path))
    ) {
      return;
    }

    this.setState({
      gitPendingAction: action,
      gitPendingPath: path,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      if (action === GitWorkspaceAction.Stage) {
        await this.gitClient.stagePaths({
          projectId: currentProject.id,
          paths: [path]
        });
      } else if (action === GitWorkspaceAction.Unstage) {
        await this.gitClient.unstagePaths({
          projectId: currentProject.id,
          paths: [path]
        });
      } else {
        await this.gitClient.revertPaths({
          projectId: currentProject.id,
          paths: [path]
        });
      }

      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        noticeMessage: readGitActionSuccessMessage(action, path),
        errorMessage: null
      });

      await this.refreshGitWorkspace(currentProject.id, false);
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not update the Git workspace.",
        noticeMessage: null
      });
    }
  }

  private handleGitSelectionToggle(path: string): void {
    this.setState({
      selectedGitPaths: toggleGitPathSelection(this.state.selectedGitPaths, path)
    });
  }

  private async handleCreateGitBranch(): Promise<void> {
    const currentProject = this.state.currentProject;
    const validationMessage = readGitBranchValidationMessage(
      this.state.gitBranchName,
      this.state.gitBranches
    );
    if (!currentProject || validationMessage !== null || this.state.gitPendingAction !== null) {
      return;
    }

    const branchName = this.state.gitBranchName.trim();
    this.setState({
      gitPendingAction: GitPendingAction.BranchCreate,
      gitPendingPath: branchName,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const branch = await this.gitClient.createBranch({
        projectId: currentProject.id,
        branchName
      });

      this.setState({
        gitBranchName: "",
        gitPendingAction: null,
        gitPendingPath: null,
        noticeMessage: `Branch ${branch.name} created.`,
        errorMessage: null
      });

      await this.refreshGitWorkspace(currentProject.id, false);
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not create the branch.",
        noticeMessage: null
      });
    }
  }

  private async handleCheckoutGitBranch(branchName: string): Promise<void> {
    const currentProject = this.state.currentProject;
    if (!currentProject || this.state.gitPendingAction !== null) {
      return;
    }

    this.setState({
      gitPendingAction: GitPendingAction.BranchCheckout,
      gitPendingPath: branchName,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const branch = await this.gitClient.checkoutBranch({
        projectId: currentProject.id,
        branchName
      });

      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        noticeMessage: `Switched to branch ${branch.name}.`,
        errorMessage: null
      });

      await this.refreshGitWorkspace(currentProject.id, false);
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not checkout the branch.",
        noticeMessage: null
      });
    }
  }

  private async handlePublishGitBranch(): Promise<void> {
    const currentProject = this.state.currentProject;
    const repository = this.state.gitRepository;
    const validationMessage = readGitPublishValidationMessage(repository);
    if (!currentProject || !repository?.branch || validationMessage !== null || this.state.gitPendingAction !== null) {
      return;
    }

    this.setState({
      gitPendingAction: GitPendingAction.BranchPublish,
      gitPendingPath: repository.branch,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const branch = await this.gitClient.publishCurrentBranch({
        projectId: currentProject.id
      });

      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        noticeMessage: `Published branch ${branch.name} to ${branch.upstream ?? `origin/${branch.name}`}.`,
        errorMessage: null
      });

      await this.refreshGitWorkspace(currentProject.id, false);
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not publish the current branch.",
        noticeMessage: null
      });
    }
  }

  private async handlePushGitBranch(): Promise<void> {
    const currentProject = this.state.currentProject;
    const repository = this.state.gitRepository;
    const validationMessage = readGitPushValidationMessage(repository);
    if (!currentProject || !repository?.branch || validationMessage !== null || this.state.gitPendingAction !== null) {
      return;
    }

    this.setState({
      gitPendingAction: GitPendingAction.BranchPush,
      gitPendingPath: repository.branch,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const branch = await this.gitClient.pushCurrentBranch({
        projectId: currentProject.id
      });

      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        noticeMessage: `Pushed branch ${branch.name} to ${branch.upstream ?? repository.upstream ?? `origin/${branch.name}`}.`,
        errorMessage: null
      });

      await this.refreshGitWorkspace(currentProject.id, false);
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not push the current branch.",
        noticeMessage: null
      });
    }
  }

  private async handleGitBulkAction(
    section: GitStatusSection
  ): Promise<void> {
    const currentProject = this.state.currentProject;
    const repository = this.state.gitRepository;
    if (!currentProject || !repository || this.state.gitPendingAction !== null) {
      return;
    }

    const groups = groupGitStatusEntries(repository);
    const entries = readGitEntriesBySection(groups, section);
    const paths = entries
      .filter((entry) => this.state.selectedGitPaths.includes(entry.path))
      .map((entry) => entry.path);
    if (paths.length === 0) {
      return;
    }

    const action = readGitSectionBulkAction(section);
    this.setState({
      gitPendingAction: action,
      gitPendingPath: null,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      if (action === GitWorkspaceAction.Stage) {
        await this.gitClient.stagePaths({
          projectId: currentProject.id,
          paths
        });
      } else {
        await this.gitClient.unstagePaths({
          projectId: currentProject.id,
          paths
        });
      }

      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        noticeMessage: readGitBulkActionSuccessMessage(action, paths),
        errorMessage: null
      });

      await this.refreshGitWorkspace(currentProject.id, false);
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not update the Git workspace.",
        noticeMessage: null
      });
    }
  }

  private async handleGitDiffFocus(
    path: string,
    scope: GitDiffScopeValue
  ): Promise<void> {
    const repository = this.state.gitRepository;
    if (!repository) {
      return;
    }

    const focusedPath = resolveGitFocusedPath(repository, scope, path) ?? path;
    this.setState({
      focusedGitDiffPath: focusedPath
    });

    const diff = readGitDiff(this.state.gitDiffs, scope);
    if (this.state.selectedGitDiffScope !== scope || diff === null) {
      await this.loadGitDiff(scope);
    }
  }

  private async refreshGitWorkspace(
    projectIdOverride?: string,
    manual = false
  ): Promise<void> {
    const projectId = projectIdOverride ?? this.state.currentProject?.id;
    if (!projectId) {
      return;
    }

    if (manual) {
      this.setState({
        gitPendingAction: GitPendingAction.Refresh,
        gitPendingPath: null,
        errorMessage: null
      });
    }

    try {
      const [repository, branches] = await Promise.all([
        this.gitClient.getStatus({
          projectId
        }),
        this.gitClient.listBranches({
          projectId
        })
      ]);
      const selectedGitDiffScope = resolveGitDiffScope(
        repository,
        this.state.selectedGitDiffScope
      );
      const selectedGitPaths = retainGitPathSelection(
        this.state.selectedGitPaths,
        repository
      );
      const focusedGitDiffPath = resolveGitFocusedPath(
        repository,
        selectedGitDiffScope,
        this.state.focusedGitDiffPath
      );
      const nextDiffs: GitDiffState = {
        staged: repository.stagedCount > 0 ? this.state.gitDiffs.staged : null,
        unstaged: repository.unstagedCount > 0 ? this.state.gitDiffs.unstaged : null
      };

      this.setState({
        gitRepository: repository,
        gitBranches: branches,
        gitDiffs: nextDiffs,
        selectedGitDiffScope,
        selectedGitPaths,
        focusedGitDiffPath,
        gitPendingPath: null,
        gitPendingAction: manual ? null : this.state.gitPendingAction,
        ...(manual
          ? {
              noticeMessage: "Git status refreshed.",
              errorMessage: null
            }
          : {})
      });

      if (readGitDiffCount(repository, selectedGitDiffScope) > 0) {
        await this.loadGitDiff(selectedGitDiffScope, false, projectId);
      }
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not load Git status.",
        noticeMessage: null
      });
    }
  }

  private async loadGitDiff(
    scope: GitDiffScopeValue,
    manual = true,
    projectIdOverride?: string
  ): Promise<void> {
    const projectId = projectIdOverride ?? this.state.currentProject?.id;
    if (!projectId) {
      return;
    }

    const repository = this.state.gitRepository;
    if (!repository || readGitDiffCount(repository, scope) === 0) {
      this.setState({
        selectedGitDiffScope: scope,
        focusedGitDiffPath: resolveGitFocusedPath(
          repository,
          scope,
          this.state.focusedGitDiffPath
        ),
        gitDiffs: writeGitDiff(this.state.gitDiffs, scope, null),
        ...(manual
          ? {
              noticeMessage: null
            }
          : {})
      });
      return;
    }

    this.setState({
      selectedGitDiffScope: scope,
      focusedGitDiffPath: resolveGitFocusedPath(
        repository,
        scope,
        this.state.focusedGitDiffPath
      ),
      gitPendingAction: GitPendingAction.Diff,
      gitPendingPath: null,
      errorMessage: null
    });

    try {
      const diff = await this.gitClient.getDiff({
        projectId,
        staged: scope === GitDiffScope.Staged
      });

      this.setState({
        gitDiffs: writeGitDiff(this.state.gitDiffs, scope, diff),
        gitPendingAction: null,
        ...(manual
          ? {
              noticeMessage: `${readGitDiffHeading(scope)} loaded.`,
              errorMessage: null
            }
          : {})
      });
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not load the Git diff.",
        noticeMessage: null
      });
    }
  }

  private async handleCreateGitCommit(): Promise<void> {
    const currentProject = this.state.currentProject;
    const validationMessage = readGitCommitValidationMessage(
      this.state.gitCommitMessage,
      this.state.gitRepository
    );
    if (!currentProject || validationMessage !== null) {
      return;
    }

    this.setState({
      gitPendingAction: GitPendingAction.Commit,
      gitPendingPath: null,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const commit = await this.gitClient.createCommit({
        projectId: currentProject.id,
        message: this.state.gitCommitMessage.trim()
      });

      this.setState({
        gitCommitMessage: "",
        gitPendingAction: null,
        gitPendingPath: null,
        lastGitCommit: commit,
        noticeMessage: `Commit ${commit.hash.slice(0, 8)} created.`,
        errorMessage: null
      });

      await this.refreshGitWorkspace(currentProject.id, false);
    } catch (error) {
      this.setState({
        gitPendingAction: null,
        gitPendingPath: null,
        errorMessage: error instanceof Error ? error.message : "Could not create the Git commit.",
        noticeMessage: null
      });
    }
  }

  private startProjectPolling(projectId: string): void {
    this.pollGeneration += 1;
    const generation = this.pollGeneration;
    const poll = (): void => {
      window.setTimeout(() => {
        if (!this.isScreenActive() || generation !== this.pollGeneration) {
          return;
        }

        void this.refreshProjectRuns(false, projectId).finally(() => {
          if (this.isScreenActive() && generation === this.pollGeneration) {
            poll();
          }
        });
      }, PollIntervalMs);
    };

    poll();
  }

  private ensureRunStream(runId: string | null): void {
    if (runId === this.streamedRunId) {
      return;
    }

    this.stopRunStream();

    if (!runId) {
      return;
    }

    this.streamedRunId = runId;
    this.streamAbortController = new AbortController();
    this.setState({
      streamState: StreamState.Live
    });

    void this.qualityGatesClient.streamQualityGateEvents({
      runId,
      signal: this.streamAbortController.signal,
      onEvent: (event) => {
        if (this.state.selectedRunId === runId) {
          this.setState({
            selectedRunEvents: mergeRunEvents(this.state.selectedRunEvents, event)
          });
        }

        if (event.type === "done") {
          void this.refreshProjectRuns(false);
        }
      }
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.setState({
          errorMessage: error instanceof Error ? error.message : "Quality gate stream disconnected.",
          noticeMessage: null
        });
      }
    }).finally(() => {
      if (this.streamedRunId === runId) {
        this.streamedRunId = null;
        this.streamAbortController = null;
        this.setState({
          streamState: StreamState.Idle
        });
      }
    });
  }

  private stopRunStream(): void {
    if (this.streamAbortController) {
      this.streamAbortController.abort();
    }

    this.streamAbortController = null;
    this.streamedRunId = null;
    this.setState({
      streamState: StreamState.Idle
    });
  }

  private toggleGate(gate: QualityGateKey): void {
    const selected = this.state.selectedGates.includes(gate)
      ? this.state.selectedGates.filter((item) => item !== gate)
      : [...this.state.selectedGates, gate];

    this.setState({
      selectedGates: sortQualityGates(selected)
    });
  }

  private isScreenActive(): boolean {
    return this.element?.isConnected === true;
  }
}

const renderGateToggle = (input: {
  gate: QualityGateKey;
  checked: boolean;
  onChange: () => void;
}): HTMLElement =>
  createElement("label", {
    className: `flex items-start gap-3 rounded-lg border px-3 py-3 text-sm ${input.checked ? "border-primary bg-primary/10 text-white" : "border-border-dark bg-background-dark/40 text-text-secondary"}`
  }, [
    createElement("input", {
      type: "checkbox",
      checked: input.checked,
      onChange: () => input.onChange()
    }),
    createElement("div", { className: "flex flex-col gap-1" }, [
      createElement("span", { className: "font-medium capitalize" }, [input.gate]),
      createElement("span", { className: "text-xs text-text-secondary" }, [
        readGateDescription(input.gate)
      ])
    ])
  ]);

const renderRunListItem = (input: {
  run: QualityGateRunRecord;
  selected: boolean;
  onClick: () => void;
}): HTMLElement =>
  createElement("button", {
    type: "button",
    key: input.run.id,
    className: `rounded-lg border px-3 py-3 text-left transition-colors ${input.selected ? "border-primary bg-primary/10" : "border-border-dark bg-background-dark/40 hover:bg-surface-dark-hover"}`,
    onClick: input.onClick
  }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("div", { className: "min-w-0" }, [
        createElement("p", { className: "truncate text-sm font-medium text-white" }, [
          input.run.id.slice(0, 8)
        ]),
        createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
          `${input.run.passedCount}/${input.run.gates.length} passed • ${input.run.gates.join(", ")}`
        ])
      ]),
      renderRunStatusBadge(input.run.status)
    ]),
    createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [
      formatTimestamp(input.run.updatedAt)
    ])
  ]);

const renderRunStatusBadge = (
  status: QualityGateRunRecord["status"]
): HTMLElement =>
  createElement(StatusBadge, {
    status: mapRunStatusToBadge(status)
  }, [status.replace(/_/g, " ")]);

const renderGateStatusCell = (input: {
  gate: QualityGateKey;
  status: GateExecutionState;
}): HTMLElement =>
  createElement("div", {
    className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3"
  }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("span", { className: "text-sm font-medium capitalize text-white" }, [input.gate]),
      createElement(StatusBadge, {
        status: mapRunStatusToBadge(input.status)
      }, [input.status])
    ]),
    createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [
      readGateDescription(input.gate)
    ])
  ]);

const renderEventItem = (event: QualityGateEventRecord): HTMLElement => {
  const gate = readEventText(event.data["gate"]);
  const text = readEventText(event.data["text"]);
  const status = readEventText(event.data["status"]);
  const stream = readEventText(event.data["stream"]);

  return createElement("div", {
    key: event.id,
    className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4"
  }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("div", { className: "flex items-center gap-2" }, [
        createElement(StatusBadge, {
          status: mapEventTypeToBadge(event.type)
        }, [event.type]),
        gate
          ? createElement("span", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [gate])
          : ""
      ]),
      createElement("span", { className: "text-xs text-text-secondary" }, [
        formatTimestamp(event.timestamp)
      ])
    ]),
    createElement("p", { className: "mt-3 text-sm leading-6 text-white" }, [
      text || status || "No detail recorded."
    ]),
    stream
      ? createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [`stream ${stream}`])
      : ""
  ]);
};

const renderGitWorkspaceContent = (input: {
  repository: GitRepositoryRecord;
  branches: GitBranchListRecord | null;
  branchName: string;
  branchValidationMessage: string | null;
  pushValidationMessage: string | null;
  publishValidationMessage: string | null;
  selectedPaths: ReadonlyArray<string>;
  focusedPath: string | null;
  pendingAction: GitPendingAction | null;
  pendingPath: string | null;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (branchName: string) => void;
  onPublishBranch: () => void;
  onPushBranch: () => void;
  onToggleSelection: (path: string) => void;
  onBulkAction: (section: GitStatusSection) => void;
  onFocusDiff: (path: string, scope: GitDiffScopeValue) => void;
  onAction: (action: GitWorkspaceAction, path: string) => void;
}): HTMLElement => {
  const groups = groupGitStatusEntries(input.repository);

  return createElement("div", { className: "flex flex-col gap-4" }, [
    createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
      createElement("div", { className: "flex items-center justify-between gap-3" }, [
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement("p", {
            className: "text-sm font-semibold text-white",
            dataset: {
              testid: "git-current-branch"
            }
          }, [input.repository.branch ?? "Detached HEAD"]),
          createElement("p", { className: "text-xs text-text-secondary" }, [input.repository.upstream ?? "No upstream configured"])
        ]),
        createElement(StatusBadge, {
          status: input.repository.clean ? "success" : "warning"
        }, [input.repository.clean ? "clean" : "dirty"])
      ]),
      createElement("dl", { className: "mt-3 grid gap-3 sm:grid-cols-4" }, [
        renderMetaCell("Staged", String(input.repository.stagedCount)),
        renderMetaCell("Unstaged", String(input.repository.unstagedCount)),
        renderMetaCell("Untracked", String(input.repository.untrackedCount)),
        renderMetaCell("Ahead/Behind", `${input.repository.ahead}/${input.repository.behind}`)
      ])
    ]),
    renderGitBranchesPanel({
      repository: input.repository,
      branches: input.branches,
      branchName: input.branchName,
      branchValidationMessage: input.branchValidationMessage,
      pushValidationMessage: input.pushValidationMessage,
      publishValidationMessage: input.publishValidationMessage,
      pendingAction: input.pendingAction,
      pendingPath: input.pendingPath,
      onBranchNameChange: input.onBranchNameChange,
      onCreateBranch: input.onCreateBranch,
      onCheckoutBranch: input.onCheckoutBranch,
      onPublishBranch: input.onPublishBranch,
      onPushBranch: input.onPushBranch
    }),
    renderGitEntryGroup({
      title: "Staged changes",
      section: GitStatusSection.Staged,
      entries: groups.staged,
      emptyLabel: "No staged files.",
      selectedPaths: input.selectedPaths,
      focusedPath: input.focusedPath,
      pendingAction: input.pendingAction,
      pendingPath: input.pendingPath,
      onToggleSelection: input.onToggleSelection,
      onBulkAction: input.onBulkAction,
      onFocusDiff: input.onFocusDiff,
      onAction: input.onAction
    }),
    renderGitEntryGroup({
      title: "Unstaged changes",
      section: GitStatusSection.Unstaged,
      entries: groups.unstaged,
      emptyLabel: "No unstaged tracked files.",
      selectedPaths: input.selectedPaths,
      focusedPath: input.focusedPath,
      pendingAction: input.pendingAction,
      pendingPath: input.pendingPath,
      onToggleSelection: input.onToggleSelection,
      onBulkAction: input.onBulkAction,
      onFocusDiff: input.onFocusDiff,
      onAction: input.onAction
    }),
    renderGitEntryGroup({
      title: "Untracked files",
      section: GitStatusSection.Untracked,
      entries: groups.untracked,
      emptyLabel: "No untracked files.",
      selectedPaths: input.selectedPaths,
      focusedPath: input.focusedPath,
      pendingAction: input.pendingAction,
      pendingPath: input.pendingPath,
      onToggleSelection: input.onToggleSelection,
      onBulkAction: input.onBulkAction,
      onFocusDiff: input.onFocusDiff,
      onAction: input.onAction
    })
  ]);
};

const renderGitBranchesPanel = (input: {
  repository: GitRepositoryRecord;
  branches: GitBranchListRecord | null;
  branchName: string;
  branchValidationMessage: string | null;
  pushValidationMessage: string | null;
  publishValidationMessage: string | null;
  pendingAction: GitPendingAction | null;
  pendingPath: string | null;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: () => void;
  onCheckoutBranch: (branchName: string) => void;
  onPublishBranch: () => void;
  onPushBranch: () => void;
}): HTMLElement =>
  createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("h3", { className: "text-sm font-semibold text-white" }, ["Branches"]),
        createElement("p", { className: "text-xs text-text-secondary" }, [
          "Create a local branch or switch to another local branch without leaving the server-first workspace."
        ])
      ]),
      createElement(StatusBadge, {
        status: "info"
      }, [
        `${input.branches?.local.length ?? 0} local / ${input.branches?.remote.length ?? 0} remote`
      ])
    ]),
    createElement("div", { className: "mt-4 grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]" }, [
      createElement("div", { className: "flex flex-col gap-3" }, [
        createElement("label", { className: "flex flex-col gap-2" }, [
          createElement("span", { className: "text-sm font-medium text-white" }, ["New branch"]),
          createElement("input", {
            type: "text",
            value: input.branchName,
            placeholder: "feature/projects-branching",
            className: "h-11 rounded-lg border border-border-dark bg-background-dark/40 px-3 text-sm text-white placeholder-text-secondary focus:border-primary focus:outline-none",
            dataset: {
              testid: "git-branch-name"
            },
            onChange: (event: Event) => {
              const target = event.target;
              if (target instanceof HTMLInputElement) {
                input.onBranchNameChange(target.value);
              }
            }
          })
        ]),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          disabled: input.branchValidationMessage !== null || input.pendingAction !== null,
          onClick: input.onCreateBranch,
          children: input.pendingAction === GitPendingAction.BranchCreate ? "Creating branch" : "Create branch"
        }),
        createElement("p", {
          className: `text-sm ${input.branchValidationMessage ? "text-amber-300" : "text-text-secondary"}`
        }, [
          input.branchValidationMessage ?? "Create first, then checkout when you are ready to switch."
        ]),
        createElement("div", { className: "rounded-md border border-border-dark px-3 py-3" }, [
          createElement("div", { className: "flex flex-col gap-1" }, [
            createElement("p", { className: "text-sm font-medium text-white" }, ["Remote sync"]),
            createElement("p", { className: "text-xs text-text-secondary" }, [
              input.repository.upstream ?? "No upstream configured for the current branch."
            ])
          ]),
          createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
            createElement(Button, {
              variant: "secondary",
              size: "sm",
              disabled: input.pushValidationMessage !== null || input.pendingAction !== null,
              onClick: input.onPushBranch,
              children:
                input.pendingAction === GitPendingAction.BranchPush
                  ? "Pushing upstream"
                  : "Push upstream"
            }),
            createElement("p", {
              className: `text-sm ${input.pushValidationMessage ? "text-amber-300" : "text-text-secondary"}`
            }, [
              input.pushValidationMessage ?? `Push ${input.repository.branch ?? "the current branch"} to ${input.repository.upstream ?? "its upstream"}.`
            ]),
            createElement(Button, {
              variant: "ghost",
              size: "sm",
              disabled: input.publishValidationMessage !== null || input.pendingAction !== null,
              onClick: input.onPublishBranch,
              children:
                input.pendingAction === GitPendingAction.BranchPublish
                  ? "Publishing branch"
                  : "Publish branch"
            }),
            createElement("p", {
              className: `text-sm ${input.publishValidationMessage ? "text-amber-300" : "text-text-secondary"}`
            }, [
              input.publishValidationMessage ?? `Publish ${input.repository.branch ?? "the current branch"} to origin and set upstream tracking.`
            ])
          ])
        ])
      ]),
      createElement("div", { className: "grid gap-4 md:grid-cols-2" }, [
        createElement("div", { className: "flex flex-col gap-3" }, [
          createElement("p", { className: "text-xs uppercase tracking-wide text-text-secondary" }, ["Local branches"]),
          input.branches && input.branches.local.length > 0
            ? createElement("div", { className: "flex flex-col gap-2" }, [
                input.branches.local.map((branch) =>
                  renderGitBranchRow({
                    branch,
                    pendingAction: input.pendingAction,
                    pendingPath: input.pendingPath,
                    onCheckout: input.onCheckoutBranch
                  })
                )
              ])
            : createElement("p", { className: "text-sm text-text-secondary" }, ["No local branches available."])
        ]),
        createElement("div", { className: "flex flex-col gap-3" }, [
          createElement("p", { className: "text-xs uppercase tracking-wide text-text-secondary" }, ["Remote branches"]),
          input.branches && input.branches.remote.length > 0
            ? createElement("div", { className: "flex flex-col gap-2" }, [
                input.branches.remote.map((branch) =>
                  createElement("div", {
                    key: `remote-${branch.name}`,
                    className: "rounded-md border border-border-dark px-3 py-3"
                  }, [
                    createElement("div", { className: "flex items-center justify-between gap-3" }, [
                      createElement("div", { className: "min-w-0" }, [
                        createElement("p", { className: "truncate text-sm font-medium text-white" }, [branch.name]),
                        createElement("p", { className: "mt-1 text-xs text-text-secondary" }, ["Remote reference"])
                      ]),
                      createElement(StatusBadge, {
                        status: "info"
                      }, ["remote"])
                    ])
                  ])
                )
              ])
            : createElement("p", { className: "text-sm text-text-secondary" }, ["No remote branches available."])
        ])
      ])
    ])
  ]);

const renderGitBranchRow = (input: {
  branch: GitBranchListRecord["local"][number];
  pendingAction: GitPendingAction | null;
  pendingPath: string | null;
  onCheckout: (branchName: string) => void;
}): HTMLElement =>
  createElement("div", {
    key: `local-${input.branch.name}`,
    className: `rounded-md border px-3 py-3 ${input.branch.current ? "border-primary/60 bg-primary/5" : "border-border-dark"}`
  }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("div", { className: "min-w-0" }, [
        createElement("p", { className: "truncate text-sm font-medium text-white" }, [input.branch.name]),
        createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
          input.branch.upstream ?? "No upstream configured"
        ])
      ]),
      input.branch.current
        ? createElement(StatusBadge, {
            status: "running"
          }, ["current"])
        : createElement(Button, {
            variant: "ghost",
            size: "sm",
            disabled: input.pendingAction !== null,
            onClick: () => input.onCheckout(input.branch.name),
            children:
              input.pendingAction === GitPendingAction.BranchCheckout &&
              input.pendingPath === input.branch.name
                ? "Checking out"
                : "Checkout"
          })
    ])
  ]);

const renderGitEntryGroup = (input: {
  title: string;
  section: GitStatusSection;
  entries: ReadonlyArray<GitRepositoryRecord["entries"][number]>;
  emptyLabel: string;
  selectedPaths: ReadonlyArray<string>;
  focusedPath: string | null;
  pendingAction: GitPendingAction | null;
  pendingPath: string | null;
  onToggleSelection: (path: string) => void;
  onBulkAction: (section: GitStatusSection) => void;
  onFocusDiff: (path: string, scope: GitDiffScopeValue) => void;
  onAction: (action: GitWorkspaceAction, path: string) => void;
}): HTMLElement => {
  const bulkAction = readGitSectionBulkAction(input.section);
  const selectedCount = countSelectedGitEntries(input.entries, input.selectedPaths);

  return createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("div", { className: "flex items-center gap-3" }, [
        createElement("h3", { className: "text-sm font-semibold text-white" }, [input.title]),
        createElement(StatusBadge, {
          status: readGitSectionBadgeStatus(input.section)
        }, [`${input.entries.length}`]),
        selectedCount > 0
          ? createElement(StatusBadge, {
              status: "info"
            }, [`${selectedCount} selected`])
          : ""
      ]),
      createElement(Button, {
        variant: "secondary",
        size: "sm",
        disabled: selectedCount === 0 || input.pendingAction !== null,
        onClick: () => input.onBulkAction(input.section),
        children: readGitBulkActionButtonLabel(
          bulkAction,
          selectedCount,
          input.pendingAction
        )
      })
    ]),
    input.entries.length === 0
      ? createElement("p", { className: "mt-3 text-sm text-text-secondary" }, [input.emptyLabel])
      : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
          input.entries.map((entry) =>
            createElement("div", {
              key: `${input.section}-${entry.path}`,
              className: `rounded-md border px-3 py-3 ${input.selectedPaths.includes(entry.path) ? "border-primary/60 bg-primary/5" : "border-border-dark"}`
            }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("div", { className: "flex min-w-0 items-start gap-3" }, [
                  createElement("input", {
                    type: "checkbox",
                    checked: input.selectedPaths.includes(entry.path),
                    dataset: {
                      gitSection: input.section,
                      gitPath: entry.path,
                      gitSelection: "toggle"
                    },
                    onChange: () => input.onToggleSelection(entry.path)
                  }),
                  createElement("div", { className: "min-w-0" }, [
                    createElement("p", { className: "truncate text-sm font-medium text-white" }, [
                      entry.path
                    ]),
                    entry.originalPath
                      ? createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
                          `from ${entry.originalPath}`
                        ])
                      : ""
                  ])
                ]),
                createElement("span", {
                  className: "rounded-md border border-border-dark px-2 py-1 font-mono text-xs text-text-secondary"
                }, [`${entry.indexStatus}${entry.workingTreeStatus}`])
              ]),
              createElement("div", { className: "mt-3 flex flex-wrap items-center gap-2" }, [
                readGitDiffFocusScope(input.section, entry.untracked).map((scope) =>
                  createElement(Button, {
                    key: `${input.section}-${entry.path}-${scope}`,
                    variant: input.focusedPath === entry.path ? "secondary" : "ghost",
                    size: "sm",
                    disabled: input.pendingAction !== null,
                    onClick: () => input.onFocusDiff(entry.path, scope),
                    children: input.focusedPath === entry.path ? "Focused diff" : "Focus diff"
                  })
                ),
                readGitSectionActions(input.section).map((action) =>
                  createElement(Button, {
                    key: `${input.section}-${entry.path}-${action}`,
                    variant: readGitActionButtonVariant(action),
                    size: "sm",
                    disabled: input.pendingAction !== null,
                    onClick: () => input.onAction(action, entry.path),
                    children: readGitActionButtonLabel({
                      action,
                      path: entry.path,
                      pendingAction: input.pendingAction,
                      pendingPath: input.pendingPath
                    })
                  })
                )
              ])
            ])
          )
        ])
  ]);
};

const renderGitDiffScopeButton = (input: {
  scope: GitDiffScopeValue;
  selected: boolean;
  disabled: boolean;
  count: number;
  onClick: () => void;
}): HTMLElement =>
  createElement(Button, {
    variant: input.selected ? "secondary" : "ghost",
    size: "sm",
    disabled: input.disabled,
    onClick: input.onClick,
    children: `${readGitDiffHeading(input.scope)} (${input.count})`
  });

const mapRunStatusToBadge = (
  status: "pending" | "running" | "completed" | "failed" | "canceled"
): "info" | "success" | "warning" | "error" | "paused" | "running" | "failed" => {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "canceled") {
    return "paused";
  }

  if (status === "running") {
    return "running";
  }

  return "warning";
};

const mapEventTypeToBadge = (
  type: QualityGateEventRecord["type"]
): "info" | "success" | "warning" | "error" | "paused" | "running" | "failed" => {
  if (type === "done") {
    return "success";
  }

  if (type === "error") {
    return "error";
  }

  return "info";
};

const readGateDescription = (gate: QualityGateKey): string => {
  if (gate === QualityGateId.Lint) {
    return "Static lint rules across apps and packages.";
  }

  if (gate === QualityGateId.Typecheck) {
    return "Strict TypeScript validation for the workspace.";
  }

  if (gate === QualityGateId.Test) {
    return "Vitest suite for adapters, server and UI helpers.";
  }

  return "Production build artifact generation.";
};

const readEventText = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const readGitSectionBadgeStatus = (
  section: GitStatusSection
): "info" | "success" | "warning" | "error" | "paused" | "running" | "failed" => {
  if (section === GitStatusSection.Staged) {
    return "running";
  }

  if (section === GitStatusSection.Untracked) {
    return "info";
  }

  return "warning";
};

const readGitActionButtonVariant = (
  action: GitWorkspaceAction
): "primary" | "secondary" | "ghost" | "danger" => {
  if (action === GitWorkspaceAction.Revert) {
    return "danger";
  }

  if (action === GitWorkspaceAction.Stage) {
    return "secondary";
  }

  return "ghost";
};

const readGitActionButtonLabel = (input: {
  action: GitWorkspaceAction;
  path: string;
  pendingAction: GitPendingAction | null;
  pendingPath: string | null;
}): string => {
  const isPending =
    input.pendingAction === input.action &&
    input.pendingPath === input.path;
  if (!isPending) {
    return readGitActionLabel(input.action);
  }

  if (input.action === GitWorkspaceAction.Stage) {
    return "Staging";
  }

  if (input.action === GitWorkspaceAction.Unstage) {
    return "Unstaging";
  }

  return "Reverting";
};

const readGitActionLabel = (action: GitWorkspaceAction): string => {
  if (action === GitWorkspaceAction.Stage) {
    return "Stage";
  }

  if (action === GitWorkspaceAction.Unstage) {
    return "Unstage";
  }

  return "Revert";
};

const readGitActionConfirmMessage = (path: string): string =>
  `Revert unstaged changes for ${path}?`;

const readGitActionSuccessMessage = (
  action: GitWorkspaceAction,
  path: string
): string => {
  if (action === GitWorkspaceAction.Stage) {
    return `${path} staged.`;
  }

  if (action === GitWorkspaceAction.Unstage) {
    return `${path} moved out of the index.`;
  }

  return `Unstaged changes reverted for ${path}.`;
};

const readGitBulkActionButtonLabel = (
  action: typeof GitWorkspaceAction.Stage | typeof GitWorkspaceAction.Unstage,
  count: number,
  pendingAction: GitPendingAction | null
): string => {
  if (pendingAction === action) {
    return action === GitWorkspaceAction.Stage ? "Staging selected" : "Unstaging selected";
  }

  return `${readGitActionLabel(action)} selected (${count})`;
};

const readGitBulkActionSuccessMessage = (
  action: typeof GitWorkspaceAction.Stage | typeof GitWorkspaceAction.Unstage,
  paths: ReadonlyArray<string>
): string => {
  const count = paths.length;
  if (count === 1) {
    return readGitActionSuccessMessage(action, paths[0] ?? "");
  }

  return action === GitWorkspaceAction.Stage
    ? `${count} files staged.`
    : `${count} files moved out of the index.`;
};

const readGitDiffHeading = (scope: GitDiffScopeValue): string =>
  scope === GitDiffScope.Staged ? "Staged diff" : "Unstaged diff";

const readGitDiffDescription = (scope: GitDiffScopeValue): string =>
  scope === GitDiffScope.Staged
    ? "Diff for changes already added to the index and ready to commit."
    : "Diff for tracked modifications still outside the index.";

const readGitDiffCount = (
  repository: GitRepositoryRecord,
  scope: GitDiffScopeValue
): number =>
  scope === GitDiffScope.Staged
    ? repository.stagedCount
    : repository.unstagedCount;

const readGitDiff = (
  diffs: GitDiffState,
  scope: GitDiffScopeValue
): GitDiffRecord | null =>
  scope === GitDiffScope.Staged ? diffs.staged : diffs.unstaged;

const writeGitDiff = (
  diffs: GitDiffState,
  scope: GitDiffScopeValue,
  diff: GitDiffRecord | null
): GitDiffState =>
  scope === GitDiffScope.Staged
    ? {
        ...diffs,
        staged: diff
      }
    : {
        ...diffs,
        unstaged: diff
      };

const readGitEntriesBySection = (
  groups: ReturnType<typeof groupGitStatusEntries>,
  section: GitStatusSection
): ReadonlyArray<GitRepositoryRecord["entries"][number]> => {
  if (section === GitStatusSection.Staged) {
    return groups.staged;
  }

  if (section === GitStatusSection.Unstaged) {
    return groups.unstaged;
  }

  return groups.untracked;
};

const readGitDiffFocusScope = (
  section: GitStatusSection,
  untracked: boolean
): ReadonlyArray<GitDiffScopeValue> => {
  if (untracked) {
    return [];
  }

  return [
    section === GitStatusSection.Staged
      ? GitDiffScope.Staged
      : GitDiffScope.Unstaged
  ];
};
