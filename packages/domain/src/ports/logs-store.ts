import type { Result } from "../result";

export const LogLevel = {
  Trace: "trace",
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
  Fatal: "fatal"
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

export type LogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, string>;
  data?: unknown;
};

export type LogsQuery = {
  since?: string;
  until?: string;
  level?: LogLevel;
  limit?: number;
  runId?: string;
};

export const LogsStoreErrorCode = {
  StorageError: "storage_error",
  InvalidQuery: "invalid_query",
  Unknown: "unknown"
} as const;

export type LogsStoreErrorCode =
  typeof LogsStoreErrorCode[keyof typeof LogsStoreErrorCode];

export type LogsStoreError = {
  code: LogsStoreErrorCode;
  message: string;
  retryable: boolean;
};

export type LogsStorePort = {
  append: (entry: LogEntry) => Promise<Result<void, LogsStoreError>>;
  query: (
    input: LogsQuery
  ) => Promise<Result<ReadonlyArray<LogEntry>, LogsStoreError>>;
};