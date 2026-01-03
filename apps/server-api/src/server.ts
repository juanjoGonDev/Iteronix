import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  BearerPrefix,
  BearerScheme,
  ErrorMessage,
  FileField,
  HeaderName,
  HttpMethod,
  HttpStatus,
  MimeType,
  LogsField,
  ProviderField,
  ProjectField,
  QueryParam,
  RoutePath,
  HistoryField,
  SessionField,
  TextEncoding
} from "./constants";
import { loadConfig, type ServerConfig } from "./config";
import {
  listFileTree,
  readFileContent,
  writeFileContent
} from "./files";
import {
  createProjectStore,
  ProjectStoreErrorCode,
  type Project,
  type ProjectCreateInput,
  type ProjectOpenInput,
  type ProjectStore
} from "./projects";
import {
  createHistoryStore,
  HistoryRunStatus,
  HistoryStoreErrorCode,
  type HistoryStoreError,
  type HistoryStore
} from "./history";
import {
  createLogsStore,
  LogLevel,
  LogsStoreErrorCode,
  type LogsStoreError,
  type LogsStore
} from "./logs";
import {
  createProviderStore,
  ProviderStoreErrorCode,
  type ProviderSelection,
  type ProviderStoreError,
  type ProviderStore
} from "./providers";
import {
  createSessionEventHub,
  createSessionStore,
  createStatusEvent,
  SessionEventType,
  type Session,
  SessionStoreErrorCode,
  type SessionStoreError,
  type SessionStore,
  type SessionEventHub
} from "./sessions";
import { createSseStream } from "./sse";
import { err, ok, ResultType, type Result } from "./result";

export const startServer = (): void => {
  const config = loadConfig(process.env);
  const projectStore = createProjectStore();
  const sessionStore = createSessionStore();
  const sessionEvents = createSessionEventHub();
  const historyStore = createHistoryStore();
  const logsStore = createLogsStore();
  const providerStore = createProviderStore();
  const server = createServer((req, res) => {
    void handleRequest(
      req,
      res,
      config,
      projectStore,
      sessionStore,
      sessionEvents,
      historyStore,
      logsStore,
      providerStore
    );
  });

  server.listen(config.port, config.host);
};

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  projectStore: ProjectStore,
  sessionStore: SessionStore,
  sessionEvents: SessionEventHub,
  historyStore: HistoryStore,
  logsStore: LogsStore,
  providerStore: ProviderStore
): Promise<void> => {
  if (!req.url || !req.method) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingUrl
    });
    return;
  }

  if (!isAuthorized(req, config.authToken)) {
    respondUnauthorized(res);
    return;
  }

  const url = new URL(req.url, `http://${config.host}`);
  const path = url.pathname;
  const method = req.method;

  if (path === RoutePath.ProjectsCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleCreateProject(req, res, projectStore);
    return;
  }

  if (path === RoutePath.ProjectsOpen) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleOpenProject(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesTree) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileTree(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesRead) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileRead(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesWrite) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileWrite(req, res, projectStore);
    return;
  }

  if (path === RoutePath.SessionsStart) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleSessionStart(req, res, sessionStore, sessionEvents);
    return;
  }

  if (path === RoutePath.SessionsStop) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleSessionStop(req, res, sessionStore, sessionEvents);
    return;
  }

  if (path === RoutePath.SessionsStream) {
    if (method !== HttpMethod.Get) {
      respondMethodNotAllowed(res);
      return;
    }

    handleSessionStream(req, res, sessionStore, sessionEvents, url);
    return;
  }

  if (path === RoutePath.HistoryList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleHistoryList(req, res, historyStore);
    return;
  }

  if (path === RoutePath.HistoryEvents) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleHistoryEvents(req, res, historyStore);
    return;
  }

  if (path === RoutePath.LogsQuery) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleLogsQuery(req, res, logsStore);
    return;
  }

  if (path === RoutePath.ProvidersList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleProvidersList(req, res, projectStore, providerStore);
    return;
  }

  if (path === RoutePath.ProvidersSelect) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleProvidersSelect(req, res, projectStore, providerStore);
    return;
  }

  if (path === RoutePath.ProvidersSettings) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleProviderSettingsUpdate(req, res, projectStore, providerStore);
    return;
  }

  respondError(res, {
    status: HttpStatus.NotFound,
    message: ErrorMessage.NotFound
  });
};

