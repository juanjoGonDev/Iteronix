import {
  LogLevel,
  type LogEntry,
  LogsStoreErrorCode,
  type LogsStoreError
} from "../../../packages/domain/src/ports/logs-store";
import { createFileLogsStore } from "../../../packages/adapters/src/file-logs-store";
import type { Result } from "../../../packages/domain/src/result";
import { err, ok } from "./result";

export type ServerLogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  runId?: string;
  context?: Record<string, string>;
};

export type ServerLogsStore = {
  query: (input: {
    level?: LogLevel;
    runId?: string;
    limit?: number;
  }) => Result<ReadonlyArray<ServerLogEntry>, LogsStoreError>;
  append: (entry: ServerLogEntry) => Promise<Result<void, LogsStoreError>>;
  reset: () => Promise<void>;
};

const ContextKey = {
  RunId: "runId"
} as const;

const LogsErrorMessage = {
  InvalidLimit: "Invalid limit value"
} as const;

export const createServerLogsStore = async (
  logDir: string
): Promise<ServerLogsStore> => {
  const fileLogsStore = await createFileLogsStore(logDir);
  let entries: ServerLogEntry[] = [];

  const reset = async (): Promise<void> => {
    entries = [];
    await fileLogsStore.reset();
  };

  const append = async (
    entry: ServerLogEntry
  ): Promise<Result<void, LogsStoreError>> => {
    entries.push(entry);
    return fileLogsStore.append(toDomainLogEntry(entry));
  };

  const query = (input: {
    level?: LogLevel;
    runId?: string;
    limit?: number;
  }): Result<ReadonlyArray<ServerLogEntry>, LogsStoreError> => {
    const validatedLimit = validateLimit(input.limit);
    if (validatedLimit.type === "err") {
      return validatedLimit;
    }

    let filtered = entries;

    if (input.level) {
      filtered = filtered.filter((entry) => entry.level === input.level);
    }

    if (input.runId) {
      filtered = filtered.filter((entry) => entry.runId === input.runId);
    }

    if (validatedLimit.type === "ok" && validatedLimit.value !== undefined) {
      return ok(filtered.slice(0, validatedLimit.value));
    }

    return ok(filtered);
  };

  await reset();

  return {
    query,
    append,
    reset
  };
};

const toDomainLogEntry = (entry: ServerLogEntry): LogEntry => {
  const base: {
    id: string;
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, string>;
  } = {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message
  };

  const mergedContext = mergeContext(entry.context, entry.runId);
  if (mergedContext) {
    base.context = mergedContext;
  }

  return base;
};

const mergeContext = (
  context: Record<string, string> | undefined,
  runId: string | undefined
): Record<string, string> | undefined => {
  const result: Record<string, string> = {
    ...(context ?? {})
  };

  if (runId) {
    result[ContextKey.RunId] = runId;
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const validateLimit = (
  limit: number | undefined
): Result<number | undefined, LogsStoreError> => {
  if (limit === undefined) {
    return ok(undefined);
  }

  if (!Number.isFinite(limit) || limit < 0) {
    return err({
      code: LogsStoreErrorCode.InvalidQuery,
      message: LogsErrorMessage.InvalidLimit,
      retryable: false
    });
  }

  return ok(Math.floor(limit));
};
