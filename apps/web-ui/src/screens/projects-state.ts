import {
  QualityGateId,
  type QualityGateEventRecord,
  type QualityGateId as QualityGateKey,
  type QualityGateRunRecord
} from "../shared/workbench-types.js";

export const DefaultSelectedGates: ReadonlyArray<QualityGateKey> = [
  QualityGateId.Lint,
  QualityGateId.Typecheck,
  QualityGateId.Test,
  QualityGateId.Build
];

export type GateExecutionState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export const resolveSelectedRunId = (
  selectedRunId: string | null,
  runs: ReadonlyArray<QualityGateRunRecord>
): string | null => {
  if (selectedRunId && runs.some((run) => run.id === selectedRunId)) {
    return selectedRunId;
  }

  return runs[0]?.id ?? null;
};

export const readSelectedRun = (
  runs: ReadonlyArray<QualityGateRunRecord>,
  selectedRunId: string | null
): QualityGateRunRecord | undefined =>
  runs.find((run) => run.id === selectedRunId) ?? runs[0];

export const readStreamingRunId = (
  runs: ReadonlyArray<QualityGateRunRecord>,
  selectedRunId: string | null
): string | null => {
  const selectedRun = readSelectedRun(runs, selectedRunId);
  if (selectedRun && isRunActive(selectedRun.status)) {
    return selectedRun.id;
  }

  return runs.find((run) => isRunActive(run.status))?.id ?? null;
};

export const readGateExecutionState = (
  run: QualityGateRunRecord,
  gate: QualityGateKey,
  index: number
): GateExecutionState => {
  if (index < run.passedCount) {
    return "completed";
  }

  if (run.status === "completed") {
    return "completed";
  }

  if (run.status === "failed" && (run.failedGate === gate || run.currentGate === gate)) {
    return "failed";
  }

  if (run.status === "canceled") {
    return "canceled";
  }

  if (isRunActive(run.status) && run.currentGate === gate) {
    return "running";
  }

  return "pending";
};

export const mergeRunEvents = (
  events: ReadonlyArray<QualityGateEventRecord>,
  nextEvent: QualityGateEventRecord
): ReadonlyArray<QualityGateEventRecord> => {
  if (events.some((event) => event.id === nextEvent.id)) {
    return events;
  }

  return [...events, nextEvent].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp)
  );
};

export const sortQualityGates = (
  gates: ReadonlyArray<QualityGateKey>
): ReadonlyArray<QualityGateKey> =>
  [...gates].sort(
    (left, right) =>
      DefaultSelectedGates.indexOf(left) - DefaultSelectedGates.indexOf(right)
  );

const isRunActive = (status: QualityGateRunRecord["status"]): boolean =>
  status === "pending" || status === "running";