const handleCreateProject = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseCreateProject(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const created = store.create(parsed.value);
  if (created.type === ResultType.Err) {
    respondError(res, mapProjectStoreError(created.error));
    return;
  }

  respondJson(res, HttpStatus.Created, {
    project: created.value
  });
};

const handleOpenProject = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseOpenProject(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const opened = store.open(parsed.value);
  if (opened.type === ResultType.Err) {
    respondError(res, mapProjectStoreError(opened.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    project: opened.value
  });
};

const handleFileTree = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileTreeRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const treeResult = await listFileTree(
    projectResult.value.rootPath,
    parsed.value.path
  );
  if (treeResult.type === ResultType.Err) {
    respondError(res, treeResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    entries: treeResult.value
  });
};

const handleFileRead = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileReadRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const readResult = await readFileContent(
    projectResult.value.rootPath,
    parsed.value.path
  );
  if (readResult.type === ResultType.Err) {
    respondError(res, readResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    content: readResult.value.content
  });
};

const handleFileWrite = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileWriteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const writeResult = await writeFileContent(
    projectResult.value.rootPath,
    parsed.value.path,
    parsed.value.content
  );
  if (writeResult.type === ResultType.Err) {
    respondError(res, writeResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    bytesWritten: writeResult.value.bytesWritten
  });
};

const handleSessionStart = async (
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: SessionStore,
  sessionEvents: SessionEventHub
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseSessionStartRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const started = sessionStore.start(parsed.value);
  if (started.type === ResultType.Err) {
    respondError(res, mapSessionStoreError(started.error));
    return;
  }

  sessionEvents.publish(createStatusEvent(started.value));

  respondJson(res, HttpStatus.Created, {
    session: started.value
  });
};

const handleSessionStop = async (
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: SessionStore,
  sessionEvents: SessionEventHub
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseSessionStopRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const stopped = sessionStore.stop(parsed.value.sessionId);
  if (stopped.type === ResultType.Err) {
    respondError(res, mapSessionStoreError(stopped.error));
    return;
  }

  sessionEvents.publish(createStatusEvent(stopped.value));

  respondJson(res, HttpStatus.Ok, {
    session: stopped.value
  });
};

const handleSessionStream = (
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: SessionStore,
  sessionEvents: SessionEventHub,
  url: URL
): void => {
  const sessionId = url.searchParams.get(QueryParam.SessionId) ?? undefined;
  if (!sessionId || sessionId.trim().length === 0) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingSessionId
    });
    return;
  }

  const sessionResult = getSessionById(sessionStore, sessionId);
  if (sessionResult.type === ResultType.Err) {
    respondError(res, sessionResult.error);
    return;
  }

  const stream = createSseStream(res);
  const initialEvent = createStatusEvent(sessionResult.value);
  stream.send({
    event: SessionEventType.Status,
    data: initialEvent,
    id: initialEvent.id
  });

  const unsubscribe = sessionEvents.subscribe(sessionId, (event) => {
    stream.send({
      event: event.type,
      data: event,
      id: event.id
    });
  });

  req.on("close", () => {
    unsubscribe();
    stream.close();
  });
};

