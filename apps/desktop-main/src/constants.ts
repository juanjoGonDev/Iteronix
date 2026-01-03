export const DesktopMode = {
  Local: "local",
  Remote: "remote"
} as const;

export type DesktopMode = typeof DesktopMode[keyof typeof DesktopMode];

export const EnvKey = {
  Mode: "ITERONIX_DESKTOP_MODE",
  RemoteUrl: "ITERONIX_DESKTOP_REMOTE_URL",
  AuthToken: "ITERONIX_DESKTOP_AUTH_TOKEN",
  WorkspaceRoots: "ITERONIX_DESKTOP_WORKSPACE_ROOTS",
  CommandAllowlist: "ITERONIX_DESKTOP_COMMAND_ALLOWLIST",
  ServerPort: "ITERONIX_DESKTOP_SERVER_PORT",
  ServerHost: "ITERONIX_DESKTOP_SERVER_HOST",
  ServerEntry: "ITERONIX_DESKTOP_SERVER_ENTRY"
} as const;

export const ServerEnvKey = {
  Port: "PORT",
  Host: "HOST",
  AuthToken: "AUTH_TOKEN",
  WorkspaceRoots: "WORKSPACE_ROOTS",
  CommandAllowlist: "COMMAND_ALLOWLIST"
} as const;

export const DefaultServer = {
  Host: "127.0.0.1",
  Port: 4000
} as const;

export const DefaultPaths = {
  ServerEntry: "dist/apps/server-api/src/index.js"
} as const;

export const ConfigErrorCode = {
  InvalidMode: "invalid_mode",
  MissingRemoteUrl: "missing_remote_url",
  InvalidRemoteUrl: "invalid_remote_url",
  MissingAuthToken: "missing_auth_token",
  MissingWorkspaceRoots: "missing_workspace_roots",
  InvalidServerPort: "invalid_server_port"
} as const;

export type ConfigErrorCode = typeof ConfigErrorCode[keyof typeof ConfigErrorCode];

export const ConfigErrorMessage = {
  InvalidMode: "Invalid desktop mode",
  MissingRemoteUrl: "Remote server URL is required",
  InvalidRemoteUrl: "Remote server URL must be http or https",
  MissingAuthToken: "Auth token is required for local server mode",
  MissingWorkspaceRoots: "Workspace roots are required for local server mode",
  InvalidServerPort: "Invalid desktop server port"
} as const;

export const ServerStartErrorCode = {
  EntryMissing: "server_entry_missing"
} as const;

export type ServerStartErrorCode =
  typeof ServerStartErrorCode[keyof typeof ServerStartErrorCode];
