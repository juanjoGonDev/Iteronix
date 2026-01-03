import { describe, expect, it } from "vitest";
import { ResultType } from "./result";
import {
  createHistoryStore,
  HistoryEventType,
  HistoryRunStatus,
  HistoryStoreErrorCode,
  type HistoryEvent,
  type HistoryRunRecord
} from "./history";

const RUN_ID_ONE = "run-1";
const RUN_ID_TWO = "run-2";
const PROVIDER_ID = "codex-cli";
const MODEL_ID = "gpt-4";
const CREATED_AT = "2026-01-03T16:00:00Z";
const UPDATED_AT = "2026-01-03T16:05:00Z";
const INPUT_TEXT = "hello";

const runOne: HistoryRunRecord = {
  id: RUN_ID_ONE,
  providerId: PROVIDER_ID,
  modelId: MODEL_ID,
  status: HistoryRunStatus.Completed,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  input: INPUT_TEXT
};

const runTwo: HistoryRunRecord = {
  id: RUN_ID_TWO,
  providerId: PROVIDER_ID,
  modelId: MODEL_ID,
  status: HistoryRunStatus.Failed,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  input: INPUT_TEXT
};

const eventOne: HistoryEvent = {
  id: "event-1",
  runId: RUN_ID_ONE,
  type: HistoryEventType.Message,
  data: {
    text: "alpha"
  },
  timestamp: CREATED_AT
};

const eventTwo: HistoryEvent = {
  id: "event-2",
  runId: RUN_ID_ONE,
  type: HistoryEventType.Delta,
  data: {
    delta: "beta"
  },
  timestamp: UPDATED_AT
};

describe("history store", () => {
  it("filters runs by status", () => {
    const store = createHistoryStore({ runs: [runOne, runTwo] });
    const result = store.listRuns({ status: HistoryRunStatus.Completed });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe(RUN_ID_ONE);
    }
  });

  it("applies limit after filtering", () => {
    const store = createHistoryStore({ runs: [runOne, runTwo] });
    const result = store.listRuns({ limit: 1 });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe(RUN_ID_ONE);
    }
  });

  it("returns events for a run", () => {
    const store = createHistoryStore({
      runs: [runOne, runTwo],
      events: [eventOne, eventTwo]
    });
    const result = store.listEvents(RUN_ID_ONE);

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.id).toBe("event-1");
    }
  });

  it("rejects invalid or missing runs", () => {
    const store = createHistoryStore({ runs: [runOne] });
    const invalid = store.listEvents("   ");

    expect(invalid.type).toBe(ResultType.Err);
    if (invalid.type === ResultType.Err) {
      expect(invalid.error.code).toBe(HistoryStoreErrorCode.InvalidInput);
    }

    const missing = store.listEvents(RUN_ID_TWO);
    expect(missing.type).toBe(ResultType.Err);
    if (missing.type === ResultType.Err) {
      expect(missing.error.code).toBe(HistoryStoreErrorCode.NotFound);
    }
  });
});
