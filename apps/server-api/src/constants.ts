export const HttpMethod = {
  Get: "GET",
  Post: "POST"
} as const;

export type HttpMethod = typeof HttpMethod[keyof typeof HttpMethod];

export const RoutePath = {
  ProjectsCreate: "/projects/create",
  ProjectsOpen: "/projects/open",
  FilesTree: "/files/tree",
  FilesRead: "/files/read",
  FilesWrite: "/files/write",
  FilesDelete: "/files/delete",
  FilesCreate: "/files/create",
  FilesMove: "/files/move",
  SessionsStart: "/sessions/start",
  SessionsStop: "/sessions/stop",
  SessionsStream: "/sessions/stream",
  HistoryList: "/history/list",
  HistoryEvents: "/history/events",
  LogsQuery: "/logs/query",
  LogsAppend: "/logs/append",
  LogsReset: "/logs/reset", 
  ProvidersList: "/providers/list",
  ProvidersSelect: "/providers/select",
  ProvidersSettings: "/providers/settings",
  GitStatus: "/git/status",
  GitDiff: "/git/diff",
  GitStage: "/git/stage",
  GitUnstage: "/git/unstage",
  GitRevert: "/git/revert",
  GitCommit: "/git/commit",
  GitBranchesList: "/git/branches/list",
  GitBranchesCreate: "/git/branches/create",
  GitBranchesCheckout: "/git/branches/checkout",
  GitBranchesPush: "/git/branches/push",
  GitBranchesPublish: "/git/branches/publish",
  QualityGatesRun: "/quality-gates/run",
  QualityGatesList: "/quality-gates/list",
  QualityGatesEvents: "/quality-gates/events",
  QualityGatesStream: "/quality-gates/stream",
  KanbanBoardsCreate: "/kanban/boards/create",
  KanbanBoardsList: "/kanban/boards/list",
  KanbanBoardsUpdate: "/kanban/boards/update",
  KanbanBoardsDelete: "/kanban/boards/delete",
  KanbanColumnsCreate: "/kanban/columns/create",
  KanbanColumnsList: "/kanban/columns/list",
  KanbanColumnsUpdate: "/kanban/columns/update",
  KanbanColumnsDelete: "/kanban/columns/delete",
  KanbanTasksCreate: "/kanban/tasks/create",
  KanbanTasksList: "/kanban/tasks/list",
  KanbanTasksUpdate: "/kanban/tasks/update",
  KanbanTasksDelete: "/kanban/tasks/delete",
  AiSkillsRun: "/ai/skills/run",
  AiWorkflowsRun: "/ai/workflows/run",
  AiEvalsRun: "/ai/evals/run",
  AiMemoryQuery: "/ai/memory/query"
} as const;

export type RoutePath = typeof RoutePath[keyof typeof RoutePath];

export const HeaderName = {
  Authorization: "authorization",
  WwwAuthenticate: "www-authenticate",
  ContentType: "content-type",
  CacheControl: "cache-control",
  Connection: "connection"
} as const;

export type HeaderName = typeof HeaderName[keyof typeof HeaderName];

export const BearerPrefix = "Bearer ";
export const BearerScheme = "Bearer";

export const EnvKey = {
  Port: "PORT",
  Host: "HOST",
  AuthToken: "AUTH_TOKEN",
  WorkspaceRoots: "WORKSPACE_ROOTS",
  CommandAllowlist: "COMMAND_ALLOWLIST",
  LogDir: "LOG_DIR"
} as const;

export const DefaultServerConfig = {
  Host: "0.0.0.0",
  Port: 4000,
  LogDir: "../web-ui/logs"
} as const;

