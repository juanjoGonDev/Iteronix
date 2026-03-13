import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LogLevel } from "../../../packages/domain/src/ports/logs-store";
import { LOG_FILE_NAME } from "../../../packages/shared/src/logger/constants";
import { createServerLogsStore } from "./server-logs-store";

describe("ServerLogsStore", () => {
  const testLogDir = join(tmpdir(), "iteronix-server-logs-test");
  const testLogPath = join(testLogDir, LOG_FILE_NAME);
  let logsStore: Awaited<ReturnType<typeof createServerLogsStore>>;

  beforeEach(async () => {
    await fs.mkdir(testLogDir, { recursive: true });
    logsStore = await createServerLogsStore(testLogDir);
  });

  afterEach(async () => {
    await fs.rm(testLogDir, { recursive: true, force: true });
  });

  describe("query", () => {
    it("should return all log entries when no filters are provided", async () => {
      await logsStore.append({
        id: "1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "Test message"
      });

      const result = logsStore.query({});

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.value).toHaveLength(1);
      }
    });

    it("should filter by log level", async () => {
      await logsStore.append({
        id: "1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "Info message"
      });
      await logsStore.append({
        id: "2",
        timestamp: "2024-01-01 12:00:01.000",
        level: LogLevel.Error,
        message: "Error message"
      });

      const result = logsStore.query({ level: LogLevel.Error });

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.level).toBe(LogLevel.Error);
      }
    });

    it("should limit results", async () => {
      await logsStore.append({
        id: "1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "Message 1"
      });
      await logsStore.append({
        id: "2",
        timestamp: "2024-01-01 12:00:01.000",
        level: LogLevel.Info,
        message: "Message 2"
      });
      await logsStore.append({
        id: "3",
        timestamp: "2024-01-01 12:00:02.000",
        level: LogLevel.Info,
        message: "Message 3"
      });

      const result = logsStore.query({ limit: 2 });

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.value).toHaveLength(2);
      }
    });

    it("should return error for negative limit", () => {
      const result = logsStore.query({ limit: -1 });

      expect(result.type).toBe("err");
      if (result.type === "err") {
        expect(result.error.code).toBe("invalid_query");
      }
    });
  });

  describe("append", () => {
    it("should append log entry to file", async () => {
      await logsStore.append({
        id: "1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "Test message"
      });

      const fileContent = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent).toContain("Test message");
    });
  });

  describe("reset", () => {
    it("should clear all log entries on reset", async () => {
      await logsStore.append({
        id: "test-id-1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "First message"
      });

      const fileContent1 = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent1).toContain("First message");

      await logsStore.reset();

      await logsStore.append({
        id: "test-id-2",
        timestamp: "2024-01-01 12:00:01.000",
        level: LogLevel.Info,
        message: "Second message"
      });

      const fileContent2 = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent2).not.toContain("First message");
      expect(fileContent2).toContain("Second message");
    });
  });
});
