import { spawn } from "node:child_process";
import { ResultType, type Result } from "../../../domain/src/result";

export const GitCommandName = "git";

export const GitErrorCode = {
  CommandFailed: "command_failed",
  NotRepository: "not_repository",
  NoChangesToCommit: "no_changes_to_commit",
  BranchExists: "branch_exists",
  BranchMissing: "branch_missing",
  InvalidBranchName: "invalid_branch_name",
  UpstreamMissing: "upstream_missing",
  RemoteMissing: "remote_missing"
} as const;

export type GitErrorCode = typeof GitErrorCode[keyof typeof GitErrorCode];

export type GitAdapterError = {
  code: GitErrorCode;
  command: string;
  message: string;
  exitCode?: number;
  stderr?: string;
  stdout?: string;
};

export type GitStatusEntry = {
  path: string;
  originalPath?: string;
  indexStatus: string;
  workingTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
};

export type GitStatusResult = {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  clean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  entries: ReadonlyArray<GitStatusEntry>;
};

export type GitDiffResult = {
  staged: boolean;
  diff: string;
};

export type GitPathOperationResult = {
  paths: ReadonlyArray<string>;
};

export type GitCommitResult = {
  hash: string;
  message: string;
};

export type GitBranch = {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
};

export type GitBranchListResult = {
  local: ReadonlyArray<GitBranch>;
  remote: ReadonlyArray<GitBranch>;
};

export type GitBranchOperationResult = {
  name: string;
  upstream?: string;
};

export type GitRepository = {
  getStatus: (
    input: {
      rootPath: string;
    }
  ) => Promise<Result<GitStatusResult, GitAdapterError>>;
  getDiff: (
    input: {
      rootPath: string;
      staged: boolean;
    }
  ) => Promise<Result<GitDiffResult, GitAdapterError>>;
  stagePaths: (
    input: {
      rootPath: string;
      paths: ReadonlyArray<string>;
    }
  ) => Promise<Result<GitPathOperationResult, GitAdapterError>>;
  unstagePaths: (
    input: {
      rootPath: string;
      paths: ReadonlyArray<string>;
    }
  ) => Promise<Result<GitPathOperationResult, GitAdapterError>>;
  revertPaths: (
    input: {
      rootPath: string;
      paths: ReadonlyArray<string>;
    }
  ) => Promise<Result<GitPathOperationResult, GitAdapterError>>;
  createCommit: (
    input: {
      rootPath: string;
      message: string;
    }
  ) => Promise<Result<GitCommitResult, GitAdapterError>>;
  listBranches: (
    input: {
      rootPath: string;
    }
  ) => Promise<Result<GitBranchListResult, GitAdapterError>>;
  createBranch: (
    input: {
      rootPath: string;
      name: string;
    }
  ) => Promise<Result<GitBranchOperationResult, GitAdapterError>>;
  checkoutBranch: (
    input: {
      rootPath: string;
      name: string;
    }
  ) => Promise<Result<GitBranchOperationResult, GitAdapterError>>;
  pushCurrentBranch: (
    input: {
      rootPath: string;
    }
  ) => Promise<Result<GitBranchOperationResult, GitAdapterError>>;
  publishCurrentBranch: (
    input: {
      rootPath: string;
    }
  ) => Promise<Result<GitBranchOperationResult, GitAdapterError>>;
};

