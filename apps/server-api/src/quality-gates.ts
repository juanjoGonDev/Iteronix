import { randomUUID } from "node:crypto";
import {
  type HistoryEvent,
  HistoryEventType,
  type HistoryMetadata,
  type HistoryRunRecord,
  HistoryRunStatus,
  HistoryRunType,
  HistoryStoreErrorCode,
  type HistoryStore
} from "./history";
import {
  ErrorMessage,
  HistoryField,
  HttpStatus,
  ProjectField,
  QualityGateField
} from "./constants";
import type { Project, ProjectStore } from "./projects";
import { ProjectStoreErrorCode } from "./projects";
import { ResultType, err, ok, type Result } from "./result";
import type { CommandPolicy, WorkspacePolicy } from "./sandbox";
import {
  CommandOutputSource,
  type CommandRunner
} from "../../../packages/adapters/src/command-runner/command-runner";

export type ApiError = {
  status: number;
  message: string;
};

export const QualityGateId = {
  Lint: "lint",
  Typecheck: "typecheck",
  Test: "test",
  Build: "build"
} as const;

export type QualityGateId = typeof QualityGateId[keyof typeof QualityGateId];

export const QualityGateEventName = {
  Progress: "quality-gates-progress"
} as const;

export type QualityGateDefinition = {
  id: QualityGateId;
  command: string;
  args: ReadonlyArray<string>;
};

export type QualityGateCatalog = Record<QualityGateId, QualityGateDefinition>;

export type QualityGateRunRecord = {
  id: string;
  projectId: string;
  status: HistoryRunStatus;
  createdAt: string;
  updatedAt: string;
  gates: ReadonlyArray<QualityGateId>;
  passedCount: number;
  currentGate?: QualityGateId;
  failedGate?: QualityGateId;
};

export type QualityGateRunRequest = {
  projectId: string;
  gates: ReadonlyArray<QualityGateId>;
};

export type QualityGateListRequest = {
  projectId: string;
  status?: HistoryRunStatus;
  limit?: number;
};

export type QualityGateEventsRequest = {
  runId: string;
};

export type QualityGateApiDependencies = {
  projectStore: ProjectStore;
  historyStore: HistoryStore;
  workspacePolicy: WorkspacePolicy;
  commandPolicy: CommandPolicy;
  commandRunner: CommandRunner;
  eventHub: QualityGateEventHub;
  catalog: QualityGateCatalog;
};

export type QualityGateListDependencies = {
  historyStore: HistoryStore;
};

export type QualityGateEventSubscriber = (event: HistoryEvent) => void;

export type QualityGateEventHub = {
  publish: (event: HistoryEvent) => void;
  subscribe: (
    runId: string,
    subscriber: QualityGateEventSubscriber
  ) => () => void;
};

const QualityGateList = [
  QualityGateId.Lint,
  QualityGateId.Typecheck,
  QualityGateId.Test,
  QualityGateId.Build
] as const;

const QualityGateMetadataKey = {
  Gates: "gates",
  CurrentGate: "currentGate",
  PassedCount: "passedCount",
  FailedGate: "failedGate"
} as const;

const QualityGateHistoryProviderId = "server";
const QualityGateHistoryModelId = "quality-gates";
const QualityGateCommandName = "pnpm";

export const createDefaultQualityGateCatalog = (): QualityGateCatalog => ({
  [QualityGateId.Lint]: createQualityGateDefinition(QualityGateId.Lint),
  [QualityGateId.Typecheck]: createQualityGateDefinition(QualityGateId.Typecheck),
  [QualityGateId.Test]: createQualityGateDefinition(QualityGateId.Test),
  [QualityGateId.Build]: createQualityGateDefinition(QualityGateId.Build)
});

