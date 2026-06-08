import { requestJson, streamText } from "./server-api-client.js";
import {
  QualityGateEventName,
  type ProjectRecord,
  type QualityGateEventRecord,
  type QualityGateId,
  type QualityGateRunRecord,
  type QualityGateRunStatus,
  type ServerSentEventMessage
} from "./workbench-types.js";

const EndpointPath = {
  ProjectOpen: "/projects/open",
  QualityGatesRun: "/quality-gates/run",
  QualityGatesList: "/quality-gates/list",
  QualityGatesEvents: "/quality-gates/events",
  QualityGatesStream: "/quality-gates/stream"
} as const;

export type QualityGatesClient = {
  openProject: (input: {
    rootPath: string | null;
    name?: string;
  }) => Promise<ProjectRecord>;
  runQualityGates: (input: {
    projectId: string;
    gates: ReadonlyArray<QualityGateId>;
  }) => Promise<QualityGateRunRecord>;
  listQualityGateRuns: (input: {
    projectId: string;
    status?: QualityGateRunStatus;
    limit?: number;
  }) => Promise<ReadonlyArray<QualityGateRunRecord>>;
  listQualityGateEvents: (input: {
    runId: string;
  }) => Promise<ReadonlyArray<QualityGateEventRecord>>;
  streamQualityGateEvents: (input: {
    runId: string;
    signal?: AbortSignal;
    onEvent: (event: QualityGateEventRecord) => void;
  }) => Promise<void>;
};

export const createQualityGatesClient = (): QualityGatesClient => ({
  openProject: (input) =>
    requestJson({
      path: EndpointPath.ProjectOpen,
      body: {
        rootPath: input.rootPath,
        ...(input.name ? { name: input.name } : {})
      },
      parse: parseProjectOpenResponse
    }),
  runQualityGates: (input) =>
    requestJson({
      path: EndpointPath.QualityGatesRun,
      body: {
        projectId: input.projectId,
        gates: [...input.gates]
      },
      parse: parseQualityGateRunResponse
    }),
  listQualityGateRuns: (input) =>
    requestJson({
      path: EndpointPath.QualityGatesList,
      body: {
        projectId: input.projectId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {})
      },
      parse: parseQualityGateRunsResponse
    }),
  listQualityGateEvents: (input) =>
    requestJson({
      path: EndpointPath.QualityGatesEvents,
      body: {
        runId: input.runId
      },
      parse: parseQualityGateEventsResponse
    }),
  streamQualityGateEvents: async (input) => {
    let buffer = "";

    await streamText({
      path: `${EndpointPath.QualityGatesStream}?runId=${encodeURIComponent(input.runId)}`,
      ...(input.signal ? { signal: input.signal } : {}),
      onChunk: (chunk) => {
        buffer += chunk;
        let boundaryIndex = buffer.indexOf("\n\n");

        while (boundaryIndex >= 0) {
          const rawBlock = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          const decoded = decodeServerSentEvents(`${rawBlock}\n\n`);

          for (const event of decoded) {
            if (event.event === QualityGateEventName.Progress) {
              input.onEvent(parseQualityGateEventRecord(event.data));
            }
          }

          boundaryIndex = buffer.indexOf("\n\n");
        }
      }
    });
  }
});

export const parseProjectOpenResponse = (value: unknown): ProjectRecord =>
  parseProjectRecord(readRequiredRecord(value, "projectOpenResponse", "project"));

export const parseQualityGateRunResponse = (
  value: unknown
): QualityGateRunRecord =>
  parseQualityGateRunRecord(
    readRequiredRecord(value, "qualityGateRunResponse", "run")
  );

export const parseQualityGateRunsResponse = (
  value: unknown
): ReadonlyArray<QualityGateRunRecord> =>
  readRequiredArray(value, "qualityGateRunsResponse", "runs").map((item) =>
    parseQualityGateRunRecord(ensureRecord(item, "qualityGateRunRecord"))
  );

export const parseQualityGateEventsResponse = (
  value: unknown
): ReadonlyArray<QualityGateEventRecord> =>
  readRequiredArray(value, "qualityGateEventsResponse", "events").map((item) =>
    parseQualityGateEventRecord(item)
  );

