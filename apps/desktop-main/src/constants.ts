export const DesktopMode = {
  Local: "local",
  Remote: "remote"
} as const;

export type DesktopMode = typeof DesktopMode[keyof typeof DesktopMode];

export const UiMode = {
  Dev: "dev",
  Prod: "prod"
} as const;

export type UiMode = typeof UiMode[keyof typeof UiMode];

export const EnvKey = {
  Mode: "ITERONIX_DESKTOP_MODE",
  RemoteUrl: "ITERONIX_DESKTOP_REMOTE_URL",
  AuthToken: "ITERONIX_DESKTOP_AUTH_TOKEN",
  WorkspaceRoots: "ITERONIX_DESKTOP_WORKSPACE_ROOTS",
  CommandAllowlist: "ITERONIX_DESKTOP_COMMAND_ALLOWLIST",
  ServerPort: "ITERONIX_DESKTOP_SERVER_PORT",
  ServerHost: "ITERONIX_DESKTOP_SERVER_HOST",
  ServerEntry: "ITERONIX_DESKTOP_SERVER_ENTRY",
  UiMode: "ITERONIX_DESKTOP_UI_MODE",
  UiDevUrl: "ITERONIX_DESKTOP_UI_DEV_URL",
  UiProdIndex: "ITERONIX_DESKTOP_UI_INDEX",
  UiProdAssets: "ITERONIX_DESKTOP_UI_DIST"
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

export const DefaultUi = {
  Mode: UiMode.Prod,
  DevUrl: "http://localhost:5173",
  ProdIndex: "apps/web-ui/index.html",
  ProdAssets: "apps/web-ui/dist"
} as const;

export const SecretService = "iteronix.desktop";

export const SecretKey = {
  AuthToken: "auth_token"
} as const;

export type SecretKey = typeof SecretKey[keyof typeof SecretKey];

export const SecretProviderType = {
  Keychain: "keychain",
  Memory: "memory"
} as const;

export type SecretProviderType =
  typeof SecretProviderType[keyof typeof SecretProviderType];

export const ConfigErrorCode = {
  InvalidMode: "invalid_mode",
  MissingRemoteUrl: "missing_remote_url",
  InvalidRemoteUrl: "invalid_remote_url",
  MissingAuthToken: "missing_auth_token",
  MissingWorkspaceRoots: "missing_workspace_roots",
  InvalidServerPort: "invalid_server_port",
  InvalidUiMode: "invalid_ui_mode",
  InvalidUiDevUrl: "invalid_ui_dev_url"
} as const;

export type ConfigErrorCode = typeof ConfigErrorCode[keyof typeof ConfigErrorCode];

export const ConfigErrorMessage = {
  InvalidMode: "Invalid desktop mode",
  MissingRemoteUrl: "Remote server URL is required",
  InvalidRemoteUrl: "Remote server URL must be http or https",
  MissingAuthToken: "Auth token is required for local server mode",
  MissingWorkspaceRoots: "Workspace roots are required for local server mode",
  InvalidServerPort: "Invalid desktop server port",
  InvalidUiMode: "Invalid UI mode",
  InvalidUiDevUrl: "Invalid UI dev server URL"
} as const;

export const SecretErrorCode = {
  Unavailable: "secret_unavailable",
  OperationFailed: "secret_operation_failed",
  InvalidToken: "invalid_token"
} as const;

export type SecretErrorCode =
  typeof SecretErrorCode[keyof typeof SecretErrorCode];

export const SecretErrorMessage = {
  Unavailable: "Secret provider unavailable",
  OperationFailed: "Secret operation failed",
  InvalidToken: "Invalid token"
} as const;

export const ServerStartErrorCode = {
  EntryMissing: "server_entry_missing"
} as const;

export type ServerStartErrorCode =
  typeof ServerStartErrorCode[keyof typeof ServerStartErrorCode];