export const createQualityGateEventHub = (): QualityGateEventHub => {
  const subscribers = new Map<string, Set<QualityGateEventSubscriber>>();

  const publish = (event: HistoryEvent): void => {
    const listeners = subscribers.get(event.runId);
    if (!listeners) {
      return;
    }

    for (const subscriber of listeners) {
      subscriber(event);
    }
  };

  const subscribe = (
    runId: string,
    subscriber: QualityGateEventSubscriber
  ): (() => void) => {
    const current = subscribers.get(runId) ?? new Set<QualityGateEventSubscriber>();
    current.add(subscriber);
    subscribers.set(runId, current);

    return () => {
      const listeners = subscribers.get(runId);
      if (!listeners) {
        return;
      }

      listeners.delete(subscriber);
      if (listeners.size === 0) {
        subscribers.delete(runId);
      }
    };
  };

  return {
    publish,
    subscribe
  };
};

export const parseQualityGateRunRequest = (
  value: unknown
): Result<QualityGateRunRequest, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    ProjectField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const gates = readOptionalQualityGateList(value, QualityGateField.Gates);
  if (gates.type === ResultType.Err) {
    return gates;
  }

  return ok({
    projectId: projectId.value,
    gates: gates.value ?? [...QualityGateList]
  });
};

export const parseQualityGateListRequest = (
  value: unknown
): Result<QualityGateListRequest, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const projectId = readRequiredString(
    value,
    ProjectField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const status = readOptionalHistoryRunStatus(value, HistoryField.Status);
  if (status.type === ResultType.Err) {
    return status;
  }

  const limit = readOptionalNumber(value, HistoryField.Limit);
  if (limit.type === ResultType.Err) {
    return limit;
  }

  return ok({
    projectId: projectId.value,
    ...(status.value ? { status: status.value } : {}),
    ...(limit.value !== undefined ? { limit: limit.value } : {})
  });
};

export const parseQualityGateEventsRequest = (
  value: unknown
): Result<QualityGateEventsRequest, ApiError> => {
  if (!isRecord(value)) {
    return invalidBody();
  }

  const runId = readRequiredString(
    value,
    HistoryField.RunId,
    ErrorMessage.MissingRunId
  );
  if (runId.type === ResultType.Err) {
    return runId;
  }

  return ok({
    runId: runId.value
  });
};

export const parseQualityGateStreamRequest = (
  query: URLSearchParams
): Result<QualityGateEventsRequest, ApiError> => {
  const runId = query.get(HistoryField.RunId);
  if (!runId || runId.trim().length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingRunId
    });
  }

  return ok({
    runId: runId.trim()
  });
};

export const startQualityGateRun = async (
  input: QualityGateRunRequest,
  dependencies: QualityGateApiDependencies
): Promise<Result<QualityGateRunRecord, ApiError>> => {
  const preparation = prepareQualityGateRun(input, dependencies);
  if (preparation.type === ResultType.Err) {
    return preparation;
  }

  const created = dependencies.historyStore.createRun(preparation.value.run);
  if (created.type === ResultType.Err) {
    return err(mapHistoryStoreError(created.error.code));
  }

  setTimeout(() => {
    void executeQualityGateRun(preparation.value, dependencies);
  }, 0);

  return ok(toQualityGateRunRecord(created.value));
};

export const listQualityGateRuns = (
  input: QualityGateListRequest,
  dependencies: QualityGateListDependencies
): Result<ReadonlyArray<QualityGateRunRecord>, ApiError> => {
  const listed = dependencies.historyStore.listRuns({
    projectId: input.projectId,
    runType: HistoryRunType.QualityGates,
    ...(input.status ? { status: input.status } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {})
  });
  if (listed.type === ResultType.Err) {
    return err(mapHistoryStoreError(listed.error.code));
  }

  return ok(listed.value.map(toQualityGateRunRecord));
};

export const listQualityGateEvents = (
  input: QualityGateEventsRequest,
  dependencies: QualityGateListDependencies
): Result<ReadonlyArray<HistoryEvent>, ApiError> => {
  const events = dependencies.historyStore.listEvents(input.runId);
  if (events.type === ResultType.Err) {
    return err(mapHistoryStoreError(events.error.code));
  }

  return ok(events.value);
};

