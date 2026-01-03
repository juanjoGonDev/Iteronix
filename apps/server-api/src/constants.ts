export const HttpMethod = {
  Post: "POST"
} as const;

export type HttpMethod = typeof HttpMethod[keyof typeof HttpMethod];

export const RoutePath = {
  ProjectsCreate: "/projects/create",
  ProjectsOpen: "/projects/open"
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
  InvalidJson: "Invalid JSON",
  EmptyBody: "Empty request body",
  InvalidBody: "Invalid request body",
  MissingRootPath: "Missing rootPath",
  MissingName: "Missing name",
  ProjectExists: "Project already exists",
  NotFound: "Not found",
  AuthTokenMissing: "AUTH_TOKEN is required",
  InvalidPort: "Invalid PORT value",
  MethodNotAllowed: "Method not allowed"
} as const;

export const MimeType = {
  Json: "application/json"
} as const;

export const ProjectField = {
  RootPath: "rootPath",
  Name: "name"
} as const;

export const HttpStatus = {
  Ok: 200,
  Created: 201,
  BadRequest: 400,
  Unauthorized: 401,
  NotFound: 404,
  Conflict: 409,
  MethodNotAllowed: 405,
  InternalServerError: 500
} as const;
