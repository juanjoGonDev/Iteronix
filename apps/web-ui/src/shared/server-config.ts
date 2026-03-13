export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const LocalStorageKey = {
  ServerUrl: "iteronix_server_url",
  AuthToken: "iteronix_auth_token",
  WorkbenchHistory: "iteronix_workbench_history"
} as const;

export const DefaultServerConnection = {
  serverUrl: "http://localhost:4000",
  authToken: "dev-token"
} as const;

export type ServerConnection = {
  serverUrl: string;
  authToken: string;
};

export const readServerConnection = (
  storage: StorageLike = window.localStorage
): ServerConnection => {
  const serverUrl = storage.getItem(LocalStorageKey.ServerUrl);
  const authToken = storage.getItem(LocalStorageKey.AuthToken);

  return {
    serverUrl: normalizeServerUrl(serverUrl),
    authToken: normalizeAuthToken(authToken)
  };
};

export const writeServerConnection = (
  connection: ServerConnection,
  storage: StorageLike = window.localStorage
): ServerConnection => {
  const normalized = {
    serverUrl: normalizeServerUrl(connection.serverUrl),
    authToken: normalizeAuthToken(connection.authToken)
  };

  storage.setItem(LocalStorageKey.ServerUrl, normalized.serverUrl);
  storage.setItem(LocalStorageKey.AuthToken, normalized.authToken);

  return normalized;
};

const normalizeServerUrl = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DefaultServerConnection.serverUrl;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const normalizeAuthToken = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : DefaultServerConnection.authToken;
};
