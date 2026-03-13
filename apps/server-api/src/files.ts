import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ErrorMessage, FileEntryKind, HttpStatus, TextEncoding } from "./constants";
import { err, ok, ResultType, type Result } from "./result";

export type FileEntry = {
  path: string;
  name: string;
  kind: FileEntryKind;
};

type FileError = {
  status: number;
  message: string;
};

type ResolvedSandboxPath = {
  root: string;
  target: string;
};

const FsErrorCode = {
  NotFound: "ENOENT",
  PermissionDenied: "EACCES",
  OperationNotPermitted: "EPERM",
  NotDirectory: "ENOTDIR",
  IsDirectory: "EISDIR"
} as const;

export const resolveSandboxPath = (
  rootPath: string,
  targetPath: string | undefined
): Result<ResolvedSandboxPath, FileError> => {
  const normalizedRoot = normalizeRootPath(rootPath);
  if (!normalizedRoot) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidPath
    });
  }

  const resolvedTarget = resolve(normalizedRoot, targetPath ?? ".");
  const relativePath = relative(normalizedRoot, resolvedTarget);

  if (isOutsideRoot(relativePath)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidPath
    });
  }

  return ok({
    root: normalizedRoot,
    target: resolvedTarget
  });
};

export const listFileTree = async (
  rootPath: string,
  targetPath: string | undefined
): Promise<Result<ReadonlyArray<FileEntry>, FileError>> => {
  const resolved = resolveSandboxPath(rootPath, targetPath);
  if (resolved.type === ResultType.Err) {
    return resolved;
  }

  try {
    const entries = await fs.readdir(resolved.value.target, {
      withFileTypes: true
    });
    const items = entries.map((entry) =>
      toFileEntry(resolved.value.root, resolved.value.target, entry)
    );
    return ok(items);
  } catch (error: unknown) {
    return err(mapFsError(error));
  }
};

export const readFileContent = async (
  rootPath: string,
  targetPath: string
): Promise<Result<{ content: string }, FileError>> => {
  const resolved = resolveSandboxPath(rootPath, targetPath);
  if (resolved.type === ResultType.Err) {
    return resolved;
  }

  try {
    const content = await fs.readFile(resolved.value.target, TextEncoding);
    return ok({ content });
  } catch (error: unknown) {
    return err(mapFsError(error));
  }
};

export const writeFileContent = async (
  rootPath: string,
  targetPath: string,
  content: string
): Promise<Result<{ bytesWritten: number }, FileError>> => {
  const resolved = resolveSandboxPath(rootPath, targetPath);
  if (resolved.type === ResultType.Err) {
    return resolved;
  }

  try {
    await fs.mkdir(dirname(resolved.value.target), { recursive: true });
    await fs.writeFile(resolved.value.target, content, TextEncoding);
    return ok({
      bytesWritten: Buffer.byteLength(content, TextEncoding)
    });
  } catch (error: unknown) {
    return err(mapFsError(error));
  }
};

export const deleteFile = async (
  rootPath: string,
  targetPath: string
): Promise<Result<{ success: boolean }, FileError>> => {
  const resolved = resolveSandboxPath(rootPath, targetPath);
  if (resolved.type === ResultType.Err) {
    return resolved;
  }

  try {
    await fs.unlink(resolved.value.target);
    return ok({ success: true });
  } catch (error: unknown) {
    return err(mapFsError(error));
  }
};

export const createDirectory = async (
  rootPath: string,
  targetPath: string
): Promise<Result<{ success: boolean }, FileError>> => {
  const resolved = resolveSandboxPath(rootPath, targetPath);
  if (resolved.type === ResultType.Err) {
    return resolved;
  }

  try {
    await fs.mkdir(resolved.value.target, { recursive: true });
    return ok({ success: true });
  } catch (error: unknown) {
    return err(mapFsError(error));
  }
};

export const moveFile = async (
  rootPath: string,
  sourcePath: string,
  targetPath: string
): Promise<Result<{ success: boolean }, FileError>> => {
  const resolved = resolveSandboxPath(rootPath, sourcePath);
  if (resolved.type === ResultType.Err) {
    return resolved;
  }

  try {
    await fs.mkdir(dirname(resolved.value.target), { recursive: true });
    await fs.rename(resolved.value.target, targetPath);
    return ok({ success: true });
  } catch (error: unknown) {
    return err(mapFsError(error));
  }
};

const toFileEntry = (
  rootPath: string,
  directoryPath: string,
  entry: Dirent
): FileEntry => {
  const targetPath = resolve(directoryPath, entry.name);
  const relativePath = relative(rootPath, targetPath);
  const kind = entry.isDirectory() ? FileEntryKind.Directory : FileEntryKind.File;
  return {
    path: relativePath,
    name: entry.name,
    kind
  };
};

const normalizeRootPath = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return resolve(trimmed);
};

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

const mapFsError = (error: unknown): FileError => {
  const code = getFsErrorCode(error);

  if (code === FsErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound
    };
  }

  if (
    code === FsErrorCode.PermissionDenied ||
    code === FsErrorCode.OperationNotPermitted
  ) {
    return {
      status: HttpStatus.Forbidden,
      message: ErrorMessage.Forbidden
    };
  }

  if (code === FsErrorCode.NotDirectory || code === FsErrorCode.IsDirectory) {
    return {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidPath
    };
  }

  return {
    status: HttpStatus.InternalServerError,
    message: ErrorMessage.InternalServerError
  };
};

const getFsErrorCode = (error: unknown): string | undefined => {
  if (!isFsError(error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
};

const isFsError = (error: unknown): error is { code?: unknown } =>
  typeof error === "object" && error !== null && "code" in error;