const prepareQualityGateRun = (
  input: QualityGateRunRequest,
  dependencies: QualityGateApiDependencies
): Result<
  {
    run: HistoryRunRecord;
    project: Project & { rootPath: string };
    definitions: ReadonlyArray<QualityGateDefinition>;
  },
  ApiError
> => {
  const project = dependencies.projectStore.getById(input.projectId);
  if (project.type === ResultType.Err) {
    return err(mapProjectStoreError(project.error.code));
  }

  if (project.value.rootPath === null) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingRootPath
    });
  }

  const root = dependencies.workspacePolicy.assertPathAllowed(project.value.rootPath);
  if (root.type === ResultType.Err) {
    return err(root.error);
  }

  const definitionsResult = resolveQualityGateDefinitions(
    input.gates,
    root.value,
    dependencies
  );
  if (definitionsResult.type === ResultType.Err) {
    return definitionsResult;
  }

  const run = createQualityGateHistoryRun({
    projectId: project.value.id,
    gates: input.gates
  });

  return ok({
    run,
    project: {
      ...project.value,
      rootPath: root.value
    },
    definitions: definitionsResult.value
  });
};

const executeQualityGateRun = async (
  input: {
    run: HistoryRunRecord;
    project: Project & { rootPath: string };
    definitions: ReadonlyArray<QualityGateDefinition>;
  },
  dependencies: QualityGateApiDependencies
): Promise<void> => {
  let passedCount = 0;

  for (const definition of input.definitions) {
    const startingRun = updateHistoryRun(input.run, {
      status: HistoryRunStatus.Running,
      currentGate: definition.id,
      passedCount
    });
    const updatedStart = dependencies.historyStore.updateRun(startingRun);
    if (updatedStart.type !== ResultType.Ok) {
      return;
    }
    input.run = updatedStart.value;

    publishHistoryEvent(
      dependencies,
      createHistoryEvent(input.run.id, HistoryEventType.Message, {
        gate: definition.id,
        text: `Running ${definition.id}`
      })
    );

    const execution = await dependencies.commandRunner.run({
      command: definition.command,
      rootPath: input.project.rootPath,
      cwd: input.project.rootPath,
      args: definition.args,
      onOutput: (event) => {
        publishHistoryEvent(
          dependencies,
          createHistoryEvent(input.run.id, toHistoryEventType(event.source), {
            gate: definition.id,
            stream: event.source,
            text: event.text
          })
        );
      }
    });

    if (execution.type === ResultType.Err) {
      const failedRun = updateHistoryRun(input.run, {
        status: HistoryRunStatus.Failed,
        currentGate: definition.id,
        passedCount,
        failedGate: definition.id
      });
      const updatedFailed = dependencies.historyStore.updateRun(failedRun);
      if (updatedFailed.type !== ResultType.Ok) {
        return;
      }
      input.run = updatedFailed.value;

      publishHistoryEvent(
        dependencies,
        createHistoryEvent(input.run.id, HistoryEventType.Error, {
          gate: definition.id,
          text: execution.error.message
        })
      );
      publishHistoryEvent(
        dependencies,
        createHistoryEvent(input.run.id, HistoryEventType.Done, {
          status: HistoryRunStatus.Failed
        })
      );
      return;
    }

    if (execution.value.exitCode !== 0) {
      const failedRun = updateHistoryRun(input.run, {
        status: HistoryRunStatus.Failed,
        currentGate: definition.id,
        passedCount,
        failedGate: definition.id
      });
      const updatedFailed = dependencies.historyStore.updateRun(failedRun);
      if (updatedFailed.type !== ResultType.Ok) {
        return;
      }
      input.run = updatedFailed.value;

      publishHistoryEvent(
        dependencies,
        createHistoryEvent(input.run.id, HistoryEventType.Error, {
          gate: definition.id,
          exitCode: execution.value.exitCode,
          text:
            execution.value.stderr.trim().length > 0
              ? execution.value.stderr
              : execution.value.stdout
        })
      );
      publishHistoryEvent(
        dependencies,
        createHistoryEvent(input.run.id, HistoryEventType.Done, {
          status: HistoryRunStatus.Failed
        })
      );
      return;
    }

    passedCount += 1;
    const passedRun = updateHistoryRun(input.run, {
      status: HistoryRunStatus.Running,
      currentGate: definition.id,
      passedCount
    });
    const updatedPassed = dependencies.historyStore.updateRun(passedRun);
    if (updatedPassed.type !== ResultType.Ok) {
      return;
    }
    input.run = updatedPassed.value;
  }

  const completedRun = updateHistoryRun(input.run, {
    status: HistoryRunStatus.Completed,
    passedCount
  });
  const updatedCompleted = dependencies.historyStore.updateRun(completedRun);
  if (updatedCompleted.type !== ResultType.Ok) {
    return;
  }

  publishHistoryEvent(
    dependencies,
    createHistoryEvent(updatedCompleted.value.id, HistoryEventType.Done, {
      status: HistoryRunStatus.Completed
    })
  );
};

