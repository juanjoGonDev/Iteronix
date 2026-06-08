import { requestJson } from "./server-api-client.js";
import { parseProjectOpenResponse } from "./quality-gates-client.js";
import type { ProjectRecord } from "./workbench-types.js";

const EndpointPath = {
  ProjectOpen: "/projects/open",
  FilesTree: "/files/tree",
  FilesRead: "/files/read",
  FilesSearch: "/files/search"
} as const;

export const ExplorerFileEntryKind = {
  Directory: "directory",
  File: "file"
} as const;

export type ExplorerFileEntryKind =
  typeof ExplorerFileEntryKind[keyof typeof ExplorerFileEntryKind];

export type ExplorerFileEntryRecord = {
  path: string;
  name: string;
  kind: ExplorerFileEntryKind;
};

export type ExplorerFileContentRecord = {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
};

export type ExplorerFileSearchMatchRangeRecord = {
  start: number;
  end: number;
};

export type ExplorerFileSearchMatchRecord = {
  lineNumber: number;
  lineText: string;
  ranges: ReadonlyArray<ExplorerFileSearchMatchRangeRecord>;
};

export type ExplorerFileSearchResultRecord = {
  path: string;
  name: string;
  matches: ReadonlyArray<ExplorerFileSearchMatchRecord>;
};

export type ExplorerClient = {
  openProject: (input: {
    rootPath: string;
    name?: string;
  }) => Promise<ProjectRecord>;
  listFileTree: (input: {
    projectId: string;
    path?: string;
  }) => Promise<ReadonlyArray<ExplorerFileEntryRecord>>;
  readFile: (input: {
    projectId: string;
    path: string;
    startLine?: number;
    lineCount?: number;
  }) => Promise<ExplorerFileContentRecord>;
  searchFiles: (input: {
    projectId: string;
    query: string;
    isRegex?: boolean;
    matchCase?: boolean;
    wholeWord?: boolean;
  }) => Promise<ReadonlyArray<ExplorerFileSearchResultRecord>>;
};

export const createExplorerClient = (): ExplorerClient => ({
  openProject: (input) =>
    requestJson({
      path: EndpointPath.ProjectOpen,
      body: {
        rootPath: input.rootPath,
        ...(input.name ? { name: input.name } : {})
      },
      parse: parseProjectOpenResponse
    }),
  listFileTree: (input) =>
    requestJson({
      path: EndpointPath.FilesTree,
      body: {
        projectId: input.projectId,
        ...(input.path ? { path: input.path } : {})
      },
      parse: parseExplorerFileTreeResponse
    }),
  readFile: (input) =>
    requestJson({
      path: EndpointPath.FilesRead,
      body: {
        projectId: input.projectId,
        path: input.path,
        ...(input.startLine !== undefined ? { startLine: input.startLine } : {}),
        ...(input.lineCount !== undefined ? { lineCount: input.lineCount } : {})
      },
      parse: parseExplorerFileReadResponse
    }),
  searchFiles: (input) =>
    requestJson({
      path: EndpointPath.FilesSearch,
      body: {
        projectId: input.projectId,
        query: input.query,
        ...(input.isRegex ? { isRegex: true } : {}),
        ...(input.matchCase ? { matchCase: true } : {}),
        ...(input.wholeWord ? { wholeWord: true } : {})
      },
      parse: parseExplorerFileSearchResponse
    })
});

export const parseExplorerFileTreeResponse = (
  value: unknown
): ReadonlyArray<ExplorerFileEntryRecord> =>
  readRequiredArray(value, "explorerFileTreeResponse", "entries").map((entry) =>
    parseExplorerFileEntryRecord(ensureRecord(entry, "explorerFileEntryRecord"))
  );

export const parseExplorerFileReadResponse = (
  value: unknown
): ExplorerFileContentRecord => {
  const record = ensureRecord(value, "explorerFileReadResponse");
  const content = readRequiredString(record, "explorerFileReadResponse", "content");
  const totalLines = readOptionalNumber(
    record,
    "explorerFileReadResponse",
    "totalLines"
  ) ?? countExplorerContentLines(content);
  const startLine = readOptionalNumber(
    record,
    "explorerFileReadResponse",
    "startLine"
  ) ?? 1;
  const endLine = readOptionalNumber(
    record,
    "explorerFileReadResponse",
    "endLine"
  ) ?? startLine + countExplorerContentLines(content) - 1;
  const truncated = readOptionalBoolean(
    record,
    "explorerFileReadResponse",
    "truncated"
  ) ?? false;

  return {
    content,
    startLine,
    endLine,
    totalLines,
    truncated
  };
};

