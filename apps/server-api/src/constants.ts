export const HttpMethod = {
  Get: "GET",
  Post: "POST",
} as const;

export const RoutePath = {
  SettingsGet: "/settings/get",
  SettingsUpdate: "/settings/update",
  ProvidersList: "/providers/list",
  ProvidersSelect: "/providers/select",
  ProvidersSettings: "/providers/settings",
  WorkflowDefinitionsList: "/workflows/definitions/list",
  WorkflowDefinitionsGet: "/workflows/definitions/get",
  WorkflowDefinitionsVersions: "/workflows/definitions/versions",
  WorkflowDefinitionsRestoreVersion: "/workflows/definitions/restore-version",
  WorkflowDefinitionsRestoreVersionPart:
    "/workflows/definitions/restore-version-part",
  WorkflowDefinitionsCloneVersion: "/workflows/definitions/clone-version",
  WorkflowDefinitionsExportVersion: "/workflows/definitions/export-version",
  WorkflowDefinitionsExportVersionTimeline:
    "/workflows/definitions/export-version-timeline",
  WorkflowDefinitionsPreviewImportVersion:
    "/workflows/definitions/preview-import-version",
  WorkflowDefinitionsImportVersion: "/workflows/definitions/import-version",
  WorkflowDefinitionsCleanupVersions: "/workflows/definitions/cleanup-versions",
  WorkflowDefinitionsUpsert: "/workflows/definitions/upsert",
  WorkflowDefinitionsDelete: "/workflows/definitions/delete",
  WorkflowAssetsList: "/workflows/assets/list",
  WorkflowAssetsGet: "/workflows/assets/get",
  WorkflowAssetsUpsert: "/workflows/assets/upsert",
  WorkflowAssetsDelete: "/workflows/assets/delete",
  WorkflowAssetsUsage: "/workflows/assets/usage",
  WorkflowExecutionsList: "/workflows/executions/list",
  WorkflowExecutionsGet: "/workflows/executions/get",
  WorkflowExecutionsDelete: "/workflows/executions/delete",
  WorkflowExecutionsCancel: "/workflows/executions/cancel",
  WorkflowExecutionsRun: "/workflows/executions/run",
  WorkflowExecutionsStream: "/workflows/executions/stream",
  WorkflowExecutionsRunNode: "/workflows/executions/run-node",
  WorkflowExecutionsStreamNode: "/workflows/executions/stream-node",
  WorkflowProvidersTest: "/workflows/providers/test",
  GovernanceLifecyclesGet: "/governance/lifecycles/get",
  GovernanceLifecyclesBegin: "/governance/lifecycles/begin",
  GovernanceLifecyclesApprove: "/governance/lifecycles/approve",
  GovernanceLifecyclesContinue: "/governance/lifecycles/continue",
  GovernanceLifecyclesReject: "/governance/lifecycles/reject",
  GovernanceLifecyclesResume: "/governance/lifecycles/resume",
  AuthBootstrapAdmin: "/auth/bootstrap-admin",
  AuthRegister: "/auth/register",
  AuthLogin: "/auth/login",
  AuthLogout: "/auth/logout",
  AuthMe: "/auth/me",
  AuthPasswordResetRequest: "/auth/password-reset/request",
  AuthPasswordResetConfirm: "/auth/password-reset/confirm",
  AuthAdminRegistration: "/auth/admin/registration",
  AuthAdminUserEnabled: "/auth/admin/user-enabled",
  EditableAssetsList: "/assets/list",
  EditableAssetsUsage: "/assets/usage",
  EditableAssetsUpsert: "/assets/upsert",
  EditableAssetsDelete: "/assets/delete",
  ExternalApiKeysList: "/settings/api-keys/list",
  ExternalApiKeysCreate: "/settings/api-keys/create",
  ExternalApiKeysUpdate: "/settings/api-keys/update",
  ExternalApiKeysRevoke: "/settings/api-keys/revoke",
  ExternalApiKeysWorkflowDependencies:
    "/settings/api-keys/workflow-dependencies",
  ExternalWorkflowRead: "/external/workflows/read",
  ExternalWorkflowInvoke: "/external/workflows/invoke",
} as const;

export const HeaderName = {
  Authorization: "authorization",
  WwwAuthenticate: "www-authenticate",
  ContentType: "content-type",
  CacheControl: "cache-control",
  Connection: "connection",
  Cookie: "cookie",
  SetCookie: "set-cookie",
} as const;

export const BearerPrefix = "Bearer ";
export const BearerScheme = "Bearer";

export const EnvKey = {
  Port: "PORT",
  Host: "HOST",
  AuthToken: "AUTH_TOKEN",
  DatabaseUrl: "DATABASE_URL",
  IdeUiOrigins: "IDE_UI_ORIGINS",
} as const;

export const DefaultServerConfig = {
  Host: "0.0.0.0",
  Port: 4000,
} as const;

export const ErrorMessage = {
  MissingUrl: "Missing URL",
  Unauthorized: "Unauthorized",
  InvalidJson: "Invalid JSON",
  EmptyBody: "Empty request body",
  InvalidBody: "Invalid request body",
  MissingProviderId: "Missing providerId",
  MissingProfileId: "Missing profileId",
  MissingProviderConfig: "Missing provider config",
  ProviderNotFound: "Provider not found",
  NotFound: "Not found",
  AuthTokenMissing: "AUTH_TOKEN is required",
  DatabaseUrlMissing: "DATABASE_URL is required",
  DatabaseUrlInvalid: "DATABASE_URL must be a valid PostgreSQL URL",
  InvalidPort: "Invalid PORT value",
  MethodNotAllowed: "Method not allowed",
  InternalServerError: "Internal server error",
  MissingWorkflowId: "Missing workflowId",
  MissingAssetId: "Missing assetId",
  MissingExecutionId: "Missing executionId",
  MissingNodeId: "Missing nodeId",
  MissingApiKeyName: "Missing API key name",
  MissingApiKeyId: "Missing API key id",
  DuplicateApiKeyName: "An API key with this name already exists",
  InvalidApiKeyScope: "Invalid API key scope",
  WorkflowApiKeyOutOfScope: "API key is not allowed to access this workflow",
} as const;

export const MimeType = {
  Json: "application/json",
  EventStream: "text/event-stream",
} as const;

export const HeaderValue = {
  NoCache: "no-cache",
  KeepAlive: "keep-alive",
} as const;

export const TextEncoding = "utf8";

export const QueryParam = {
  WorkflowId: "workflowId",
  NodeId: "nodeId",
  InputSourceKind: "inputSourceKind",
  SourceNodeId: "sourceNodeId",
  SeedNodeOutputs: "seedNodeOutputs",
} as const;

export const ProviderField = {
  ProfileId: "profileId",
  ProviderId: "providerId",
  Config: "config",
} as const;

export const HttpStatus = {
  Ok: 200,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  MethodNotAllowed: 405,
  InternalServerError: 500,
} as const;
