import { describe, expect, it } from "vitest";
import {
  SharedLogLevel,
  createSharedLogEntry,
  formatLogError,
  installConsoleForwarder,
  serializeLogValue
} from "./logger-core";

describe("logger core", () => {
  it("maps console methods into shared log entries", () => {
    const sent: string[] = [];
    const forwarder = installConsoleForwarder({
      send: (entry) => {
        sent.push(`${entry.level}:${entry.message}`);
      },
      shouldReset: () => false,
      createId: () => "log-id",
      now: () => "2026-06-05T00:00:00.000Z"
    });

    console.warn("settings failed", { status: 400 });
    forwarder.uninstall();

    expect(sent).toEqual([
      "warn:settings failed {\"status\":400}"
    ]);
  });

  it("creates shared log entries from arbitrary args", () => {
    const entry = createSharedLogEntry({
      level: SharedLogLevel.Info,
      args: ["hello", { ok: true }],
      createId: () => "entry-id",
      now: () => "2026-06-05T00:00:00.000Z"
    });

    expect(entry).toEqual({
      id: "entry-id",
      timestamp: "2026-06-05T00:00:00.000Z",
      level: SharedLogLevel.Info,
      message: "hello {\"ok\":true}"
    });
  });

  it("serializes errors with stack-safe formatting", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\nstack-line";

    expect(formatLogError(error)).toContain("Error: boom");
    expect(serializeLogValue(error)).toContain("stack-line");
  });
});
