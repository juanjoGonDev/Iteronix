import { requestJson } from "./server-api-client.js";
import { parseProjectOpenResponse } from "./quality-gates-client.js";
import type { ProjectRecord } from "./workbench-types.js";

const EndpointPath = {
  ProjectOpen: "/projects/open",
  FilesTree: "/files/tree",
  FilesRead: "/files/read"
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
  }) => Promise<ExplorerFileContentRecord>;
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
        path: input.path
      },
      parse: parseExplorerFileReadResponse
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

  return {
    content: readRequiredString(record, "explorerFileReadResponse", "content")
  };
};

const parseExplorerFileEntryRecord = (
  value: Record<string, unknown>
): ExplorerFileEntryRecord => ({
  path: readRequiredString(value, "explorerFileEntryRecord", "path"),
  name: readRequiredString(value, "explorerFileEntryRecord", "name"),
  kind: readExplorerFileEntryKind(value, "explorerFileEntryRecord", "kind")
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
