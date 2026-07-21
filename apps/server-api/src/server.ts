import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
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
  createApplicationStateFromStores,
  parseApplicationState,
  type ApplicationSettingsSnapshot,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";
import {
  AssetStatus,
  appendPluginAuditEvent,
  parseEditableAssetCatalog,
  removeEditableAsset,
  upsertEditableAsset,
  withServerOwnedPluginAudit,
  type EditableAssetCatalog,
} from "./editable-assets";
import {
  indexMemoryDocument,
  createApplicationMemoryRagPort,
  type MemoryDocument,
  type MemoryDocumentCatalog,
} from "./memory-rag";
import { summarizePromptAssetUsage } from "./prompt-asset-usage";
import {
  createIdeAuthService,
  IdeUserRole,
  type IdeAuthState,
  type IdeAuthService,
  type PasswordResetDelivery,
} from "./ide-auth";
import {
  createPostgresPool,
  createPostgresApplicationStateStore,
} from "./postgres-application-state";
import { readDatabaseMigrationCatalog } from "./database-migration-catalog";
import { verifyDatabaseMigrations } from "./database-migrations";
import {
  ExternalApiKeyScopeKind,
  isExternalApiKeyNameAvailable,
  isWorkflowAllowedForExternalApiKey,
  readWorkflowExternalApiKeyDependencies,
  revokeExternalApiKeysForWorkflow,
  toExternalApiKeyView,
  type ExternalApiKeyRecord,
  type ExternalApiKeyScope,
} from "../../../packages/domain/src/external-api-keys";
import {
  createExternalApiKey,
  findVerifiedExternalApiKey,
} from "./external-api-keys";
import {
  GovernanceTransitionKind,
  type GovernanceLifecycle,
} from "../../../packages/domain/src/governance-lifecycle";
import {
  createGovernanceLifecycleService,
  isRetryableResumeReady,
  type GovernanceLifecycleService,
} from "./governance-lifecycle-service";
import {
  createGovernedAgentToolService,
  type GovernedAgentToolService,
} from "./governed-agent-tool-service";
import {
  createRunGovernedNodeCallback,
  registerSkillsAndPlugins,
  resolveMcpConnection,
} from "./governed-workflow-runtime";
import {
  createLocalMcpConnectionPort,
  type ServerMcpConnectionPort,
} from "./mcp-connection-port";
import {
  createChildProcessReferencePluginHost,
  createTrustedPluginRegistry,
  type TrustedPluginRegistry,
} from "./server-plugin-runtime";
import {
  createMemoryScope,
  type ArtifactProvenance,
  type McpToolResult,
} from "../../../packages/domain/src/agent-tool-contracts";
import { McpToolResultStatus } from "../../../packages/domain/src/agent-tool-contracts";

import type { JsonValue } from "../../../packages/domain/src/governance-validation";
import { tryServeStaticUi } from "./static-ui";

const UiSafeRedactedBindingKey = "[redacted]";
const UiSafeRedactedBindingValue = "[redacted]";
const SensitivePromptBindingKeyFragments = [
  "apikey",
  "authorization",
  "credential",
  "password",
  "private",
  "secret",
  "token",
] as const;
const ReferencePluginId = "reference.echo";
const createNoopPluginInvoke =
  () =>
  async (input: {
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }): Promise<McpToolResult> => ({
    toolId: input.toolId,
    status: McpToolResultStatus.Failure,
    output: {
      error: "MCP/plugin invocation is not available in this server context.",
    },
    provenance: {
      serverId: "none",
      toolVersion: "0.0.0",
      responseFingerprint: "noop-fingerprint",
    },
  });

const AuthRoutePaths = new Set<string>([
  RoutePath.AuthBootstrapAdmin,
  RoutePath.AuthRegister,
  RoutePath.AuthLogin,
  RoutePath.AuthLogout,
  RoutePath.AuthMe,
  RoutePath.AuthPasswordResetRequest,
  RoutePath.AuthPasswordResetConfirm,
  RoutePath.AuthAdminRegistration,
  RoutePath.AuthAdminUserEnabled,
]);

const WorkflowOnlyRoutePaths = new Set<string>([
  ...AuthRoutePaths,
  RoutePath.SettingsGet,
  RoutePath.SettingsUpdate,
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
  RoutePath.GovernanceLifecyclesGet,
  RoutePath.GovernanceLifecyclesBegin,
  RoutePath.GovernanceLifecyclesApprove,
  RoutePath.GovernanceLifecyclesContinue,
  RoutePath.GovernanceLifecyclesReject,
  RoutePath.GovernanceLifecyclesResume,
  RoutePath.EditableAssetsList,
  RoutePath.EditableAssetsUsage,
  RoutePath.EditableAssetsUpsert,
  RoutePath.EditableAssetsDelete,
  RoutePath.MemoryDocumentsIndex,
  RoutePath.MemoryDocumentsList,
  RoutePath.ExternalApiKeysList,
  RoutePath.ExternalApiKeysCreate,
  RoutePath.ExternalApiKeysUpdate,
  RoutePath.ExternalApiKeysRevoke,
  RoutePath.ExternalApiKeysWorkflowDependencies,
]);

export const isWorkflowOnlyRoute = (path: string): boolean =>
  WorkflowOnlyRoutePaths.has(path);
type ActiveWorkflowExecutionRegistry = {
  register: (executionId: string, controller: AbortController) => void;
  cancel: (executionId: string) => void;
  delete: (executionId: string) => void;
};

export type ApplicationPersistence = {
  read: () => ApplicationState;
  saveCurrent: () => Promise<ApplicationState>;
  updateUiState: (input: {
    settings?: ApplicationSettingsSnapshot;
  }) => Promise<ApplicationState>;
  updateExternalApiKeys: (
    externalApiKeys: ReadonlyArray<ExternalApiKeyRecord>,
  ) => Promise<ApplicationState>;
  updateGovernanceLifecycles: (
    governanceLifecycles: ReadonlyArray<GovernanceLifecycle>,
  ) => Promise<ApplicationState>;
  updateEditableAssets: (
    editableAssets: EditableAssetCatalog,
  ) => Promise<ApplicationState>;
  updateMemoryDocuments: (
    memoryDocuments: MemoryDocumentCatalog,
  ) => Promise<ApplicationState>;
  updateIdeAuth: (ideAuth: IdeAuthState) => Promise<ApplicationState>;
  mutateGovernanceLifecycles: (
    updater: (
      governanceLifecycles: ReadonlyArray<GovernanceLifecycle>,
    ) => ReadonlyArray<GovernanceLifecycle>,
  ) => Promise<ApplicationState>;
};
export const startServer = async (): Promise<void> => {
  const config = loadConfig(process.env);
  const postgresPool = createPostgresPool(config.databaseUrl);
  const applicationStateStore =
    createPostgresApplicationStateStore(postgresPool);
  const initialApplicationState = await loadInitialApplicationState(
    applicationStateStore,
    postgresPool,
  );
  const providerStore = createProviderStore({
    selections: initialApplicationState.providerSelections,
    settings: initialApplicationState.providerSettings,
  });
  const workflowCatalog = createWorkflowCatalogStore(
    initialApplicationState.workflows,
  );
  const applicationPersistence = createApplicationPersistence({
    stateStore: applicationStateStore,
    initialState: initialApplicationState,
    providerStore,
    workflowCatalog,
  });
  const workflowRuntime = createWorkflowRuntimeService({
    readApplicationState: () => applicationPersistence.read(),
  });
  const governanceLifecycle = createGovernanceLifecycleService(
    applicationPersistence,
  );
  const server = createApiServer({
    config,
    providerStore,
    workflowRuntime,
    applicationPersistence,
    governanceLifecycle,
    workflowCatalog,
    webUiRoot: readWebUiRoot(),
  });

  server.listen(config.port, config.host);
  console.info("server.started", { host: config.host, port: config.port });
};

