import {
  GitDiffScope,
  type GitRepositoryRecord,
  QualityGateId,
  type QualityGateEventRecord,
  type QualityGateId as QualityGateKey,
  type QualityGateRunRecord
} from "../shared/workbench-types.js";

export const DefaultSelectedGates: ReadonlyArray<QualityGateKey> = [
  QualityGateId.Lint,
  QualityGateId.Typecheck,
  QualityGateId.Test,
  QualityGateId.Build
];

export type GateExecutionState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export const GitStatusSection = {
  Staged: "staged",
  Unstaged: "unstaged",
  Untracked: "untracked"
} as const;

export type GitStatusSection =
  typeof GitStatusSection[keyof typeof GitStatusSection];

export const GitWorkspaceAction = {
  Stage: "stage",
  Unstage: "unstage",
  Revert: "revert"
} as const;

export type GitWorkspaceAction =
  typeof GitWorkspaceAction[keyof typeof GitWorkspaceAction];

export const resolveSelectedRunId = (
  selectedRunId: string | null,
  runs: ReadonlyArray<QualityGateRunRecord>
): string | null => {
  if (selectedRunId && runs.some((run) => run.id === selectedRunId)) {
    return selectedRunId;
  }

  return runs[0]?.id ?? null;
};

export const readSelectedRun = (
  runs: ReadonlyArray<QualityGateRunRecord>,
  selectedRunId: string | null
): QualityGateRunRecord | undefined =>
  runs.find((run) => run.id === selectedRunId) ?? runs[0];

export const readStreamingRunId = (
  runs: ReadonlyArray<QualityGateRunRecord>,
  selectedRunId: string | null
): string | null => {
  const selectedRun = readSelectedRun(runs, selectedRunId);
  if (selectedRun && isRunActive(selectedRun.status)) {
    return selectedRun.id;
  }

  return runs.find((run) => isRunActive(run.status))?.id ?? null;
};

export const readGateExecutionState = (
  run: QualityGateRunRecord,
  gate: QualityGateKey,
  index: number
): GateExecutionState => {
  if (index < run.passedCount) {
    return "completed";
  }

  if (run.status === "completed") {
    return "completed";
  }

  if (run.status === "failed" && (run.failedGate === gate || run.currentGate === gate)) {
    return "failed";
  }

  if (run.status === "canceled") {
    return "canceled";
  }

  if (isRunActive(run.status) && run.currentGate === gate) {
    return "running";
  }

  return "pending";
};

export const mergeRunEvents = (
  events: ReadonlyArray<QualityGateEventRecord>,
  nextEvent: QualityGateEventRecord
): ReadonlyArray<QualityGateEventRecord> => {
  if (events.some((event) => event.id === nextEvent.id)) {
    return events;
  }

  return [...events, nextEvent].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp)
  );
};

export const sortQualityGates = (
  gates: ReadonlyArray<QualityGateKey>
): ReadonlyArray<QualityGateKey> =>
  [...gates].sort(
    (left, right) =>
      DefaultSelectedGates.indexOf(left) - DefaultSelectedGates.indexOf(right)
  );

export const groupGitStatusEntries = (
  repository: GitRepositoryRecord
): {
  staged: ReadonlyArray<GitRepositoryRecord["entries"][number]>;
  unstaged: ReadonlyArray<GitRepositoryRecord["entries"][number]>;
  untracked: ReadonlyArray<GitRepositoryRecord["entries"][number]>;
} => ({
  staged: repository.entries.filter((entry) => entry.staged),
  unstaged: repository.entries.filter((entry) => entry.unstaged),
  untracked: repository.entries.filter((entry) => entry.untracked)
});

export const readGitSectionActions = (
  section: GitStatusSection
): ReadonlyArray<GitWorkspaceAction> => {
  if (section === GitStatusSection.Staged) {
    return [GitWorkspaceAction.Unstage];
  }

  if (section === GitStatusSection.Unstaged) {
    return [GitWorkspaceAction.Stage, GitWorkspaceAction.Revert];
  }

  return [GitWorkspaceAction.Stage];
};

export const resolveGitDiffScope = (
  repository: GitRepositoryRecord | null,
  selectedScope: GitDiffScope
): GitDiffScope => {
  if (!repository) {
    return selectedScope;
  }

  if (selectedScope === GitDiffScope.Staged && repository.stagedCount > 0) {
    return GitDiffScope.Staged;
  }

  if (repository.unstagedCount > 0) {
    return GitDiffScope.Unstaged;
  }

  return GitDiffScope.Staged;
};

export const readGitCommitValidationMessage = (
  message: string,
  repository: GitRepositoryRecord | null
): string | null => {
  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return "Commit message is required.";
  }

  if (!isConventionalCommitMessage(trimmed)) {
    return "Use a Conventional Commit message such as feat(projects): add git workspace panel.";
  }

  if (!repository || repository.stagedCount === 0) {
    return "Stage changes before creating a commit.";
  }

  return null;
};

export const isConventionalCommitMessage = (value: string): boolean => {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return false;
  }

  const header = value.slice(0, separatorIndex).trim();
  const description = value.slice(separatorIndex + 1).trim();
  if (description.length === 0) {
    return false;
  }

  const breaking = header.endsWith("!");
  const normalizedHeader = breaking ? header.slice(0, -1) : header;
  const scopeStart = normalizedHeader.indexOf("(");

  if (scopeStart < 0) {
    return isAllowedConventionalCommitType(normalizedHeader);
  }

  if (!normalizedHeader.endsWith(")")) {
    return false;
  }

  const type = normalizedHeader.slice(0, scopeStart);
  const scope = normalizedHeader.slice(scopeStart + 1, -1);

  return (
    isAllowedConventionalCommitType(type) &&
    /^[a-z0-9./_-]+$/u.test(scope)
  );
};

const isRunActive = (status: QualityGateRunRecord["status"]): boolean =>
  status === "pending" || status === "running";

const ConventionalCommitType = {
  Build: "build",
  Chore: "chore",
  Ci: "ci",
  Docs: "docs",
  Feat: "feat",
  Fix: "fix",
  Perf: "perf",
  Refactor: "refactor",
  Revert: "revert",
  Style: "style",
  Test: "test"
} as const;

const isAllowedConventionalCommitType = (value: string): boolean =>
  value === ConventionalCommitType.Build ||
  value === ConventionalCommitType.Chore ||
  value === ConventionalCommitType.Ci ||
  value === ConventionalCommitType.Docs ||
  value === ConventionalCommitType.Feat ||
  value === ConventionalCommitType.Fix ||
  value === ConventionalCommitType.Perf ||
  value === ConventionalCommitType.Refactor ||
  value === ConventionalCommitType.Revert ||
  value === ConventionalCommitType.Style ||
  value === ConventionalCommitType.Test;
