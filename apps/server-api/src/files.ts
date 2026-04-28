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

export type FileSearchMatchRange = {
  start: number;
  end: number;
};

export type FileSearchMatch = {
  lineNumber: number;
  lineText: string;
  ranges: ReadonlyArray<FileSearchMatchRange>;
};

export type FileSearchResult = {
  path: string;
  name: string;
  matches: ReadonlyArray<FileSearchMatch>;
};

type FileError = {
  status: number;
  message: string;
};

type ResolvedSandboxPath = {
  root: string;
  target: string;
};

type FileSearchOptions = {
  query: string;
  isRegex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
};

type SearchPattern = {
  expression: RegExp;
  testExpression: RegExp;
};

const FsErrorCode = {
  NotFound: "ENOENT",
  PermissionDenied: "EACCES",
  OperationNotPermitted: "EPERM",
  NotDirectory: "ENOTDIR",
  IsDirectory: "EISDIR"
} as const;

const SearchLimit = {
  Files: 100,
  MatchesPerFile: 50
} as const;

const IgnoredDirectoryName = {
  Git: ".git",
  NodeModules: "node_modules",
  Dist: "dist",
  Build: "build",
  Coverage: "coverage"
} as const;

const IgnoredSearchDirectories = new Set<string>([
  IgnoredDirectoryName.Git,
  IgnoredDirectoryName.NodeModules,
  IgnoredDirectoryName.Dist,
  IgnoredDirectoryName.Build,
  IgnoredDirectoryName.Coverage
]);

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

export const searchFiles = async (
  rootPath: string,
  options: FileSearchOptions
): Promise<Result<ReadonlyArray<FileSearchResult>, FileError>> => {
  const resolved = resolveSandboxPath(rootPath, undefined);
  if (resolved.type === ResultType.Err) {
    return resolved;
  }

  const pattern = createSearchPattern(options);
  if (pattern.type === ResultType.Err) {
    return err(pattern.error);
  }

  try {
    const results = await searchDirectoryEntries(
      resolved.value.root,
      resolved.value.root,
      pattern.value
    );

    return ok(results);
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
    path: normalizeRelativePath(relativePath),
    name: entry.name,
    kind
  };
};

const searchDirectoryEntries = async (
  rootPath: string,
  directoryPath: string,
  pattern: SearchPattern
): Promise<ReadonlyArray<FileSearchResult>> => {
  const entries = sortSearchDirectoryEntries(await fs.readdir(directoryPath, {
    withFileTypes: true
  }));
  const results: FileSearchResult[] = [];

  for (const entry of entries) {
    if (results.length >= SearchLimit.Files) {
      break;
    }

    const targetPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (IgnoredSearchDirectories.has(entry.name)) {
        continue;
      }

      const childResults = await searchDirectoryEntries(rootPath, targetPath, pattern);
      results.push(...childResults);
      continue;
    }

    const content = await fs.readFile(targetPath, TextEncoding);
    const matches = findSearchMatches(content, pattern);
    if (matches.length === 0) {
      continue;
    }

    results.push({
      path: normalizeRelativePath(relative(rootPath, targetPath)),
      name: entry.name,
      matches
    });
  }

  return results;
};

const findSearchMatches = (
  content: string,
  pattern: SearchPattern
): ReadonlyArray<FileSearchMatch> => {
  const lines = content.split(/\r?\n/);
  const matches: FileSearchMatch[] = [];

  for (const [index, line] of lines.entries()) {
    if (!pattern.testExpression.test(line)) {
      pattern.testExpression.lastIndex = 0;
      continue;
    }

    pattern.testExpression.lastIndex = 0;
    const ranges = readSearchMatchRanges(line, pattern.expression);
    if (ranges.length === 0) {
      continue;
    }

    matches.push({
      lineNumber: index + 1,
      lineText: line,
      ranges
    });

    if (matches.length >= SearchLimit.MatchesPerFile) {
      break;
    }
  }

  return matches;
};

const readSearchMatchRanges = (
  line: string,
  expression: RegExp
): ReadonlyArray<FileSearchMatchRange> => {
  const ranges: FileSearchMatchRange[] = [];

  for (const match of line.matchAll(expression)) {
    const text = match[0];
    const start = match.index ?? 0;
    ranges.push({
      start,
      end: start + text.length
    });

    if (ranges.length >= SearchLimit.MatchesPerFile) {
      break;
    }

    if (text.length === 0) {
      break;
    }
  }

  return ranges;
};

const createSearchPattern = (
  options: FileSearchOptions
): Result<SearchPattern, FileError> => {
  const source = options.isRegex
    ? options.query
    : escapeRegExp(options.query);
  const boundedSource = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.matchCase ? "g" : "gi";

  try {
    return ok({
      expression: new RegExp(boundedSource, flags),
      testExpression: new RegExp(boundedSource, options.matchCase ? "" : "i")
    });
  } catch {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidPath
    });
  }
};

const normalizeRootPath = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return resolve(trimmed);
};

const normalizeRelativePath = (value: string): string =>
  value.split(sep).join("/");

const sortSearchDirectoryEntries = (
  entries: ReadonlyArray<Dirent>
): ReadonlyArray<Dirent> =>
  [...entries].sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