export const createApiServer = (input: {
  config: ServerConfig;
  providerStore: ProviderStore;
  workflowRuntime: WorkflowRuntimeService;
  applicationPersistence: ApplicationPersistence;
  governanceLifecycle?: GovernanceLifecycleService;
  workflowCatalog: WorkflowCatalogStore;
  passwordResetDelivery?: PasswordResetDelivery;
  mcpConnectionPort?: ServerMcpConnectionPort;
  pluginRegistry?: TrustedPluginRegistry;
  webUiRoot?: string;
}) => {
  const activeWorkflowExecutions = createActiveWorkflowExecutionRegistry();
  const governanceLifecycle =
    input.governanceLifecycle ??
    createGovernanceLifecycleService(input.applicationPersistence);

  const governedService = createGovernedAgentToolService(
    input.applicationPersistence,
    createApplicationMemoryRagPort({ read: input.applicationPersistence.read }),
    async (audit) => {
      await input.applicationPersistence.updateEditableAssets(
        appendPluginAuditEvent(
          input.applicationPersistence.read().editableAssets,
          {
            assetId: audit.assetId,
            action: audit.action,
            actorId: "server-runtime",
            at: audit.at,
          },
        ),
      );
    },
  );

  const initialAssets = input.applicationPersistence.read().editableAssets;
  const initialInvoke =
    input.mcpConnectionPort ??
    createLocalMcpConnectionPort({ invoke: createNoopPluginInvoke() });
  const pluginRegistry =
    input.pluginRegistry ??
    createTrustedPluginRegistry({
      allowedPluginIds: [ReferencePluginId],
      host: createChildProcessReferencePluginHost(),
    });
  registerSkillsAndPlugins(
    governedService,
    { ...input.applicationPersistence.read(), editableAssets: initialAssets },
    "server-agent",
    initialInvoke,
    pluginRegistry,
  );
  const refreshGovernedAssetRegistry = (): void =>
    registerSkillsAndPlugins(
      governedService,
      input.applicationPersistence.read(),
      "server-agent",
      initialInvoke,
      pluginRegistry,
    );

  return createServer((req, res) => {
    refreshGovernedAssetRegistry();
    void handleRequest(
      req,
      res,
      input.config,
      input.providerStore,
      input.workflowRuntime,
      activeWorkflowExecutions,
      input.applicationPersistence,
      governanceLifecycle,
      input.workflowCatalog,
      input.passwordResetDelivery,
      input.webUiRoot,
      governedService,
      pluginRegistry,
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

const loadInitialApplicationState = async (
  applicationStateStore: ReturnType<typeof createPostgresApplicationStateStore>,
  postgresPool: ReturnType<typeof createPostgresPool>,
): Promise<ApplicationState> => {
  try {
    const migrationVerification = await verifyDatabaseMigrations(
      postgresPool,
      readDatabaseMigrationCatalog(),
    );
    if (migrationVerification.pending.length > 0) {
      throw new Error(
        `Pending database migrations: ${migrationVerification.pending.join(", ")}`,
      );
    }
    await applicationStateStore.initialize();
    return await applicationStateStore.load();
  } catch (error) {
    await postgresPool.end();
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`PostgreSQL startup failed: ${message}`);
  }
};

const readWebUiRoot = (): string => {
  const packagedRoot = resolve(process.cwd(), "web-ui");
  return existsSync(packagedRoot)
    ? packagedRoot
    : resolve(process.cwd(), "apps", "web-ui");
};

export const createApplicationPersistence = (input: {
  stateStore: ApplicationStateStore;
  initialState: ApplicationState;
  providerStore: ProviderStore;
  workflowCatalog: WorkflowCatalogStore;
}): ApplicationPersistence => {
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
    update: {
      settings?: ApplicationSettingsSnapshot;
      externalApiKeys?: ReadonlyArray<ExternalApiKeyRecord>;
      governanceLifecycles?: ReadonlyArray<GovernanceLifecycle>;
      editableAssets?: EditableAssetCatalog;
      memoryDocuments?: MemoryDocumentCatalog;
      ideAuth?: IdeAuthState;
    } = {},
  ): ApplicationState =>
    createApplicationStateFromStores({
      providerSnapshot: input.providerStore.snapshot(),
      workflowSnapshot: input.workflowCatalog.snapshot(),
      settings: update.settings ?? state.settings,
      externalApiKeys: update.externalApiKeys ?? state.externalApiKeys,
      governanceLifecycles:
        update.governanceLifecycles ?? state.governanceLifecycles,
      editableAssets: update.editableAssets ?? state.editableAssets,
      memoryDocuments: update.memoryDocuments ?? state.memoryDocuments,
      ideAuth: update.ideAuth ?? state.ideAuth,
      previousState: state,
    });

  const saveState = async (
    candidate: ApplicationState,
  ): Promise<ApplicationState> => {
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

  const saveCurrent = async (): Promise<ApplicationState> =>
    enqueueSave(() => saveState(buildState()));

  const updateUiState = async (update: {
    settings?: ApplicationSettingsSnapshot;
  }): Promise<ApplicationState> => {
    return enqueueSave(() => saveState(buildState(update)));
  };

  const updateExternalApiKeys = async (
    externalApiKeys: ReadonlyArray<ExternalApiKeyRecord>,
  ): Promise<ApplicationState> =>
    enqueueSave(() => saveState(buildState({ externalApiKeys })));

  const updateGovernanceLifecycles = async (
    governanceLifecycles: ReadonlyArray<GovernanceLifecycle>,
  ): Promise<ApplicationState> =>
    enqueueSave(() => saveState(buildState({ governanceLifecycles })));

  const updateEditableAssets = async (
    editableAssets: EditableAssetCatalog,
  ): Promise<ApplicationState> =>
    enqueueSave(() => saveState(buildState({ editableAssets })));

  const updateMemoryDocuments = async (
    memoryDocuments: MemoryDocumentCatalog,
  ): Promise<ApplicationState> =>
    enqueueSave(() => saveState(buildState({ memoryDocuments })));

  const updateIdeAuth = async (
    ideAuth: IdeAuthState,
  ): Promise<ApplicationState> =>
    enqueueSave(() => saveState(buildState({ ideAuth })));

  const mutateGovernanceLifecycles = async (
    updater: (
      governanceLifecycles: ReadonlyArray<GovernanceLifecycle>,
    ) => ReadonlyArray<GovernanceLifecycle>,
  ): Promise<ApplicationState> =>
    enqueueSave(() =>
      saveState(
        buildState({
          governanceLifecycles: updater(state.governanceLifecycles),
        }),
      ),
    );

  return {
    read: () => state,
    saveCurrent,
    updateUiState,
    updateExternalApiKeys,
    updateGovernanceLifecycles,
    updateEditableAssets,
    updateMemoryDocuments,
    updateIdeAuth,
    mutateGovernanceLifecycles,
  };
};
const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  providerStore: ProviderStore,
  workflowRuntime: WorkflowRuntimeService,
  activeWorkflowExecutions: ActiveWorkflowExecutionRegistry,
  applicationPersistence: ApplicationPersistence,
  governanceLifecycle: GovernanceLifecycleService,
  workflowCatalog: WorkflowCatalogStore,
  passwordResetDelivery: PasswordResetDelivery | undefined,
  webUiRoot: string | undefined,
  governedService: GovernedAgentToolService,
  pluginRegistry: TrustedPluginRegistry,
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

  const url = new URL(req.url, `http://${config.host}`);
  const path = url.pathname;
  const method = req.method;
  const ideAuth = createRequestIdeAuth(
    applicationPersistence,
    passwordResetDelivery,
  );

  if (
    webUiRoot &&
    !isWorkflowOnlyRoute(path) &&
    !isExternalWorkflowRoute(path) &&
    tryServeStaticUi(req, res, webUiRoot)
  ) {
    return;
  }

  if (isAuthRoute(path)) {
    await handleIdeAuthRequest({
      req,
      res,
      path,
      method,
      config,
      ideAuth,
      applicationPersistence,
    });
    return;
  }

  if (isExternalWorkflowRoute(path)) {
    await handleExternalWorkflowRequest({
      req,
      res,
      path,
      method,
      workflowCatalog,
      workflowRuntime,
      applicationPersistence,
      governanceLifecycle,
      governedService,
    });
    return;
  }

  const hasIdeSession = readSessionUser(req, ideAuth) !== undefined;
  const acceptsIdeSession =
    hasIdeSession &&
    (isEditableAssetRoute(path) ||
      path === RoutePath.GovernanceLifecyclesGet ||
      isIdeWorkflowExecutionRoute(path));
  if (
    (!isAuthorized(req, config.authToken) && !acceptsIdeSession) ||
    (requiresStrictBearerAuthentication(path) &&
      readBearerToken(req) !== config.authToken &&
      !acceptsIdeSession)
  ) {
    respondUnauthorized(res);
    return;
  }

  if (!isWorkflowOnlyRoute(path)) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }

  if (path === RoutePath.EditableAssetsList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    respondJson(res, HttpStatus.Ok, {
      assets: applicationPersistence.read().editableAssets.records,
    });
    return;
  }
  if (path === RoutePath.EditableAssetsUsage) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleEditableAssetUsage(req, res, applicationPersistence);
    return;
  }
  if (path === RoutePath.EditableAssetsUpsert) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleEditableAssetUpsert(
      req,
      res,
      applicationPersistence,
      pluginRegistry,
    );
    return;
  }
  if (path === RoutePath.EditableAssetsDelete) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleEditableAssetDelete(req, res, applicationPersistence);
    return;
  }
  if (path === RoutePath.MemoryDocumentsIndex) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleMemoryDocumentIndex(req, res, applicationPersistence);
    return;
  }
  if (path === RoutePath.MemoryDocumentsList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleMemoryDocumentList(req, res, applicationPersistence);
    return;
  }

  if (path === RoutePath.SettingsGet) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleSettingsGet(res, applicationPersistence);
    return;
  }

  if (path === RoutePath.SettingsUpdate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleSettingsUpdate(req, res, applicationPersistence);
    return;
  }
  if (path === RoutePath.GovernanceLifecyclesGet) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleGovernanceLifecycleGet(req, res, applicationPersistence);
    return;
  }
  if (path === RoutePath.GovernanceLifecyclesBegin) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleGovernanceLifecycleBegin(req, res, governanceLifecycle);
    return;
  }
  if (path === RoutePath.GovernanceLifecyclesApprove) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleGovernanceLifecycleControl(
      req,
      res,
      governanceLifecycle,
      GovernanceTransitionKind.Approve,
    );
    return;
  }
  if (path === RoutePath.GovernanceLifecyclesContinue) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleGovernanceLifecycleControl(
      req,
      res,
      governanceLifecycle,
      GovernanceTransitionKind.Continue,
    );
    return;
  }
  if (path === RoutePath.GovernanceLifecyclesReject) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleGovernanceLifecycleControl(
      req,
      res,
      governanceLifecycle,
      GovernanceTransitionKind.RejectWithFeedback,
    );
    return;
  }
  if (path === RoutePath.GovernanceLifecyclesResume) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }
    await handleGovernanceLifecycleResume(
      req,
      res,
      governanceLifecycle,
      workflowCatalog,
      workflowRuntime,
      applicationPersistence,
      governedService,
    );
    return;
  }
  if (path === RoutePath.ExternalApiKeysList) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    respondJson(res, HttpStatus.Ok, {
      keys: applicationPersistence
        .read()
        .externalApiKeys.map(toExternalApiKeyView),
    });
    return;
  }

  if (path === RoutePath.ExternalApiKeysCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleExternalApiKeyCreate(
      req,
      res,
      workflowCatalog,
      applicationPersistence,
    );
    return;
  }
  if (path === RoutePath.ExternalApiKeysUpdate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleExternalApiKeyUpdate(
      req,
      res,
      workflowCatalog,
      applicationPersistence,
    );
    return;
  }

  if (path === RoutePath.ExternalApiKeysRevoke) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleExternalApiKeyRevoke(req, res, applicationPersistence);
    return;
  }

  if (path === RoutePath.ExternalApiKeysWorkflowDependencies) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleExternalApiKeyDependencies(req, res, applicationPersistence);
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

    await handleProvidersSelect(
      req,
      res,
      providerStore,
      applicationPersistence,
    );
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
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
      applicationPersistence,
      governanceLifecycle,
      governedService,
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
      applicationPersistence,
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
      applicationPersistence,
      governanceLifecycle,
      governedService,
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
      applicationPersistence,
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
      applicationPersistence,
    );
    return;
  }
  respondError(res, {
    status: HttpStatus.NotFound,
    message: ErrorMessage.NotFound,
  });
};

