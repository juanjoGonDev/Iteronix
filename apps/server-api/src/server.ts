import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  BearerPrefix,
  BearerScheme,
  ErrorMessage,
  HeaderName,
  HttpMethod,
  HttpStatus,
  MimeType,
  ProviderField,
  QueryParam,
  RoutePath,
  TextEncoding,
} from "./constants";
import { loadConfig, type ServerConfig } from "./config";
import {
  createProviderStore,
  ProviderStoreErrorCode,
  type ProviderSelection,
  type ProviderStoreError,
  type ProviderStore,
} from "./providers";
import { createSseStream } from "./sse";
import { err, ok, ResultType, type Result } from "./result";
import {
  createWorkflowCatalogStore,
  type WorkflowCatalogStore,
} from "../../../packages/agents/src/workflow-catalog";
import {
  executeWorkflowAssetDelete,
  executeWorkflowAssetGet,
  executeWorkflowAssetList,
  executeWorkflowAssetUpsert,
  executeWorkflowAssetUsageList,
  executeWorkflowDefinitionDelete,
  executeWorkflowDefinitionCloneVersion,
  executeWorkflowDefinitionCleanupVersions,
  executeWorkflowDefinitionExportVersionTimeline,
  executeWorkflowDefinitionExportVersion,
  executeWorkflowDefinitionGet,
  executeWorkflowDefinitionImportVersion,
  executeWorkflowDefinitionPreviewImportVersion,
  executeWorkflowDefinitionList,
  executeWorkflowDefinitionRestoreVersion,
  executeWorkflowDefinitionRestoreVersionPart,
  executeWorkflowDefinitionUpsert,
  executeWorkflowDefinitionVersionList,
  executeWorkflowExecutionDelete,
  executeWorkflowExecutionGet,
  executeWorkflowExecutionList,
  executeWorkflowExecutionCancel,
  executeWorkflowNodeExecutionRun,
  executeWorkflowExecutionRun,
  executeWorkflowNodeProviderTest,
  parseWorkflowAssetDeleteRequest,
  parseWorkflowAssetGetRequest,
  parseWorkflowAssetListRequest,
  parseWorkflowAssetUpsertRequest,
  parseWorkflowDefinitionDeleteRequest,
  parseWorkflowDefinitionCloneVersionRequest,
  parseWorkflowDefinitionCleanupVersionsRequest,
  parseWorkflowDefinitionExportVersionTimelineRequest,
  parseWorkflowDefinitionExportVersionRequest,
  parseWorkflowDefinitionGetRequest,
  parseWorkflowDefinitionImportVersionRequest,
  parseWorkflowDefinitionPreviewImportVersionRequest,
  parseWorkflowDefinitionListRequest,
  parseWorkflowDefinitionRestoreVersionRequest,
  parseWorkflowDefinitionRestoreVersionPartRequest,
  parseWorkflowDefinitionUpsertRequest,
  parseWorkflowDefinitionVersionListRequest,
  parseWorkflowAssetUsageListRequest,
  parseWorkflowExecutionDeleteRequest,
  parseWorkflowExecutionGetRequest,
  parseWorkflowExecutionListRequest,
  parseWorkflowExecutionCancelRequest,
  parseWorkflowNodeExecutionRunRequest,
  parseWorkflowExecutionRunRequest,
  parseWorkflowNodeProviderTestRequest,
} from "./workflows";
import {
  createWorkflowRuntimeService,
  type WorkflowRuntimeService,
} from "./workflow-runtime";
import {
  WorkflowRuntimeEventType,
  type WorkflowRuntimeEvent,
} from "../../../packages/agents/src/workflow-runtime";
import {
  WorkflowExecutionStatus,
  type WorkflowAlertRecord,
  type WorkflowDefinitionRecord,
  type WorkflowExecutionRecord,
  type WorkflowNodeExecutionRecord,
  type WorkflowUsageTotalsRecord,
} from "../../../packages/shared/src/workflows";
import {
  createWorkspaceStateFromStores,
  parseWorkspaceState,
  type WorkspaceSettingsSnapshot,
  type WorkspaceState,
  type WorkspaceStateStore,
} from "./workspace-state";
import {
  createPostgresPool,
  createPostgresWorkspaceStateStore,
} from "./postgres-workspace-state";
const WorkflowOnlyRoutePaths = new Set<string>([
  RoutePath.WorkspaceStateGet,
  RoutePath.WorkspaceStateUpdate,
  RoutePath.ProvidersList,
  RoutePath.ProvidersSelect,
  RoutePath.ProvidersSettings,
  RoutePath.WorkflowDefinitionsList,
  RoutePath.WorkflowDefinitionsGet,
  RoutePath.WorkflowDefinitionsVersions,
  RoutePath.WorkflowDefinitionsRestoreVersion,
  RoutePath.WorkflowDefinitionsRestoreVersionPart,
  RoutePath.WorkflowDefinitionsCloneVersion,
  RoutePath.WorkflowDefinitionsExportVersion,
  RoutePath.WorkflowDefinitionsExportVersionTimeline,
  RoutePath.WorkflowDefinitionsPreviewImportVersion,
  RoutePath.WorkflowDefinitionsImportVersion,
  RoutePath.WorkflowDefinitionsCleanupVersions,
  RoutePath.WorkflowDefinitionsUpsert,
  RoutePath.WorkflowDefinitionsDelete,
  RoutePath.WorkflowAssetsList,
  RoutePath.WorkflowAssetsGet,
  RoutePath.WorkflowAssetsUpsert,
  RoutePath.WorkflowAssetsDelete,
  RoutePath.WorkflowAssetsUsage,
  RoutePath.WorkflowExecutionsList,
  RoutePath.WorkflowExecutionsGet,
  RoutePath.WorkflowExecutionsDelete,
  RoutePath.WorkflowExecutionsCancel,
  RoutePath.WorkflowExecutionsRun,
  RoutePath.WorkflowExecutionsStream,
  RoutePath.WorkflowExecutionsRunNode,
  RoutePath.WorkflowExecutionsStreamNode,
  RoutePath.WorkflowProvidersTest,
]);