const handleHistoryList = async (
  req: IncomingMessage,
  res: ServerResponse,
  historyStore: HistoryStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseHistoryListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const listed = historyStore.listRuns(parsed.value);
  if (listed.type === ResultType.Err) {
    respondError(res, mapHistoryStoreError(listed.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    runs: listed.value
  });
};

const handleHistoryEvents = async (
  req: IncomingMessage,
  res: ServerResponse,
  historyStore: HistoryStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseHistoryEventsRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const events = historyStore.listEvents(parsed.value.runId);
  if (events.type === ResultType.Err) {
    respondError(res, mapHistoryStoreError(events.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    events: events.value
  });
};

const handleLogsQuery = async (
  req: IncomingMessage,
  res: ServerResponse,
  logsStore: LogsStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseLogsQueryRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const logs = logsStore.query(parsed.value);
  if (logs.type === ResultType.Err) {
    respondError(res, mapLogsStoreError(logs.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    logs: logs.value
  });
};

const handleProvidersList = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  providerStore: ProviderStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseProvidersListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  let selection: ProviderSelection | undefined;

  if (parsed.value.projectId && parsed.value.profileId) {
    const projectResult = getProjectById(projectStore, parsed.value.projectId);
    if (projectResult.type === ResultType.Err) {
      respondError(res, projectResult.error);
      return;
    }

    const selectionResult = providerStore.getSelection({
      projectId: parsed.value.projectId,
      profileId: parsed.value.profileId
    });
    if (selectionResult.type === ResultType.Err) {
      respondError(res, mapProviderStoreError(selectionResult.error));
      return;
    }

    selection = selectionResult.value;
  }

  const response = selection
    ? { providers: providerStore.listProviders(), selection }
    : { providers: providerStore.listProviders() };

  respondJson(res, HttpStatus.Ok, response);
};

const handleProvidersSelect = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  providerStore: ProviderStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseProvidersSelectRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const selected = providerStore.selectProvider(parsed.value);
  if (selected.type === ResultType.Err) {
    respondError(res, mapProviderStoreError(selected.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    selection: selected.value
  });
};

const handleProviderSettingsUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  providerStore: ProviderStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseProviderSettingsRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const updated = providerStore.updateSettings(parsed.value);
  if (updated.type === ResultType.Err) {
    respondError(res, mapProviderStoreError(updated.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    settings: updated.value
  });
};

type ApiError = {
  status: number;
  message: string;
};

const readJsonBody = async (
  req: IncomingMessage
): Promise<Result<unknown, ApiError>> =>
  new Promise((resolve) => {
    const chunks: string[] = [];

    req.on("data", (chunk: Buffer | string) => {
      chunks.push(chunkToString(chunk));
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(
          err({
            status: HttpStatus.BadRequest,
            message: ErrorMessage.EmptyBody
          })
        );
        return;
      }

      const raw = chunks.join("");
      const parsed = parseJson(raw);
      if (parsed.type === ResultType.Err) {
        resolve(parsed);
        return;
      }

      resolve(ok(parsed.value));
    });

    req.on("error", (error: Error) => {
      resolve(
        err({
          status: HttpStatus.BadRequest,
          message: error.message
        })
      );
    });
  });

const parseCreateProject = (
  value: unknown
): Result<ProjectCreateInput, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const rootPath = readRequiredString(
    value,
    ProjectField.RootPath,
    ErrorMessage.MissingRootPath
  );
  if (rootPath.type === ResultType.Err) {
    return rootPath;
  }

  const name = readRequiredString(
    value,
    ProjectField.Name,
    ErrorMessage.MissingName
  );
  if (name.type === ResultType.Err) {
    return name;
  }

  return ok({
    name: name.value,
    rootPath: rootPath.value
  });
};

const parseOpenProject = (
  value: unknown
): Result<ProjectOpenInput, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const rootPath = readRequiredString(
    value,
    ProjectField.RootPath,
    ErrorMessage.MissingRootPath
  );
  if (rootPath.type === ResultType.Err) {
    return rootPath;
  }

  const name = readOptionalString(value, ProjectField.Name);

  if (name) {
    return ok({
      name,
      rootPath: rootPath.value
    });
  }

  return ok({
    rootPath: rootPath.value
  });
};