const handleSettingsGet = async (
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  respondJson(res, HttpStatus.Ok, {
    settings: redactSettingsForClient(applicationPersistence.read().settings),
  });
};

const handleSettingsUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseSettingsUpdateRequest(
    bodyResult.value,
    applicationPersistence.read(),
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  try {
    const state = await applicationPersistence.updateUiState({
      settings: parsed.value,
    });
    respondJson(res, HttpStatus.Ok, {
      settings: redactSettingsForClient(state.settings),
    });
  } catch (error) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message:
        error instanceof Error ? error.message : ErrorMessage.InvalidBody,
    });
  }
};

export const parseSettingsUpdateRequest = (
  value: unknown,
  currentState: ApplicationState,
): Result<ApplicationSettingsSnapshot, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }

  try {
    const settings = parseApplicationState({
      ...currentState,
      settings: value,
    }).settings;
    return ok(settings);
  } catch {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
};

const redactSettingsForClient = (
  settings: ApplicationSettingsSnapshot,
): ApplicationSettingsSnapshot => settings;
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
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    selection: selected.value,
  });
};

const handleProviderSettingsUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  providerStore: ProviderStore,
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    settings: updated.value,
  });
};

const mapProviderStoreError = (error: ProviderStoreError): ApiError =>
  error.code === ProviderStoreErrorCode.NotFound
    ? { status: HttpStatus.NotFound, message: error.message }
    : { status: HttpStatus.BadRequest, message: error.message };

const handleEditableAssetUpsert = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
  pluginRegistry: TrustedPluginRegistry,
): Promise<void> => {
  const body = await readJsonBody(req);
  if (body.type === ResultType.Err) {
    respondError(res, body.error);
    return;
  }
  const parsed = parseEditableAssetCatalog({ records: [body.value] });
  const asset = parsed.records[0];
  if (!asset) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  if (asset.kind === "plugin" && !pluginRegistry.isAllowed(asset.id)) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: "Plugin registry key is not trusted.",
    });
    return;
  }
  const existing = applicationPersistence
    .read()
    .editableAssets.records.find((candidate) => candidate.id === asset.id);
  const serverOwnedAsset = withServerOwnedPluginAudit(asset, existing, {
    action: existing ? "updated" : "registered",
    actorId: "ide-session",
    at: new Date().toISOString(),
  });
  let assets: EditableAssetCatalog;
  try {
    assets = upsertEditableAsset(
      applicationPersistence.read().editableAssets,
      serverOwnedAsset,
    );
  } catch {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  await applicationPersistence.updateEditableAssets(assets);
  respondJson(res, HttpStatus.Ok, { asset: serverOwnedAsset });
};

const handleEditableAssetDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const body = await readJsonBody(req);
  if (body.type === ResultType.Err) {
    respondError(res, body.error);
    return;
  }
  const assetId = readEditableAssetId(body.value);
  if (!assetId) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  const current = applicationPersistence.read().editableAssets;
  const asset = current.records.find((candidate) => candidate.id === assetId);
  if (!asset) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }
  const usage = summarizePromptAssetUsage({
    assetId,
    definitions: applicationPersistence.read().workflows.definitions,
  });
  if (usage.nodeCount > 0) {
    const usageFingerprint = readUsageFingerprint(body.value);
    const confirmImpact = readImpactConfirmation(body.value);
    if (usageFingerprint !== usage.fingerprint || !confirmImpact) {
      respondError(res, {
        status: HttpStatus.Conflict,
        message: "Prompt asset usage changed or impact was not confirmed.",
      });
      return;
    }
    await applicationPersistence.updateEditableAssets(
      upsertEditableAsset(current, { ...asset, status: AssetStatus.Disabled }),
    );
    respondJson(res, HttpStatus.Ok, { assetId, tombstoned: true });
    return;
  }
  await applicationPersistence.updateEditableAssets(
    removeEditableAsset(current, assetId),
  );
  respondJson(res, HttpStatus.Ok, { assetId });
};

const handleEditableAssetUsage = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const body = await readJsonBody(req);
  if (body.type === ResultType.Err) {
    respondError(res, body.error);
    return;
  }
  const assetId = readEditableAssetId(body.value);
  if (!assetId) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  const asset = applicationPersistence
    .read()
    .editableAssets.records.find((candidate) => candidate.id === assetId);
  if (!asset || asset.kind !== "prompt") {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }
  respondJson(
    res,
    HttpStatus.Ok,
    summarizePromptAssetUsage({
      assetId,
      definitions: applicationPersistence.read().workflows.definitions,
    }),
  );
};

