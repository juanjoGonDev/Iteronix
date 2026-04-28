import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import {
  AiField,
  BearerPrefix,
  BearerScheme,
  ErrorMessage,
  FileField,
  FileSearchField,
  FileMoveField,
  HeaderName,
  HttpMethod,
  HttpStatus,
  KanbanBoardField,
  KanbanColumnField,
  KanbanTaskField,
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
  createDirectory,
  deleteFile,
  listFileTree,
  moveFile,
  readFileContent,
  searchFiles,
  writeFileContent
} from "./files";
import {
  executeGitBranchCheckout,
  executeGitBranchCreate,
  executeGitBranchList,
  executeGitBranchPublish,
  executeGitBranchPush,
  GitPathOperationKind,
  executeGitPathOperation,
  executeGitCommit,
  executeGitDiff,
  executeGitStatus,
  parseGitBranchMutationRequest,
  parseGitPathRequest,
  parseGitCommitRequest,
  parseGitDiffRequest,
  parseGitStatusRequest
} from "./git";
import {
  createDefaultQualityGateCatalog,
  createQualityGateEventHub,
  listQualityGateEvents,
  listQualityGateRuns,
  parseQualityGateEventsRequest,
  parseQualityGateListRequest,
  parseQualityGateRunRequest,
  parseQualityGateStreamRequest,
  QualityGateEventName,
  startQualityGateRun,
  type QualityGateCatalog,
  type QualityGateEventHub
} from "./quality-gates";
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
import { LogLevel as LogLevelValues, type LogLevel } from "./logs";
import {
  LogsStoreErrorCode as DomainLogsStoreErrorCode,
  type LogsStoreError as DomainLogsStoreError
} from "../../../packages/domain/src/ports/logs-store";
import {
  createServerLogsStore,
  type ServerLogEntry,
  type ServerLogsStore
} from "./server-logs-store";
import {
  createProviderStore,
  ProviderStoreErrorCode,
  type ProviderSelection,
  type ProviderStoreError,
  type ProviderStore
} from "./providers";
import {
  createCommandPolicy,
  createWorkspacePolicy,
  type CommandPolicy,
  type WorkspacePolicy
} from "./sandbox";
import {
  createKanbanStore,
  KanbanStoreErrorCode,
  type KanbanStoreError,
  type KanbanStore
} from "./kanban";
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
import {
  createAiWorkbenchService,
  type AiWorkbenchService
} from "./ai-workbench";
import {
  createCommandRunnerAdapter,
  type CommandRunner
} from "../../../packages/adapters/src/command-runner/command-runner";
import {
  createGitCliAdapter,
  type GitRepository
} from "../../../packages/adapters/src/git/git-adapter";