export const parseExplorerFileSearchResponse = (
  value: unknown
): ReadonlyArray<ExplorerFileSearchResultRecord> =>
  readRequiredArray(value, "explorerFileSearchResponse", "results").map((entry) =>
    parseExplorerFileSearchResultRecord(
      ensureRecord(entry, "explorerFileSearchResultRecord")
    )
  );

const parseExplorerFileEntryRecord = (
  value: Record<string, unknown>
): ExplorerFileEntryRecord => ({
  path: readRequiredString(value, "explorerFileEntryRecord", "path"),
  name: readRequiredString(value, "explorerFileEntryRecord", "name"),
  kind: readExplorerFileEntryKind(value, "explorerFileEntryRecord", "kind")
});

const parseExplorerFileSearchResultRecord = (
  value: Record<string, unknown>
): ExplorerFileSearchResultRecord => ({
  path: readRequiredString(value, "explorerFileSearchResultRecord", "path"),
  name: readRequiredString(value, "explorerFileSearchResultRecord", "name"),
  matches: readRequiredArray(
    value,
    "explorerFileSearchResultRecord",
    "matches"
  ).map((match) =>
    parseExplorerFileSearchMatchRecord(
      ensureRecord(match, "explorerFileSearchMatchRecord")
    )
  )
});

const parseExplorerFileSearchMatchRecord = (
  value: Record<string, unknown>
): ExplorerFileSearchMatchRecord => ({
  lineNumber: readRequiredNumber(
    value,
    "explorerFileSearchMatchRecord",
    "lineNumber"
  ),
  lineText: readRequiredString(value, "explorerFileSearchMatchRecord", "lineText"),
  ranges: readRequiredArray(
    value,
    "explorerFileSearchMatchRecord",
    "ranges"
  ).map((range) =>
    parseExplorerFileSearchMatchRangeRecord(
      ensureRecord(range, "explorerFileSearchMatchRangeRecord")
    )
  )
});

const parseExplorerFileSearchMatchRangeRecord = (
  value: Record<string, unknown>
): ExplorerFileSearchMatchRangeRecord => ({
  start: readRequiredNumber(
    value,
    "explorerFileSearchMatchRangeRecord",
    "start"
  ),
  end: readRequiredNumber(
    value,
    "explorerFileSearchMatchRangeRecord",
    "end"
  )
});

const readExplorerFileEntryKind = (
  value: Record<string, unknown>,
  label: string,
  key: string
): ExplorerFileEntryKind => {
  const kind = readRequiredString(value, label, key);

  if (kind === ExplorerFileEntryKind.Directory || kind === ExplorerFileEntryKind.File) {
    return kind;
  }

  throw new Error(`Invalid ${label}.${key}`);
};

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredArray = (
  value: unknown,
  label: string,
  key: string
): ReadonlyArray<unknown> => {
  const record = ensureRecord(value, label);
  const entry = record[key];

  if (!Array.isArray(entry)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return entry;
};

const readRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string
): string => {
  const entry = value[key];

  if (typeof entry !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return entry;
};

const readRequiredNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string
): number => {
  const entry = value[key];

  if (typeof entry !== "number" || !Number.isFinite(entry)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return entry;
};

const readOptionalNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string
): number | undefined => {
  const entry = value[key];
  if (entry === undefined) {
    return undefined;
  }

  if (typeof entry !== "number" || !Number.isFinite(entry)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return entry;
};

const readOptionalBoolean = (
  value: Record<string, unknown>,
  label: string,
  key: string
): boolean | undefined => {
  const entry = value[key];
  if (entry === undefined) {
    return undefined;
  }

  if (typeof entry !== "boolean") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return entry;
};

const countExplorerContentLines = (content: string): number =>
  content.length === 0 ? 1 : content.split(/\r?\n/).length;
