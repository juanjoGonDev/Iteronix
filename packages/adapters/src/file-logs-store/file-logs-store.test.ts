import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LogEntry, LogLevel } from "../../../domain/src/ports/logs-store";
import { LOG_FILE_NAME } from "../../../shared/src/logger/constants";
import { createFileLogsStore } from "./file-logs-store";

describe("FileLogsStore", () => {
  const testLogDir = join(tmpdir(), "iteronix-logs-test");
  const testLogPath = join(testLogDir, LOG_FILE_NAME);
  let store: Awaited<ReturnType<typeof createFileLogsStore>>;

  beforeEach(async () => {
    await fs.mkdir(testLogDir, { recursive: true });
    store = await createFileLogsStore(testLogDir);
  });

  afterEach(async () => {
    await fs.rm(testLogDir, { recursive: true, force: true });
  });

  describe("append", () => {
    it("should append a log entry to the file", async () => {
      const entry: LogEntry = {
        id: "test-id-1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "Test message"
      };

      const result = await store.append(entry);

      expect(result.type).toBe("ok");

      const fileContent = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent).toContain("Test message");
    });

    it("should append multiple log entries", async () => {
      const entry1: LogEntry = {
        id: "test-id-1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "First message"
      };
      const entry2: LogEntry = {
        id: "test-id-2",
        timestamp: "2024-01-01 12:00:01.000",
        level: LogLevel.Debug,
        message: "Second message"
      };

      await store.append(entry1);
      await store.append(entry2);

      const fileContent = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent).toContain("First message");
      expect(fileContent).toContain("Second message");
    });

    it("should create log directory if it does not exist", async () => {
      const nonExistentDir = join(tmpdir(), "iteronix-non-existent");
      const store2 = await createFileLogsStore(nonExistentDir);
      const entry: LogEntry = {
        id: "test-id-1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "Test message"
      };

      const result = await store2.append(entry);

      expect(result.type).toBe("ok");

      await fs.rm(nonExistentDir, { recursive: true });
    });

    it("should handle log entries with context", async () => {
      const entry: LogEntry = {
        id: "test-id-1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Warn,
        message: "Warning message",
        context: { key1: "value1", key2: "value2" }
      };

      const result = await store.append(entry);

      expect(result.type).toBe("ok");

      const fileContent = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent).toContain("Warning message");
      expect(fileContent).toContain("key1");
      expect(fileContent).toContain("value1");
    });

    it("should handle log entries with data", async () => {
      const entry: LogEntry = {
        id: "test-id-1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Error,
        message: "Error message",
        data: { error: "Something went wrong", code: 500 }
      };

      const result = await store.append(entry);

      expect(result.type).toBe("ok");

      const fileContent = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent).toContain("Error message");
      expect(fileContent).toContain("error");
      expect(fileContent).toContain("Something went wrong");
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      const baseTime = "2024-01-01 12:00:00.000";

      await store.append({
        id: "1",
        timestamp: baseTime,
        level: LogLevel.Trace,
        message: "Trace message"
      });
      await store.append({
        id: "2",
        timestamp: "2024-01-01 12:00:01.000",
        level: LogLevel.Debug,
        message: "Debug message"
      });
      await store.append({
        id: "3",
        timestamp: "2024-01-01 12:00:02.000",
        level: LogLevel.Info,
        message: "Info message"
      });
      await store.append({
        id: "4",
        timestamp: "2024-01-01 12:00:03.000",
        level: LogLevel.Warn,
        message: "Warn message"
      });
      await store.append({
        id: "5",
        timestamp: "2024-01-01 12:00:04.000",
        level: LogLevel.Error,
        message: "Error message"
      });
      await store.append({
        id: "6",
        timestamp: "2024-01-01 12:00:05.000",
        level: LogLevel.Fatal,
        message: "Fatal message"
      });
    });

    it("should return all log entries when no filters are provided", async () => {
      const result = await store.query({});

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.value).toHaveLength(6);
      }
    });

    it("should filter by log level", async () => {
      const result = await store.query({ level: LogLevel.Error });

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.value.length).toBe(2);
        expect(result.value[0]?.level).toBe(LogLevel.Error);
        expect(result.value[1]?.level).toBe(LogLevel.Fatal);
      }
    });

    it("should limit results", async () => {
      const result = await store.query({ limit: 3 });

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.value).toHaveLength(3);
      }
    });

    it("should return empty array if no logs match query", async () => {
      const result = await store.query({
        since: "2025-01-01 00:00:00.000"
      });

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("reset", () => {
    it("should clear all log entries on initialization", async () => {
      await store.append({
        id: "test-id-1",
        timestamp: "2024-01-01 12:00:00.000",
        level: LogLevel.Info,
        message: "First store message"
      });

      const fileContent1 = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent1).toContain("First store message");

      await store.reset();

      await store.append({
        id: "test-id-2",
        timestamp: "2024-01-01 12:00:01.000",
        level: LogLevel.Info,
        message: "Second store message"
      });

      const fileContent2 = await fs.readFile(testLogPath, "utf-8");
      expect(fileContent2).not.toContain("First store message");
      expect(fileContent2).toContain("Second store message");
    });
  });
});
