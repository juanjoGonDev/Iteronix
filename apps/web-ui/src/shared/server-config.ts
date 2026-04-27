export type StorageLike = Pick<Storage, "getItem" | "setItem">;

type LocationLike = Pick<Location, "origin">;

const RuntimeHost = {
  Localhost: "localhost",
  Loopback: "127.0.0.1"
} as const;

const RuntimePort = {
  ApiDefault: 4000,
  ApiDev: 4001,
  WebUiDev: 4000
} as const;

export const LocalStorageKey = {
  ServerUrl: "iteronix_server_url",
  AuthToken: "iteronix_auth_token",
  WorkbenchHistory: "iteronix_workbench_history"
} as const;

export const DefaultServerConnection = {
  serverUrl: `http://${RuntimeHost.Localhost}:${RuntimePort.ApiDefault}`,
  authToken: "dev-token"
} as const;

export type ServerConnection = {
  serverUrl: string;
  authToken: string;
};

export const readServerConnection = (
  storage: StorageLike = window.localStorage,
  location: LocationLike | undefined = window.location
): ServerConnection => {
  const serverUrl = storage.getItem(LocalStorageKey.ServerUrl);
  const authToken = storage.getItem(LocalStorageKey.AuthToken);

  return {
    serverUrl: normalizeServerUrl(serverUrl, location),
    authToken: normalizeAuthToken(authToken)
  };
};

export const writeServerConnection = (
  connection: ServerConnection,
  storage: StorageLike = window.localStorage
): ServerConnection => {
  const normalized = {
    serverUrl: normalizeServerUrl(connection.serverUrl, window.location),
    authToken: normalizeAuthToken(connection.authToken)
  };

  storage.setItem(LocalStorageKey.ServerUrl, normalized.serverUrl);
  storage.setItem(LocalStorageKey.AuthToken, normalized.authToken);

  return normalized;
};

const normalizeServerUrl = (
  value: string | null | undefined,
  location: LocationLike | undefined
): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return readDefaultServerUrl(location);
  }

  const normalized = trimTrailingSlash(trimmed);
  const localDevOrigin = readLocalDevApiOrigin(location);
  if (
    localDevOrigin &&
    shouldUseLocalDevApiOrigin(normalized, location, localDevOrigin)
  ) {
    return localDevOrigin;
  }

  return normalized;
};

const normalizeAuthToken = (value: string | null | undefined): string => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : DefaultServerConnection.authToken;
};

const readDefaultServerUrl = (location: LocationLike | undefined): string => {
  const localDevOrigin = readLocalDevApiOrigin(location);
  if (localDevOrigin) {
    return localDevOrigin;
  }

  return location ? trimTrailingSlash(location.origin) : DefaultServerConnection.serverUrl;
};

const shouldUseLocalDevApiOrigin = (
  serverUrl: string,
  location: LocationLike | undefined,
  localDevOrigin: string | undefined
): boolean =>
  location !== undefined &&
  serverUrl === trimTrailingSlash(location.origin) &&
  localDevOrigin !== undefined;

const readLocalDevApiOrigin = (
  location: LocationLike | undefined
): string | undefined => {
  if (!location) {
    return undefined;
  }

  try {
    const url = new URL(location.origin);
    const isLocalHost =
      url.hostname === RuntimeHost.Localhost ||
      url.hostname === RuntimeHost.Loopback;

    if (!isLocalHost || url.port !== String(RuntimePort.WebUiDev)) {
      return undefined;
    }

    url.port = String(RuntimePort.ApiDev);
    return trimTrailingSlash(url.origin);
  } catch {
    return undefined;
  }
};

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;