export const startServer = async (): Promise<void> => {
  const config = loadConfig(process.env);
  const logsStore = await createServerLogsStore(config.logDir);
  installServerConsoleForwarder(logsStore);

  const projectStore = createProjectStore();
  const sessionStore = createSessionStore();
  const sessionEvents = createSessionEventHub();
  const historyStore = createHistoryStore();
  const qualityGateEventHub = createQualityGateEventHub();
  const providerStore = createProviderStore();
  const kanbanStore = createKanbanStore();
  const workspacePolicy = createWorkspacePolicy(config.workspaceRoots);
  const commandPolicy = createCommandPolicy(
    config.commandAllowlist,
    workspacePolicy
  );
  const aiWorkbench = await createAiWorkbenchService({
    workspaceRoot: config.workspaceRoots[0] ?? process.cwd()
  });
  const commandRunner = createCommandRunnerAdapter();
  const qualityGateCatalog = createDefaultQualityGateCatalog();
  const git = createGitCliAdapter();
  const server = createServer((req, res) => {
    void handleRequest(
      req,
      res,
      config,
      projectStore,
      sessionStore,
      sessionEvents,
      historyStore,
      qualityGateEventHub,
      logsStore,
      providerStore,
      kanbanStore,
      workspacePolicy,
      commandPolicy,
      commandRunner,
      qualityGateCatalog,
      aiWorkbench,
      git
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
  qualityGateEventHub: QualityGateEventHub,
  logsStore: ServerLogsStore,
  providerStore: ProviderStore,
  kanbanStore: KanbanStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  commandRunner: CommandRunner,
  qualityGateCatalog: QualityGateCatalog,
  aiWorkbench: AiWorkbenchService,
  git: GitRepository
): Promise<void> => {
  if (!req.url || !req.method) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingUrl
    });
    return;
  }

  if (handleCorsPreflight(req, res)) {
    return;
  }

  applyCorsHeaders(req, res);

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

    await handleCreateProject(req, res, projectStore, workspacePolicy);
    return;
  }

  if (path === RoutePath.ProjectsOpen) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleOpenProject(req, res, projectStore, workspacePolicy);
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

  if (path === RoutePath.FilesSearch) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileSearch(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileDelete(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileCreate(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesMove) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileMove(req, res, projectStore);
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

  if (path === RoutePath.FilesDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileDelete(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileCreate(req, res, projectStore);
    return;
  }

  if (path === RoutePath.FilesMove) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileMove(req, res, projectStore);
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

  if (path === RoutePath.LogsAppend) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleLogsAppend(req, res, logsStore);
    return;
  }

  if (path === RoutePath.LogsReset) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleLogsReset(res, logsStore);
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

  if (path === RoutePath.GitStatus) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitStatusRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git
    );
    return;
  }

  if (path === RoutePath.GitDiff) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitDiffRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git
    );
    return;
  }

  if (path === RoutePath.GitStage) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitPathOperationRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git,
      GitPathOperationKind.Stage
    );
    return;
  }

  if (path === RoutePath.GitUnstage) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitPathOperationRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git,
      GitPathOperationKind.Unstage
    );
    return;
  }

  if (path === RoutePath.GitRevert) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitPathOperationRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git,
      GitPathOperationKind.Revert
    );
    return;
  }

  if (path === RoutePath.GitCommit) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitCommitRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git
    );
    return;
  }

  if (path === RoutePath.GitBranchesList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitBranchListRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git
    );
    return;
  }

  if (path === RoutePath.GitBranchesCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitBranchMutationRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git,
      "create"
    );
    return;
  }

  if (path === RoutePath.GitBranchesCheckout) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitBranchMutationRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git,
      "checkout"
    );
    return;
  }

  if (path === RoutePath.GitBranchesPush) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitBranchRemoteRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git,
      "push"
    );
    return;
  }

  if (path === RoutePath.GitBranchesPublish) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleGitBranchRemoteRequest(
      req,
      res,
      projectStore,
      workspacePolicy,
      commandPolicy,
      git,
      "publish"
    );
    return;
  }

  if (path === RoutePath.QualityGatesRun) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleQualityGateRunRequest(
      req,
      res,
      projectStore,
      historyStore,
      workspacePolicy,
      commandPolicy,
      commandRunner,
      qualityGateEventHub,
      qualityGateCatalog
    );
    return;
  }

  if (path === RoutePath.QualityGatesList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleQualityGateListRequest(req, res, historyStore);
    return;
  }

  if (path === RoutePath.QualityGatesEvents) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleQualityGateEventsRequest(req, res, historyStore);
    return;
  }

  if (path === RoutePath.QualityGatesStream) {
    if (method !== HttpMethod.Get) {
      respondMethodNotAllowed(res);
      return;
    }

    handleQualityGateStreamRequest(req, res, url, historyStore, qualityGateEventHub);
    return;
  }

  if (path === RoutePath.KanbanBoardsCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanBoardCreate(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanBoardsList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanBoardList(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanBoardsUpdate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanBoardUpdate(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanBoardsDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanBoardDelete(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanColumnsCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanColumnCreate(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanColumnsList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanColumnList(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanColumnsUpdate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanColumnUpdate(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanColumnsDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanColumnDelete(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanTasksCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanTaskCreate(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanTasksList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanTaskList(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanTasksUpdate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanTaskUpdate(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.KanbanTasksDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleKanbanTaskDelete(req, res, projectStore, kanbanStore);
    return;
  }

  if (path === RoutePath.AiSkillsRun) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleAiSkillRun(req, res, aiWorkbench);
    return;
  }

  if (path === RoutePath.AiWorkflowsRun) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleAiWorkflowRun(req, res, aiWorkbench);
    return;
  }

  if (path === RoutePath.AiEvalsRun) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleAiEvalRun(req, res, aiWorkbench);
    return;
  }

  if (path === RoutePath.AiMemoryQuery) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleAiMemoryQuery(req, res, aiWorkbench);
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
  store: ProjectStore,
  workspacePolicy: WorkspacePolicy
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

  const rootResult = workspacePolicy.assertPathAllowed(parsed.value.rootPath);
  if (rootResult.type === ResultType.Err) {
    respondError(res, rootResult.error);
    return;
  }

  const created = store.create({
    ...parsed.value,
    rootPath: rootResult.value
  });
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
  store: ProjectStore,
  workspacePolicy: WorkspacePolicy
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

  const rootResult = workspacePolicy.assertPathAllowed(parsed.value.rootPath);
  if (rootResult.type === ResultType.Err) {
    respondError(res, rootResult.error);
    return;
  }

  const openInput =
    parsed.value.name !== undefined
      ? { name: parsed.value.name, rootPath: rootResult.value }
      : { rootPath: rootResult.value };

  const opened = store.open(openInput);
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

const handleFileSearch = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileSearchRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const searchResult = await searchFiles(projectResult.value.rootPath, {
    query: parsed.value.query,
    isRegex: parsed.value.isRegex,
    matchCase: parsed.value.matchCase,
    wholeWord: parsed.value.wholeWord
  });
  if (searchResult.type === ResultType.Err) {
    respondError(res, searchResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    results: searchResult.value
  });
};

const handleFileDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileDeleteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const deleteResult = await deleteFile(
    projectResult.value.rootPath,
    parsed.value.path
  );
  if (deleteResult.type === ResultType.Err) {
    respondError(res, deleteResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    success: deleteResult.value.success
  });
};

const handleFileCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileCreateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const createResult = await createDirectory(
    projectResult.value.rootPath,
    dirname(parsed.value.path)
  );
  if (createResult.type === ResultType.Err) {
    respondError(res, createResult.error);
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

  respondJson(res, HttpStatus.Created, {
    path: parsed.value.path,
    bytesWritten: writeResult.value.bytesWritten
  });
};

const handleFileMove = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileMoveRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const moveResult = await moveFile(
    projectResult.value.rootPath,
    parsed.value.sourcePath,
    parsed.value.targetPath
  );
  if (moveResult.type === ResultType.Err) {
    respondError(res, moveResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    success: moveResult.value.success
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
  logsStore: ServerLogsStore
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
    respondError(res, mapDomainLogsStoreError(logs.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    logs: logs.value
  });
};

const handleLogsAppend = async (
  req: IncomingMessage,
  res: ServerResponse,
  logsStore: ServerLogsStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseLogsAppendRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await logsStore.append(parsed.value);
  if (result.type === ResultType.Err) {
    respondError(res, mapDomainLogsStoreError(result.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    success: true
  });
};

const handleLogsReset = async (
  res: ServerResponse,
  logsStore: ServerLogsStore
): Promise<void> => {
  await logsStore.reset();

  respondJson(res, HttpStatus.Ok, {
    success: true
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

const handleKanbanBoardCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanBoardCreateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const created = kanbanStore.createBoard(parsed.value);
  if (created.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(created.error));
    return;
  }

  respondJson(res, HttpStatus.Created, {
    board: created.value
  });
};

const handleKanbanBoardList = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanBoardListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const listed = kanbanStore.listBoards(parsed.value);
  if (listed.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(listed.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    boards: listed.value
  });
};

const handleKanbanBoardUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanBoardUpdateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const updated = kanbanStore.updateBoard(parsed.value);
  if (updated.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(updated.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    board: updated.value
  });
};

const handleKanbanBoardDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanBoardDeleteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const deleted = kanbanStore.deleteBoard(parsed.value);
  if (deleted.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(deleted.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    board: deleted.value
  });
};

const handleKanbanColumnCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanColumnCreateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const created = kanbanStore.createColumn(parsed.value);
  if (created.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(created.error));
    return;
  }

  respondJson(res, HttpStatus.Created, {
    column: created.value
  });
};

const handleKanbanColumnList = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanColumnListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const listed = kanbanStore.listColumns(parsed.value);
  if (listed.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(listed.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    columns: listed.value
  });
};

const handleKanbanColumnUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanColumnUpdateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const updated = kanbanStore.updateColumn(parsed.value);
  if (updated.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(updated.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    column: updated.value
  });
};

const handleKanbanColumnDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanColumnDeleteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const deleted = kanbanStore.deleteColumn(parsed.value);
  if (deleted.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(deleted.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    column: deleted.value
  });
};

const handleKanbanTaskCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanTaskCreateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const created = kanbanStore.createTask(parsed.value);
  if (created.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(created.error));
    return;
  }

  respondJson(res, HttpStatus.Created, {
    task: created.value
  });
};