const parseFileTreeRequest = (
  value: unknown
): Result<{ projectId: string; path?: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    FileField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const path = readOptionalString(value, FileField.Path);

  if (path) {
    return ok({
      projectId: projectId.value,
      path
    });
  }

  return ok({
    projectId: projectId.value
  });
};

const parseFileReadRequest = (
  value: unknown
): Result<{ projectId: string; path: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    FileField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const path = readRequiredString(
    value,
    FileField.Path,
    ErrorMessage.MissingPath
  );
  if (path.type === ResultType.Err) {
    return path;
  }

  return ok({
    projectId: projectId.value,
    path: path.value
  });
};

const parseFileWriteRequest = (
  value: unknown
): Result<{ projectId: string; path: string; content: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    FileField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const path = readRequiredString(
    value,
    FileField.Path,
    ErrorMessage.MissingPath
  );
  if (path.type === ResultType.Err) {
    return path;
  }

  const content = readRequiredStringAllowEmpty(
    value,
    FileField.Content,
    ErrorMessage.MissingContent
  );
  if (content.type === ResultType.Err) {
    return content;
  }

  return ok({
    projectId: projectId.value,
    path: path.value,
    content: content.value
  });
};

const parseSessionStartRequest = (
  value: unknown
): Result<{ projectId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    SessionField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  return ok({
    projectId: projectId.value
  });
};

const parseSessionStopRequest = (
  value: unknown
): Result<{ sessionId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const sessionId = readRequiredString(
    value,
    SessionField.SessionId,
    ErrorMessage.MissingSessionId
  );
  if (sessionId.type === ResultType.Err) {
    return sessionId;
  }

  return ok({
    sessionId: sessionId.value
  });
};

const parseHistoryListRequest = (
  value: unknown
): Result<{ status?: HistoryRunStatus; limit?: number }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const statusValue = readOptionalStringField(value, HistoryField.Status);
  if (statusValue.type === ResultType.Err) {
    return statusValue;
  }

  const limitValue = readOptionalNumberField(value, HistoryField.Limit);
  if (limitValue.type === ResultType.Err) {
    return limitValue;
  }

  let status: HistoryRunStatus | undefined;
  if (statusValue.value !== undefined) {
    const parsedStatus = parseHistoryRunStatus(statusValue.value);
    if (parsedStatus.type === ResultType.Err) {
      return parsedStatus;
    }

    status = parsedStatus.value;
  }

  const input: { status?: HistoryRunStatus; limit?: number } = {};

  if (status !== undefined) {
    input.status = status;
  }

  if (limitValue.value !== undefined) {
    input.limit = limitValue.value;
  }

  return ok(input);
};

const parseHistoryEventsRequest = (
  value: unknown
): Result<{ runId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const runId = readRequiredString(value, HistoryField.RunId, ErrorMessage.MissingRunId);
  if (runId.type === ResultType.Err) {
    return runId;
  }

  return ok({
    runId: runId.value
  });
};

const parseLogsQueryRequest = (
  value: unknown
): Result<{ level?: LogLevel; runId?: string; limit?: number }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const levelValue = readOptionalStringField(value, LogsField.Level);
  if (levelValue.type === ResultType.Err) {
    return levelValue;
  }

  const runIdValue = readOptionalStringField(value, LogsField.RunId);
  if (runIdValue.type === ResultType.Err) {
    return runIdValue;
  }

  const limitValue = readOptionalNumberField(value, LogsField.Limit);
  if (limitValue.type === ResultType.Err) {
    return limitValue;
  }

  let level: LogLevel | undefined;
  if (levelValue.value !== undefined) {
    const parsedLevel = parseLogLevel(levelValue.value);
    if (parsedLevel.type === ResultType.Err) {
      return parsedLevel;
    }

    level = parsedLevel.value;
  }

  const input: { level?: LogLevel; runId?: string; limit?: number } = {};

  if (level !== undefined) {
    input.level = level;
  }

  if (runIdValue.value !== undefined) {
    input.runId = runIdValue.value;
  }

  if (limitValue.value !== undefined) {
    input.limit = limitValue.value;
  }

  return ok(input);
};

