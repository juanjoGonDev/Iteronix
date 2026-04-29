import { ErrorMessage } from "./constants";
import { err, ok, ResultType, type Result } from "./result";

export const HistoryRunStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Canceled: "canceled"
} as const;

export type HistoryRunStatus =
  typeof HistoryRunStatus[keyof typeof HistoryRunStatus];

export const HistoryRunType = {
  Provider: "provider",
  QualityGates: "quality_gates"
} as const;

export type HistoryRunType = typeof HistoryRunType[keyof typeof HistoryRunType];

export const HistoryEventType = {
  Delta: "delta",
  Message: "message",
  Usage: "usage",
  Error: "error",
  Done: "done",
  Status: "status"
} as const;

export type HistoryEventType =
  typeof HistoryEventType[keyof typeof HistoryEventType];

export type HistoryMetadataValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<string>;

export type HistoryMetadata = Readonly<Record<string, HistoryMetadataValue>>;

export type HistoryRunRecord = {
  id: string;
  providerId: string;
  modelId: string;
  status: HistoryRunStatus;
  createdAt: string;
  updatedAt: string;
  input: string;
  system?: string;
  projectId?: string;
  runType?: HistoryRunType;
  metadata?: HistoryMetadata;
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
  projectId?: string;
  runType?: HistoryRunType;
};

export const HistoryStoreErrorCode = {
  InvalidInput: "invalid_input",
  NotFound: "not_found",
  Conflict: "conflict"
} as const;

export type HistoryStoreErrorCode =
  typeof HistoryStoreErrorCode[keyof typeof HistoryStoreErrorCode];

export type HistoryStoreError = {
  code: HistoryStoreErrorCode;
  message: string;
};

export type HistoryStore = {
  createRun: (
    run: HistoryRunRecord
  ) => Result<HistoryRunRecord, HistoryStoreError>;
  updateRun: (
    run: HistoryRunRecord
  ) => Result<HistoryRunRecord, HistoryStoreError>;
  appendEvent: (
    event: HistoryEvent
  ) => Result<HistoryEvent, HistoryStoreError>;
  listRuns: (
    input: HistoryListInput
  ) => Result<ReadonlyArray<HistoryRunRecord>, HistoryStoreError>;
  listEvents: (
    runId: string
  ) => Result<ReadonlyArray<HistoryEvent>, HistoryStoreError>;
  snapshot: () => HistoryStoreSeed;
};

export type HistoryStoreSeed = {
  runs?: ReadonlyArray<HistoryRunRecord>;
  events?: ReadonlyArray<HistoryEvent>;
};

export type HistoryStoreChangeListener = () => void;

export const createHistoryStore = (
  seed: HistoryStoreSeed = {},
  onChange: HistoryStoreChangeListener = noopHistoryStoreChangeListener
): HistoryStore => {
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

  const createRun = (
    run: HistoryRunRecord
  ): Result<HistoryRunRecord, HistoryStoreError> =>
    notifyWhenOk(storeRun(runs, runsById, run), onChange);

  const updateRun = (
    run: HistoryRunRecord
  ): Result<HistoryRunRecord, HistoryStoreError> =>
    notifyWhenOk(updateStoredRun(runs, runsById, run), onChange);

  const appendEvent = (
    event: HistoryEvent
  ): Result<HistoryEvent, HistoryStoreError> =>
    notifyWhenOk(storeEvent(runsById, eventsByRun, event), onChange);

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

  const snapshot = (): HistoryStoreSeed => ({
    runs: [...runs],
    events: Array.from(eventsByRun.values()).flat()
  });

  return {
    createRun,
    updateRun,
    appendEvent,
    listRuns,
    listEvents,
    snapshot
  };
};

const noopHistoryStoreChangeListener = (): void => {
  return;
};

const notifyWhenOk = <TValue, TError>(
  result: Result<TValue, TError>,
  onChange: HistoryStoreChangeListener
): Result<TValue, TError> => {
  if (result.type === ResultType.Ok) {
    onChange();
  }

  return result;
};

const storeRun = (
  runs: HistoryRunRecord[],
  runsById: Map<string, HistoryRunRecord>,
  run: HistoryRunRecord
): Result<HistoryRunRecord, HistoryStoreError> => {
  const normalized = normalizeRunRecord(run);
  if (!normalized) {
    return err({
      code: HistoryStoreErrorCode.InvalidInput,
      message: ErrorMessage.InvalidBody
    });
  }

  if (runsById.has(normalized.id)) {
    return err({
      code: HistoryStoreErrorCode.Conflict,
      message: ErrorMessage.InvalidBody
    });
  }

  runs.push(normalized);
  runsById.set(normalized.id, normalized);

  return ok(normalized);
};