export const isWorkflowOnlyRoute = (path: string): boolean =>
  WorkflowOnlyRoutePaths.has(path);
type ActiveWorkflowExecutionRegistry = {
  register: (executionId: string, controller: AbortController) => void;
  cancel: (executionId: string) => void;
  delete: (executionId: string) => void;
};

export type WorkspacePersistence = {
  read: () => WorkspaceState;
  saveCurrent: () => Promise<WorkspaceState>;
  updateUiState: (input: {
    settings?: WorkspaceSettingsSnapshot;
  }) => Promise<WorkspaceState>;
};
export const startServer = async (): Promise<void> => {
  const config = loadConfig(process.env);
  const postgresPool = createPostgresPool(config.databaseUrl);
  const workspaceStateStore = createPostgresWorkspaceStateStore(postgresPool);
  const initialWorkspaceState = await loadInitialWorkspaceState(
    workspaceStateStore,
    postgresPool,
  );
  const providerStore = createProviderStore({
    selections: initialWorkspaceState.providerSelections,
    settings: initialWorkspaceState.providerSettings,
  });
  const workflowCatalog = createWorkflowCatalogStore(
    initialWorkspaceState.workflows,
  );
  const workspacePersistence = createWorkspacePersistence({
    stateStore: workspaceStateStore,
    initialState: initialWorkspaceState,
    providerStore,
    workflowCatalog,
  });
  const workflowRuntime = createWorkflowRuntimeService({
    readWorkspaceState: () => workspacePersistence.read(),
  });
  const server = createApiServer({
    config,
    providerStore,
    workflowRuntime,
    workspacePersistence,
    workflowCatalog,
  });

  server.listen(config.port, config.host);
  console.info("server.started", { host: config.host, port: config.port });
};

export const createApiServer = (input: {
  config: ServerConfig;
  providerStore: ProviderStore;
  workflowRuntime: WorkflowRuntimeService;
  workspacePersistence: WorkspacePersistence;
  workflowCatalog: WorkflowCatalogStore;
}) => {
  const activeWorkflowExecutions = createActiveWorkflowExecutionRegistry();
  return createServer((req, res) => {
    void handleRequest(
      req,
      res,
      input.config,
      input.providerStore,
      input.workflowRuntime,
      activeWorkflowExecutions,
      input.workspacePersistence,
      input.workflowCatalog,
    ).catch((error: unknown) => {
      console.error(
        "server.unhandled",
        req.method ?? "UNKNOWN",
        req.url ?? "",
        error,
      );
      if (!res.writableEnded) {
        respondError(res, {
          status: HttpStatus.InternalServerError,
          message: ErrorMessage.InternalServerError,
        });
      }
    });
  });
};

const loadInitialWorkspaceState = async (
  workspaceStateStore: ReturnType<typeof createPostgresWorkspaceStateStore>,
  postgresPool: ReturnType<typeof createPostgresPool>,
): Promise<WorkspaceState> => {
  try {
    await workspaceStateStore.initialize();
    return await workspaceStateStore.load();
  } catch (error) {
    await postgresPool.end();
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`PostgreSQL startup failed: ${message}`);
  }
};

