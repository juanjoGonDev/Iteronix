import { ErrorMessage } from "./constants";
import { err, ok, type Result } from "./result";

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
  runId?: string;
  context?: Record<string, string>;
};

export type LogsQuery = {
  level?: LogLevel;
  runId?: string;
  limit?: number;
};

export const LogsStoreErrorCode = {
  InvalidInput: "invalid_input"
} as const;

export type LogsStoreErrorCode =
  typeof LogsStoreErrorCode[keyof typeof LogsStoreErrorCode];

export type LogsStoreError = {
  code: LogsStoreErrorCode;
  message: string;
};

export type LogsStore = {
  query: (input: LogsQuery) => Result<ReadonlyArray<LogEntry>, LogsStoreError>;
};

export type LogsStoreSeed = {
  entries?: ReadonlyArray<LogEntry>;
};

export const createLogsStore = (seed: LogsStoreSeed = {}): LogsStore => {
  const entries = seed.entries ? [...seed.entries] : [];

  const query = (
    input: LogsQuery
  ): Result<ReadonlyArray<LogEntry>, LogsStoreError> => {
    if (input.limit !== undefined && input.limit < 0) {
      return err({
        code: LogsStoreErrorCode.InvalidInput,
        message: ErrorMessage.InvalidBody
      });
    }

    const filtered = entries.filter((entry) => matchesQuery(entry, input));
    if (input.limit === undefined) {
      return ok(filtered);
    }

    const limit = Math.max(0, Math.floor(input.limit));
    return ok(filtered.slice(0, limit));
  };

  return {
    query
  };
};

const matchesQuery = (entry: LogEntry, query: LogsQuery): boolean => {
  if (query.level && entry.level !== query.level) {
    return false;
  }

  if (query.runId && entry.runId !== query.runId) {
    return false;
  }

  return true;
};