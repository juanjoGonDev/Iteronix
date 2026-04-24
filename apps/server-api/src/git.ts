import type {
  GitAdapterError,
  GitCommitResult,
  GitDiffResult,
  GitRepository,
  GitStatusResult
} from "../../../packages/adapters/src/git/git-adapter";
import { GitCommandName, GitErrorCode } from "../../../packages/adapters/src/git/git-adapter";
import { ErrorMessage, GitField, HttpStatus } from "./constants";
import type { ProjectStore } from "./projects";
import { ProjectStoreErrorCode } from "./projects";
import { ResultType, err, ok, type Result } from "./result";
import type { CommandPolicy, WorkspacePolicy } from "./sandbox";

export type ApiError = {
  status: number;
  message: string;
};

export type GitApiDependencies = {
  projectStore: ProjectStore;
  workspacePolicy: WorkspacePolicy;
  commandPolicy: CommandPolicy;
  git: GitRepository;
};

export const parseGitStatusRequest = (
  value: unknown
): Result<{ projectId: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    GitField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  return ok({
    projectId: projectId.value
  });
};

export const parseGitDiffRequest = (
  value: unknown
): Result<{ projectId: string; staged: boolean }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    GitField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const staged = readOptionalBoolean(value, GitField.Staged);
  if (staged.type === ResultType.Err) {
    return staged;
  }

  return ok({
    projectId: projectId.value,
    staged: staged.value ?? false
  });
};

export const parseGitCommitRequest = (
  value: unknown
): Result<{ projectId: string; message: string }, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    GitField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const message = readRequiredString(
    value,
    GitField.Message,
    ErrorMessage.MissingCommitMessage
  );
  if (message.type === ResultType.Err) {
    return message;
  }

  if (!isConventionalCommitMessage(message.value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidCommitMessage
    });
  }

  return ok({
    projectId: projectId.value,
    message: message.value
  });
};

export const executeGitStatus = async (
  input: { projectId: string },
  dependencies: GitApiDependencies
): Promise<Result<GitStatusResult, ApiError>> => {
  const root = resolveGitRoot(input.projectId, dependencies);
  if (root.type === ResultType.Err) {
    return root;
  }

  const result = await dependencies.git.getStatus({
    rootPath: root.value
  });

  return mapGitResult(result);
};

export const executeGitDiff = async (
  input: { projectId: string; staged: boolean },
  dependencies: GitApiDependencies
): Promise<Result<GitDiffResult, ApiError>> => {
  const root = resolveGitRoot(input.projectId, dependencies);
  if (root.type === ResultType.Err) {
    return root;
  }

  const result = await dependencies.git.getDiff({
    rootPath: root.value,
    staged: input.staged
  });

  return mapGitResult(result);
};

export const executeGitCommit = async (
  input: { projectId: string; message: string },
  dependencies: GitApiDependencies
): Promise<Result<GitCommitResult, ApiError>> => {
  const root = resolveGitRoot(input.projectId, dependencies);
  if (root.type === ResultType.Err) {
    return root;
  }

  const result = await dependencies.git.createCommit({
    rootPath: root.value,
    message: input.message
  });

  return mapGitResult(result);
};

const resolveGitRoot = (
  projectId: string,
  dependencies: GitApiDependencies
): Result<string, ApiError> => {
  const project = dependencies.projectStore.getById(projectId);
  if (project.type === ResultType.Err) {
    return err(mapProjectStoreError(project.error.code));
  }

  const root = dependencies.workspacePolicy.assertPathAllowed(project.value.rootPath);
  if (root.type === ResultType.Err) {
    return err(root.error);
  }

  const command = dependencies.commandPolicy.assertCommandAllowed({
    command: GitCommandName,
    rootPath: root.value,
    cwd: root.value
  });
  if (command.type === ResultType.Err) {
    return err(command.error);
  }

  return ok(command.value.rootPath);
};

const mapGitResult = <T>(
  result: Result<T, GitAdapterError>
): Result<T, ApiError> => {
  if (result.type === ResultType.Ok) {
    return result;
  }

  return err(mapGitAdapterError(result.error));
};

const mapGitAdapterError = (error: GitAdapterError): ApiError => {
  if (
    error.code === GitErrorCode.NotRepository ||
    error.code === GitErrorCode.NoChangesToCommit
  ) {
    return {
      status: HttpStatus.BadRequest,
      message: error.message
    };
  }

  return {
    status: HttpStatus.InternalServerError,
    message: error.message || ErrorMessage.InternalServerError
  };
};

const mapProjectStoreError = (code: string): ApiError => {
  if (code === ProjectStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: ErrorMessage.NotFound
  };
};

const isConventionalCommitMessage = (value: string): boolean =>
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9./_-]+\))?!?: .+/u.test(
    value
  );

const invalidBody = (): Result<never, ApiError> =>
  err({
    status: HttpStatus.BadRequest,
    message: ErrorMessage.InvalidBody
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRequiredString = (
  record: Record<string, unknown>,
  key: string,
  message: string
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message
    });
  }

  return ok(trimmed);
};

const readOptionalBoolean = (
  record: Record<string, unknown>,
  key: string
): Result<boolean | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "boolean") {
    return invalidBody();
  }

  return ok(value);
};