export const createWorkspacePersistence = (input: {
  stateStore: WorkspaceStateStore;
  initialState: WorkspaceState;
  providerStore: ProviderStore;
  workflowCatalog: WorkflowCatalogStore;
}): WorkspacePersistence => {
  let state = input.initialState;
  let saveQueue: Promise<void> = Promise.resolve();

  const enqueueSave = <TValue>(
    operation: () => Promise<TValue>,
  ): Promise<TValue> => {
    const queuedSave = saveQueue.then(operation);
    saveQueue = queuedSave.then(
      () => undefined,
      () => undefined,
    );
    return queuedSave;
  };

  const buildState = (
    settings: WorkspaceSettingsSnapshot = state.settings,
  ): WorkspaceState =>
    createWorkspaceStateFromStores({
      providerSnapshot: input.providerStore.snapshot(),
      workflowSnapshot: input.workflowCatalog.snapshot(),
      settings,
      previousState: state,
    });

  const saveState = async (
    candidate: WorkspaceState,
  ): Promise<WorkspaceState> => {
    try {
      state = await input.stateStore.save(candidate);
      return state;
    } catch (error) {
      input.providerStore.restore({
        selections: state.providerSelections,
        settings: state.providerSettings,
      });
      input.workflowCatalog.restore(state.workflows);
      throw error;
    }
  };

  const saveCurrent = async (): Promise<WorkspaceState> =>
    enqueueSave(() => saveState(buildState()));

  const updateUiState = async (update: {
    settings?: WorkspaceSettingsSnapshot;
  }): Promise<WorkspaceState> => {
    return enqueueSave(() => saveState(buildState(update.settings)));
  };

  return { read: () => state, saveCurrent, updateUiState };
};
const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  providerStore: ProviderStore,
  workflowRuntime: WorkflowRuntimeService,
  activeWorkflowExecutions: ActiveWorkflowExecutionRegistry,
  workspacePersistence: WorkspacePersistence,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  if (!req.url || !req.method) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingUrl,
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

  if (!isWorkflowOnlyRoute(path)) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }

  if (path === RoutePath.WorkspaceStateGet) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkspaceStateGet(res, workspacePersistence);
    return;
  }

  if (path === RoutePath.WorkspaceStateUpdate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkspaceStateUpdate(req, res, workspacePersistence);
    return;
  }
  if (path === RoutePath.ProvidersList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleProvidersList(req, res, providerStore);
    return;
  }

  if (path === RoutePath.ProvidersSelect) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleProvidersSelect(req, res, providerStore, workspacePersistence);
    return;
  }

  if (path === RoutePath.ProvidersSettings) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleProviderSettingsUpdate(
      req,
      res,
      providerStore,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionList(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsGet) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionGet(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsVersions) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionVersionList(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsRestoreVersion) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionRestoreVersion(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsRestoreVersionPart) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionRestoreVersionPart(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsCloneVersion) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionCloneVersion(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsExportVersion) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionExportVersion(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsExportVersionTimeline) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionExportVersionTimeline(
      req,
      res,
      workflowCatalog,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsPreviewImportVersion) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionPreviewImportVersion(
      req,
      res,
      workflowCatalog,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsImportVersion) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionImportVersion(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsCleanupVersions) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionCleanupVersions(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsUpsert) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionUpsert(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowDefinitionsDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowDefinitionDelete(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowAssetsList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowAssetList(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowAssetsGet) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowAssetGet(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowAssetsUpsert) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowAssetUpsert(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowAssetsDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowAssetDelete(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowAssetsUsage) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowAssetUsageList(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowExecutionsList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowExecutionList(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowExecutionsGet) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowExecutionGet(req, res, workflowCatalog);
    return;
  }

  if (path === RoutePath.WorkflowExecutionsDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowExecutionDelete(
      req,
      res,
      workflowCatalog,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowExecutionsCancel) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowExecutionCancel(
      req,
      res,
      workflowCatalog,
      activeWorkflowExecutions,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowExecutionsRun) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowExecutionRun(
      req,
      res,
      workflowCatalog,
      workflowRuntime,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowExecutionsRunNode) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowNodeExecutionRun(
      req,
      res,
      workflowCatalog,
      workflowRuntime,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowExecutionsStream) {
    if (method !== HttpMethod.Get) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowExecutionStream(
      req,
      res,
      url,
      workflowCatalog,
      workflowRuntime,
      activeWorkflowExecutions,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowExecutionsStreamNode) {
    if (method !== HttpMethod.Get) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowNodeExecutionStream(
      res,
      url,
      workflowCatalog,
      workflowRuntime,
      activeWorkflowExecutions,
      workspacePersistence,
    );
    return;
  }

  if (path === RoutePath.WorkflowProvidersTest) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleWorkflowNodeProviderTest(
      req,
      res,
      workflowCatalog,
      workflowRuntime,
      workspacePersistence,
    );
    return;
  }
  respondError(res, {
    status: HttpStatus.NotFound,
    message: ErrorMessage.NotFound,
  });
};

const handleWorkspaceStateGet = async (
  res: ServerResponse,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  respondJson(res, HttpStatus.Ok, { state: workspacePersistence.read() });
};

const handleWorkspaceStateUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkspaceStateUpdateRequest(
    bodyResult.value,
    workspacePersistence.read(),
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  try {
    const state = await workspacePersistence.updateUiState(parsed.value);
    respondJson(res, HttpStatus.Ok, { state });
  } catch (error) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message:
        error instanceof Error ? error.message : ErrorMessage.InvalidBody,
    });
  }
};

export const parseWorkspaceStateUpdateRequest = (
  value: unknown,
  currentState: WorkspaceState,
): Result<{ settings?: WorkspaceSettingsSnapshot }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }

  if (!Object.hasOwn(value, "settings")) {
    return ok({});
  }

  try {
    return ok({
      settings: parseWorkspaceState({
        ...currentState,
        settings: value["settings"],
      }).settings,
    });
  } catch {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
};
const handleProvidersList = async (
  req: IncomingMessage,
  res: ServerResponse,
  providerStore: ProviderStore,
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

  if (parsed.value.profileId) {
    const selectionResult = providerStore.getSelection({
      profileId: parsed.value.profileId,
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
  providerStore: ProviderStore,
  workspacePersistence: WorkspacePersistence,
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

  const selected = providerStore.selectProvider(parsed.value);
  if (selected.type === ResultType.Err) {
    respondError(res, mapProviderStoreError(selected.error));
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    selection: selected.value,
  });
};

const handleProviderSettingsUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  providerStore: ProviderStore,
  workspacePersistence: WorkspacePersistence,
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

  const updated = providerStore.updateSettings(parsed.value);
  if (updated.type === ResultType.Err) {
    respondError(res, mapProviderStoreError(updated.error));
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    settings: updated.value,
  });
};