const handleMemoryDocumentIndex = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const body = await readJsonBody(req);
  if (body.type === ResultType.Err) {
    respondError(res, body.error);
    return;
  }
  const document = readMemoryDocument(body.value);
  if (!document) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  const source = applicationPersistence
    .read()
    .editableAssets.records.find((asset) => asset.id === document.sourceId);
  if (
    !source ||
    source.kind !== "memory-source" ||
    source.status !== AssetStatus.Enabled ||
    !source.memory?.optInIndexing ||
    source.memory.tenantId !== document.tenantId ||
    source.memory.workflowId !== document.workflowId
  ) {
    respondError(res, {
      status: HttpStatus.Forbidden,
      message: "Memory source does not permit this document.",
    });
    return;
  }
  try {
    await applicationPersistence.updateMemoryDocuments(
      indexMemoryDocument(
        applicationPersistence.read().memoryDocuments,
        document,
      ),
    );
  } catch {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  respondJson(res, HttpStatus.Ok, { document });
};

const handleMemoryDocumentList = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const body = await readJsonBody(req);
  if (body.type === ResultType.Err) {
    respondError(res, body.error);
    return;
  }
  const sourceId = readEditableAssetId(body.value);
  if (!sourceId) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  respondJson(res, HttpStatus.Ok, {
    documents: applicationPersistence
      .read()
      .memoryDocuments.documents.filter(
        (document) => document.sourceId === sourceId,
      )
      .map(toMemoryDocumentMetadata),
  });
};

const toMemoryDocumentMetadata = (document: MemoryDocument) => ({
  id: document.id,
  sourceId: document.sourceId,
  tenantId: document.tenantId,
  workflowId: document.workflowId,
  createdAt: document.createdAt,
  provenance: { ...document.provenance },
});

const readMemoryDocument = (value: unknown): MemoryDocument | undefined => {
  if (!isRecord(value) || !isRecord(value["document"])) return undefined;
  const document = value["document"];
  if (
    typeof document["id"] !== "string" ||
    typeof document["sourceId"] !== "string" ||
    typeof document["tenantId"] !== "string" ||
    typeof document["workflowId"] !== "string" ||
    typeof document["content"] !== "string" ||
    typeof document["createdAt"] !== "string" ||
    !isRecord(document["provenance"]) ||
    typeof document["provenance"]["source"] !== "string" ||
    typeof document["provenance"]["artifactFingerprint"] !== "string" ||
    typeof document["provenance"]["registeredAt"] !== "string"
  )
    return undefined;
  return {
    id: document["id"],
    sourceId: document["sourceId"],
    tenantId: document["tenantId"],
    workflowId: document["workflowId"],
    content: document["content"],
    createdAt: document["createdAt"],
    provenance: {
      source: document["provenance"]["source"],
      artifactFingerprint: document["provenance"]["artifactFingerprint"],
      registeredAt: document["provenance"]["registeredAt"],
    },
  };
};

const readEditableAssetId = (value: unknown): string | undefined =>
  isRecord(value) &&
  typeof value["assetId"] === "string" &&
  value["assetId"].trim().length > 0
    ? value["assetId"].trim()
    : undefined;

const readUsageFingerprint = (value: unknown): string | undefined =>
  isRecord(value) && typeof value["usageFingerprint"] === "string"
    ? value["usageFingerprint"]
    : undefined;

const readImpactConfirmation = (value: unknown): boolean =>
  isRecord(value) && value["confirmImpact"] === true;

const handleGovernanceLifecycleGet = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }
  const lifecycleId = parseGovernanceLifecycleId(bodyResult.value);
  if (lifecycleId.type === ResultType.Err) {
    respondError(res, lifecycleId.error);
    return;
  }
  const lifecycle = applicationPersistence
    .read()
    .governanceLifecycles.find(
      (candidate) => candidate.id === lifecycleId.value,
    );
  if (!lifecycle) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }
  respondJson(res, HttpStatus.Ok, {
    lifecycle: toUiSafeGovernanceLifecycle(lifecycle),
  });
};

const toUiSafeGovernanceLifecycle = (
  lifecycle: GovernanceLifecycle,
): GovernanceLifecycle => ({
  ...lifecycle,
  promptExecutions: lifecycle.promptExecutions.map((execution) => ({
    ...execution,
    bindings: redactPromptBindingsForUi(execution.bindings),
  })),
});

const redactPromptBindingsForUi = (
  bindings: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const uiSafeBindings: Record<string, unknown> = {};
  let redacted = false;
  for (const [key, value] of Object.entries(bindings)) {
    if (isSensitivePromptBindingKey(key)) {
      redacted = true;
      continue;
    }
    uiSafeBindings[key] = redactPromptBindingValueForUi(value);
  }
  if (redacted) {
    uiSafeBindings[UiSafeRedactedBindingKey] = UiSafeRedactedBindingValue;
  }
  return uiSafeBindings;
};

const redactPromptBindingValueForUi = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactPromptBindingValueForUi);
  }
  return isRecord(value) ? redactPromptBindingsForUi(value) : value;
};

const isSensitivePromptBindingKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SensitivePromptBindingKeyFragments.some((fragment) =>
    normalized.includes(fragment),
  );
};

const handleGovernanceLifecycleBegin = async (
  req: IncomingMessage,
  res: ServerResponse,
  governanceLifecycle: GovernanceLifecycleService,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }
  const parsed = parseGovernanceLifecycleBegin(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }
  try {
    const lifecycle = await governanceLifecycle.begin({
      ...parsed.value,
      now: new Date().toISOString(),
    });
    respondJson(res, HttpStatus.Ok, { lifecycle });
  } catch (error: unknown) {
    respondError(res, mapGovernanceError(error));
  }
};

const handleGovernanceLifecycleControl = async (
  req: IncomingMessage,
  res: ServerResponse,
  governanceLifecycle: GovernanceLifecycleService,
  kind: GovernanceTransitionKind,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }
  const parsed = parseGovernanceLifecycleControl(bodyResult.value, kind);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }
  try {
    const lifecycle = await governanceLifecycle.transition({
      ...parsed.value,
      kind,
      actorId: readAuthenticatedActorId(req),
      now: new Date().toISOString(),
    });
    respondJson(res, HttpStatus.Ok, { lifecycle });
  } catch (error: unknown) {
    respondError(res, mapGovernanceError(error));
  }
};

const handleGovernanceLifecycleResume = async (
  req: IncomingMessage,
  res: ServerResponse,
  governanceLifecycle: GovernanceLifecycleService,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  applicationPersistence: ApplicationPersistence,
  governedService: GovernedAgentToolService,
): Promise<void> => {
  const body = await readJsonBody(req);
  if (body.type === ResultType.Err) {
    respondError(res, body.error);
    return;
  }
  const lifecycleId = parseGovernanceLifecycleId(body.value);
  if (lifecycleId.type === ResultType.Err) {
    respondError(res, lifecycleId.error);
    return;
  }
  const lifecycle = governanceLifecycle.read(lifecycleId.value);
  const workflow = lifecycle
    ? workflowCatalog.getWorkflow(lifecycle.workflowId)
    : undefined;
  if (
    !lifecycle ||
    !workflow ||
    !isRetryableResumeReady(lifecycle) ||
    !hasMatchingWorkflowFingerprint(lifecycle, workflow)
  ) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
    return;
  }
  try {
    let execution: WorkflowExecutionRecord | undefined;
    const memoryScope = createMemoryScope({
      tenantId: workflow.id,
      workflowId: workflow.id,
      enabled: true,
      retentionDays: 30,
    });
    const resumed = await governanceLifecycle.executeBoundedPass({
      lifecycleId: lifecycle.id,
      execute: async () => {
        const result = await executeWorkflowExecutionRun(
          { workflowId: workflow.id },
          {
            catalog: workflowCatalog,
            runWorkflow: workflowRuntime.runWorkflow,
            runGovernedNode: createRunGovernedNodeCallback({
              governedService,
              lifecycleId: lifecycle.id,
              grantedPermissions: [],
              memoryScope,
              resolveMcpConnection: (connection) =>
                resolveMcpConnection(applicationPersistence.read(), connection),
              now: () => new Date(),
            }),
          },
        );
        if (result.type === ResultType.Err) {
          throw new Error(result.error.message);
        }
        execution = result.value;
        await persistPromptExecutionProvenance({
          lifecycleId: lifecycle.id,
          execution: result.value,
          governanceLifecycle,
        });
      },
      classifyFailure: classifyExternalWorkflowFailure,
      now: () => new Date().toISOString(),
    });
    if (execution) {
      await applicationPersistence.saveCurrent();
    }
    respondJson(res, HttpStatus.Ok, { lifecycle: resumed });
  } catch (error: unknown) {
    respondError(res, mapGovernanceError(error));
  }
};

