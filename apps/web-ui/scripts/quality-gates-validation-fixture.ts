import {
  QualityGateEventName,
  QualityGateId,
  type ProjectRecord,
  type QualityGateEventRecord,
  type QualityGateRunRecord
} from "../src/shared/workbench-types.js";

const FixtureTimestamp = {
  ProjectCreatedAt: "2026-04-24T13:00:00.000Z",
  RunCreatedAt: "2026-04-24T13:05:00.000Z",
  RunningUpdatedAt: "2026-04-24T13:05:05.000Z",
  CompletedUpdatedAt: "2026-04-24T13:05:09.000Z",
  EventLint: "2026-04-24T13:05:06.000Z",
  EventTypecheck: "2026-04-24T13:05:07.000Z"
} as const;

const FixtureIdentity = {
  ProjectId: "project-quality-gates-browser",
  RunId: "run-quality-gates-browser"
} as const;

const FixturePath = {
  RootPath: "D:/projects/Iteronix",
  Name: "Iteronix"
} as const;

export type QualityGatesValidationFixture = {
  project: ProjectRecord;
  runningRun: QualityGateRunRecord;
  completedRun: QualityGateRunRecord;
  streamEvents: ReadonlyArray<QualityGateEventRecord>;
  readRunsForPoll: (pollCount: number) => ReadonlyArray<QualityGateRunRecord>;
};

export const createQualityGatesValidationFixture = (): QualityGatesValidationFixture => {
  const project = createProjectRecord();
  const runningRun = createRunningRun();
  const completedRun = createCompletedRun();
  const streamEvents = createStreamEvents();

  return {
    project,
    runningRun,
    completedRun,
    streamEvents,
    readRunsForPoll: (pollCount) =>
      pollCount >= 2 ? [completedRun] : [runningRun]
  };
};

export const encodeQualityGateProgressEvent = (
  event: QualityGateEventRecord
): string =>
  [
    `id: ${event.id}`,
    `event: ${QualityGateEventName.Progress}`,
    `data: ${JSON.stringify(event)}`,
    "",
    ""
  ].join("\n");

const createProjectRecord = (): ProjectRecord => ({
  id: FixtureIdentity.ProjectId,
  name: FixturePath.Name,
  rootPath: FixturePath.RootPath,
  createdAt: FixtureTimestamp.ProjectCreatedAt,
  updatedAt: FixtureTimestamp.ProjectCreatedAt
});

const createRunningRun = (): QualityGateRunRecord => ({
  id: FixtureIdentity.RunId,
  projectId: FixtureIdentity.ProjectId,
  status: "running",
  createdAt: FixtureTimestamp.RunCreatedAt,
  updatedAt: FixtureTimestamp.RunningUpdatedAt,
  gates: [
    QualityGateId.Lint,
    QualityGateId.Typecheck,
    QualityGateId.Test,
    QualityGateId.Build
  ],
  passedCount: 1,
  currentGate: QualityGateId.Typecheck
});

const createCompletedRun = (): QualityGateRunRecord => ({
  id: FixtureIdentity.RunId,
  projectId: FixtureIdentity.ProjectId,
  status: "completed",
  createdAt: FixtureTimestamp.RunCreatedAt,
  updatedAt: FixtureTimestamp.CompletedUpdatedAt,
  gates: [
    QualityGateId.Lint,
    QualityGateId.Typecheck,
    QualityGateId.Test,
    QualityGateId.Build
  ],
  passedCount: 4
});

const createStreamEvents = (): ReadonlyArray<QualityGateEventRecord> => [
  {
    id: "event-quality-gates-lint",
    runId: FixtureIdentity.RunId,
    type: "message",
    timestamp: FixtureTimestamp.EventLint,
    data: {
      gate: QualityGateId.Lint,
      text: "Running lint"
    }
  },
  {
    id: "event-quality-gates-typecheck",
    runId: FixtureIdentity.RunId,
    type: "message",
    timestamp: FixtureTimestamp.EventTypecheck,
    data: {
      gate: QualityGateId.Typecheck,
      text: "Typecheck passed"
    }
  }
];
