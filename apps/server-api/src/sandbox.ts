import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { ErrorMessage, HttpStatus } from "./constants";
import { ResultType, err, ok, type Result } from "./result";

export type SandboxError = {
  status: number;
  message: string;
};

export type WorkspacePolicy = {
  allowlist: ReadonlyArray<string>;
  assertPathAllowed: (path: string) => Result<string, SandboxError>;
};

export type CommandPolicyInput = {
  command: string;
  rootPath: string;
  cwd?: string;
};

export type CommandPolicyDecision = {
  command: string;
  rootPath: string;
  cwd: string;
};

export type CommandPolicy = {
  assertCommandAllowed: (
    input: CommandPolicyInput
  ) => Result<CommandPolicyDecision, SandboxError>;
};

export const createWorkspacePolicy = (
  allowlist: ReadonlyArray<string>
): WorkspacePolicy => {
  const roots = normalizeAllowlist(allowlist);

  const assertPathAllowed = (path: string): Result<string, SandboxError> =>
    ensurePathAllowed(roots, path);

  return {
    allowlist: roots,
    assertPathAllowed
  };
};

export const createCommandPolicy = (
  allowlist: ReadonlyArray<string>,
  workspacePolicy: WorkspacePolicy
): CommandPolicy => {
  const commands = normalizeCommandAllowlist(allowlist);

  const assertCommandAllowed = (
    input: CommandPolicyInput
  ): Result<CommandPolicyDecision, SandboxError> =>
    ensureCommandAllowed(commands, workspacePolicy, input);

  return {
    assertCommandAllowed
  };
};

const ensurePathAllowed = (
  roots: ReadonlyArray<string>,
  path: string
): Result<string, SandboxError> => {
  const normalized = normalizePath(path);
  if (!normalized) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidPath
    });
  }

  if (roots.length === 0) {
    return err({
      status: HttpStatus.Forbidden,
      message: ErrorMessage.WorkspaceNotAllowed
    });
  }

  for (const root of roots) {
    if (isWithinRoot(root, normalized)) {
      return ok(normalized);
    }
  }

  return err({
    status: HttpStatus.Forbidden,
    message: ErrorMessage.WorkspaceNotAllowed
  });
};

const ensureCommandAllowed = (
  commands: ReadonlyArray<string>,
  workspacePolicy: WorkspacePolicy,
  input: CommandPolicyInput
): Result<CommandPolicyDecision, SandboxError> => {
  const command = normalizeCommand(input.command);
  if (!command) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingCommand
    });
  }

  if (!isCommandAllowed(commands, command)) {
    return err({
      status: HttpStatus.Forbidden,
      message: ErrorMessage.CommandNotAllowed
    });
  }

  const rootResult = workspacePolicy.assertPathAllowed(input.rootPath);
  if (rootResult.type === ResultType.Err) {
    return rootResult;
  }

  const cwdResult = ensurePathWithinRoot(
    rootResult.value,
    input.cwd ?? rootResult.value
  );
  if (cwdResult.type === ResultType.Err) {
    return cwdResult;
  }

  return ok({
    command,
    rootPath: rootResult.value,
    cwd: cwdResult.value
  });
};

const normalizeAllowlist = (allowlist: ReadonlyArray<string>): string[] => {
  const roots: string[] = [];

  for (const entry of allowlist) {
    const normalized = normalizePath(entry);
    if (normalized) {
      roots.push(normalized);
    }
  }

  return roots;
};

const normalizeCommandAllowlist = (
  allowlist: ReadonlyArray<string>
): string[] => {
  const commands: string[] = [];

  for (const entry of allowlist) {
    const normalized = normalizeCommand(entry);
    if (normalized) {
      commands.push(normalized);
    }
  }

  return commands;
};

const normalizePath = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return resolve(trimmed);
};

const normalizeCommand = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return normalizeCommandCase(trimmed);
};

const ensurePathWithinRoot = (
  root: string,
  target: string
): Result<string, SandboxError> => {
  const resolved = normalizePath(target);
  if (!resolved) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidPath
    });
  }

  if (!isWithinRoot(root, resolved)) {
    return err({
      status: HttpStatus.Forbidden,
      message: ErrorMessage.WorkspaceNotAllowed
    });
  }

  return ok(resolved);
};

const isWithinRoot = (root: string, target: string): boolean => {
  const normalizedRoot = normalizePathCase(root);
  const normalizedTarget = normalizePathCase(target);
  const relativePath = relative(normalizedRoot, normalizedTarget);
  return !isOutsideRoot(relativePath);
};

const normalizePathCase = (value: string): string =>
  process.platform === "win32" ? value.toLowerCase() : value;

const isOutsideRoot = (relativePath: string): boolean => {
  if (relativePath.length === 0) {
    return false;
  }

  if (relativePath === "..") {
    return true;
  }

  if (relativePath.startsWith(`..${sep}`)) {
    return true;
  }

  return isAbsolute(relativePath);
};

const isCommandAllowed = (
  allowlist: ReadonlyArray<string>,
  command: string
): boolean => {
  const commandName = normalizeCommandCase(basename(command));

  for (const entry of allowlist) {
    if (entry === command || entry === commandName) {
      return true;
    }
  }

  return false;
};

const normalizeCommandCase = (value: string): string =>
  process.platform === "win32" ? value.toLowerCase() : value;