const parseProvidersListRequest = (
  value: unknown
): Result<{ projectId?: string; profileId?: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectIdValue = readOptionalStringField(value, ProviderField.ProjectId);
  if (projectIdValue.type === ResultType.Err) {
    return projectIdValue;
  }

  const profileIdValue = readOptionalStringField(value, ProviderField.ProfileId);
  if (profileIdValue.type === ResultType.Err) {
    return profileIdValue;
  }

  if (projectIdValue.value !== undefined && profileIdValue.value === undefined) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingProfileId
    });
  }

  if (profileIdValue.value !== undefined && projectIdValue.value === undefined) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingProjectId
    });
  }

  const input: { projectId?: string; profileId?: string } = {};

  if (projectIdValue.value !== undefined) {
    input.projectId = projectIdValue.value;
  }

  if (profileIdValue.value !== undefined) {
    input.profileId = profileIdValue.value;
  }

  return ok(input);
};

const parseProvidersSelectRequest = (
  value: unknown
): Result<{ projectId: string; profileId: string; providerId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    ProviderField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const profileId = readRequiredString(
    value,
    ProviderField.ProfileId,
    ErrorMessage.MissingProfileId
  );
  if (profileId.type === ResultType.Err) {
    return profileId;
  }

  const providerId = readRequiredString(
    value,
    ProviderField.ProviderId,
    ErrorMessage.MissingProviderId
  );
  if (providerId.type === ResultType.Err) {
    return providerId;
  }

  return ok({
    projectId: projectId.value,
    profileId: profileId.value,
    providerId: providerId.value
  });
};

const parseProviderSettingsRequest = (
  value: unknown
): Result<
  { projectId: string; profileId: string; providerId: string; config: Record<string, unknown> },
  ApiError
> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    ProviderField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const profileId = readRequiredString(
    value,
    ProviderField.ProfileId,
    ErrorMessage.MissingProfileId
  );
  if (profileId.type === ResultType.Err) {
    return profileId;
  }

  const providerId = readRequiredString(
    value,
    ProviderField.ProviderId,
    ErrorMessage.MissingProviderId
  );
  if (providerId.type === ResultType.Err) {
    return providerId;
  }

  const config = readRequiredRecord(
    value,
    ProviderField.Config,
    ErrorMessage.MissingProviderConfig
  );
  if (config.type === ResultType.Err) {
    return config;
  }

  return ok({
    projectId: projectId.value,
    profileId: profileId.value,
    providerId: providerId.value,
    config: config.value
  });
};

const getSessionById = (
  store: SessionStore,
  id: string
): Result<Session, ApiError> => {
  const result = store.getById(id);
  if (result.type === ResultType.Err) {
    return err(mapSessionStoreError(result.error));
  }

  return ok(result.value);
};

const mapSessionStoreError = (error: SessionStoreError): ApiError => {
  if (error.code === SessionStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: error.message
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: error.message
  };
};

const mapHistoryStoreError = (error: HistoryStoreError): ApiError => {
  if (error.code === HistoryStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: error.message
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: error.message
  };
};

const mapLogsStoreError = (error: LogsStoreError): ApiError => {
  if (error.code === LogsStoreErrorCode.InvalidInput) {
    return {
      status: HttpStatus.BadRequest,
      message: error.message
    };
  }

  return {
    status: HttpStatus.InternalServerError,
    message: error.message
  };
};

const mapProviderStoreError = (error: ProviderStoreError): ApiError => {
  if (error.code === ProviderStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: error.message
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: error.message
  };
};

const getProjectById = (
  store: ProjectStore,
  id: string
): Result<Project, ApiError> => {
  const result = store.getById(id);
  if (result.type === ResultType.Err) {
    return err(mapProjectStoreError(result.error));
  }

  return ok(result.value);
};