export const createGitCliAdapter = (
  input: {
    command?: string;
  } = {}
): GitRepository => {
  const command = normalizeCommand(input.command);

  const getStatus = async (
    statusInput: {
      rootPath: string;
    }
  ): Promise<Result<GitStatusResult, GitAdapterError>> => {
    const result = await runGitCommand({
      command,
      rootPath: statusInput.rootPath,
      args: ["status", "--porcelain=1", "-b"]
    });
    if (result.type === ResultType.Err) {
      return result;
    }

    return {
      type: ResultType.Ok,
      value: parseGitStatusOutput(result.value.stdout)
    };
  };

  const getDiff = async (
    diffInput: {
      rootPath: string;
      staged: boolean;
    }
  ): Promise<Result<GitDiffResult, GitAdapterError>> => {
    const args = diffInput.staged
      ? ["diff", "--cached", "--no-ext-diff"]
      : ["diff", "--no-ext-diff"];
    const result = await runGitCommand({
      command,
      rootPath: diffInput.rootPath,
      args
    });
    if (result.type === ResultType.Err) {
      return result;
    }

    return {
      type: ResultType.Ok,
      value: {
        staged: diffInput.staged,
        diff: result.value.stdout
      }
    };
  };

  const stagePaths = async (
    stageInput: {
      rootPath: string;
      paths: ReadonlyArray<string>;
    }
  ): Promise<Result<GitPathOperationResult, GitAdapterError>> =>
    runGitPathOperation({
      command,
      rootPath: stageInput.rootPath,
      paths: stageInput.paths,
      args: ["add", "--"]
    });

  const unstagePaths = async (
    unstageInput: {
      rootPath: string;
      paths: ReadonlyArray<string>;
    }
  ): Promise<Result<GitPathOperationResult, GitAdapterError>> =>
    runGitPathOperation({
      command,
      rootPath: unstageInput.rootPath,
      paths: unstageInput.paths,
      args: ["restore", "--staged", "--"]
    });

  const revertPaths = async (
    revertInput: {
      rootPath: string;
      paths: ReadonlyArray<string>;
    }
  ): Promise<Result<GitPathOperationResult, GitAdapterError>> =>
    runGitPathOperation({
      command,
      rootPath: revertInput.rootPath,
      paths: revertInput.paths,
      args: ["restore", "--worktree", "--source=HEAD", "--"]
    });

  const createCommit = async (
    commitInput: {
      rootPath: string;
      message: string;
    }
  ): Promise<Result<GitCommitResult, GitAdapterError>> => {
    const commitResult = await runGitCommand({
      command,
      rootPath: commitInput.rootPath,
      args: ["commit", "--quiet", "-m", commitInput.message]
    });
    if (commitResult.type === ResultType.Err) {
      return commitResult;
    }

    const hashResult = await runGitCommand({
      command,
      rootPath: commitInput.rootPath,
      args: ["rev-parse", "HEAD"]
    });
    if (hashResult.type === ResultType.Err) {
      return hashResult;
    }

    return {
      type: ResultType.Ok,
      value: {
        hash: hashResult.value.stdout.trim(),
        message: commitInput.message
      }
    };
  };

  const listBranches = async (
    branchInput: {
      rootPath: string;
    }
  ): Promise<Result<GitBranchListResult, GitAdapterError>> => {
    const localBranches = await runGitCommand({
      command,
      rootPath: branchInput.rootPath,
      args: ["for-each-ref", "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)", "refs/heads"]
    });
    if (localBranches.type === ResultType.Err) {
      return localBranches;
    }

    const remoteBranches = await runGitCommand({
      command,
      rootPath: branchInput.rootPath,
      args: ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]
    });
    if (remoteBranches.type === ResultType.Err) {
      return remoteBranches;
    }

    return {
      type: ResultType.Ok,
      value: {
        local: parseLocalBranchOutput(localBranches.value.stdout),
        remote: parseRemoteBranchOutput(remoteBranches.value.stdout)
      }
    };
  };

  const createBranch = async (
    branchInput: {
      rootPath: string;
      name: string;
    }
  ): Promise<Result<GitBranchOperationResult, GitAdapterError>> => {
    const result = await runGitCommand({
      command,
      rootPath: branchInput.rootPath,
      args: ["branch", branchInput.name]
    });
    if (result.type === ResultType.Err) {
      return result;
    }

    return {
      type: ResultType.Ok,
      value: {
        name: branchInput.name
      }
    };
  };

  const checkoutBranch = async (
    branchInput: {
      rootPath: string;
      name: string;
    }
  ): Promise<Result<GitBranchOperationResult, GitAdapterError>> => {
    const result = await runGitCommand({
      command,
      rootPath: branchInput.rootPath,
      args: ["switch", branchInput.name]
    });
    if (result.type === ResultType.Err) {
      return result;
    }

    return {
      type: ResultType.Ok,
      value: {
        name: branchInput.name
      }
    };
  };

  const pushCurrentBranch = async (
    branchInput: {
      rootPath: string;
    }
  ): Promise<Result<GitBranchOperationResult, GitAdapterError>> => {
    const branchState = await readCurrentBranchState({
      command,
      rootPath: branchInput.rootPath
    });
    if (branchState.type === ResultType.Err) {
      return branchState;
    }

    if (!branchState.value.upstream) {
      return {
        type: ResultType.Err,
        error: {
          code: GitErrorCode.UpstreamMissing,
          command,
          message: `Current branch ${branchState.value.name} has no upstream configured.`
        }
      };
    }

    const result = await runGitCommand({
      command,
      rootPath: branchInput.rootPath,
      args: ["push"]
    });
    if (result.type === ResultType.Err) {
      return result;
    }

    return {
      type: ResultType.Ok,
      value: {
        name: branchState.value.name,
        upstream: branchState.value.upstream
      }
    };
  };

  const publishCurrentBranch = async (
    branchInput: {
      rootPath: string;
    }
  ): Promise<Result<GitBranchOperationResult, GitAdapterError>> => {
    const branchState = await readCurrentBranchState({
      command,
      rootPath: branchInput.rootPath
    });
    if (branchState.type === ResultType.Err) {
      return branchState;
    }

    const result = await runGitCommand({
      command,
      rootPath: branchInput.rootPath,
      args: ["push", "-u", "origin", branchState.value.name]
    });
    if (result.type === ResultType.Err) {
      return result;
    }

    const refreshedState = await readCurrentBranchState({
      command,
      rootPath: branchInput.rootPath
    });
    if (refreshedState.type === ResultType.Err) {
      return refreshedState;
    }

    return {
      type: ResultType.Ok,
      value: {
        name: refreshedState.value.name,
        upstream: refreshedState.value.upstream ?? `origin/${refreshedState.value.name}`
      }
    };
  };

  return {
    getStatus,
    getDiff,
    stagePaths,
    unstagePaths,
    revertPaths,
    createCommit,
    listBranches,
    createBranch,
    checkoutBranch,
    pushCurrentBranch,
    publishCurrentBranch
  };
};