const handleKanbanTaskList = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanTaskListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const listed = kanbanStore.listTasks(parsed.value);
  if (listed.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(listed.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    tasks: listed.value
  });
};

const handleKanbanTaskUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanTaskUpdateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const updated = kanbanStore.updateTask(parsed.value);
  if (updated.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(updated.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    task: updated.value
  });
};

const handleKanbanTaskDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  kanbanStore: KanbanStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseKanbanTaskDeleteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(projectStore, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const deleted = kanbanStore.deleteTask(parsed.value);
  if (deleted.type === ResultType.Err) {
    respondError(res, mapKanbanStoreError(deleted.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    task: deleted.value
  });
};

type ApiError = {
  status: number;
  message: string;
};

const readJsonBody = (
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

const parseFileDeleteRequest = (
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

const parseFileCreateRequest = (
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

const parseFileMoveRequest = (
  value: unknown
): Result<{ projectId: string; sourcePath: string; targetPath: string }, ApiError> => {
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

  const sourcePath = readRequiredString(
    value,
    FileMoveField.SourcePath,
    ErrorMessage.MissingSourcePath
  );
  if (sourcePath.type === ResultType.Err) {
    return sourcePath;
  }

  const targetPath = readRequiredString(
    value,
    FileMoveField.TargetPath,
    ErrorMessage.MissingTargetPath
  );
  if (targetPath.type === ResultType.Err) {
    return targetPath;
  }

  return ok({
    projectId: projectId.value,
    sourcePath: sourcePath.value,
    targetPath: targetPath.value
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

  const name = readRequiredString(value, ProjectField.Name, ErrorMessage.MissingName);
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

const parseFileSearchRequest = (
  value: unknown
): Result<
  {
    projectId: string;
    query: string;
    isRegex: boolean;
    matchCase: boolean;
    wholeWord: boolean;
  },
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
    FileSearchField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const query = readRequiredString(
    value,
    FileSearchField.Query,
    ErrorMessage.MissingQuery
  );
  if (query.type === ResultType.Err) {
    return query;
  }

  const isRegex = readOptionalBooleanField(value, FileSearchField.IsRegex);
  if (isRegex.type === ResultType.Err) {
    return isRegex;
  }

  const matchCase = readOptionalBooleanField(value, FileSearchField.MatchCase);
  if (matchCase.type === ResultType.Err) {
    return matchCase;
  }

  const wholeWord = readOptionalBooleanField(value, FileSearchField.WholeWord);
  if (wholeWord.type === ResultType.Err) {
    return wholeWord;
  }

  return ok({
    projectId: projectId.value,
    query: query.value,
    isRegex: isRegex.value ?? false,
    matchCase: matchCase.value ?? false,
    wholeWord: wholeWord.value ?? false
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

const LogsAppendField = {
  Id: "id",
  Timestamp: "timestamp",
  Level: "level",
  Message: "message",
  RunId: "runId"
} as const;

const parseLogsAppendRequest = (value: unknown): Result<ServerLogEntry, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const id = readRequiredString(value, LogsAppendField.Id, ErrorMessage.InvalidBody);
  if (id.type === ResultType.Err) {
    return id;
  }

  const timestamp = readRequiredString(value, LogsAppendField.Timestamp, ErrorMessage.InvalidBody);
  if (timestamp.type === ResultType.Err) {
    return timestamp;
  }

  const levelValue = readRequiredString(value, LogsAppendField.Level, ErrorMessage.InvalidBody);
  if (levelValue.type === ResultType.Err) {
    return levelValue;
  }

  const parsedLevel = parseLogLevel(levelValue.value);
  if (parsedLevel.type === ResultType.Err) {
    return parsedLevel;
  }

  const message = readRequiredString(value, LogsAppendField.Message, ErrorMessage.InvalidBody);
  if (message.type === ResultType.Err) {
    return message;
  }

  const runId = readOptionalString(value, LogsAppendField.RunId);

  const entry: ServerLogEntry = {
    id: id.value,
    timestamp: timestamp.value,
    level: parsedLevel.value,
    message: message.value
  };

  if (runId) {
    entry.runId = runId;
  }

  return ok(entry);
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

const parseKanbanBoardCreateRequest = (
  value: unknown
): Result<{ projectId: string; name: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    KanbanBoardField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const name = readRequiredString(
    value,
    KanbanBoardField.Name,
    ErrorMessage.MissingBoardName
  );
  if (name.type === ResultType.Err) {
    return name;
  }

  return ok({
    projectId: projectId.value,
    name: name.value
  });
};

const parseKanbanBoardListRequest = (
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
    KanbanBoardField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  return ok({
    projectId: projectId.value
  });
};

const parseKanbanBoardUpdateRequest = (
  value: unknown
): Result<{ projectId: string; boardId: string; name: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    KanbanBoardField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanBoardField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const name = readRequiredString(
    value,
    KanbanBoardField.Name,
    ErrorMessage.MissingBoardName
  );
  if (name.type === ResultType.Err) {
    return name;
  }

  return ok({
    projectId: projectId.value,
    boardId: boardId.value,
    name: name.value
  });
};

const parseKanbanBoardDeleteRequest = (
  value: unknown
): Result<{ projectId: string; boardId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    KanbanBoardField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanBoardField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  return ok({
    projectId: projectId.value,
    boardId: boardId.value
  });
};

const parseKanbanColumnCreateRequest = (
  value: unknown
): Result<
  { projectId: string; boardId: string; name: string; position?: number },
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
    KanbanColumnField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanColumnField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const name = readRequiredString(
    value,
    KanbanColumnField.Name,
    ErrorMessage.MissingColumnName
  );
  if (name.type === ResultType.Err) {
    return name;
  }

  const position = readOptionalNumberField(value, KanbanColumnField.Position);
  if (position.type === ResultType.Err) {
    return position;
  }

  const input: {
    projectId: string;
    boardId: string;
    name: string;
    position?: number;
  } = {
    projectId: projectId.value,
    boardId: boardId.value,
    name: name.value
  };

  if (position.value !== undefined) {
    input.position = position.value;
  }

  return ok(input);
};

const parseKanbanColumnListRequest = (
  value: unknown
): Result<{ projectId: string; boardId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    KanbanColumnField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanColumnField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  return ok({
    projectId: projectId.value,
    boardId: boardId.value
  });
};

const parseKanbanColumnUpdateRequest = (
  value: unknown
): Result<
  { projectId: string; boardId: string; columnId: string; name?: string; position?: number },
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
    KanbanColumnField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanColumnField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const columnId = readRequiredString(
    value,
    KanbanColumnField.ColumnId,
    ErrorMessage.MissingColumnId
  );
  if (columnId.type === ResultType.Err) {
    return columnId;
  }

  const name = readOptionalStringField(value, KanbanColumnField.Name);
  if (name.type === ResultType.Err) {
    return name;
  }

  const position = readOptionalNumberField(value, KanbanColumnField.Position);
  if (position.type === ResultType.Err) {
    return position;
  }

  const input: {
    projectId: string;
    boardId: string;
    columnId: string;
    name?: string;
    position?: number;
  } = {
    projectId: projectId.value,
    boardId: boardId.value,
    columnId: columnId.value
  };

  if (name.value !== undefined) {
    input.name = name.value;
  }

  if (position.value !== undefined) {
    input.position = position.value;
  }

  if (input.name === undefined && input.position === undefined) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  return ok(input);
};

const parseKanbanColumnDeleteRequest = (
  value: unknown
): Result<{ projectId: string; boardId: string; columnId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    KanbanColumnField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanColumnField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const columnId = readRequiredString(
    value,
    KanbanColumnField.ColumnId,
    ErrorMessage.MissingColumnId
  );
  if (columnId.type === ResultType.Err) {
    return columnId;
  }

  return ok({
    projectId: projectId.value,
    boardId: boardId.value,
    columnId: columnId.value
  });
};

const parseKanbanTaskCreateRequest = (
  value: unknown
): Result<
  {
    projectId: string;
    boardId: string;
    columnId: string;
    title: string;
    description?: string;
    position?: number;
  },
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
    KanbanTaskField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanTaskField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const columnId = readRequiredString(
    value,
    KanbanTaskField.ColumnId,
    ErrorMessage.MissingColumnId
  );
  if (columnId.type === ResultType.Err) {
    return columnId;
  }

  const title = readRequiredString(
    value,
    KanbanTaskField.Title,
    ErrorMessage.MissingTaskTitle
  );
  if (title.type === ResultType.Err) {
    return title;
  }

  const description = readOptionalStringField(
    value,
    KanbanTaskField.Description
  );
  if (description.type === ResultType.Err) {
    return description;
  }

  const position = readOptionalNumberField(value, KanbanTaskField.Position);
  if (position.type === ResultType.Err) {
    return position;
  }

  const input: {
    projectId: string;
    boardId: string;
    columnId: string;
    title: string;
    description?: string;
    position?: number;
  } = {
    projectId: projectId.value,
    boardId: boardId.value,
    columnId: columnId.value,
    title: title.value
  };

  if (description.value !== undefined) {
    input.description = description.value;
  }

  if (position.value !== undefined) {
    input.position = position.value;
  }

  return ok(input);
};

const parseKanbanTaskListRequest = (
  value: unknown
): Result<
  { projectId: string; boardId: string; columnId?: string },
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
    KanbanTaskField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanTaskField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const columnId = readOptionalStringField(value, KanbanTaskField.ColumnId);
  if (columnId.type === ResultType.Err) {
    return columnId;
  }

  const input: { projectId: string; boardId: string; columnId?: string } = {
    projectId: projectId.value,
    boardId: boardId.value
  };

  if (columnId.value !== undefined) {
    input.columnId = columnId.value;
  }

  return ok(input);
};

const parseKanbanTaskUpdateRequest = (
  value: unknown
): Result<
  {
    projectId: string;
    boardId: string;
    taskId: string;
    columnId?: string;
    title?: string;
    description?: string;
    position?: number;
  },
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
    KanbanTaskField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanTaskField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const taskId = readRequiredString(
    value,
    KanbanTaskField.TaskId,
    ErrorMessage.MissingTaskId
  );
  if (taskId.type === ResultType.Err) {
    return taskId;
  }

  const title = readOptionalStringField(value, KanbanTaskField.Title);
  if (title.type === ResultType.Err) {
    return title;
  }

  const description = readOptionalStringField(
    value,
    KanbanTaskField.Description
  );
  if (description.type === ResultType.Err) {
    return description;
  }

  const columnId = readOptionalStringField(value, KanbanTaskField.ColumnId);
  if (columnId.type === ResultType.Err) {
    return columnId;
  }

  const position = readOptionalNumberField(value, KanbanTaskField.Position);
  if (position.type === ResultType.Err) {
    return position;
  }

  const input: {
    projectId: string;
    boardId: string;
    taskId: string;
    columnId?: string;
    title?: string;
    description?: string;
    position?: number;
  } = {
    projectId: projectId.value,
    boardId: boardId.value,
    taskId: taskId.value
  };

  if (title.value !== undefined) {
    input.title = title.value;
  }

  if (description.value !== undefined) {
    input.description = description.value;
  }

  if (columnId.value !== undefined) {
    input.columnId = columnId.value;
  }

  if (position.value !== undefined) {
    input.position = position.value;
  }

  if (
    input.title === undefined &&
    input.description === undefined &&
    input.columnId === undefined &&
    input.position === undefined
  ) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  return ok(input);
};

const parseKanbanTaskDeleteRequest = (
  value: unknown
): Result<{ projectId: string; boardId: string; taskId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    KanbanTaskField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const boardId = readRequiredString(
    value,
    KanbanTaskField.BoardId,
    ErrorMessage.MissingBoardId
  );
  if (boardId.type === ResultType.Err) {
    return boardId;
  }

  const taskId = readRequiredString(
    value,
    KanbanTaskField.TaskId,
    ErrorMessage.MissingTaskId
  );
  if (taskId.type === ResultType.Err) {
    return taskId;
  }

  return ok({
    projectId: projectId.value,
    boardId: boardId.value,
    taskId: taskId.value
  });
};

const handleGitStatusRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  git: GitRepository
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseGitStatusRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeGitStatus(parsed.value, {
    projectStore,
    workspacePolicy,
    commandPolicy,
    git
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    repository: result.value
  });
};

const handleGitDiffRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  git: GitRepository
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseGitDiffRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeGitDiff(parsed.value, {
    projectStore,
    workspacePolicy,
    commandPolicy,
    git
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    diff: result.value.diff,
    staged: result.value.staged
  });
};

const handleGitCommitRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  git: GitRepository
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseGitCommitRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeGitCommit(parsed.value, {
    projectStore,
    workspacePolicy,
    commandPolicy,
    git
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Created, {
    commit: result.value
  });
};

const handleGitBranchListRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  git: GitRepository
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseGitStatusRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeGitBranchList(parsed.value, {
    projectStore,
    workspacePolicy,
    commandPolicy,
    git
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    branches: result.value
  });
};

const handleGitBranchMutationRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  git: GitRepository,
  operation: "create" | "checkout"
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseGitBranchMutationRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = operation === "create"
    ? await executeGitBranchCreate(parsed.value, {
        projectStore,
        workspacePolicy,
        commandPolicy,
        git
      })
    : await executeGitBranchCheckout(parsed.value, {
        projectStore,
        workspacePolicy,
        commandPolicy,
        git
      });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, operation === "create" ? HttpStatus.Created : HttpStatus.Ok, {
    branch: result.value
  });
};

const handleGitBranchRemoteRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  git: GitRepository,
  operation: "push" | "publish"
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseGitStatusRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = operation === "push"
    ? await executeGitBranchPush(parsed.value, {
        projectStore,
        workspacePolicy,
        commandPolicy,
        git
      })
    : await executeGitBranchPublish(parsed.value, {
        projectStore,
        workspacePolicy,
        commandPolicy,
        git
      });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, operation === "publish" ? HttpStatus.Created : HttpStatus.Ok, {
    branch: result.value
  });
};

const handleGitPathOperationRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  git: GitRepository,
  operation: GitPathOperationKind
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseGitPathRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeGitPathOperation(parsed.value, operation, {
    projectStore,
    workspacePolicy,
    commandPolicy,
    git
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    paths: result.value.paths
  });
};

const handleQualityGateRunRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  projectStore: ProjectStore,
  historyStore: HistoryStore,
  workspacePolicy: WorkspacePolicy,
  commandPolicy: CommandPolicy,
  commandRunner: CommandRunner,
  eventHub: QualityGateEventHub,
  catalog: QualityGateCatalog
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseQualityGateRunRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await startQualityGateRun(parsed.value, {
    projectStore,
    historyStore,
    workspacePolicy,
    commandPolicy,
    commandRunner,
    eventHub,
    catalog
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Created, {
    run: result.value
  });
};

const handleQualityGateListRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  historyStore: HistoryStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseQualityGateListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = listQualityGateRuns(parsed.value, {
    historyStore
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    runs: result.value
  });
};

const handleQualityGateEventsRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  historyStore: HistoryStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseQualityGateEventsRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = listQualityGateEvents(parsed.value, {
    historyStore
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    events: result.value
  });
};

const handleQualityGateStreamRequest = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  historyStore: HistoryStore,
  eventHub: QualityGateEventHub
): void => {
  const parsed = parseQualityGateStreamRequest(url.searchParams);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const existing = listQualityGateEvents(parsed.value, {
    historyStore
  });
  if (existing.type === ResultType.Err) {
    respondError(res, existing.error);
    return;
  }

  const stream = createSseStream(res);
  for (const event of existing.value) {
    stream.send({
      event: QualityGateEventName.Progress,
      id: event.id,
      data: event
    });
  }

  const unsubscribe = eventHub.subscribe(parsed.value.runId, (event) => {
    stream.send({
      event: QualityGateEventName.Progress,
      id: event.id,
      data: event
    });
  });

  req.on("close", () => {
    unsubscribe();
    stream.close();
  });
};

const handleAiSkillRun = async (
  req: IncomingMessage,
  res: ServerResponse,
  aiWorkbench: AiWorkbenchService
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseAiSkillRunRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  try {
    const result = await aiWorkbench.runSkill(parsed.value);
    respondJson(res, HttpStatus.Ok, result);
  } catch (error) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: error instanceof Error ? error.message : ErrorMessage.InternalServerError
    });
  }
};

