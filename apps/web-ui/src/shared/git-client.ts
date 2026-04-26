import { requestJson } from "./server-api-client.js";
import type {
  GitBranchListRecord,
  GitBranchOperationRecord,
  GitCommitRecord,
  GitDiffRecord,
  GitPathOperationRecord,
  GitRepositoryRecord
} from "./workbench-types.js";

const EndpointPath = {
  GitStatus: "/git/status",
  GitDiff: "/git/diff",
  GitStage: "/git/stage",
  GitUnstage: "/git/unstage",
  GitRevert: "/git/revert",
  GitCommit: "/git/commit",
  GitBranchesList: "/git/branches/list",
  GitBranchesCreate: "/git/branches/create",
  GitBranchesCheckout: "/git/branches/checkout"
} as const;

export type GitClient = {
  getStatus: (input: {
    projectId: string;
  }) => Promise<GitRepositoryRecord>;
  getDiff: (input: {
    projectId: string;
    staged: boolean;
  }) => Promise<GitDiffRecord>;
  listBranches: (input: {
    projectId: string;
  }) => Promise<GitBranchListRecord>;
  createBranch: (input: {
    projectId: string;
    branchName: string;
  }) => Promise<GitBranchOperationRecord>;
  checkoutBranch: (input: {
    projectId: string;
    branchName: string;
  }) => Promise<GitBranchOperationRecord>;
  stagePaths: (input: {
    projectId: string;
    paths: ReadonlyArray<string>;
  }) => Promise<GitPathOperationRecord>;
  unstagePaths: (input: {
    projectId: string;
    paths: ReadonlyArray<string>;
  }) => Promise<GitPathOperationRecord>;
  revertPaths: (input: {
    projectId: string;
    paths: ReadonlyArray<string>;
  }) => Promise<GitPathOperationRecord>;
  createCommit: (input: {
    projectId: string;
    message: string;
  }) => Promise<GitCommitRecord>;
};

export const createGitClient = (): GitClient => ({
  getStatus: (input) =>
    requestJson({
      path: EndpointPath.GitStatus,
      body: {
        projectId: input.projectId
      },
      parse: parseGitStatusResponse
    }),
  getDiff: (input) =>
    requestJson({
      path: EndpointPath.GitDiff,
      body: {
        projectId: input.projectId,
        staged: input.staged
      },
      parse: parseGitDiffResponse
    }),
  listBranches: (input) =>
    requestJson({
      path: EndpointPath.GitBranchesList,
      body: {
        projectId: input.projectId
      },
      parse: parseGitBranchListResponse
    }),
  createBranch: (input) =>
    requestJson({
      path: EndpointPath.GitBranchesCreate,
      body: {
        projectId: input.projectId,
        branchName: input.branchName
      },
      parse: parseGitBranchOperationResponse
    }),
  checkoutBranch: (input) =>
    requestJson({
      path: EndpointPath.GitBranchesCheckout,
      body: {
        projectId: input.projectId,
        branchName: input.branchName
      },
      parse: parseGitBranchOperationResponse
    }),
  stagePaths: (input) =>
    requestJson({
      path: EndpointPath.GitStage,
      body: {
        projectId: input.projectId,
        paths: [...input.paths]
      },
      parse: parseGitPathOperationResponse
    }),
  unstagePaths: (input) =>
    requestJson({
      path: EndpointPath.GitUnstage,
      body: {
        projectId: input.projectId,
        paths: [...input.paths]
      },
      parse: parseGitPathOperationResponse
    }),
  revertPaths: (input) =>
    requestJson({
      path: EndpointPath.GitRevert,
      body: {
        projectId: input.projectId,
        paths: [...input.paths]
      },
      parse: parseGitPathOperationResponse
    }),
  createCommit: (input) =>
    requestJson({
      path: EndpointPath.GitCommit,
      body: {
        projectId: input.projectId,
        message: input.message
      },
      parse: parseGitCommitResponse
    })
});

export const parseGitStatusResponse = (value: unknown): GitRepositoryRecord =>
  parseGitRepositoryRecord(readRequiredRecord(value, "gitStatusResponse", "repository"));

export const parseGitDiffResponse = (value: unknown): GitDiffRecord => {
  const record = ensureRecord(value, "gitDiffResponse");

  return {
    staged: readRequiredBoolean(record, "gitDiffResponse", "staged"),
    diff: readRequiredString(record, "gitDiffResponse", "diff")
  };
};