const persistPromptExecutionProvenance = async (input: {
  lifecycleId: string;
  execution: WorkflowExecutionRecord;
  governanceLifecycle: GovernanceLifecycleService;
}): Promise<void> => {
  const attempt = input.governanceLifecycle.read(input.lifecycleId)?.budgets
    .execution;
  if (!attempt) {
    throw new Error("Prompt provenance requires an active execution attempt.");
  }
  for (const [index, provenance] of (
    input.execution.promptProvenance ?? []
  ).entries()) {
    await input.governanceLifecycle.recordPromptExecution({
      id: `${input.lifecycleId}:prompt:${attempt.toString()}:${index.toString()}`,
      lifecycleId: input.lifecycleId,
      assetId: provenance.assetId,
      version: provenance.version,
      bindings: provenance.bindings,
      renderedFingerprint: provenance.renderedFingerprint,
      validation: provenance.validation,
      timestamp: input.execution.finishedAt ?? input.execution.startedAt,
    });
  }
};

const hasMatchingWorkflowFingerprint = (
  lifecycle: GovernanceLifecycle,
  workflow: WorkflowDefinitionRecord,
): boolean =>
  lifecycle.fingerprints.scope ===
    `${workflow.id}@${workflow.version.toString()}` &&
  lifecycle.fingerprints.evidence === workflow.updatedAt;

const parseGovernanceLifecycleId = (
  value: unknown,
): Result<string, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
  return readRequiredString(value, "lifecycleId", ErrorMessage.InvalidBody);
};

const parseGovernanceLifecycleBegin = (
  value: unknown,
): Result<
  {
    id: string;
    workflowId: string;
    fingerprints: { scope: string; evidence: string };
    limits: { execution: number; repair: number; review: number };
  },
  ApiError
> => {
  if (
    !isRecord(value) ||
    !isRecord(value["fingerprints"]) ||
    !isRecord(value["limits"])
  ) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
  const id = readRequiredString(value, "lifecycleId", ErrorMessage.InvalidBody);
  const workflowId = readRequiredString(
    value,
    "workflowId",
    ErrorMessage.InvalidBody,
  );
  const scope = readRequiredString(
    value["fingerprints"],
    "scope",
    ErrorMessage.InvalidBody,
  );
  const evidence = readRequiredString(
    value["fingerprints"],
    "evidence",
    ErrorMessage.InvalidBody,
  );
  const execution = readNonNegativeIntegerField(value["limits"], "execution");
  const repair = readNonNegativeIntegerField(value["limits"], "repair");
  const review = readNonNegativeIntegerField(value["limits"], "review");
  if (
    id.type === ResultType.Err ||
    workflowId.type === ResultType.Err ||
    scope.type === ResultType.Err ||
    evidence.type === ResultType.Err ||
    execution.type === ResultType.Err ||
    repair.type === ResultType.Err ||
    review.type === ResultType.Err
  ) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
  return ok({
    id: id.value,
    workflowId: workflowId.value,
    fingerprints: { scope: scope.value, evidence: evidence.value },
    limits: {
      execution: execution.value,
      repair: repair.value,
      review: review.value,
    },
  });
};

const parseGovernanceLifecycleControl = (
  value: unknown,
  kind: GovernanceTransitionKind,
): Result<{ lifecycleId: string; reason: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
  const lifecycleId = readRequiredString(
    value,
    "lifecycleId",
    ErrorMessage.InvalidBody,
  );
  const reason = readRequiredString(
    value,
    kind === GovernanceTransitionKind.RejectWithFeedback
      ? "feedback"
      : "reason",
    ErrorMessage.InvalidBody,
  );
  if (lifecycleId.type === ResultType.Err || reason.type === ResultType.Err) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
  return ok({ lifecycleId: lifecycleId.value, reason: reason.value });
};

const readNonNegativeIntegerField = (
  value: Record<string, unknown>,
  key: string,
): Result<number, ApiError> => {
  const candidate = value[key];
  return typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 0
    ? ok(candidate)
    : err({ status: HttpStatus.BadRequest, message: ErrorMessage.InvalidBody });
};

const mapGovernanceError = (error: unknown): ApiError => ({
  status: HttpStatus.BadRequest,
  message: error instanceof Error ? error.message : ErrorMessage.InvalidBody,
});

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
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionRestoreVersionPart = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionCloneVersion = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
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
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
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
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, result.value);
};

const handleWorkflowDefinitionUpsert = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
  });
};

const handleWorkflowDefinitionDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  applicationPersistence: ApplicationPersistence,
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

  const keyUpdate = revokeExternalApiKeysForWorkflow({
    keys: applicationPersistence.read().externalApiKeys,
    workflowId: parsed.value.workflowId,
    revokedAt: new Date().toISOString(),
  });
  await applicationPersistence.updateExternalApiKeys(keyUpdate.keys);
  respondJson(res, HttpStatus.Ok, {
    definition: result.value,
    revokedKeys: keyUpdate.revoked,
  });
};

const handleExternalApiKeyCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseExternalApiKeyCreateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  if (
    parsed.value.scope.kind === ExternalApiKeyScopeKind.SelectedWorkflows &&
    parsed.value.scope.workflowIds.some(
      (workflowId) => !workflowCatalog.getWorkflow(workflowId),
    )
  ) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }

  if (
    !isExternalApiKeyNameAvailable(
      applicationPersistence.read().externalApiKeys,
      parsed.value.name,
    )
  ) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.DuplicateApiKeyName,
    });
    return;
  }

  const created = createExternalApiKey({ ...parsed.value, now: new Date() });
  await applicationPersistence.updateExternalApiKeys([
    ...applicationPersistence.read().externalApiKeys,
    created.key,
  ]);
  respondJson(res, HttpStatus.Ok, {
    key: toExternalApiKeyView(created.key),
    plaintextKey: created.plaintext,
  });
};

const handleExternalApiKeyUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseExternalApiKeyUpdateRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  if (
    parsed.value.scope.kind === ExternalApiKeyScopeKind.SelectedWorkflows &&
    parsed.value.scope.workflowIds.some(
      (workflowId) => !workflowCatalog.getWorkflow(workflowId),
    )
  ) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }

  const keys = applicationPersistence.read().externalApiKeys;
  const currentKey = keys.find((key) => key.id === parsed.value.keyId);
  if (!currentKey) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }

  if (!isExternalApiKeyNameAvailable(keys, parsed.value.name, currentKey.id)) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.DuplicateApiKeyName,
    });
    return;
  }

  const updatedKey: ExternalApiKeyRecord = {
    ...currentKey,
    name: parsed.value.name,
    scope: parsed.value.scope,
  };
  await applicationPersistence.updateExternalApiKeys(
    keys.map((key) => (key.id === updatedKey.id ? updatedKey : key)),
  );
  respondJson(res, HttpStatus.Ok, { key: toExternalApiKeyView(updatedKey) });
};

const handleExternalApiKeyRevoke = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const keyId = readExternalApiKeyId(bodyResult.value);
  if (keyId.type === ResultType.Err) {
    respondError(res, keyId.error);
    return;
  }

  const revokedAt = new Date().toISOString();
  let found = false;
  const keys = applicationPersistence.read().externalApiKeys.map((key) => {
    if (key.id !== keyId.value) {
      return key;
    }
    found = true;
    return key.revokedAt ? key : { ...key, revokedAt };
  });
  if (!found) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }

  await applicationPersistence.updateExternalApiKeys(keys);
  const key = keys.find((entry) => entry.id === keyId.value);
  if (!key) {
    respondError(res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }
  respondJson(res, HttpStatus.Ok, { key: toExternalApiKeyView(key) });
};

