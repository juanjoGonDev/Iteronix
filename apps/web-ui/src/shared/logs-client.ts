import { requestJson } from "./server-api-client.js";

const EndpointPath = {
  LogsQuery: "/logs/query",
} as const;

export const ServerLogLevel = {
  Trace: "trace",
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
  Fatal: "fatal",
} as const;

export type ServerLogLevel =
  (typeof ServerLogLevel)[keyof typeof ServerLogLevel];

export type ServerLogEntry = {
  id: string;
  timestamp: string;
  level: ServerLogLevel;
  message: string;
  runId?: string;
};

export type LogsClient = {
  query: (input?: {
    level?: ServerLogLevel;
    runId?: string;
    limit?: number;
  }) => Promise<ReadonlyArray<ServerLogEntry>>;
};

export const createLogsClient = (): LogsClient => ({
  query: (input = {}) =>
    requestJson({
      path: EndpointPath.LogsQuery,
      body: {
        ...(input.level ? { level: input.level } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      },
      parse: parseLogsQueryResponse,
    }),
});

export const parseLogsQueryResponse = (
  value: unknown,
): ReadonlyArray<ServerLogEntry> =>
  readRequiredArray(value, "logsQueryResponse", "logs").map((item) =>
    parseServerLogEntry(ensureRecord(item, "serverLogEntry")),
  );

const parseServerLogEntry = (
  value: Record<string, unknown>,
): ServerLogEntry => ({
  id: readRequiredString(value, "serverLogEntry", "id"),
  timestamp: readRequiredString(value, "serverLogEntry", "timestamp"),
  level: readRequiredString(value, "serverLogEntry", "level") as ServerLogLevel,
  message: readRequiredString(value, "serverLogEntry", "message"),
  ...(typeof value["runId"] === "string" ? { runId: value["runId"] } : {}),
});

const ensureRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredArray = (
  value: unknown,
  label: string,
  key: string,
): ReadonlyArray<unknown> => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string,
): string => {
  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};
