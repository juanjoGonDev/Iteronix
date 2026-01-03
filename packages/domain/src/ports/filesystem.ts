import type { Result } from "../result";

export const FileSystemEntryKind = {
  File: "file",
  Directory: "directory"
} as const;

export type FileSystemEntryKind =
  typeof FileSystemEntryKind[keyof typeof FileSystemEntryKind];

export type FileSystemEntry = {
  path: string;
  name: string;
  kind: FileSystemEntryKind;
};

export type FileSystemStat = {
  path: string;
  kind: FileSystemEntryKind;
  size: number;
  createdAt: string;
  modifiedAt: string;
};

export const FileSystemErrorCode = {
  NotFound: "not_found",
  Forbidden: "forbidden",
  InvalidPath: "invalid_path",
  Conflict: "conflict",
  Unknown: "unknown"
} as const;

export type FileSystemErrorCode =
  typeof FileSystemErrorCode[keyof typeof FileSystemErrorCode];

export type FileSystemError = {
  code: FileSystemErrorCode;
  message: string;
  retryable: boolean;
};

export type FileSystemPort = {
  readFile: (path: string) => Promise<Result<Uint8Array, FileSystemError>>;
  writeFile: (
    path: string,
    data: Uint8Array
  ) => Promise<Result<void, FileSystemError>>;
  listDirectory: (
    path: string
  ) => Promise<Result<ReadonlyArray<FileSystemEntry>, FileSystemError>>;
  stat: (path: string) => Promise<Result<FileSystemStat, FileSystemError>>;
};