const handleExternalApiKeyDependencies = async (
  req: IncomingMessage,
  res: ServerResponse,
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }
  const workflowId = readWorkflowId(bodyResult.value);
  if (workflowId.type === ResultType.Err) {
    respondError(res, workflowId.error);
    return;
  }
  respondJson(res, HttpStatus.Ok, {
    keys: readWorkflowExternalApiKeyDependencies(
      applicationPersistence.read().externalApiKeys,
      workflowId.value,
    ),
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
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    asset: result.value,
  });
};

const handleWorkflowAssetDelete = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
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
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const handleWorkflowExecutionCancel = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  activeWorkflowExecutions: ActiveWorkflowExecutionRegistry,
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const handleWorkflowExecutionRun = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  applicationPersistence: ApplicationPersistence,
  governanceLifecycle: GovernanceLifecycleService,
  governedService: GovernedAgentToolService,
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

  const result = await executeGovernedWorkflowExecution(parsed.value, {
    catalog: workflowCatalog,
    runWorkflow: workflowRuntime.runWorkflow,
    governanceLifecycle,
    applicationPersistence,
    governedService,
  });
  if (result.type === ResultType.Err) {
    respondError(res, result.error);
    return;
  }

  await applicationPersistence.saveCurrent();
  respondJson(res, HttpStatus.Ok, {
    execution: result.value,
  });
};

const executeGovernedWorkflowExecution = async (
  request: {
    workflowId: string;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
  },
  dependencies: {
    catalog: WorkflowCatalogStore;
    runWorkflow: WorkflowRuntimeService["runWorkflow"];
    governanceLifecycle: GovernanceLifecycleService;
    applicationPersistence: ApplicationPersistence;
    governedService: GovernedAgentToolService;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  },
): Promise<Result<WorkflowExecutionRecord, ApiError>> => {
  const workflow = dependencies.catalog.getWorkflow(request.workflowId);
  if (!workflow) {
    return err({ status: HttpStatus.NotFound, message: ErrorMessage.NotFound });
  }

  const lifecycle = await dependencies.governanceLifecycle.begin({
    id: `ide:${workflow.id}:${randomUUID()}`,
    workflowId: workflow.id,
    fingerprints: {
      scope: `${workflow.id}@${workflow.version.toString()}`,
      evidence: workflow.updatedAt,
    },
    limits: {
      execution: workflow.executionPolicy.maxNodeRetries + 1,
      repair: workflow.executionPolicy.maxNodeRetries,
      review: 1,
    },
    now: new Date().toISOString(),
  });
  await dependencies.governanceLifecycle.transition({
    lifecycleId: lifecycle.id,
    kind: GovernanceTransitionKind.StartPlanning,
    actorId: "ide-session",
    reason: "IDE requested a bounded workflow pass.",
    now: new Date().toISOString(),
  });

  let execution: WorkflowExecutionRecord | undefined;
  const memoryScope = createMemoryScope({
    tenantId: workflow.id,
    workflowId: workflow.id,
    enabled: true,
    retentionDays: 30,
  });
  await dependencies.governanceLifecycle.executeBoundedPass({
    lifecycleId: lifecycle.id,
    execute: async () => {
      const result = await executeWorkflowExecutionRun(request, {
        catalog: dependencies.catalog,
        runWorkflow: dependencies.runWorkflow,
        ...(dependencies.signal ? { signal: dependencies.signal } : {}),
        ...(dependencies.onEvent ? { onEvent: dependencies.onEvent } : {}),
        runGovernedNode: createRunGovernedNodeCallback({
          governedService: dependencies.governedService,
          lifecycleId: lifecycle.id,
          grantedPermissions: [],
          memoryScope,
          resolveMcpConnection: (connection) =>
            resolveMcpConnection(
              dependencies.applicationPersistence.read(),
              connection,
            ),
          now: () => new Date(),
        }),
      });
      if (result.type === ResultType.Err) {
        throw new Error(result.error.message);
      }
      execution = dependencies.catalog.upsertExecution({
        ...result.value,
        lifecycleId: lifecycle.id,
      });
      await persistPromptExecutionProvenance({
        lifecycleId: lifecycle.id,
        execution,
        governanceLifecycle: dependencies.governanceLifecycle,
      });
    },
    classifyFailure: classifyExternalWorkflowFailure,
    now: () => new Date().toISOString(),
  });
  await dependencies.applicationPersistence.saveCurrent();

  if (!execution) {
    return err({
      status: HttpStatus.InternalServerError,
      message: ErrorMessage.InternalServerError,
    });
  }
  return ok(execution);
};

