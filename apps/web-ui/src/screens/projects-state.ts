import {
  GitDiffScope,
  type GitBranchListRecord,
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

export const readGitSectionBulkAction = (
  section: GitStatusSection
): typeof GitWorkspaceAction.Stage | typeof GitWorkspaceAction.Unstage =>
  section === GitStatusSection.Staged
    ? GitWorkspaceAction.Unstage
    : GitWorkspaceAction.Stage;

export const toggleGitPathSelection = (
  selectedPaths: ReadonlyArray<string>,
  path: string
): ReadonlyArray<string> =>
  selectedPaths.includes(path)
    ? selectedPaths.filter((item) => item !== path)
    : [...selectedPaths, path];

export const countSelectedGitEntries = (
  entries: ReadonlyArray<GitRepositoryRecord["entries"][number]>,
  selectedPaths: ReadonlyArray<string>
): number =>
  entries.filter((entry) => selectedPaths.includes(entry.path)).length;

export const retainGitPathSelection = (
  selectedPaths: ReadonlyArray<string>,
  repository: GitRepositoryRecord | null
): ReadonlyArray<string> => {
  if (!repository) {
    return [];
  }

  const validPaths = new Set(repository.entries.map((entry) => entry.path));
  return selectedPaths.filter((path) => validPaths.has(path));
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

export const resolveGitFocusedPath = (
  repository: GitRepositoryRecord | null,
  scope: GitDiffScope,
  focusedPath: string | null
): string | null => {
  if (!repository || !focusedPath) {
    return null;
  }

  const group = scope === GitDiffScope.Staged
    ? repository.entries.filter((entry) => entry.staged)
    : repository.entries.filter((entry) => entry.unstaged);

  return group.some((entry) => entry.path === focusedPath)
    ? focusedPath
    : null;
};

export const filterGitDiffByPath = (
  diff: string,
  path: string | null
): string => {
  if (!path || diff.trim().length === 0) {
    return diff;
  }

  const sections = splitGitDiffSections(diff);
  const match = sections.find((section) => section.path === path);
  return match?.content ?? diff;
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

export const readGitBranchValidationMessage = (
  branchName: string,
  branches: GitBranchListRecord | null
): string | null => {
  const trimmed = branchName.trim();

  if (trimmed.length === 0) {
    return "Branch name is required.";
  }

  if (!isValidGitBranchName(trimmed)) {
    return "Use a valid Git branch name such as feature/projects-branching.";
  }

  if (branches?.local.some((branch) => branch.name === trimmed)) {
    return `A local branch named ${trimmed} already exists.`;
  }

  return null;
};

export const readGitPushValidationMessage = (
  repository: GitRepositoryRecord | null
): string | null => {
  if (!repository?.branch) {
    return "Current branch is unavailable.";
  }

  if (!repository.upstream) {
    return "Publish the current branch to origin before pushing.";
  }

  if (repository.behind > 0) {
    return `Current branch is behind ${repository.upstream}. Pull before pushing.`;
  }

  if (repository.ahead === 0) {
    return `Current branch is already synced with ${repository.upstream}.`;
  }

  return null;
};

export const readGitPublishValidationMessage = (
  repository: GitRepositoryRecord | null
): string | null => {
  if (!repository?.branch) {
    return "Current branch is unavailable.";
  }

  if (repository.upstream) {
    return `Current branch already tracks ${repository.upstream}.`;
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

export const isValidGitBranchName = (value: string): boolean => {
  if (value.length === 0) {
    return false;
  }

  if (
    value.startsWith("-") ||
    value.startsWith(".") ||
    value.endsWith(".") ||
    value.endsWith("/") ||
    value.endsWith(".lock")
  ) {
    return false;
  }

  if (
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("\\") ||
    value.includes(" ") ||
    value.includes("~") ||
    value.includes("^") ||
    value.includes(":") ||
    value.includes("?") ||
    value.includes("*") ||
    value.includes("[")
  ) {
    return false;
  }

  return value
    .split("/")
    .every((segment) => segment.length > 0 && !segment.endsWith("."));
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

const splitGitDiffSections = (
  diff: string
): ReadonlyArray<{ path: string; content: string }> => {
  const trimmed = diff.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const parts = trimmed.split("\ndiff --git ");
  return parts
    .map((part, index) => index === 0 ? part : `diff --git ${part}`)
    .map(readGitDiffSection)
    .filter((section): section is { path: string; content: string } => section !== null);
};

const readGitDiffSection = (
  value: string
): { path: string; content: string } | null => {
  const firstLine = value.split("\n", 1)[0] ?? "";
  const match = /^diff --git a\/(.+?) b\/(.+)$/u.exec(firstLine);
  if (!match?.[2]) {
    return null;
  }

  return {
    path: match[2],
    content: value
  };
};