const mapProjectStoreError = (error: {
  code: ProjectStoreErrorCode;
  message: string;
}): ApiError => {
  if (error.code === ProjectStoreErrorCode.Conflict) {
    return {
      status: HttpStatus.Conflict,
      message: error.message
    };
  }

  if (error.code === ProjectStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: error.message
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: error.message
  };
};

const isAuthorized = (req: IncomingMessage, authToken: string): boolean => {
  const header = req.headers[HeaderName.Authorization];
  const value = typeof header === "string" ? header : undefined;

  if (!value) {
    return false;
  }

  const token = extractBearerToken(value);
  if (!token) {
    return false;
  }

  return token === authToken;
};

const extractBearerToken = (header: string): string | undefined => {
  if (!header.startsWith(BearerPrefix)) {
    return undefined;
  }

  const token = header.slice(BearerPrefix.length).trim();
  return token.length > 0 ? token : undefined;
};

const respondUnauthorized = (res: ServerResponse): void => {
  res.setHeader(HeaderName.WwwAuthenticate, BearerScheme);
  respondError(res, {
    status: HttpStatus.Unauthorized,
    message: ErrorMessage.Unauthorized
  });
};

const respondMethodNotAllowed = (res: ServerResponse): void => {
  respondError(res, {
    status: HttpStatus.MethodNotAllowed,
    message: ErrorMessage.MethodNotAllowed
  });
};

const respondError = (res: ServerResponse, error: ApiError): void => {
  respondJson(res, error.status, {
    error: {
      message: error.message
    }
  });
};

const respondJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);

  res.statusCode = status;
  res.setHeader(HeaderName.ContentType, MimeType.Json);
  res.end(payload);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRequiredString = (
  record: Record<string, unknown>,
  key: string,
  missingMessage: string
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage
    });
  }

  return ok(trimmed);
};

const readRequiredStringAllowEmpty = (
  record: Record<string, unknown>,
  key: string,
  missingMessage: string
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage
    });
  }

  return ok(value);
};

const readRequiredRecord = (
  record: Record<string, unknown>,
  key: string,
  missingMessage: string
): Result<Record<string, unknown>, ApiError> => {
  if (!(key in record)) {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage
    });
  }

  const value = record[key];
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  return ok(value);
};

const readOptionalString = (
  record: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readOptionalStringField = (
  record: Record<string, unknown>,
  key: string
): Result<string | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const trimmed = value.trim();
  return ok(trimmed.length > 0 ? trimmed : undefined);
};

const readOptionalNumberField = (
  record: Record<string, unknown>,
  key: string
): Result<number | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  return ok(value);
};

const parseHistoryRunStatus = (
  value: string
): Result<HistoryRunStatus, ApiError> => {
  if (isHistoryRunStatus(value)) {
    return ok(value);
  }

  return err({
    status: HttpStatus.BadRequest,
    message: ErrorMessage.InvalidBody
  });
};

const parseLogLevel = (value: string): Result<LogLevel, ApiError> => {
  if (isLogLevel(value)) {
    return ok(value);
  }

  return err({
    status: HttpStatus.BadRequest,
    message: ErrorMessage.InvalidBody
  });
};

const isHistoryRunStatus = (value: string): value is HistoryRunStatus =>
  value === HistoryRunStatus.Pending ||
  value === HistoryRunStatus.Running ||
  value === HistoryRunStatus.Completed ||
  value === HistoryRunStatus.Failed ||
  value === HistoryRunStatus.Canceled;

const isLogLevel = (value: string): value is LogLevel =>
  value === LogLevel.Trace ||
  value === LogLevel.Debug ||
  value === LogLevel.Info ||
  value === LogLevel.Warn ||
  value === LogLevel.Error ||
  value === LogLevel.Fatal;

const parseJson = (raw: string): Result<unknown, ApiError> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return ok(parsed);
  } catch {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidJson
    });
  }
};

const chunkToString = (chunk: Buffer | string): string =>
  typeof chunk === "string" ? chunk : chunk.toString(TextEncoding);