const handleAiWorkflowRun = async (
  req: IncomingMessage,
  res: ServerResponse,
  aiWorkbench: AiWorkbenchService
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseAiWorkflowRunRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  try {
    const result = await aiWorkbench.runWorkflow(parsed.value);
    respondJson(res, HttpStatus.Ok, result);
  } catch (error) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: error instanceof Error ? error.message : ErrorMessage.InternalServerError
    });
  }
};

const handleAiEvalRun = async (
  req: IncomingMessage,
  res: ServerResponse,
  aiWorkbench: AiWorkbenchService
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseAiEvalRunRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  try {
    const result = await aiWorkbench.runEvaluation(parsed.value);
    respondJson(res, HttpStatus.Ok, result);
  } catch (error) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: error instanceof Error ? error.message : ErrorMessage.InternalServerError
    });
  }
};

const handleAiMemoryQuery = async (
  req: IncomingMessage,
  res: ServerResponse,
  aiWorkbench: AiWorkbenchService
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseAiMemoryQueryRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  try {
    const result = await aiWorkbench.searchMemory(parsed.value);
    respondJson(res, HttpStatus.Ok, {
      items: result
    });
  } catch (error) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: error instanceof Error ? error.message : ErrorMessage.InternalServerError
    });
  }
};

const parseAiSkillRunRequest = (
  value: unknown
): Result<{ skillName: string; sessionId: string; input: unknown }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const skillName = readRequiredString(
    value,
    AiField.SkillName,
    ErrorMessage.MissingSkillName
  );
  if (skillName.type === ResultType.Err) {
    return skillName;
  }

  const sessionId = readRequiredString(
    value,
    SessionField.SessionId,
    ErrorMessage.MissingSessionId
  );
  if (sessionId.type === ResultType.Err) {
    return sessionId;
  }

  if (!(AiField.Input in value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingInput
    });
  }

  return ok({
    skillName: skillName.value,
    sessionId: sessionId.value,
    input: value[AiField.Input]
  });
};

