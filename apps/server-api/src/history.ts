import { ErrorMessage } from "./constants";
import { err, ok, type Result } from "./result";

export const HistoryRunStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Canceled: "canceled"
} as const;

export type HistoryRunStatus =
  typeof HistoryRunStatus[keyof typeof HistoryRunStatus];

export const HistoryEventType = {
  Delta: "delta",
  Message: "message",
  Usage: "usage",
  Error: "error",
  Done: "done"
} as const;

export type HistoryEventType =
  typeof HistoryEventType[keyof typeof HistoryEventType];

export type HistoryRunRecord = {
  id: string;
  providerId: string;
  modelId: string;
  status: HistoryRunStatus;
  createdAt: string;
  updatedAt: string;
  input: string;
  system?: string;
};

export type HistoryEvent = {
  id: string;
  runId: string;
  type: HistoryEventType;
  data: Record<string, unknown>;
  timestamp: string;
};

export type HistoryListInput = {
  status?: HistoryRunStatus;
  limit?: number;
};

export const HistoryStoreErrorCode = {
  InvalidInput: "invalid_input",
  NotFound: "not_found"
} as const;

export type HistoryStoreErrorCode =
  typeof HistoryStoreErrorCode[keyof typeof HistoryStoreErrorCode];

export type HistoryStoreError = {
  code: HistoryStoreErrorCode;
  message: string;
};

export type HistoryStore = {
  listRuns: (
    input: HistoryListInput
  ) => Result<ReadonlyArray<HistoryRunRecord>, HistoryStoreError>;
  listEvents: (
    runId: string
  ) => Result<ReadonlyArray<HistoryEvent>, HistoryStoreError>;
};

export type HistoryStoreSeed = {
  runs?: ReadonlyArray<HistoryRunRecord>;
  events?: ReadonlyArray<HistoryEvent>;
};

export const createHistoryStore = (seed: HistoryStoreSeed = {}): HistoryStore => {
  const runs = seed.runs ? [...seed.runs] : [];
  const runsById = new Map<string, HistoryRunRecord>();
  const eventsByRun = new Map<string, HistoryEvent[]>();

  for (const run of runs) {
    runsById.set(run.id, run);
  }

  if (seed.events) {
    for (const event of seed.events) {
      const list = eventsByRun.get(event.runId) ?? [];
      list.push(event);
      eventsByRun.set(event.runId, list);
    }
  }

  const listRuns = (
    input: HistoryListInput
  ): Result<ReadonlyArray<HistoryRunRecord>, HistoryStoreError> =>
    ok(filterRuns(runs, input));

  const listEvents = (
    runId: string
  ): Result<ReadonlyArray<HistoryEvent>, HistoryStoreError> => {
    const normalized = runId.trim();
    if (normalized.length === 0) {
      return err({
        code: HistoryStoreErrorCode.InvalidInput,
        message: ErrorMessage.InvalidBody
      });
    }

    if (!runsById.has(normalized)) {
      return err({
        code: HistoryStoreErrorCode.NotFound,
        message: ErrorMessage.NotFound
      });
    }

    const events = eventsByRun.get(normalized) ?? [];
    return ok([...events]);
  };

  return {
    listRuns,
    listEvents
  };
};

const filterRuns = (
  runs: ReadonlyArray<HistoryRunRecord>,
  input: HistoryListInput
): ReadonlyArray<HistoryRunRecord> => {
  const filtered = input.status
    ? runs.filter((run) => run.status === input.status)
    : [...runs];

  if (input.limit === undefined) {
    return filtered;
  }

  const limit = Math.max(0, Math.floor(input.limit));
  return filtered.slice(0, limit);
};