const normalizeCommand = (value: string | undefined): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : GitCommandName;

const runGitCommand = async (
  input: {
    command: string;
    rootPath: string;
    args: ReadonlyArray<string>;
  }
): Promise<Result<{ stdout: string; stderr: string }, GitAdapterError>> => {
  const execution = await spawnProcess(input);
  if (execution.type === ResultType.Err) {
    return execution;
  }

  if (execution.value.exitCode !== 0) {
    return {
      type: ResultType.Err,
      error: mapGitExecutionFailure({
        command: input.command,
        exitCode: execution.value.exitCode,
        stdout: execution.value.stdout,
        stderr: execution.value.stderr
      })
    };
  }

  return {
    type: ResultType.Ok,
    value: {
      stdout: execution.value.stdout,
      stderr: execution.value.stderr
    }
  };
};

const runGitPathOperation = async (
  input: {
    command: string;
    rootPath: string;
    paths: ReadonlyArray<string>;
    args: ReadonlyArray<string>;
  }
): Promise<Result<GitPathOperationResult, GitAdapterError>> => {
  const result = await runGitCommand({
    command: input.command,
    rootPath: input.rootPath,
    args: [...input.args, ...input.paths]
  });
  if (result.type === ResultType.Err) {
    return result;
  }

  return {
    type: ResultType.Ok,
    value: {
      paths: [...input.paths]
    }
  };
};