const resolveQualityGateDefinitions = (
  gates: ReadonlyArray<QualityGateId>,
  rootPath: string,
  dependencies: QualityGateApiDependencies
): Result<ReadonlyArray<QualityGateDefinition>, ApiError> => {
  const definitions: QualityGateDefinition[] = [];

  for (const gate of gates) {
    const definition = dependencies.catalog[gate];
    if (!definition) {
      return invalidBody();
    }

    const command = dependencies.commandPolicy.assertCommandAllowed({
      command: definition.command,
      rootPath,
      cwd: rootPath
    });
    if (command.type === ResultType.Err) {
      return err(command.error);
    }

    definitions.push({
      ...definition,
      command: command.value.command
    });
  }

  return ok(definitions);
};

const createQualityGateHistoryRun = (input: {
  projectId: string;
  gates: ReadonlyArray<QualityGateId>;
}): HistoryRunRecord => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    providerId: QualityGateHistoryProviderId,
    modelId: QualityGateHistoryModelId,
    status: HistoryRunStatus.Pending,
    createdAt: now,
    updatedAt: now,
    input: input.gates.join(","),
    projectId: input.projectId,
    runType: HistoryRunType.QualityGates,
    metadata: createQualityGateMetadata({
      gates: input.gates,
      passedCount: 0
    })
  };
};

const updateHistoryRun = (
  run: HistoryRunRecord,
  input: {
    status: HistoryRunStatus;
    passedCount: number;
    currentGate?: QualityGateId;
    failedGate?: QualityGateId;
  }
): HistoryRunRecord => ({
  ...run,
  status: input.status,
  updatedAt: new Date().toISOString(),
  metadata: createQualityGateMetadata({
    gates: readMetadataGates(run.metadata),
    passedCount: input.passedCount,
    ...(input.currentGate ? { currentGate: input.currentGate } : {}),
    ...(input.failedGate ? { failedGate: input.failedGate } : {})
  })
});

const createQualityGateMetadata = (input: {
  gates: ReadonlyArray<QualityGateId>;
  passedCount: number;
  currentGate?: QualityGateId;
  failedGate?: QualityGateId;
}): HistoryMetadata => ({
  [QualityGateMetadataKey.Gates]: [...input.gates],
  [QualityGateMetadataKey.PassedCount]: input.passedCount,
  ...(input.currentGate
    ? { [QualityGateMetadataKey.CurrentGate]: input.currentGate }
    : {}),
  ...(input.failedGate
    ? { [QualityGateMetadataKey.FailedGate]: input.failedGate }
    : {})
});

const toQualityGateRunRecord = (run: HistoryRunRecord): QualityGateRunRecord => {
  const currentGate = readMetadataCurrentGate(run.metadata);
  const failedGate = readMetadataFailedGate(run.metadata);

  return {
    id: run.id,
    projectId: run.projectId ?? "",
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    gates: readMetadataGates(run.metadata),
    passedCount: readMetadataPassedCount(run.metadata),
    ...(currentGate ? { currentGate } : {}),
    ...(failedGate ? { failedGate } : {})
  };
};