const mapProviderStoreError = (error: ProviderStoreError): ApiError =>
  error.code === ProviderStoreErrorCode.NotFound
    ? { status: HttpStatus.NotFound, message: error.message }
    : { status: HttpStatus.BadRequest, message: error.message };

type ApiError = {
  status: number;
  message: string;
};

const readJsonBody = (
  req: IncomingMessage,
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
            message: ErrorMessage.EmptyBody,
          }),
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
          message: error.message,
        }),
      );
    });
  });

const parseProvidersListRequest = (
  value: unknown,
): Result<{ profileId?: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }

  const profileIdValue = readOptionalStringField(
    value,
    ProviderField.ProfileId,
  );
  if (profileIdValue.type === ResultType.Err) {
    return profileIdValue;
  }

  const input: { profileId?: string } = {};

  if (profileIdValue.value !== undefined) {
    input.profileId = profileIdValue.value;
  }

  return ok(input);
};

const parseProvidersSelectRequest = (
  value: unknown,
): Result<{ profileId: string; providerId: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }

  const profileId = readRequiredString(
    value,
    ProviderField.ProfileId,
    ErrorMessage.MissingProfileId,
  );
  if (profileId.type === ResultType.Err) {
    return profileId;
  }

  const providerId = readRequiredString(
    value,
    ProviderField.ProviderId,
    ErrorMessage.MissingProviderId,
  );
  if (providerId.type === ResultType.Err) {
    return providerId;
  }

  return ok({
    profileId: profileId.value,
    providerId: providerId.value,
  });
};

const parseProviderSettingsRequest = (
  value: unknown,
): Result<
  {
    profileId: string;
    providerId: string;
    config: Record<string, unknown>;
  },
  ApiError
> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }

  const profileId = readRequiredString(
    value,
    ProviderField.ProfileId,
    ErrorMessage.MissingProfileId,
  );
  if (profileId.type === ResultType.Err) {
    return profileId;
  }

  const providerId = readRequiredString(
    value,
    ProviderField.ProviderId,
    ErrorMessage.MissingProviderId,
  );
  if (providerId.type === ResultType.Err) {
    return providerId;
  }

  const config = readRequiredRecord(
    value,
    ProviderField.Config,
    ErrorMessage.MissingProviderConfig,
  );
  if (config.type === ResultType.Err) {
    return config;
  }

  return ok({
    profileId: profileId.value,
    providerId: providerId.value,
    config: config.value,
  });
};

const handleWorkflowDefinitionList = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionList({
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    definitions: result.value,
  });
};

const handleWorkflowDefinitionGet = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionGetRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionGet(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionVersionList = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionVersionListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionVersionList(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    versions: result.value,
  });
};

const handleWorkflowDefinitionRestoreVersion = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionRestoreVersionRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionRestoreVersion(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionRestoreVersionPart = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionRestoreVersionPartRequest(
    bodyResult.value,
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionRestoreVersionPart(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionCloneVersion = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionCloneVersionRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionCloneVersion(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionExportVersion = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionExportVersionRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionExportVersion(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    exported: result.value,
  });
};

const handleWorkflowDefinitionExportVersionTimeline = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionExportVersionTimelineRequest(
    bodyResult.value,
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionExportVersionTimeline(parsed.value, {
    catalog: workflowCatalog,
    now: () => new Date(),
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    exported: result.value,
  });
};

const handleWorkflowDefinitionImportVersion = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionImportVersionRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionImportVersion(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionPreviewImportVersion = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionPreviewImportVersionRequest(
    bodyResult.value,
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionPreviewImportVersion(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    preview: result.value,
  });
};

const handleWorkflowDefinitionCleanupVersions = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionCleanupVersionsRequest(
    bodyResult.value,
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionCleanupVersions(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, result.value);
};

const handleWorkflowDefinitionUpsert = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionUpsertRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionUpsert(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowDefinitionDeleteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowDefinitionDelete(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowAssetList = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowAssetListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowAssetList(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    assets: result.value,
  });
};

const handleWorkflowAssetGet = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowAssetGetRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowAssetGet(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    asset: result.value,
  });
};

const handleWorkflowAssetUpsert = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowAssetUpsertRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowAssetUpsert(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    asset: result.value,
  });
};

const handleWorkflowAssetDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowAssetDeleteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowAssetDelete(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    asset: result.value,
  });
};

const handleWorkflowAssetUsageList = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowAssetUsageListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowAssetUsageList(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    usages: result.value,
  });
};

const handleWorkflowExecutionList = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowExecutionListRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowExecutionList(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    executions: result.value,
  });
};

const handleWorkflowExecutionGet = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowExecutionGetRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowExecutionGet(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const handleWorkflowExecutionDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowExecutionDeleteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowExecutionDelete(parsed.value, {
    catalog: workflowCatalog,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const handleWorkflowExecutionCancel = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  activeWorkflowExecutions: ActiveWorkflowExecutionRegistry,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowExecutionCancelRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = executeWorkflowExecutionCancel(parsed.value, {
    catalog: workflowCatalog,
    now: () => new Date(),
    cancelActiveExecution: activeWorkflowExecutions.cancel,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const handleWorkflowExecutionRun = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowExecutionRunRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeWorkflowExecutionRun(parsed.value, {
    catalog: workflowCatalog,
    runWorkflow: workflowRuntime.runWorkflow,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const handleWorkflowNodeExecutionRun = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowNodeExecutionRunRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeWorkflowNodeExecutionRun(parsed.value, {
    catalog: workflowCatalog,
    runNode: workflowRuntime.runNode,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const handleWorkflowExecutionStream = async (
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  activeWorkflowExecutions: ActiveWorkflowExecutionRegistry,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const workflowId = url.searchParams.get(QueryParam.WorkflowId) ?? undefined;
  if (!workflowId || workflowId.trim().length === 0) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingWorkflowId,
    });
    return;
  }

  const stream = createSseStream(res);
  const progressSaves = createWorkspaceSaveScheduler(workspacePersistence);
  const executionAbortController = new AbortController();
  const streamEvents = createWorkflowStreamEvents({
    workflowCatalog,
    activeWorkflowExecutions,
    executionAbortController,
    progressSaves,
    stream,
  });

  try {
    const result = await executeWorkflowExecutionRun(
      { workflowId },
      {
        catalog: workflowCatalog,
        runWorkflow: workflowRuntime.runWorkflow,
        signal: executionAbortController.signal,
        onEvent: streamEvents.onEvent,
      },
    );

    if (result.type === ResultType.Err) {
      stream.send({
        event: WorkflowRuntimeEventType.WorkflowFailed,
        data: {
          type: WorkflowRuntimeEventType.WorkflowFailed,
          workflowId,
          workflowRunId: "",
          finishedAt: new Date().toISOString(),
          error: result.error.message,
        },
      });
      return;
    }

    await progressSaves.flush();
    await workspacePersistence.saveCurrent();
    streamEvents.sendTerminal();
  } catch (error) {
    stream.send({
      event: WorkflowRuntimeEventType.WorkflowFailed,
      data: {
        type: WorkflowRuntimeEventType.WorkflowFailed,
        workflowId,
        workflowRunId: "",
        finishedAt: new Date().toISOString(),
        error:
          error instanceof Error ? error.message : "Workflow stream failed.",
      },
    });
  } finally {
    streamEvents.dispose();
    await progressSaves.flush().catch(() => undefined);
    stream.close();
  }
};

const handleWorkflowNodeExecutionStream = async (
  res: ServerResponse,
  url: URL,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  activeWorkflowExecutions: ActiveWorkflowExecutionRegistry,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const parsed = parseWorkflowNodeExecutionRunRequest(
    readWorkflowNodeExecutionStreamRequest(url),
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const stream = createSseStream(res);
  const progressSaves = createWorkspaceSaveScheduler(workspacePersistence);
  const executionAbortController = new AbortController();
  const streamEvents = createWorkflowStreamEvents({
    workflowCatalog,
    activeWorkflowExecutions,
    executionAbortController,
    progressSaves,
    stream,
  });

  try {
    const result = await executeWorkflowNodeExecutionRun(parsed.value, {
      catalog: workflowCatalog,
      runNode: workflowRuntime.runNode,
      signal: executionAbortController.signal,
      onEvent: streamEvents.onEvent,
    });

    if (result.type === ResultType.Err) {
      stream.send({
        event: WorkflowRuntimeEventType.WorkflowFailed,
        data: {
          type: WorkflowRuntimeEventType.WorkflowFailed,
          workflowId: parsed.value.workflowId,
          workflowRunId: "",
          finishedAt: new Date().toISOString(),
          error: result.error.message,
        },
      });
      return;
    }

    await progressSaves.flush();
    await workspacePersistence.saveCurrent();
    streamEvents.sendTerminal();
  } catch (error) {
    stream.send({
      event: WorkflowRuntimeEventType.WorkflowFailed,
      data: {
        type: WorkflowRuntimeEventType.WorkflowFailed,
        workflowId: parsed.value.workflowId,
        workflowRunId: "",
        finishedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Workflow node stream failed.",
      },
    });
  } finally {
    streamEvents.dispose();
    await progressSaves.flush().catch(() => undefined);
    stream.close();
  }
};

const readWorkflowNodeExecutionStreamRequest = (
  url: URL,
): Record<string, unknown> => {
  const inputSourceKind = url.searchParams.get(QueryParam.InputSourceKind);
  const sourceNodeId = url.searchParams.get(QueryParam.SourceNodeId);
  const seedNodeOutputs = readJsonQueryParam(
    url.searchParams.get(QueryParam.SeedNodeOutputs),
  );
  return {
    workflowId: url.searchParams.get(QueryParam.WorkflowId),
    nodeId: url.searchParams.get(QueryParam.NodeId),
    inputSource: {
      kind: inputSourceKind,
      ...(sourceNodeId ? { nodeId: sourceNodeId } : {}),
    },
    ...(seedNodeOutputs ? { seedNodeOutputs } : {}),
  };
};

const readJsonQueryParam = (value: string | null): unknown => {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const handleWorkflowNodeProviderTest = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  workspacePersistence: WorkspacePersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseWorkflowNodeProviderTestRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const result = await executeWorkflowNodeProviderTest(parsed.value, {
    catalog: workflowCatalog,
    testProviderNode: workflowRuntime.testProviderNode,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await workspacePersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, result.value);
};

const readWorkflowStreamEventName = (event: WorkflowRuntimeEvent): string =>
  event.type;

const createActiveWorkflowExecutionRegistry =
  (): ActiveWorkflowExecutionRegistry => {
    const controllers = new Map<string, AbortController>();

    const register = (
      executionId: string,
      controller: AbortController,
    ): void => {
      controllers.set(executionId, controller);
    };

    const cancel = (executionId: string): void => {
      controllers.get(executionId)?.abort();
    };

    const deleteExecution = (executionId: string): void => {
      controllers.delete(executionId);
    };

    return {
      register,
      cancel,
      delete: deleteExecution,
    };
  };

const createWorkspaceSaveScheduler = (
  workspacePersistence: WorkspacePersistence,
): {
  schedule: () => void;
  flush: () => Promise<void>;
} => {
  let saveQueue: Promise<void> = Promise.resolve();

  const schedule = (): void => {
    saveQueue = saveQueue.then(async () => {
      await workspacePersistence.saveCurrent();
    });
    void saveQueue.catch(() => undefined);
  };

  const flush = async (): Promise<void> => {
    await saveQueue;
  };

  return {
    schedule,
    flush,
  };
};

const createWorkflowStreamEvents = (input: {
  workflowCatalog: WorkflowCatalogStore;
  activeWorkflowExecutions: ActiveWorkflowExecutionRegistry;
  executionAbortController: AbortController;
  progressSaves: ReturnType<typeof createWorkspaceSaveScheduler>;
  stream: ReturnType<typeof createSseStream>;
}): {
  onEvent: (event: WorkflowRuntimeEvent) => void;
  sendTerminal: () => void;
  dispose: () => void;
} => {
  let workflowRunId: string | null = null;
  let terminalEvent: WorkflowRuntimeEvent | null = null;

  const onEvent = (event: WorkflowRuntimeEvent): void => {
    if (event.type === WorkflowRuntimeEventType.WorkflowStarted) {
      workflowRunId = event.workflowRunId;
      input.activeWorkflowExecutions.register(
        event.workflowRunId,
        input.executionAbortController,
      );
    }
    if (persistWorkflowRuntimeProgress(input.workflowCatalog, event)) {
      input.progressSaves.schedule();
    }
    if (isWorkflowTerminalEvent(event)) {
      terminalEvent = event;
      return;
    }

    input.stream.send({
      event: readWorkflowStreamEventName(event),
      data: event,
    });
  };

  const sendTerminal = (): void => {
    if (!terminalEvent) {
      return;
    }

    input.stream.send({
      event: readWorkflowStreamEventName(terminalEvent),
      data: terminalEvent,
    });
    terminalEvent = null;
  };

  const dispose = (): void => {
    if (workflowRunId) {
      input.activeWorkflowExecutions.delete(workflowRunId);
    }
  };

  return { onEvent, sendTerminal, dispose };
};

const isWorkflowTerminalEvent = (event: WorkflowRuntimeEvent): boolean =>
  event.type === WorkflowRuntimeEventType.WorkflowCompleted ||
  event.type === WorkflowRuntimeEventType.WorkflowFailed;

const persistWorkflowRuntimeProgress = (
  workflowCatalog: WorkflowCatalogStore,
  event: WorkflowRuntimeEvent,
): boolean => {
  if (event.type === WorkflowRuntimeEventType.WorkflowCompleted) {
    workflowCatalog.upsertExecution(event.execution);
    return true;
  }

  if (event.type === WorkflowRuntimeEventType.WorkflowFailed) {
    workflowCatalog.upsertExecution(event.execution);
    return true;
  }

  const workflow = workflowCatalog.getWorkflow(event.workflowId);
  if (!workflow) {
    return false;
  }

  const current = workflowCatalog.getExecution(event.workflowRunId);
  const next = createWorkflowProgressExecution(workflow, current, event);
  if (!next) {
    return false;
  }

  workflowCatalog.upsertExecution(next);
  return true;
};

const createWorkflowProgressExecution = (
  workflow: WorkflowDefinitionRecord,
  current: WorkflowExecutionRecord | undefined,
  event: WorkflowRuntimeEvent,
): WorkflowExecutionRecord | null => {
  if (event.type === WorkflowRuntimeEventType.WorkflowStarted) {
    return createRunningWorkflowExecution(workflow, current, event);
  }

  if (event.workflowRunId.trim().length === 0) {
    return null;
  }

  const startedAt =
    current?.startedAt ??
    ("startedAt" in event ? event.startedAt : new Date().toISOString());
  const nodeRuns = mergeWorkflowProgressNodeRuns(
    current?.nodeRuns ?? [],
    event,
  );
  return {
    id: event.workflowRunId,
    workflowId: workflow.id,
    triggerKind: workflow.trigger.kind,
    status: WorkflowExecutionStatus.Running,
    startedAt,
    warningsCount: countWorkflowWarnings(nodeRuns),
    errorsCount: countWorkflowErrors(nodeRuns),
    totals: sumWorkflowUsageTotals(nodeRuns),
    contextSessionId: event.workflowRunId,
    nodeRuns,
  };
};

const createRunningWorkflowExecution = (
  workflow: WorkflowDefinitionRecord,
  current: WorkflowExecutionRecord | undefined,
  event: Extract<
    WorkflowRuntimeEvent,
    { type: typeof WorkflowRuntimeEventType.WorkflowStarted }
  >,
): WorkflowExecutionRecord => ({
  id: event.workflowRunId,
  workflowId: workflow.id,
  triggerKind: workflow.trigger.kind,
  status: WorkflowExecutionStatus.Running,
  startedAt: current?.startedAt ?? event.startedAt,
  warningsCount: current?.warningsCount ?? 0,
  errorsCount: current?.errorsCount ?? 0,
  totals: current?.totals ?? createEmptyWorkflowUsageTotals(),
  contextSessionId: event.workflowRunId,
  nodeRuns: current?.nodeRuns ?? [],
});

const mergeWorkflowProgressNodeRuns = (
  current: ReadonlyArray<WorkflowNodeExecutionRecord>,
  event: WorkflowRuntimeEvent,
): ReadonlyArray<WorkflowNodeExecutionRecord> => {
  if (event.type === WorkflowRuntimeEventType.NodeStarted) {
    return upsertWorkflowNodeRun(current, {
      id: `${event.workflowRunId}:${event.nodeId}`,
      nodeId: event.nodeId,
      nodeKind: event.nodeKind,
      status: "running",
      startedAt: event.startedAt,
      alerts: [],
      guardrailFindings: [],
    });
  }

  if (event.type === WorkflowRuntimeEventType.NodeDelta) {
    const existing = current.find((nodeRun) => nodeRun.nodeId === event.nodeId);
    if (!existing) {
      return current;
    }

    return upsertWorkflowNodeRun(current, {
      ...existing,
      outputSnapshot:
        typeof existing.outputSnapshot === "string"
          ? `${existing.outputSnapshot}${event.delta}`
          : event.delta,
    });
  }

  if (event.type === WorkflowRuntimeEventType.NodeCompleted) {
    return upsertWorkflowNodeRun(current, {
      id: `${event.workflowRunId}:${event.nodeId}`,
      nodeId: event.nodeId,
      nodeKind: event.nodeKind,
      status: event.status,
      startedAt: event.startedAt,
      finishedAt: event.finishedAt,
      durationMs: readDurationMs(event.startedAt, event.finishedAt),
      ...(event.provider?.providerId
        ? { providerId: event.provider.providerId }
        : {}),
      ...(event.provider?.modelId ? { modelId: event.provider.modelId } : {}),
      ...(event.provider?.reasoningLevel
        ? { reasoningLevel: event.provider.reasoningLevel }
        : {}),
      ...(event.provider?.temperature !== undefined
        ? { temperature: event.provider.temperature }
        : {}),
      ...(event.provider?.verbosity
        ? { verbosity: event.provider.verbosity }
        : {}),
      ...(event.usage ? { usage: event.usage } : {}),
      alerts: event.alerts,
      guardrailFindings: event.guardrailFindings,
      outputSnapshot: event.outputSnapshot,
    });
  }

  if (event.type === WorkflowRuntimeEventType.NodeFailed) {
    return upsertWorkflowNodeRun(current, {
      id: `${event.workflowRunId}:${event.nodeId}`,
      nodeId: event.nodeId,
      nodeKind: event.nodeKind,
      status: "failed",
      startedAt: event.startedAt,
      finishedAt: event.finishedAt,
      durationMs: readDurationMs(event.startedAt, event.finishedAt),
      alerts: [
        createWorkflowRuntimeErrorAlert(event.message, event.finishedAt),
      ],
      guardrailFindings: [],
      outputSnapshot: { error: event.message },
    });
  }

  return current;
};

const upsertWorkflowNodeRun = (
  current: ReadonlyArray<WorkflowNodeExecutionRecord>,
  next: WorkflowNodeExecutionRecord,
): ReadonlyArray<WorkflowNodeExecutionRecord> =>
  current.some((nodeRun) => nodeRun.nodeId === next.nodeId)
    ? current.map((nodeRun) =>
        nodeRun.nodeId === next.nodeId ? next : nodeRun,
      )
    : [...current, next];

const createWorkflowRuntimeErrorAlert = (
  message: string,
  createdAt: string,
): WorkflowAlertRecord => ({
  id: `runtime-error:${createdAt}`,
  level: "error",
  source: "system",
  message,
  createdAt,
});

const countWorkflowWarnings = (
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>,
): number =>
  nodeRuns.reduce(
    (total, nodeRun) =>
      total +
      nodeRun.alerts.filter((alert) => alert.level === "warn").length +
      nodeRun.guardrailFindings.filter((finding) => finding.severity === "warn")
        .length,
    0,
  );

const countWorkflowErrors = (
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>,
): number =>
  nodeRuns.reduce(
    (total, nodeRun) =>
      total +
      (nodeRun.status === "failed" ? 1 : 0) +
      nodeRun.alerts.filter((alert) => alert.level === "error").length,
    0,
  );

const sumWorkflowUsageTotals = (
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>,
): WorkflowUsageTotalsRecord =>
  nodeRuns.reduce(
    (totals, nodeRun) =>
      nodeRun.usage ? addWorkflowUsageTotals(totals, nodeRun.usage) : totals,
    createEmptyWorkflowUsageTotals(),
  );

const addWorkflowUsageTotals = (
  left: WorkflowUsageTotalsRecord,
  right: WorkflowUsageTotalsRecord,
): WorkflowUsageTotalsRecord => ({
  promptTokens: left.promptTokens + right.promptTokens,
  completionTokens: left.completionTokens + right.completionTokens,
  totalTokens: left.totalTokens + right.totalTokens,
  estimatedCostEur: left.estimatedCostEur + right.estimatedCostEur,
  latencyMs: left.latencyMs + right.latencyMs,
  ...(right.estimatedCostSourceCurrency
    ? { estimatedCostSourceCurrency: right.estimatedCostSourceCurrency }
    : {}),
  ...(right.estimatedCostSourceValue !== undefined
    ? { estimatedCostSourceValue: right.estimatedCostSourceValue }
    : {}),
  ...(right.exchangeRateEur !== undefined
    ? { exchangeRateEur: right.exchangeRateEur }
    : {}),
});

const createEmptyWorkflowUsageTotals = (): WorkflowUsageTotalsRecord => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostEur: 0,
  latencyMs: 0,
});

const readDurationMs = (startedAt: string, finishedAt: string): number =>
  Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));

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
  Vary: "vary",
} as const;

const CorsHeaderValue = {
  AllowHeaders: "authorization,content-type",
  AllowMethods: "GET,POST,OPTIONS",
  MaxAgeSeconds: "600",
  OptionsMethod: "OPTIONS",
  VaryOrigin: "origin",
} as const;

const handleCorsPreflight = (
  req: IncomingMessage,
  res: ServerResponse,
): boolean => {
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
  res.setHeader(
    CorsHeaderName.AccessControlAllowHeaders,
    CorsHeaderValue.AllowHeaders,
  );
  res.setHeader(
    CorsHeaderName.AccessControlAllowMethods,
    CorsHeaderValue.AllowMethods,
  );
  res.setHeader(
    CorsHeaderName.AccessControlMaxAge,
    CorsHeaderValue.MaxAgeSeconds,
  );
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

const respondUnauthorized = (res: ServerResponse): void => {
  res.setHeader(HeaderName.WwwAuthenticate, BearerScheme);
  respondError(res, {
    status: HttpStatus.Unauthorized,
    message: ErrorMessage.Unauthorized,
  });
};

const respondMethodNotAllowed = (res: ServerResponse): void => {
  respondError(res, {
    status: HttpStatus.MethodNotAllowed,
    message: ErrorMessage.MethodNotAllowed,
  });
};

const respondError = (res: ServerResponse, error: ApiError): void => {
  respondJson(res, error.status, {
    error: {
      message: error.message,
    },
  });
};

const respondJson = (
  res: ServerResponse,
  status: number,
  body: unknown,
): void => {
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
  missingMessage: string,
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage,
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage,
    });
  }

  return ok(trimmed);
};

const readRequiredRecord = (
  record: Record<string, unknown>,
  key: string,
  missingMessage: string,
): Result<Record<string, unknown>, ApiError> => {
  if (!(key in record)) {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage,
    });
  }

  const value = record[key];
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }

  return ok(value);
};

const readOptionalStringField = (
  record: Record<string, unknown>,
  key: string,
): Result<string | undefined, ApiError> => {
  const value = record[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }

  const trimmed = value.trim();
  return ok(trimmed.length > 0 ? trimmed : undefined);
};

const parseJson = (raw: string): Result<unknown, ApiError> => {
  try {
    return ok(JSON.parse(raw) as unknown);
  } catch {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidJson,
    });
  }
};

const chunkToString = (chunk: Buffer | string): string =>
  typeof chunk === "string" ? chunk : chunk.toString(TextEncoding);