const readCurrentBranchState = async (
  input: {
    command: string;
    rootPath: string;
  }
): Promise<Result<{ name: string; upstream?: string }, GitAdapterError>> => {
  const status = await runGitCommand({
    command: input.command,
    rootPath: input.rootPath,
    args: ["status", "--porcelain=1", "-b"]
  });
  if (status.type === ResultType.Err) {
    return status;
  }

  const parsedStatus = parseGitStatusOutput(status.value.stdout);
  if (!parsedStatus.branch) {
    return {
      type: ResultType.Err,
      error: {
        code: GitErrorCode.BranchMissing,
        command: input.command,
        message: "Current branch not found"
      }
    };
  }

  return {
    type: ResultType.Ok,
    value: {
      name: parsedStatus.branch,
      ...(parsedStatus.upstream ? { upstream: parsedStatus.upstream } : {})
    }
  };
};

const spawnProcess = (
  input: {
    command: string;
    rootPath: string;
    args: ReadonlyArray<string>;
  }
): Promise<Result<{ stdout: string; stderr: string; exitCode: number }, GitAdapterError>> =>
  new Promise((resolve) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.rootPath,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: unknown) => {
      stdout += toText(chunk);
    });

    child.stderr.on("data", (chunk: unknown) => {
      stderr += toText(chunk);
    });

    child.once("error", (error: Error & { code?: unknown }) => {
      resolve({
        type: ResultType.Err,
        error: {
          code: GitErrorCode.CommandFailed,
          command: input.command,
          message: error.message
        }
      });
    });

    child.once("close", (code: number | null) => {
      resolve({
        type: ResultType.Ok,
        value: {
          stdout,
          stderr,
          exitCode: code ?? 1
        }
      });
    });
  });

const parseGitStatusOutput = (stdout: string): GitStatusResult => {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const branchLine = lines[0]?.startsWith("## ") ? lines[0] : undefined;
  const entryLines = branchLine ? lines.slice(1) : lines;
  const branchInfo = parseBranchLine(branchLine);
  const entries = entryLines.map(parseStatusEntry);

  return {
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    clean: entries.length === 0,
    stagedCount: entries.filter((entry) => entry.staged).length,
    unstagedCount: entries.filter((entry) => entry.unstaged).length,
    untrackedCount: entries.filter((entry) => entry.untracked).length,
    entries,
    ...(branchInfo.branch ? { branch: branchInfo.branch } : {}),
    ...(branchInfo.upstream ? { upstream: branchInfo.upstream } : {})
  };
};

const parseBranchLine = (
  line: string | undefined
): {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
} => {
  if (!line) {
    return {
      ahead: 0,
      behind: 0
    };
  }

  const content = line.slice(3);
  const relationStart = content.indexOf(" [");
  const branchSection = relationStart >= 0 ? content.slice(0, relationStart) : content;
  const relationSection =
    relationStart >= 0 ? content.slice(relationStart + 2, -1) : "";

  const parts = branchSection.split("...");
  const branch = normalizeBranchName(parts[0]);
  const upstream = parts[1] && parts[1].trim().length > 0 ? parts[1].trim() : undefined;
  const ahead = readRelationCount(relationSection, "ahead ");
  const behind = readRelationCount(relationSection, "behind ");

  return {
    ahead,
    behind,
    ...(branch ? { branch } : {}),
    ...(upstream ? { upstream } : {})
  };
};

const normalizeBranchName = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith("HEAD ")) {
    return undefined;
  }

  return trimmed;
};