const handleWorkflowNodeExecutionRun = async (
  req: IncomingMessage,
  res: ServerResponse,
  workflowCatalog: WorkflowCatalogStore,
  workflowRuntime: WorkflowRuntimeService,
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
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
  applicationPersistence: ApplicationPersistence,
  governanceLifecycle: GovernanceLifecycleService,
  governedService: GovernedAgentToolService,
): Promise<void> => {
  const workflowId = url.searchParams.get(QueryParam.WorkflowId) ?? undefined;
  if (!workflowId || workflowId.trim().length === 0) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingWorkflowId,
    });
    return;
  }
  const seedNodeOutputs = readJsonQueryParam(
    url.searchParams.get(QueryParam.SeedNodeOutputs),
  );
  const parsed = parseWorkflowExecutionRunRequest({
    workflowId,
    ...(seedNodeOutputs ? { seedNodeOutputs } : {}),
  });
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const stream = createSseStream(res);
  const progressSaves = createApplicationSaveScheduler(applicationPersistence);
  const executionAbortController = new AbortController();
  const streamEvents = createWorkflowStreamEvents({
    workflowCatalog,
    activeWorkflowExecutions,
    executionAbortController,
    progressSaves,
    stream,
  });

  try {
    const result = await executeGovernedWorkflowExecution(parsed.value, {
      catalog: workflowCatalog,
      runWorkflow: workflowRuntime.runWorkflow,
      signal: executionAbortController.signal,
      onEvent: streamEvents.onEvent,
      governanceLifecycle,
      applicationPersistence,
      governedService,
    });

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
    await applicationPersistence.saveCurrent();
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
  applicationPersistence: ApplicationPersistence,
): Promise<void> => {
  const parsed = parseWorkflowNodeExecutionRunRequest(
    readWorkflowNodeExecutionStreamRequest(url),
  );
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const stream = createSseStream(res);
  const progressSaves = createApplicationSaveScheduler(applicationPersistence);
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
    await applicationPersistence.saveCurrent();
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
  applicationPersistence: ApplicationPersistence,
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

  await applicationPersistence.saveCurrent();
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

const createApplicationSaveScheduler = (
  applicationPersistence: ApplicationPersistence,
): {
  schedule: () => void;
  flush: () => Promise<void>;
} => {
  let saveQueue: Promise<void> = Promise.resolve();

  const schedule = (): void => {
    saveQueue = saveQueue.then(async () => {
      await applicationPersistence.saveCurrent();
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
  progressSaves: ReturnType<typeof createApplicationSaveScheduler>;
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

const createRequestIdeAuth = (
  applicationPersistence: ApplicationPersistence,
  passwordResetDelivery: PasswordResetDelivery | undefined,
): IdeAuthService =>
  createIdeAuthService({
    load: () => applicationPersistence.read().ideAuth,
    save: () => undefined,
    now: () => new Date().toISOString(),
    randomToken: randomUUID,
    ...(passwordResetDelivery
      ? { deliverPasswordReset: passwordResetDelivery }
      : {}),
  });

const IdeAuthClientErrorMessages = new Set([
  "Administrator already exists",
  "Administrator access is required",
  "Email is already registered",
  "Email is invalid",
  "Invalid credentials",
  "Invalid password reset token",
  "Password must be at least 12 characters",
  "Password reset is unavailable",
  "Registration is disabled",
  "User not found",
]);

const handleIdeAuthRequest = async (input: {
  req: IncomingMessage;
  res: ServerResponse;
  path: string;
  method: string;
  config: ServerConfig;
  ideAuth: IdeAuthService;
  applicationPersistence: ApplicationPersistence;
}): Promise<void> => {
  if (input.method !== HttpMethod.Post) {
    respondMethodNotAllowed(input.res);
    return;
  }
  const body = await readJsonBody(input.req);
  if (body.type === ResultType.Err) {
    respondError(input.res, body.error);
    return;
  }
  const sessionUser = readSessionUser(input.req, input.ideAuth);
  try {
    if (input.path === RoutePath.AuthBootstrapAdmin) {
      if (readBearerToken(input.req) !== input.config.authToken) {
        respondUnauthorized(input.res);
        return;
      }
      const credentials = readCredentials(body.value);
      if (!credentials) return respondInvalidBody(input.res);
      const user = input.ideAuth.bootstrapAdmin(credentials);
      await persistIdeAuth(input);
      respondJson(input.res, HttpStatus.Ok, { user: toIdeUserView(user) });
      return;
    }
    if (input.path === RoutePath.AuthRegister) {
      const credentials = readCredentials(body.value);
      if (!credentials) return respondInvalidBody(input.res);
      const registered = await input.ideAuth.register(credentials);
      await persistIdeAuth(input);
      respondJson(input.res, HttpStatus.Ok, {
        user: toIdeUserView(registered.user),
      });
      return;
    }
    if (input.path === RoutePath.AuthLogin) {
      const credentials = readCredentials(body.value);
      if (!credentials) return respondInvalidBody(input.res);
      const session = await input.ideAuth.login(credentials);
      await persistIdeAuth(input);
      input.res.setHeader(
        HeaderName.SetCookie,
        createSessionCookie(session.token),
      );
      const user = input.ideAuth.getSessionUser(session.token);
      respondJson(input.res, HttpStatus.Ok, {
        user: user ? toIdeUserView(user) : null,
      });
      return;
    }
    if (input.path === RoutePath.AuthLogout) {
      const token = readSessionToken(input.req);
      if (token) input.ideAuth.logout(token);
      await persistIdeAuth(input);
      input.res.setHeader(HeaderName.SetCookie, clearSessionCookie());
      respondJson(input.res, HttpStatus.Ok, {});
      return;
    }
    if (input.path === RoutePath.AuthMe) {
      if (!sessionUser) {
        respondUnauthorized(input.res);
        return;
      }
      respondJson(input.res, HttpStatus.Ok, {
        user: toIdeUserView(sessionUser),
      });
      return;
    }
    if (input.path === RoutePath.AuthPasswordResetRequest) {
      const email = readStringField(body.value, "email");
      if (!email) return respondInvalidBody(input.res);
      input.ideAuth.requestPasswordReset(email);
      await persistIdeAuth(input);
      respondJson(input.res, HttpStatus.Ok, {});
      return;
    }
    if (input.path === RoutePath.AuthPasswordResetConfirm) {
      const token = readStringField(body.value, "token");
      const password = readStringField(body.value, "password");
      if (!token || !password) return respondInvalidBody(input.res);
      await input.ideAuth.confirmPasswordReset({ token, password });
      await persistIdeAuth(input);
      respondJson(input.res, HttpStatus.Ok, {});
      return;
    }
    if (!sessionUser || sessionUser.role !== IdeUserRole.Admin) {
      respondUnauthorized(input.res);
      return;
    }
    if (input.path === RoutePath.AuthAdminRegistration) {
      const enabled = readBooleanField(body.value, "enabled");
      if (enabled === undefined) return respondInvalidBody(input.res);
      input.ideAuth.setRegistrationEnabled({
        actorId: sessionUser.id,
        enabled,
      });
      await persistIdeAuth(input);
      respondJson(input.res, HttpStatus.Ok, { registrationEnabled: enabled });
      return;
    }
    if (input.path === RoutePath.AuthAdminUserEnabled) {
      const userId = readStringField(body.value, "userId");
      const enabled = readBooleanField(body.value, "enabled");
      if (!userId || enabled === undefined)
        return respondInvalidBody(input.res);
      input.ideAuth.setUserEnabled({
        actorId: sessionUser.id,
        userId,
        enabled,
      });
      await persistIdeAuth(input);
      respondJson(input.res, HttpStatus.Ok, { userId, enabled });
      return;
    }
    respondError(input.res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : ErrorMessage.InternalServerError;
    const isClientError = IdeAuthClientErrorMessages.has(message);
    respondError(input.res, {
      status: isClientError
        ? HttpStatus.BadRequest
        : HttpStatus.InternalServerError,
      message: isClientError ? message : ErrorMessage.InternalServerError,
    });
  }
};

const persistIdeAuth = async (input: {
  ideAuth: IdeAuthService;
  applicationPersistence: ApplicationPersistence;
}): Promise<void> => {
  await input.applicationPersistence.updateIdeAuth(input.ideAuth.snapshot());
};

const readSessionUser = (req: IncomingMessage, ideAuth: IdeAuthService) => {
  const token = readSessionToken(req);
  return token ? ideAuth.getSessionUser(token) : undefined;
};

const readSessionToken = (req: IncomingMessage): string | undefined => {
  const raw = req.headers[HeaderName.Cookie];
  if (!raw) return undefined;
  const values = raw.split(";").map((entry) => entry.trim());
  const session = values.find((entry) => entry.startsWith("iteronix_session="));
  return session
    ? decodeURIComponent(session.slice("iteronix_session=".length))
    : undefined;
};

const createSessionCookie = (token: string): string =>
  `iteronix_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`;
const clearSessionCookie = (): string =>
  "iteronix_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
const toIdeUserView = (user: {
  id: string;
  email: string;
  role: IdeUserRole;
  enabled: boolean;
}) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  enabled: user.enabled,
});
const readCredentials = (
  value: unknown,
): { email: string; password: string } | undefined => {
  const email = readStringField(value, "email");
  const password = readStringField(value, "password");
  return email && password ? { email, password } : undefined;
};
const readStringField = (value: unknown, key: string): string | undefined =>
  isRecord(value) &&
  typeof value[key] === "string" &&
  value[key].trim().length > 0
    ? value[key].trim()
    : undefined;
const readBooleanField = (value: unknown, key: string): boolean | undefined =>
  isRecord(value) && typeof value[key] === "boolean" ? value[key] : undefined;
const respondInvalidBody = (res: ServerResponse): void =>
  respondError(res, {
    status: HttpStatus.BadRequest,
    message: ErrorMessage.InvalidBody,
  });
const isAuthRoute = (path: string): boolean => AuthRoutePaths.has(path);

const isAuthorized = (req: IncomingMessage, authToken: string): boolean => {
  const token = readBearerToken(req);
  return token === authToken || isColocatedWebUiRequest(req);
};

const isColocatedWebUiRequest = (req: IncomingMessage): boolean => {
  const origin = readCorsOrigin(req);
  const host = req.headers.host;
  if (!origin || !host) {
    return false;
  }
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host || originUrl.port === "4000";
  } catch {
    return false;
  }
};

const isExternalWorkflowRoute = (path: string): boolean =>
  path === RoutePath.ExternalWorkflowRead ||
  path === RoutePath.ExternalWorkflowInvoke;

const isGovernanceLifecycleRoute = (path: string): boolean =>
  path === RoutePath.GovernanceLifecyclesGet ||
  path === RoutePath.GovernanceLifecyclesBegin ||
  path === RoutePath.GovernanceLifecyclesApprove ||
  path === RoutePath.GovernanceLifecyclesContinue ||
  path === RoutePath.GovernanceLifecyclesReject ||
  path === RoutePath.GovernanceLifecyclesResume;

const isEditableAssetRoute = (path: string): boolean =>
  path === RoutePath.EditableAssetsList ||
  path === RoutePath.EditableAssetsUsage ||
  path === RoutePath.EditableAssetsUpsert ||
  path === RoutePath.EditableAssetsDelete ||
  path === RoutePath.MemoryDocumentsIndex ||
  path === RoutePath.MemoryDocumentsList;

const isIdeWorkflowExecutionRoute = (path: string): boolean =>
  path === RoutePath.WorkflowExecutionsRun ||
  path === RoutePath.WorkflowExecutionsStream;

const requiresStrictBearerAuthentication = (path: string): boolean =>
  isGovernanceLifecycleRoute(path) || isEditableAssetRoute(path);

const handleExternalWorkflowRequest = async (input: {
  req: IncomingMessage;
  res: ServerResponse;
  path: string;
  method: string;
  workflowCatalog: WorkflowCatalogStore;
  workflowRuntime: WorkflowRuntimeService;
  applicationPersistence: ApplicationPersistence;
  governanceLifecycle: GovernanceLifecycleService;
  governedService: GovernedAgentToolService;
}): Promise<void> => {
  if (input.method !== HttpMethod.Post) {
    respondMethodNotAllowed(input.res);
    return;
  }

  const plaintextKey = readBearerToken(input.req);
  if (!plaintextKey) {
    respondUnauthorized(input.res);
    return;
  }
  const key = findVerifiedExternalApiKey(
    input.applicationPersistence.read().externalApiKeys,
    plaintextKey,
  );
  if (!key) {
    respondUnauthorized(input.res);
    return;
  }

  const bodyResult = await readJsonBody(input.req);
  if (bodyResult.type === ResultType.Err) {
    respondError(input.res, bodyResult.error);
    return;
  }
  const workflowId = readWorkflowId(bodyResult.value);
  if (workflowId.type === ResultType.Err) {
    respondError(input.res, workflowId.error);
    return;
  }
  if (!isWorkflowAllowedForExternalApiKey(key, workflowId.value)) {
    respondError(input.res, {
      status: HttpStatus.Forbidden,
      message: ErrorMessage.WorkflowApiKeyOutOfScope,
    });
    return;
  }

  const workflow = input.workflowCatalog.getWorkflow(workflowId.value);
  if (!workflow) {
    respondError(input.res, {
      status: HttpStatus.NotFound,
      message: ErrorMessage.NotFound,
    });
    return;
  }

  await input.applicationPersistence.updateExternalApiKeys(
    input.applicationPersistence
      .read()
      .externalApiKeys.map((entry) =>
        entry.id === key.id
          ? { ...entry, lastUsedAt: new Date().toISOString() }
          : entry,
      ),
  );

  if (input.path === RoutePath.ExternalWorkflowRead) {
    respondJson(input.res, HttpStatus.Ok, { definition: workflow });
    return;
  }

  const lifecycle = await input.governanceLifecycle.begin({
    id: `external:${workflow.id}:${randomUUID()}`,
    workflowId: workflow.id,
    fingerprints: {
      scope: `${workflow.id}@${workflow.version.toString()}`,
      evidence: workflow.updatedAt,
    },
    limits: {
      execution: workflow.executionPolicy.maxNodeRetries + 1,
      repair: workflow.executionPolicy.maxNodeRetries,
      review: 1,
    },
    now: new Date().toISOString(),
  });
  await input.governanceLifecycle.transition({
    lifecycleId: lifecycle.id,
    kind: "start-planning",
    actorId: "external-api",
    reason: "External invocation requested a bounded workflow pass.",
    now: new Date().toISOString(),
  });
  let execution: WorkflowExecutionRecord | undefined;
  const memoryScope = createMemoryScope({
    tenantId: workflow.id,
    workflowId: workflow.id,
    enabled: true,
    retentionDays: 30,
  });
  await input.governanceLifecycle.executeBoundedPass({
    lifecycleId: lifecycle.id,
    execute: async () => {
      const result = await executeWorkflowExecutionRun(
        { workflowId: workflowId.value },
        {
          catalog: input.workflowCatalog,
          runWorkflow: input.workflowRuntime.runWorkflow,
          runGovernedNode: createRunGovernedNodeCallback({
            governedService: input.governedService,
            lifecycleId: lifecycle.id,
            grantedPermissions: [],
            memoryScope,
            resolveMcpConnection: (connection) =>
              resolveMcpConnection(
                input.applicationPersistence.read(),
                connection,
              ),
            now: () => new Date(),
          }),
        },
      );
      if (result.type === ResultType.Err) {
        throw new Error(result.error.message);
      }
      execution = result.value;
      await persistPromptExecutionProvenance({
        lifecycleId: lifecycle.id,
        execution: result.value,
        governanceLifecycle: input.governanceLifecycle,
      });
    },
    classifyFailure: classifyExternalWorkflowFailure,
    now: () => new Date().toISOString(),
  });
  if (!execution) {
    respondError(input.res, {
      status: HttpStatus.InternalServerError,
      message: ErrorMessage.InternalServerError,
    });
    return;
  }
  await input.applicationPersistence.saveCurrent();
  respondJson(input.res, HttpStatus.Ok, {
    execution,
    lifecycleId: lifecycle.id,
  });
};

const readBearerToken = (req: IncomingMessage): string | undefined => {
  const header = req.headers[HeaderName.Authorization];
  return typeof header === "string" ? extractBearerToken(header) : undefined;
};

const readAuthenticatedActorId = (req: IncomingMessage): string =>
  readBearerToken(req)
    ? "authenticated-bearer-client"
    : "authenticated-colocated-web-ui";

const classifyExternalWorkflowFailure = (
  error: unknown,
): {
  classification: "retryable" | "non-retryable";
  before: string;
  after: string;
} => {
  const message =
    error instanceof Error ? error.message : "Unknown workflow failure.";
  const classification = /timeout|temporar|rate limit|\b429\b|\b5\d\d\b/i.test(
    message,
  )
    ? "retryable"
    : "non-retryable";
  return {
    classification,
    before: message,
    after:
      classification === "retryable"
        ? "A bounded repair pass is available."
        : "The failure is terminal and requires a new lifecycle.",
  };
};

const parseExternalApiKeyCreateRequest = (
  value: unknown,
): Result<{ name: string; scope: ExternalApiKeyScope }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody,
    });
  }
  const name = typeof value["name"] === "string" ? value["name"].trim() : "";
  if (!name) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingApiKeyName,
    });
  }
  const scope = parseExternalApiKeyScope(value["scope"]);
  return scope.type === ResultType.Err
    ? scope
    : ok({ name, scope: scope.value });
};

