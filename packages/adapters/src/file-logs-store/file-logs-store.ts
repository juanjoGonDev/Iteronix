import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  LOG_FILE_NAME,
  LOG_LINE_SEPARATOR,
} from "../../../shared/src/logger/constants";
import { LogEntry, LogLevel } from "../../../domain/src/ports/logs-store";
import { LogsStorePort } from "../../../domain/src/ports/logs-store";
import type { Result } from "../../../domain/src/result";
import {
  LogsStoreErrorCode,
  LogsStoreError,
} from "../../../domain/src/ports/logs-store";

const resetLogFile = async (
  logFilePath: string,
  logDir: string,
): Promise<void> => {
  try {
    await fs.writeFile(logFilePath, "", "utf-8");
  } catch {
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(logFilePath, "", "utf-8");
  }
};

export const createFileLogsStore = async (
  logDir: string,
  options: {
    maxEntries?: number;
  } = {},
): Promise<LogsStorePort & { reset: () => Promise<void> }> => {
  const logFilePath = join(logDir, LOG_FILE_NAME);
  let entries: LogEntry[] = [];
  const maxEntries = readMaxEntries(options.maxEntries);

  const reset = async (): Promise<void> => {
    entries = [];
    await resetLogFile(logFilePath, logDir);
  };

  const appendToMemory = (entry: LogEntry): boolean => {
    entries.push(entry);
    if (entries.length <= maxEntries) {
      return false;
    }

    entries = entries.slice(-maxEntries);
    return true;
  };

  const appendToFile = async (entry: LogEntry): Promise<void> => {
    const line = formatLogEntry(entry);
    await fs.appendFile(logFilePath, `${line}${LOG_LINE_SEPARATOR}`, "utf-8");
  };

  const writeAllEntriesToFile = async (): Promise<void> => {
    const payload = entries
      .map((entry) => formatLogEntry(entry))
      .join(LOG_LINE_SEPARATOR);
    const suffix = payload.length > 0 ? LOG_LINE_SEPARATOR : "";

    try {
      await fs.writeFile(logFilePath, `${payload}${suffix}`, "utf-8");
    } catch {
      await fs.mkdir(logDir, { recursive: true });
      await fs.writeFile(logFilePath, `${payload}${suffix}`, "utf-8");
    }
  };

  const queryFromMemory = (filters: {
    since?: string;
    until?: string;
    level?: LogLevel;
    limit?: number;
    runId?: string;
  }): LogEntry[] => {
    let filtered = entries;

    if (filters.since) {
      filtered = filtered.filter((e) => e.timestamp >= filters.since!);
    }

    if (filters.until) {
      filtered = filtered.filter((e) => e.timestamp <= filters.until!);
    }

    if (filters.level) {
      const levelOrder = [
        LogLevel.Trace,
        LogLevel.Debug,
        LogLevel.Info,
        LogLevel.Warn,
        LogLevel.Error,
        LogLevel.Fatal,
      ];
      const levelIndex = levelOrder.indexOf(filters.level);
      filtered = filtered.filter(
        (e) => levelOrder.indexOf(e.level) >= levelIndex,
      );
    }

    if (filters.runId) {
      filtered = filtered.filter((e) => e.context?.["runId"] === filters.runId);
    }

    if (filters.limit) {
      filtered = filtered.slice(-filters.limit);
    }

    return filtered;
  };

  const append = async (
    entry: LogEntry,
  ): Promise<Result<void, LogsStoreError>> => {
    try {
      const trimmed = appendToMemory(entry);
      if (trimmed) {
        await writeAllEntriesToFile();
      } else {
        await appendToFile(entry);
      }
      return { type: "ok", value: undefined };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        type: "err",
        error: {
          code: LogsStoreErrorCode.StorageError,
          message: `Failed to append log entry: ${errorMessage}`,
          retryable: true,
        },
      };
    }
  };

  const query = async (input: {
    since?: string;
    until?: string;
    level?: LogLevel;
    limit?: number;
    runId?: string;
  }): Promise<Result<ReadonlyArray<LogEntry>, LogsStoreError>> => {
    try {
      const results = queryFromMemory(input);
      return { type: "ok", value: Object.freeze(results) };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        type: "err",
        error: {
          code: LogsStoreErrorCode.InvalidQuery,
          message: `Failed to query logs: ${errorMessage}`,
          retryable: false,
        },
      };
    }
  };

  await reset();

  return {
    append,
    query,
    reset,
  };
};

const readMaxEntries = (value: number | undefined): number => {
  if (value === undefined || !Number.isInteger(value) || value < 1) {
    return Number.MAX_SAFE_INTEGER;
  }

  return value;
};

const formatLogEntry = (entry: LogEntry): string => {
  const parts: string[] = [
    entry.timestamp,
    `[${entry.level.toUpperCase()}]`,
    entry.message,
  ];

  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(`context=${JSON.stringify(entry.context)}`);
  }

  if (entry.data !== undefined) {
    parts.push(`data=${JSON.stringify(entry.data)}`);
  }

  return parts.join(" ");
};