const updateStoredRun = (
  runs: HistoryRunRecord[],
  runsById: Map<string, HistoryRunRecord>,
  run: HistoryRunRecord
): Result<HistoryRunRecord, HistoryStoreError> => {
  const normalized = normalizeRunRecord(run);
  if (!normalized) {
    return err({
      code: HistoryStoreErrorCode.InvalidInput,
      message: ErrorMessage.InvalidBody
    });
  }

  if (!runsById.has(normalized.id)) {
    return err({
      code: HistoryStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  const index = runs.findIndex((entry) => entry.id === normalized.id);
  if (index < 0) {
    return err({
      code: HistoryStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  runs[index] = normalized;
  runsById.set(normalized.id, normalized);

  return ok(normalized);
};

const storeEvent = (
  runsById: Map<string, HistoryRunRecord>,
  eventsByRun: Map<string, HistoryEvent[]>,
  event: HistoryEvent
): Result<HistoryEvent, HistoryStoreError> => {
  const normalized = normalizeEvent(event);
  if (!normalized) {
    return err({
      code: HistoryStoreErrorCode.InvalidInput,
      message: ErrorMessage.InvalidBody
    });
  }

  if (!runsById.has(normalized.runId)) {
    return err({
      code: HistoryStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  const events = eventsByRun.get(normalized.runId) ?? [];
  events.push(normalized);
  eventsByRun.set(normalized.runId, events);

  return ok(normalized);
};

const filterRuns = (
  runs: ReadonlyArray<HistoryRunRecord>,
  input: HistoryListInput
): ReadonlyArray<HistoryRunRecord> => {
  let filtered = input.status
    ? runs.filter((run) => run.status === input.status)
    : [...runs];

  if (input.projectId) {
    filtered = filtered.filter((run) => run.projectId === input.projectId);
  }

  if (input.runType) {
    filtered = filtered.filter((run) => run.runType === input.runType);
  }

  if (input.limit === undefined) {
    return filtered;
  }

  const limit = Math.max(0, Math.floor(input.limit));
  return filtered.slice(0, limit);
};

const normalizeRunRecord = (
  run: HistoryRunRecord
): HistoryRunRecord | undefined => {
  const id = normalizeText(run.id);
  const providerId = normalizeText(run.providerId);
  const modelId = normalizeText(run.modelId);
  const status = normalizeText(run.status);
  const createdAt = normalizeText(run.createdAt);
  const updatedAt = normalizeText(run.updatedAt);
  const input = normalizeText(run.input);
  if (
    !id ||
    !providerId ||
    !modelId ||
    !status ||
    !createdAt ||
    !updatedAt ||
    !input
  ) {
    return undefined;
  }

  if (!isHistoryRunStatus(status)) {
    return undefined;
  }

  if (run.runType && !isHistoryRunType(run.runType)) {
    return undefined;
  }

  return {
    id,
    providerId,
    modelId,
    status,
    createdAt,
    updatedAt,
    input,
    ...(run.system ? { system: run.system } : {}),
    ...(run.projectId ? { projectId: run.projectId } : {}),
    ...(run.runType ? { runType: run.runType } : {}),
    ...(run.metadata ? { metadata: run.metadata } : {})
  };
};

const normalizeEvent = (event: HistoryEvent): HistoryEvent | undefined => {
  const id = normalizeText(event.id);
  const runId = normalizeText(event.runId);
  const type = normalizeText(event.type);
  const timestamp = normalizeText(event.timestamp);
  if (!id || !runId || !type || !timestamp) {
    return undefined;
  }

  if (!isHistoryEventType(type)) {
    return undefined;
  }

  return {
    id,
    runId,
    type,
    data: event.data,
    timestamp
  };
};

const normalizeText = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const isHistoryRunStatus = (value: string): value is HistoryRunStatus =>
  value === HistoryRunStatus.Pending ||
  value === HistoryRunStatus.Running ||
  value === HistoryRunStatus.Completed ||
  value === HistoryRunStatus.Failed ||
  value === HistoryRunStatus.Canceled;

const isHistoryRunType = (value: string): value is HistoryRunType =>
  value === HistoryRunType.Provider || value === HistoryRunType.QualityGates;

const isHistoryEventType = (value: string): value is HistoryEventType =>
  value === HistoryEventType.Delta ||
  value === HistoryEventType.Message ||
  value === HistoryEventType.Usage ||
  value === HistoryEventType.Error ||
  value === HistoryEventType.Done ||
  value === HistoryEventType.Status;
