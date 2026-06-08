import { describe, expect, it } from "vitest";
import {
  countSelectedGitEntries,
  filterGitDiffByPath,
  GitStatusSection,
  GitWorkspaceAction,
  groupGitStatusEntries,
  isConventionalCommitMessage,
  mergeRunEvents,
  readGitBranchValidationMessage,
  readGitPublishValidationMessage,
  readGitPushValidationMessage,
  readGitSectionBulkAction,
  readGitSectionActions,
  readGitCommitValidationMessage,
  resolveGitFocusedPath,
  resolveGitDiffScope,
  readGateExecutionState,
  readSelectedRun,
  readStreamingRunId,
  resolveSelectedRunId,
  retainGitPathSelection,
  sortQualityGates,
  toggleGitPathSelection
} from "./projects-state.js";
import {
  GitDiffScope,
  type GitBranchListRecord,
  QualityGateId,
  type GitRepositoryRecord,
  type QualityGateEventRecord,
  type QualityGateRunRecord
} from "../shared/workbench-types.js";

describe("projects state helpers", () => {
  it("keeps the current selection when the run still exists and falls back to the latest run", () => {
    const runs: ReadonlyArray<QualityGateRunRecord> = [
      createRun({
        id: "run-2",
        status: "running",
        createdAt: "2026-04-24T12:05:00.000Z",
        updatedAt: "2026-04-24T12:05:00.000Z"
      }),
      createRun({
        id: "run-1",
        status: "completed",
        createdAt: "2026-04-24T12:00:00.000Z",
        updatedAt: "2026-04-24T12:03:00.000Z"
      })
    ];

    expect(resolveSelectedRunId("run-1", runs)).toBe("run-1");
    expect(resolveSelectedRunId("missing", runs)).toBe("run-2");
    expect(readSelectedRun(runs, "run-1")?.id).toBe("run-1");
  });

  it("picks a running run for the live stream when the current selection is not active", () => {
    const runs: ReadonlyArray<QualityGateRunRecord> = [
      createRun({
        id: "run-2",
        status: "running",
        currentGate: QualityGateId.Test
      }),
      createRun({
        id: "run-1",
        status: "completed"
      })
    ];

    expect(readStreamingRunId(runs, "run-1")).toBe("run-2");
    expect(readStreamingRunId(runs, "run-2")).toBe("run-2");
  });

  it("derives gate execution state from the run summary", () => {
    const running = createRun({
      id: "run-running",
      status: "running",
      passedCount: 1,
      currentGate: QualityGateId.Typecheck
    });
    const failed = createRun({
      id: "run-failed",
      status: "failed",
      passedCount: 2,
      currentGate: QualityGateId.Test,
      failedGate: QualityGateId.Test
    });

    expect(readGateExecutionState(running, QualityGateId.Lint, 0)).toBe("completed");
    expect(readGateExecutionState(running, QualityGateId.Typecheck, 1)).toBe("running");
    expect(readGateExecutionState(running, QualityGateId.Test, 2)).toBe("pending");
    expect(readGateExecutionState(failed, QualityGateId.Test, 2)).toBe("failed");
    expect(readGateExecutionState(failed, QualityGateId.Build, 3)).toBe("pending");
  });

  it("merges streamed events without duplicates and keeps chronological order", () => {
    const first = createEvent({
      id: "event-2",
      timestamp: "2026-04-24T12:00:02.000Z",
      text: "lint completed"
    });
    const second = createEvent({
      id: "event-1",
      timestamp: "2026-04-24T12:00:01.000Z",
      text: "lint started"
    });

    const merged = mergeRunEvents([first], second);

    expect(mergeRunEvents(merged, second)).toEqual(merged);
    expect(merged.map((event) => event.id)).toEqual(["event-1", "event-2"]);
  });

  it("sorts gate selections in execution order", () => {
    expect(
      sortQualityGates([
        QualityGateId.Build,
        QualityGateId.Lint,
        QualityGateId.Test
      ])
    ).toEqual([
      QualityGateId.Lint,
      QualityGateId.Test,
      QualityGateId.Build
    ]);
  });

  it("groups git status entries and resolves the active diff scope", () => {
    const repository = createRepository({
      stagedCount: 1,
      unstagedCount: 1,
      untrackedCount: 1,
      entries: [
        createGitEntry({
          path: "apps/web-ui/src/screens/Projects.ts",
          staged: true
        }),
        createGitEntry({
          path: "apps/web-ui/src/shared/git-client.ts",
          unstaged: true
        }),
        createGitEntry({
          path: "apps/web-ui/src/screens/Git.ts",
          untracked: true
        })
      ]
    });

    expect(groupGitStatusEntries(repository).staged).toHaveLength(1);
    expect(groupGitStatusEntries(repository).unstaged).toHaveLength(1);
    expect(groupGitStatusEntries(repository).untracked).toHaveLength(1);
    expect(resolveGitDiffScope(repository, GitDiffScope.Staged)).toBe(GitDiffScope.Staged);
    expect(
      resolveGitDiffScope(
        createRepository({
          stagedCount: 0,
          unstagedCount: 1
        }),
        GitDiffScope.Staged
      )
    ).toBe(GitDiffScope.Unstaged);
  });

  it("maps each git status section to the expected workspace actions", () => {
    expect(readGitSectionActions(GitStatusSection.Staged)).toEqual([
      GitWorkspaceAction.Unstage
    ]);
    expect(readGitSectionActions(GitStatusSection.Unstaged)).toEqual([
      GitWorkspaceAction.Stage,
      GitWorkspaceAction.Revert
    ]);
    expect(readGitSectionActions(GitStatusSection.Untracked)).toEqual([
      GitWorkspaceAction.Stage
    ]);
    expect(readGitSectionBulkAction(GitStatusSection.Staged)).toBe(
      GitWorkspaceAction.Unstage
    );
    expect(readGitSectionBulkAction(GitStatusSection.Unstaged)).toBe(
      GitWorkspaceAction.Stage
    );
    expect(readGitSectionBulkAction(GitStatusSection.Untracked)).toBe(
      GitWorkspaceAction.Stage
    );
  });

  it("toggles, counts and retains selected git paths against repository status", () => {
    const repository = createRepository({
      stagedCount: 2,
      unstagedCount: 1,
      untrackedCount: 1,
      entries: [
        createGitEntry({
          path: "apps/web-ui/src/screens/Projects.ts",
          staged: true
        }),
        createGitEntry({
          path: "apps/web-ui/src/shared/git-client.ts",
          staged: true
        }),
        createGitEntry({
          path: "apps/web-ui/src/shared/quality-gates-client.ts",
          unstaged: true
        }),
        createGitEntry({
          path: "apps/web-ui/src/screens/GitDetails.ts",
          untracked: true
        })
      ]
    });

    const selected = toggleGitPathSelection(
      toggleGitPathSelection(
        toggleGitPathSelection([], "apps/web-ui/src/screens/Projects.ts"),
        "apps/web-ui/src/shared/git-client.ts"
      ),
      "apps/web-ui/src/screens/GitDetails.ts"
    );

    expect(countSelectedGitEntries(groupGitStatusEntries(repository).staged, selected)).toBe(2);
    expect(countSelectedGitEntries(groupGitStatusEntries(repository).untracked, selected)).toBe(1);
    expect(
      retainGitPathSelection(selected, createRepository({
        stagedCount: 1,
        untrackedCount: 1,
        entries: [
          createGitEntry({
            path: "apps/web-ui/src/screens/Projects.ts",
            staged: true
          }),
          createGitEntry({
            path: "apps/web-ui/src/screens/GitDetails.ts",
            untracked: true
          })
        ]
      }))
    ).toEqual([
      "apps/web-ui/src/screens/Projects.ts",
      "apps/web-ui/src/screens/GitDetails.ts"
    ]);
    expect(
      toggleGitPathSelection(selected, "apps/web-ui/src/shared/git-client.ts")
    ).toEqual([
      "apps/web-ui/src/screens/Projects.ts",
      "apps/web-ui/src/screens/GitDetails.ts"
    ]);
  });

  it("filters a scope diff to the focused file and clears focus when the scope changes", () => {
    const repository = createRepository({
      stagedCount: 2,
      unstagedCount: 1,
      entries: [
        createGitEntry({
          path: "apps/web-ui/src/screens/Projects.ts",
          staged: true
        }),
        createGitEntry({
          path: "apps/web-ui/src/screens/GitDetails.ts",
          staged: true
        }),
        createGitEntry({
          path: "apps/web-ui/src/shared/quality-gates-client.ts",
          unstaged: true
        })
      ]
    });
    const diff = [
      "diff --git a/apps/web-ui/src/screens/Projects.ts b/apps/web-ui/src/screens/Projects.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
      "diff --git a/apps/web-ui/src/screens/GitDetails.ts b/apps/web-ui/src/screens/GitDetails.ts",
      "@@ -0,0 +1 @@",
      "+export const ready = true;"
    ].join("\n");

    expect(
      filterGitDiffByPath(diff, "apps/web-ui/src/screens/GitDetails.ts")
    ).toContain("GitDetails.ts");
    expect(
      filterGitDiffByPath(diff, "apps/web-ui/src/screens/GitDetails.ts")
    ).not.toContain("Projects.ts");
    expect(
      resolveGitFocusedPath(repository, GitDiffScope.Staged, "apps/web-ui/src/screens/GitDetails.ts")
    ).toBe("apps/web-ui/src/screens/GitDetails.ts");
    expect(
      resolveGitFocusedPath(repository, GitDiffScope.Unstaged, "apps/web-ui/src/screens/GitDetails.ts")
    ).toBe(null);
  });

  it("validates conventional commit messages for the git workspace form", () => {
    const repository = createRepository({
      stagedCount: 1
    });
    const branches = createBranches();

    expect(isConventionalCommitMessage("feat(projects): add git workspace panel")).toBe(true);
    expect(isConventionalCommitMessage("refactor(ui)!: change git layout")).toBe(true);
    expect(isConventionalCommitMessage("ship it")).toBe(false);
    expect(
      readGitCommitValidationMessage("", repository)
    ).toBe("Commit message is required.");
    expect(
      readGitCommitValidationMessage("ship it", repository)
    ).toBe("Use a Conventional Commit message such as feat(projects): add git workspace panel.");
    expect(
      readGitCommitValidationMessage(
        "feat(projects): add git workspace panel",
        createRepository({
          stagedCount: 0
        })
      )
    ).toBe("Stage changes before creating a commit.");
    expect(readGitBranchValidationMessage("", branches)).toBe("Branch name is required.");
    expect(readGitBranchValidationMessage("bad branch", branches)).toBe("Use a valid Git branch name such as feature/projects-branching.");
    expect(readGitBranchValidationMessage("develop", branches)).toBe("A local branch named develop already exists.");
    expect(readGitBranchValidationMessage("feature/projects-branching", branches)).toBe(null);
    expect(readGitPushValidationMessage(repository)).toBe(null);
    expect(
      readGitPushValidationMessage(
        createRepository({
          ahead: 0,
          upstream: "origin/feature/git-ui"
        })
      )
    ).toBe("Current branch is already synced with origin/feature/git-ui.");
    expect(
      readGitPushValidationMessage(
        createRepository({
          upstream: null
        })
      )
    ).toBe("Publish the current branch to origin before pushing.");
    expect(readGitPublishValidationMessage(repository)).toBe("Current branch already tracks origin/feature/git-ui.");
    expect(
      readGitPublishValidationMessage(
        createRepository({
          upstream: null
        })
      )
    ).toBe(null);
  });
});