const readMetadataGates = (
  metadata: HistoryMetadata | undefined
): ReadonlyArray<QualityGateId> => {
  const value = metadata?.[QualityGateMetadataKey.Gates];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isQualityGateId);
};

const readMetadataPassedCount = (metadata: HistoryMetadata | undefined): number => {
  const value = metadata?.[QualityGateMetadataKey.PassedCount];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const readMetadataCurrentGate = (
  metadata: HistoryMetadata | undefined
): QualityGateId | undefined => {
  const value = metadata?.[QualityGateMetadataKey.CurrentGate];
  return typeof value === "string" && isQualityGateId(value) ? value : undefined;
};

const readMetadataFailedGate = (
  metadata: HistoryMetadata | undefined
): QualityGateId | undefined => {
  const value = metadata?.[QualityGateMetadataKey.FailedGate];
  return typeof value === "string" && isQualityGateId(value) ? value : undefined;
};

const createHistoryEvent = (
  runId: string,
  type: HistoryEventType,
  data: Record<string, unknown>
): HistoryEvent => ({
  id: randomUUID(),
  runId,
  type,
  data,
  timestamp: new Date().toISOString()
});

const publishHistoryEvent = (
  dependencies: QualityGateApiDependencies,
  event: HistoryEvent
): void => {
  const appended = dependencies.historyStore.appendEvent(event);
  if (appended.type !== ResultType.Ok) {
    return;
  }

  dependencies.eventHub.publish(appended.value);
};

const toHistoryEventType = (
  source: CommandOutputSource
): HistoryEventType => {
  if (source === CommandOutputSource.Stderr) {
    return HistoryEventType.Error;
  }

  return HistoryEventType.Message;
};

const createQualityGateDefinition = (
  id: QualityGateId
): QualityGateDefinition => ({
  id,
  command: QualityGateCommandName,
  args: [id]
});

const mapProjectStoreError = (code: string): ApiError => {
  if (code === ProjectStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: ErrorMessage.NotFound
  };
};

const mapHistoryStoreError = (code: string): ApiError => {
  if (code === HistoryStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: ErrorMessage.InvalidBody
  };
};

const invalidBody = (): Result<never, ApiError> =>
  err({
    status: HttpStatus.BadRequest,
    message: ErrorMessage.InvalidBody
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isQualityGateId = (value: string): value is QualityGateId =>
  value === QualityGateId.Lint ||
  value === QualityGateId.Typecheck ||
  value === QualityGateId.Test ||
  value === QualityGateId.Build;

const isHistoryRunStatus = (value: string): value is HistoryRunStatus =>
  value === HistoryRunStatus.Pending ||
  value === HistoryRunStatus.Running ||
  value === HistoryRunStatus.Completed ||
  value === HistoryRunStatus.Failed ||
  value === HistoryRunStatus.Canceled;

const readRequiredString = (
  record: Record<string, unknown>,
  key: string,
  message: string
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message
    });
  }

  return ok(trimmed);
};

const readOptionalQualityGateList = (
  record: Record<string, unknown>,
  key: string
): Result<ReadonlyArray<QualityGateId> | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(value)) {
    return invalidBody();
  }

  const gates: QualityGateId[] = [];

  for (const entry of value) {
    if (typeof entry !== "string" || !isQualityGateId(entry)) {
      return invalidBody();
    }

    if (!gates.includes(entry)) {
      gates.push(entry);
    }
  }

  return ok(gates);
};

const readOptionalHistoryRunStatus = (
  record: Record<string, unknown>,
  key: string
): Result<HistoryRunStatus | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "string" || !isHistoryRunStatus(value)) {
    return invalidBody();
  }

  return ok(value);
};

const readOptionalNumber = (
  record: Record<string, unknown>,
  key: string
): Result<number | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return invalidBody();
  }

  return ok(Math.floor(value));
};