const parseAiWorkflowRunRequest = (
  value: unknown
): Result<
  {
    skillName: string;
    sessionId: string;
    question: string;
    autoApprove: boolean;
  },
  ApiError
> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const skillName = readRequiredString(
    value,
    AiField.SkillName,
    ErrorMessage.MissingSkillName
  );
  if (skillName.type === ResultType.Err) {
    return skillName;
  }

  const sessionId = readRequiredString(
    value,
    SessionField.SessionId,
    ErrorMessage.MissingSessionId
  );
  if (sessionId.type === ResultType.Err) {
    return sessionId;
  }

  const question = readRequiredString(
    value,
    AiField.Question,
    ErrorMessage.MissingQuestion
  );
  if (question.type === ResultType.Err) {
    return question;
  }

  const autoApprove = readOptionalBooleanField(value, AiField.AutoApprove);
  if (autoApprove.type === ResultType.Err) {
    return autoApprove;
  }

  return ok({
    skillName: skillName.value,
    sessionId: sessionId.value,
    question: question.value,
    autoApprove: autoApprove.value ?? true
  });
};

const parseAiEvalRunRequest = (
  value: unknown
): Result<{ datasetPath: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const datasetPath = readRequiredString(
    value,
    AiField.DatasetPath,
    ErrorMessage.MissingDatasetPath
  );
  if (datasetPath.type === ResultType.Err) {
    return datasetPath;
  }

  return ok({
    datasetPath: datasetPath.value
  });
};