const createRun = (input: {
  id: string;
  status: QualityGateRunRecord["status"];
  createdAt?: string;
  updatedAt?: string;
  passedCount?: number;
  currentGate?: QualityGateRunRecord["currentGate"];
  failedGate?: QualityGateRunRecord["failedGate"];
}): QualityGateRunRecord => ({
  id: input.id,
  projectId: "project-1",
  status: input.status,
  createdAt: input.createdAt ?? "2026-04-24T12:00:00.000Z",
  updatedAt: input.updatedAt ?? "2026-04-24T12:00:00.000Z",
  gates: [
    QualityGateId.Lint,
    QualityGateId.Typecheck,
    QualityGateId.Test,
    QualityGateId.Build
  ],
  passedCount: input.passedCount ?? 4,
  ...(input.currentGate ? { currentGate: input.currentGate } : {}),
  ...(input.failedGate ? { failedGate: input.failedGate } : {})
});

const createEvent = (input: {
  id: string;
  timestamp: string;
  text: string;
}): QualityGateEventRecord => ({
  id: input.id,
  runId: "run-1",
  type: "message",
  timestamp: input.timestamp,
  data: {
    text: input.text
  }
});

const createRepository = (input: {
  branch?: string;
  upstream?: string | null;
  ahead?: number;
  behind?: number;
  stagedCount?: number;
  unstagedCount?: number;
  untrackedCount?: number;
  entries?: GitRepositoryRecord["entries"];
}): GitRepositoryRecord => ({
  ...(input.branch === undefined ? { branch: "feature/git-ui" } : { branch: input.branch }),
  ...(input.upstream === undefined
    ? { upstream: "origin/feature/git-ui" }
    : input.upstream
      ? { upstream: input.upstream }
      : {}),
  ahead: input.ahead ?? 1,
  behind: input.behind ?? 0,
  clean: false,
  stagedCount: input.stagedCount ?? 1,
  unstagedCount: input.unstagedCount ?? 0,
  untrackedCount: input.untrackedCount ?? 0,
  entries: input.entries ?? [
    createGitEntry({
      path: "apps/web-ui/src/screens/Projects.ts",
      staged: true
    })
  ]
});

const createGitEntry = (input: {
  path: string;
  staged?: boolean;
  unstaged?: boolean;
  untracked?: boolean;
}): GitRepositoryRecord["entries"][number] => ({
  path: input.path,
  indexStatus: input.untracked ? "?" : input.staged ? "M" : " ",
  workingTreeStatus: input.untracked ? "?" : input.unstaged ? "M" : " ",
  staged: input.staged ?? false,
  unstaged: input.unstaged ?? false,
  untracked: input.untracked ?? false
});

const createBranches = (): GitBranchListRecord => ({
  local: [
    {
      name: "feature/git-ui",
      current: true,
      remote: false,
      upstream: "origin/feature/git-ui"
    },
    {
      name: "develop",
      current: false,
      remote: false
    }
  ],
  remote: [
    {
      name: "origin/release/next",
      current: false,
      remote: true
    }
  ]
});