export const ErrorMessage = {
  MissingUrl: "Missing URL",
  Unauthorized: "Unauthorized",
  Forbidden: "Forbidden",
  InvalidJson: "Invalid JSON",
  EmptyBody: "Empty request body",
  InvalidBody: "Invalid request body",
  MissingRootPath: "Missing rootPath",
  MissingName: "Missing name",
  MissingProjectId: "Missing projectId",
  MissingPath: "Missing path",
  MissingContent: "Missing content",
  MissingRunId: "Missing runId",
  MissingSessionId: "Missing sessionId",
  MissingProviderId: "Missing providerId",
  MissingProfileId: "Missing profileId",
  MissingProviderConfig: "Missing provider config",
  MissingBoardId: "Missing boardId",
  MissingBoardName: "Missing board name",
  MissingColumnId: "Missing columnId",
  MissingColumnName: "Missing column name",
  MissingTaskId: "Missing taskId",
  MissingTaskTitle: "Missing task title",
  ProjectExists: "Project already exists",
  ProviderNotFound: "Provider not found",
  NotFound: "Not found",
  InvalidPath: "Invalid path",
  WorkspaceRootsMissing: "Workspace roots are required",
  WorkspaceNotAllowed: "Workspace root not allowed",
  MissingCommand: "Missing command",
  CommandNotAllowed: "Command not allowed",
  AuthTokenMissing: "AUTH_TOKEN is required",
  InvalidPort: "Invalid PORT value",
  MethodNotAllowed: "Method not allowed",
  InternalServerError: "Internal server error",
  MissingSourcePath: "Missing sourcePath",
  MissingTargetPath: "Missing targetPath",
  MissingSkillName: "Missing skillName",
  MissingInput: "Missing input",
  MissingQuestion: "Missing question",
  MissingDatasetPath: "Missing datasetPath",
  MissingCommitMessage: "Missing commit message",
  MissingBranchName: "Missing branchName",
  MissingPaths: "Missing paths",
  InvalidCommitMessage: "Invalid Conventional Commit message",
  InvalidBranchName: "Invalid Git branch name"
} as const;

export const MimeType = {
  Json: "application/json",
  EventStream: "text/event-stream"
} as const;

export const HeaderValue = {
  NoCache: "no-cache",
  KeepAlive: "keep-alive"
} as const;

export const TextEncoding = "utf8";

export const ProjectField = {
  ProjectId: "projectId",
  RootPath: "rootPath",
  Name: "name"
} as const;

export const FileField = {
  ProjectId: "projectId",
  Path: "path",
  Content: "content"
} as const;

export const FileMoveField = {
  ProjectId: "projectId",
  SourcePath: "sourcePath",
  TargetPath: "targetPath"
} as const;

export const SessionField = {
  SessionId: "sessionId",
  ProjectId: "projectId"
} as const;

export const QueryParam = {
  SessionId: "sessionId"
} as const;

export const HistoryField = {
  Status: "status",
  Limit: "limit",
  RunId: "runId"
} as const;

export const LogsField = {
  Level: "level",
  Limit: "limit",
  RunId: "runId"
} as const;

export const ProviderField = {
  ProjectId: "projectId",
  ProfileId: "profileId",
  ProviderId: "providerId",
  Config: "config"
} as const;

export const KanbanBoardField = {
  ProjectId: "projectId",
  BoardId: "boardId",
  Name: "name"
} as const;

export const KanbanColumnField = {
  ProjectId: "projectId",
  BoardId: "boardId",
  ColumnId: "columnId",
  Name: "name",
  Position: "position"
} as const;

export const KanbanTaskField = {
  ProjectId: "projectId",
  BoardId: "boardId",
  ColumnId: "columnId",
  TaskId: "taskId",
  Title: "title",
  Description: "description",
  Position: "position"
} as const;

export const AiField = {
  SkillName: "skillName",
  Input: "input",
  Question: "question",
  DatasetPath: "datasetPath",
  AutoApprove: "autoApprove",
  Query: "query",
  Limit: "limit"
} as const;

export const GitField = {
  ProjectId: "projectId",
  Paths: "paths",
  Staged: "staged",
  Message: "message",
  BranchName: "branchName"
} as const;

export const QualityGateField = {
  ProjectId: "projectId",
  RunId: "runId",
  Gates: "gates",
  Status: "status",
  Limit: "limit"
} as const;

export const FileEntryKind = {
  File: "file",
  Directory: "directory"
} as const;

export type FileEntryKind = typeof FileEntryKind[keyof typeof FileEntryKind];

export const HttpStatus = {
  Ok: 200,
  Created: 201,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  MethodNotAllowed: 405,
  TooManyRequests: 429,
  InternalServerError: 500
} as const;