const parseAiMemoryQueryRequest = (
  value: unknown
): Result<
  {
    sessionId: string;
    query: string;
    limit: number;
  },
  ApiError
> => {
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

  const query = readRequiredString(
    value,
    AiField.Query,
    ErrorMessage.MissingQuestion
  );
  if (query.type === ResultType.Err) {
    return query;
  }

  const limit = readOptionalNumberField(value, AiField.Limit);
  if (limit.type === ResultType.Err) {
    return limit;
  }

  return ok({
    sessionId: sessionId.value,
    query: query.value,
    limit: limit.value ?? 10
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

const mapDomainLogsStoreError = (error: DomainLogsStoreError): ApiError => {
  if (error.code === DomainLogsStoreErrorCode.InvalidQuery) {
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

const mapKanbanStoreError = (error: KanbanStoreError): ApiError => {
  if (error.code === KanbanStoreErrorCode.NotFound) {
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

const CorsHeaderName = {
  Origin: "origin",
  AccessControlAllowOrigin: "access-control-allow-origin",
  AccessControlAllowHeaders: "access-control-allow-headers",
  AccessControlAllowMethods: "access-control-allow-methods",
  AccessControlMaxAge: "access-control-max-age",
  Vary: "vary"
} as const;

const CorsHeaderValue = {
  AllowHeaders: "authorization,content-type",
  AllowMethods: "GET,POST,OPTIONS",
  MaxAgeSeconds: "600",
  OptionsMethod: "OPTIONS",
  VaryOrigin: "origin"
} as const;

const Separator = {
  Space: " "
} as const;

const handleCorsPreflight = (req: IncomingMessage, res: ServerResponse): boolean => {
  const origin = readCorsOrigin(req);
  if (!origin || !isAllowedCorsOrigin(origin)) {
    return false;
  }

  if (req.method !== CorsHeaderValue.OptionsMethod) {
    return false;
  }

  applyCorsHeaders(req, res);
  res.statusCode = HttpStatus.Ok;
  res.end();
  return true;
};

const applyCorsHeaders = (req: IncomingMessage, res: ServerResponse): void => {
  const origin = readCorsOrigin(req);
  if (!origin || !isAllowedCorsOrigin(origin)) {
    return;
  }

  res.setHeader(CorsHeaderName.AccessControlAllowOrigin, origin);
  res.setHeader(CorsHeaderName.AccessControlAllowHeaders, CorsHeaderValue.AllowHeaders);
  res.setHeader(CorsHeaderName.AccessControlAllowMethods, CorsHeaderValue.AllowMethods);
  res.setHeader(CorsHeaderName.AccessControlMaxAge, CorsHeaderValue.MaxAgeSeconds);
  res.setHeader(CorsHeaderName.Vary, CorsHeaderValue.VaryOrigin);
};

const readCorsOrigin = (req: IncomingMessage): string | undefined => {
  const originHeader = req.headers[CorsHeaderName.Origin];
  return typeof originHeader === "string" ? originHeader : undefined;
};

const isAllowedCorsOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
};

const installServerConsoleForwarder = (logsStore: ServerLogsStore): void => {
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace.bind(console)
  };

  const methodLevel: Record<keyof typeof original, LogLevel> = {
    log: LogLevelValues.Info,
    info: LogLevelValues.Info,
    warn: LogLevelValues.Warn,
    error: LogLevelValues.Error,
    debug: LogLevelValues.Debug,
    trace: LogLevelValues.Trace
  };

  const forward = (method: keyof typeof original, args: unknown[]): void => {
    const entry: ServerLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level: methodLevel[method],
      message: args.map((value) => safeSerializeServerValue(value)).join(Separator.Space)
    };

    void logsStore.append(entry);
  };

  console.log = (...args: unknown[]): void => {
    forward("log", args);
    original.log(...args);
  };

  console.info = (...args: unknown[]): void => {
    forward("info", args);
    original.info(...args);
  };

  console.warn = (...args: unknown[]): void => {
    forward("warn", args);
    original.warn(...args);
  };

  console.error = (...args: unknown[]): void => {
    forward("error", args);
    original.error(...args);
  };

  console.debug = (...args: unknown[]): void => {
    forward("debug", args);
    original.debug(...args);
  };

  console.trace = (...args: unknown[]): void => {
    forward("trace", args);
    original.trace(...args);
  };
};

const safeSerializeServerValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ? `${value.name}: ${value.message}\n${value.stack}` : `${value.name}: ${value.message}`;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

const readOptionalBooleanField = (
  record: Record<string, unknown>,
  key: string
): Result<boolean | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "boolean") {
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
  value === LogLevelValues.Trace ||
  value === LogLevelValues.Debug ||
  value === LogLevelValues.Info ||
  value === LogLevelValues.Warn ||
  value === LogLevelValues.Error ||
  value === LogLevelValues.Fatal;

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
