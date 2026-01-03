export const HttpMethod = {
  Post: "POST"
} as const;

export type HttpMethod = typeof HttpMethod[keyof typeof HttpMethod];

export const RoutePath = {
  ProjectsCreate: "/projects/create",
  ProjectsOpen: "/projects/open",
  FilesTree: "/files/tree",
  FilesRead: "/files/read",
  FilesWrite: "/files/write"
} as const;

export type RoutePath = typeof RoutePath[keyof typeof RoutePath];

export const HeaderName = {
  Authorization: "authorization",
  WwwAuthenticate: "www-authenticate",
  ContentType: "content-type"
} as const;

export type HeaderName = typeof HeaderName[keyof typeof HeaderName];

export const BearerPrefix = "Bearer ";
export const BearerScheme = "Bearer";

export const EnvKey = {
  Port: "PORT",
  Host: "HOST",
  AuthToken: "AUTH_TOKEN"
} as const;

export const DefaultServerConfig = {
  Host: "0.0.0.0",
  Port: 4000
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
  ProjectExists: "Project already exists",
  NotFound: "Not found",
  InvalidPath: "Invalid path",
  AuthTokenMissing: "AUTH_TOKEN is required",
  InvalidPort: "Invalid PORT value",
  MethodNotAllowed: "Method not allowed",
  InternalServerError: "Internal server error"
} as const;

export const MimeType = {
  Json: "application/json"
} as const;

export const TextEncoding = "utf8";

export const ProjectField = {
  RootPath: "rootPath",
  Name: "name"
} as const;

export const FileField = {
  ProjectId: "projectId",
  Path: "path",
  Content: "content"
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
  InternalServerError: 500
} as const;