export const parseGitBranchListResponse = (
  value: unknown
): GitBranchListRecord => {
  const record = ensureRecord(value, "gitBranchListResponse");
  const branches = readRequiredRecord(record, "gitBranchListResponse", "branches");

  return {
    local: readRequiredArray(branches, "gitBranchListResponse.branches", "local").map((branch) =>
      parseGitBranchRecord(ensureRecord(branch, "gitBranchRecord"))
    ),
    remote: readRequiredArray(branches, "gitBranchListResponse.branches", "remote").map((branch) =>
      parseGitBranchRecord(ensureRecord(branch, "gitBranchRecord"))
    )
  };
};

export const parseGitBranchOperationResponse = (
  value: unknown
): GitBranchOperationRecord =>
  parseGitBranchOperationRecord(readRequiredRecord(value, "gitBranchOperationResponse", "branch"));

export const parseGitPathOperationResponse = (
  value: unknown
): GitPathOperationRecord => {
  const record = ensureRecord(value, "gitPathOperationResponse");

  return {
    paths: readRequiredArray(record, "gitPathOperationResponse", "paths").map((path) =>
      readArrayString(path, "gitPathOperationResponse.paths")
    )
  };
};

export const parseGitCommitResponse = (value: unknown): GitCommitRecord =>
  parseGitCommitRecord(readRequiredRecord(value, "gitCommitResponse", "commit"));

const parseGitRepositoryRecord = (
  value: Record<string, unknown>
): GitRepositoryRecord => ({
  ahead: readRequiredNumber(value, "gitRepositoryRecord", "ahead"),
  behind: readRequiredNumber(value, "gitRepositoryRecord", "behind"),
  clean: readRequiredBoolean(value, "gitRepositoryRecord", "clean"),
  stagedCount: readRequiredNumber(value, "gitRepositoryRecord", "stagedCount"),
  unstagedCount: readRequiredNumber(value, "gitRepositoryRecord", "unstagedCount"),
  untrackedCount: readRequiredNumber(value, "gitRepositoryRecord", "untrackedCount"),
  entries: readRequiredArray(value, "gitRepositoryRecord", "entries").map((entry) =>
    parseGitStatusEntryRecord(ensureRecord(entry, "gitStatusEntryRecord"))
  ),
  ...readOptionalString(value, "branch"),
  ...readOptionalString(value, "upstream")
});

const parseGitStatusEntryRecord = (
  value: Record<string, unknown>
) => ({
  path: readRequiredString(value, "gitStatusEntryRecord", "path"),
  indexStatus: readRequiredString(value, "gitStatusEntryRecord", "indexStatus"),
  workingTreeStatus: readRequiredString(value, "gitStatusEntryRecord", "workingTreeStatus"),
  staged: readRequiredBoolean(value, "gitStatusEntryRecord", "staged"),
  unstaged: readRequiredBoolean(value, "gitStatusEntryRecord", "unstaged"),
  untracked: readRequiredBoolean(value, "gitStatusEntryRecord", "untracked"),
  ...readOptionalString(value, "originalPath")
});

const parseGitCommitRecord = (
  value: Record<string, unknown>
): GitCommitRecord => ({
  hash: readRequiredString(value, "gitCommitRecord", "hash"),
  message: readRequiredString(value, "gitCommitRecord", "message")
});

const parseGitBranchRecord = (
  value: Record<string, unknown>
): GitBranchListRecord["local"][number] => ({
  name: readRequiredString(value, "gitBranchRecord", "name"),
  current: readRequiredBoolean(value, "gitBranchRecord", "current"),
  remote: readRequiredBoolean(value, "gitBranchRecord", "remote"),
  ...readOptionalString(value, "upstream")
});

const parseGitBranchOperationRecord = (
  value: Record<string, unknown>
): GitBranchOperationRecord => ({
  name: readRequiredString(value, "gitBranchOperationRecord", "name")
});

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: unknown,
  label: string,
  key: string
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  return ensureRecord(record[key], `${label}.${key}`);
};

const readRequiredArray = (
  value: Record<string, unknown>,
  label: string,
  key: string
): ReadonlyArray<unknown> => {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string
): string => {
  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string
): number => {
  const nested = value[key];
  if (typeof nested !== "number" || Number.isNaN(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredBoolean = (
  value: Record<string, unknown>,
  label: string,
  key: string
): boolean => {
  const nested = value[key];
  if (typeof nested !== "boolean") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readArrayString = (
  value: unknown,
  label: string
): string => {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}`);
  }

  return value;
};

const readOptionalString = (
  value: Record<string, unknown>,
  key: string
): Partial<Record<"branch" | "upstream" | "originalPath", string>> => {
  const nested = value[key];
  if (typeof nested !== "string" || nested.trim().length === 0) {
    return {};
  }

  if (key === "branch" || key === "upstream" || key === "originalPath") {
    return {
      [key]: nested
    } as Partial<Record<"branch" | "upstream" | "originalPath", string>>;
  }

  return {};
};
