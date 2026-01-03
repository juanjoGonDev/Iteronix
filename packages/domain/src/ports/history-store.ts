import type { LLMEvent } from "../llm/events";
import type { LLMRunRequest, LLMRunSession } from "../llm/run";
import type { Result } from "../result";

export const HistoryStoreErrorCode = {
  NotFound: "not_found",
  Conflict: "conflict",
  StorageError: "storage_error",
  Unknown: "unknown"
} as const;

export type HistoryStoreErrorCode =
  typeof HistoryStoreErrorCode[keyof typeof HistoryStoreErrorCode];

export type HistoryStoreError = {
  code: HistoryStoreErrorCode;
  message: string;
  retryable: boolean;
};

export type LLMRunRecord = {
  session: LLMRunSession;
  request: LLMRunRequest;
};

export type HistoryListInput = {
  limit?: number;
  cursor?: string;
  status?: LLMRunSession["status"];
};

export type HistoryStorePort = {
  getRun: (id: string) => Promise<Result<LLMRunRecord, HistoryStoreError>>;
  listRuns: (
    input: HistoryListInput
  ) => Promise<Result<ReadonlyArray<LLMRunRecord>, HistoryStoreError>>;
  saveRun: (
    record: LLMRunRecord
  ) => Promise<Result<LLMRunRecord, HistoryStoreError>>;
  appendEvent: (
    runId: string,
    event: LLMEvent
  ) => Promise<Result<void, HistoryStoreError>>;
  listEvents: (
    runId: string
  ) => Promise<Result<ReadonlyArray<LLMEvent>, HistoryStoreError>>;
};