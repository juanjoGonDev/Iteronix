import { describe, expect, it } from "vitest";
import { ResultType } from "./result";
import {
  createLogsStore,
  LogLevel,
  LogsStoreErrorCode,
  type LogEntry
} from "./logs";

const RUN_ID_ONE = "run-1";
const RUN_ID_TWO = "run-2";
const TIMESTAMP_ONE = "2026-01-03T16:00:00Z";
const TIMESTAMP_TWO = "2026-01-03T16:05:00Z";
const TIMESTAMP_THREE = "2026-01-03T16:06:00Z";

const entryOne: LogEntry = {
  id: "log-1",
  timestamp: TIMESTAMP_ONE,
  level: LogLevel.Info,
  message: "Started",
  runId: RUN_ID_ONE
};

const entryTwo: LogEntry = {
  id: "log-2",
  timestamp: TIMESTAMP_TWO,
  level: LogLevel.Error,
  message: "Failed",
  runId: RUN_ID_ONE
};

const entryThree: LogEntry = {
  id: "log-3",
  timestamp: TIMESTAMP_THREE,
  level: LogLevel.Info,
  message: "Completed",
  runId: RUN_ID_TWO
};

describe("logs store", () => {
  it("filters by level and run id", () => {
    const store = createLogsStore({
      entries: [entryOne, entryTwo, entryThree]
    });
    const result = store.query({
      level: LogLevel.Info,
      runId: RUN_ID_ONE
    });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe("log-1");
    }
  });

  it("applies limit", () => {
    const store = createLogsStore({
      entries: [entryOne, entryTwo, entryThree]
    });
    const result = store.query({ limit: 2 });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.id).toBe("log-1");
    }
  });

  it("rejects negative limit", () => {
    const store = createLogsStore({
      entries: [entryOne, entryTwo]
    });
    const result = store.query({ limit: -1 });

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(LogsStoreErrorCode.InvalidInput);
    }
  });
});
