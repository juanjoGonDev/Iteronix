import { describe, expect, it } from "vitest";
import {
  mergeRunEvents,
  readGateExecutionState,
  readSelectedRun,
  readStreamingRunId,
  resolveSelectedRunId,
  sortQualityGates
} from "./projects-state.js";
import {
  QualityGateId,
  type QualityGateEventRecord,
  type QualityGateRunRecord
} from "../shared/workbench-types.js";

describe("projects state helpers", () => {
  it("keeps the current selection when the run still exists and falls back to the latest run", () => {
    const runs: ReadonlyArray<QualityGateRunRecord> = [
      createRun({
        id: "run-2",
        status: "running",
        createdAt: "2026-04-24T12:05:00.000Z",
        updatedAt: "2026-04-24T12:05:00.000Z"
      }),
      createRun({
        id: "run-1",
        status: "completed",
        createdAt: "2026-04-24T12:00:00.000Z",
        updatedAt: "2026-04-24T12:03:00.000Z"
      })
    ];

    expect(resolveSelectedRunId("run-1", runs)).toBe("run-1");
    expect(resolveSelectedRunId("missing", runs)).toBe("run-2");
    expect(readSelectedRun(runs, "run-1")?.id).toBe("run-1");
  });

  it("picks a running run for the live stream when the current selection is not active", () => {
    const runs: ReadonlyArray<QualityGateRunRecord> = [
      createRun({
        id: "run-2",
        status: "running",
        currentGate: QualityGateId.Test
      }),
      createRun({
        id: "run-1",
        status: "completed"
      })
    ];

    expect(readStreamingRunId(runs, "run-1")).toBe("run-2");
    expect(readStreamingRunId(runs, "run-2")).toBe("run-2");
  });

  it("derives gate execution state from the run summary", () => {
    const running = createRun({
      id: "run-running",
      status: "running",
      passedCount: 1,
      currentGate: QualityGateId.Typecheck
    });
    const failed = createRun({
      id: "run-failed",
      status: "failed",
      passedCount: 2,
      currentGate: QualityGateId.Test,
      failedGate: QualityGateId.Test
    });

    expect(readGateExecutionState(running, QualityGateId.Lint, 0)).toBe("completed");
    expect(readGateExecutionState(running, QualityGateId.Typecheck, 1)).toBe("running");
    expect(readGateExecutionState(running, QualityGateId.Test, 2)).toBe("pending");
    expect(readGateExecutionState(failed, QualityGateId.Test, 2)).toBe("failed");
    expect(readGateExecutionState(failed, QualityGateId.Build, 3)).toBe("pending");
  });

  it("merges streamed events without duplicates and keeps chronological order", () => {
    const first = createEvent({
      id: "event-2",
      timestamp: "2026-04-24T12:00:02.000Z",
      text: "lint completed"
    });
    const second = createEvent({
      id: "event-1",
      timestamp: "2026-04-24T12:00:01.000Z",
      text: "lint started"
    });

    const merged = mergeRunEvents([first], second);

    expect(mergeRunEvents(merged, second)).toEqual(merged);
    expect(merged.map((event) => event.id)).toEqual(["event-1", "event-2"]);
  });

  it("sorts gate selections in execution order", () => {
    expect(
      sortQualityGates([
        QualityGateId.Build,
        QualityGateId.Lint,
        QualityGateId.Test
      ])
    ).toEqual([
      QualityGateId.Lint,
      QualityGateId.Test,
      QualityGateId.Build
    ]);
  });
});

const createRun = (input: {
  id: string;
  status: QualityGateRunRecord["status"];
  createdAt?: string;
  updatedAt?: string;
  passedCount?: number;
  currentGate?: QualityGateRunRecord["currentGate"];
  failedGate?: QualityGateRunRecord["failedGate"];
}): QualityGateRunRecord => ({
  id: input.id,
  projectId: "project-1",
  status: input.status,
  createdAt: input.createdAt ?? "2026-04-24T12:00:00.000Z",
  updatedAt: input.updatedAt ?? "2026-04-24T12:00:00.000Z",
  gates: [
    QualityGateId.Lint,
    QualityGateId.Typecheck,
    QualityGateId.Test,
    QualityGateId.Build
  ],
  passedCount: input.passedCount ?? 4,
  ...(input.currentGate ? { currentGate: input.currentGate } : {}),
  ...(input.failedGate ? { failedGate: input.failedGate } : {})
});

const createEvent = (input: {
  id: string;
  timestamp: string;
  text: string;
}): QualityGateEventRecord => ({
  id: input.id,
  runId: "run-1",
  type: "message",
  timestamp: input.timestamp,
  data: {
    text: input.text
  }
});
