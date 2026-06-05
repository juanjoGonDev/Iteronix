import { describe, expect, it } from "vitest";
import { parseLogsQueryResponse, ServerLogLevel } from "./logs-client.js";

describe("logs client", () => {
  it("parses log entries from logs query response", () => {
    const parsed = parseLogsQueryResponse({
      logs: [
        {
          id: "log-1",
          timestamp: "2026-06-05T08:00:00.000Z",
          level: ServerLogLevel.Error,
          message: "save failed",
          runId: "run-1"
        }
      ]
    });

    expect(parsed).toEqual([
      {
        id: "log-1",
        timestamp: "2026-06-05T08:00:00.000Z",
        level: ServerLogLevel.Error,
        message: "save failed",
        runId: "run-1"
      }
    ]);
  });

  it("rejects invalid payloads", () => {
    expect(() => parseLogsQueryResponse({ logs: [{}] })).toThrowError("Invalid serverLogEntry.id");
  });
});