export const decodeServerSentEvents = (
  value: string
): ReadonlyArray<ServerSentEventMessage> => {
  const blocks = value
    .split(/\n\n/u)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks
    .map(parseServerSentEventBlock)
    .filter((event): event is ServerSentEventMessage => event !== null);
};

const parseServerSentEventBlock = (
  value: string
): ServerSentEventMessage | null => {
  const lines = value.split(/\n/u);
  let id: string | undefined;
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("id:")) {
      id = line.slice(3).trim();
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!eventName || dataLines.length === 0) {
    return null;
  }

  try {
    return {
      ...(id ? { id } : {}),
      event: eventName,
      data: JSON.parse(dataLines.join("\n"))
    };
  } catch {
    return null;
  }
};

const parseProjectRecord = (value: Record<string, unknown>): ProjectRecord => ({
  id: readRequiredString(value, "projectRecord", "id"),
  name: readRequiredString(value, "projectRecord", "name"),
  rootPath: readNullableString(value, "projectRecord", "rootPath"),
  createdAt: readRequiredString(value, "projectRecord", "createdAt"),
  updatedAt: readRequiredString(value, "projectRecord", "updatedAt")
});

const parseQualityGateRunRecord = (
  value: Record<string, unknown>
): QualityGateRunRecord => {
  const currentGate = readOptionalQualityGateId(value, "currentGate");
  const failedGate = readOptionalQualityGateId(value, "failedGate");

  return {
    id: readRequiredString(value, "qualityGateRunRecord", "id"),
    projectId: readRequiredString(value, "qualityGateRunRecord", "projectId"),
    status: readEnum(value, "qualityGateRunRecord", "status", [
      "pending",
      "running",
      "completed",
      "failed",
      "canceled"
    ]),
    createdAt: readRequiredString(value, "qualityGateRunRecord", "createdAt"),
    updatedAt: readRequiredString(value, "qualityGateRunRecord", "updatedAt"),
    gates: readRequiredArray(value, "qualityGateRunRecord", "gates").map((gate) =>
      parseQualityGateId(gate, "qualityGateRunRecord.gates")
    ),
    passedCount: readRequiredNumber(value, "qualityGateRunRecord", "passedCount"),
    ...(currentGate ? { currentGate } : {}),
    ...(failedGate ? { failedGate } : {})
  };
};

const parseQualityGateEventRecord = (
  value: unknown
): QualityGateEventRecord => {
  const record = ensureRecord(value, "qualityGateEventRecord");

  return {
    id: readRequiredString(record, "qualityGateEventRecord", "id"),
    runId: readRequiredString(record, "qualityGateEventRecord", "runId"),
    type: readEnum(record, "qualityGateEventRecord", "type", [
      "delta",
      "message",
      "usage",
      "error",
      "done",
      "status"
    ]),
    timestamp: readRequiredString(record, "qualityGateEventRecord", "timestamp"),
    data: readRequiredRecord(record, "qualityGateEventRecord", "data")
  };
};

const parseQualityGateId = (value: unknown, label: string): QualityGateId => {
  if (
    value === "lint" ||
    value === "typecheck" ||
    value === "test" ||
    value === "build"
  ) {
    return value;
  }

  throw new Error(`Invalid ${label}`);
};

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: unknown,
  label: string,
  key: string
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  return ensureRecord(nested, `${label}.${key}`);
};

const readRequiredArray = (
  value: unknown,
  label: string,
  key: string
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
  key: string
): string => {
  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readNullableString = (
  value: Record<string, unknown>,
  label: string,
  key: string
): string | null => {
  const nested = value[key];
  if (nested === null) {
    return null;
  }

  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string
): number => {
  const nested = value[key];
  if (typeof nested !== "number" || Number.isNaN(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readOptionalQualityGateId = (
  value: Record<string, unknown>,
  key: string
): QualityGateId | undefined => {
  const nested = value[key];
  return nested === undefined ? undefined : parseQualityGateId(nested, key);
};

const readEnum = <TValue extends string>(
  value: Record<string, unknown>,
  label: string,
  key: string,
  allowed: ReadonlyArray<TValue>
): TValue => {
  const nested = value[key];
  if (typeof nested !== "string" || !allowed.includes(nested as TValue)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested as TValue;
};