const parseExternalApiKeyUpdateRequest = (
  value: unknown,
): Result<
  { keyId: string; name: string; scope: ExternalApiKeyScope },
  ApiError
> => {
  const keyId = readExternalApiKeyId(value);
  if (keyId.type === ResultType.Err) {
    return keyId;
  }
  const creation = parseExternalApiKeyCreateRequest(value);
  return creation.type === ResultType.Err
    ? creation
    : ok({ keyId: keyId.value, ...creation.value });
};

const parseExternalApiKeyScope = (
  value: unknown,
): Result<ExternalApiKeyScope, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidApiKeyScope,
    });
  }
  if (value["kind"] === ExternalApiKeyScopeKind.AllWorkflows) {
    return ok({ kind: ExternalApiKeyScopeKind.AllWorkflows });
  }
  if (
    value["kind"] !== ExternalApiKeyScopeKind.SelectedWorkflows ||
    !Array.isArray(value["workflowIds"])
  ) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidApiKeyScope,
    });
  }
  const workflowIds = value["workflowIds"].filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );
  return workflowIds.length > 0
    ? ok({ kind: ExternalApiKeyScopeKind.SelectedWorkflows, workflowIds })
    : err({
        status: HttpStatus.BadRequest,
        message: ErrorMessage.InvalidApiKeyScope,
      });
};

const readExternalApiKeyId = (value: unknown): Result<string, ApiError> => {
  if (
    !isRecord(value) ||
    typeof value["keyId"] !== "string" ||
    !value["keyId"].trim()
  ) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingApiKeyId,
    });
  }
  return ok(value["keyId"].trim());
};

const readWorkflowId = (value: unknown): Result<string, ApiError> => {
  if (
    !isRecord(value) ||
    typeof value["workflowId"] !== "string" ||
    !value["workflowId"].trim()
  ) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingWorkflowId,
    });
  }
  return ok(value["workflowId"].trim());
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
  AccessControlAllowCredentials: "access-control-allow-credentials",
  AccessControlMaxAge: "access-control-max-age",
  Vary: "vary",
} as const;

const CorsHeaderValue = {
  AllowHeaders: "authorization,content-type",
  AllowMethods: "GET,POST,OPTIONS",
  MaxAgeSeconds: "600",
  OptionsMethod: "OPTIONS",
  VaryOrigin: "origin",
  AllowCredentials: "true",
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
    CorsHeaderName.AccessControlAllowCredentials,
    CorsHeaderValue.AllowCredentials,
  );
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

const DefaultIdeUiOrigins = [
  "http://localhost:4000",
  "http://127.0.0.1:4000",
] as const;
const isAllowedCorsOrigin = (origin: string): boolean =>
  DefaultIdeUiOrigins.some((trustedOrigin) => trustedOrigin === origin);

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