const readRelationCount = (value: string, label: string): number => {
  const match = new RegExp(`${escapeRegExp(label)}(\\d+)`, "u").exec(value);
  if (!match?.[1]) {
    return 0;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseStatusEntry = (line: string): GitStatusEntry => {
  const indexStatus = line[0] ?? " ";
  const workingTreeStatus = line[1] ?? " ";
  const pathSection = line.length > 3 ? line.slice(3) : "";
  const renameParts = pathSection.split(" -> ");
  const path = renameParts.length > 1 ? renameParts[renameParts.length - 1] ?? pathSection : pathSection;
  const originalPath = renameParts.length > 1 ? renameParts[0] : undefined;

  return {
    path,
    indexStatus,
    workingTreeStatus,
    staged: indexStatus !== " " && indexStatus !== "?",
    unstaged: workingTreeStatus !== " " && workingTreeStatus !== "?",
    untracked: indexStatus === "?" && workingTreeStatus === "?",
    ...(originalPath ? { originalPath } : {})
  };
};

const parseLocalBranchOutput = (stdout: string): ReadonlyArray<GitBranch> =>
  stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseLocalBranchLine);

const parseLocalBranchLine = (line: string): GitBranch => {
  const [namePart = "", currentPart = "", upstreamPart = ""] = line.split("\t");

  return {
    name: namePart.trim(),
    current: currentPart.trim() === "*",
    remote: false,
    ...(upstreamPart.trim().length > 0 ? { upstream: upstreamPart.trim() } : {})
  };
};

const parseRemoteBranchOutput = (stdout: string): ReadonlyArray<GitBranch> =>
  stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith("/HEAD"))
    .map((name) => ({
      name,
      current: false,
      remote: true
    }));

const mapGitExecutionFailure = (
  input: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }
): GitAdapterError => {
  const combinedOutput = `${input.stdout}\n${input.stderr}`.toLowerCase();
  if (combinedOutput.includes("not a git repository")) {
    return {
      code: GitErrorCode.NotRepository,
      command: input.command,
      message: "Not a git repository",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr
    };
  }

  if (combinedOutput.includes("nothing to commit")) {
    return {
      code: GitErrorCode.NoChangesToCommit,
      command: input.command,
      message: "No staged changes to commit",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr
    };
  }

  if (combinedOutput.includes("already exists")) {
    return {
      code: GitErrorCode.BranchExists,
      command: input.command,
      message: input.stderr.trim().length > 0 ? input.stderr.trim() : "Branch already exists",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr
    };
  }

  if (
    combinedOutput.includes("not a valid branch name") ||
    combinedOutput.includes("invalid branch name")
  ) {
    return {
      code: GitErrorCode.InvalidBranchName,
      command: input.command,
      message: input.stderr.trim().length > 0 ? input.stderr.trim() : "Invalid branch name",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr
    };
  }

  if (
    combinedOutput.includes("has no upstream branch") ||
    combinedOutput.includes("no upstream configured")
  ) {
    return {
      code: GitErrorCode.UpstreamMissing,
      command: input.command,
      message: input.stderr.trim().length > 0 ? input.stderr.trim() : "Current branch has no upstream configured",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr
    };
  }

  if (
    combinedOutput.includes("no configured push destination") ||
    combinedOutput.includes("no such remote") ||
    combinedOutput.includes("unknown remote") ||
    combinedOutput.includes("could not read from remote repository")
  ) {
    return {
      code: GitErrorCode.RemoteMissing,
      command: input.command,
      message: input.stderr.trim().length > 0 ? input.stderr.trim() : "Remote repository is not configured",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr
    };
  }

  if (
    combinedOutput.includes("unknown revision") ||
    combinedOutput.includes("invalid reference") ||
    combinedOutput.includes("not a commit") ||
    combinedOutput.includes("did not match any file") ||
    combinedOutput.includes("invalid reference:") ||
    combinedOutput.includes("invalid reference")
  ) {
    return {
      code: GitErrorCode.BranchMissing,
      command: input.command,
      message: input.stderr.trim().length > 0 ? input.stderr.trim() : "Branch not found",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr
    };
  }

  return {
    code: GitErrorCode.CommandFailed,
    command: input.command,
    message: input.stderr.trim().length > 0 ? input.stderr.trim() : "Git command failed",
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr
  };
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const toText = (chunk: unknown): string => {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString("utf8");
  }

  return "";
};
