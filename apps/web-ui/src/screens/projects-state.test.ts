import { describe, expect, it } from "vitest";
import {
  groupGitStatusEntries,
  isConventionalCommitMessage,
  mergeRunEvents,
  readGitCommitValidationMessage,
  resolveGitDiffScope,
  readGateExecutionState,
  readSelectedRun,
  readStreamingRunId,
  resolveSelectedRunId,
  sortQualityGates
} from "./projects-state.js";
import {
  GitDiffScope,
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

  it("validates conventional commit messages for the git workspace form", () => {
    const repository = createRepository({
      stagedCount: 1
    });

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
  stagedCount?: number;
  unstagedCount?: number;
  untrackedCount?: number;
  entries?: GitRepositoryRecord["entries"];
}): GitRepositoryRecord => ({
  branch: "feature/git-ui",
  upstream: "origin/feature/git-ui",
  ahead: 1,
  behind: 0,
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
