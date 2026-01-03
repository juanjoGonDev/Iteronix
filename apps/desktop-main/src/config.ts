import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ConfigErrorCode,
  ConfigErrorMessage,
  DefaultPaths,
  DefaultServer,
  DesktopMode,
  EnvKey,
  DefaultUi,
  UiMode
} from "./constants";
import { err, ok, ResultType, type Result } from "./result";

export type ConfigError = {
  code: ConfigErrorCode;
  message: string;
};

export type LocalServerConfig = {
  entryPath: string;
  host: string;
  port: number;
  authToken: string;
  workspaceRoots: ReadonlyArray<string>;
  commandAllowlist: ReadonlyArray<string>;
};

export type UiSource =
  | { mode: typeof UiMode.Dev; url: string }
  | {
      mode: typeof UiMode.Prod;
      entryPath: string;
      entryUrl: string;
      assetsPath: string;
    };

type LocalConfigBase = {
  mode: typeof DesktopMode.Local;
  serverUrl: string;
  server: LocalServerConfig;
};

type RemoteConfigBase = {
  mode: typeof DesktopMode.Remote;
  serverUrl: string;
  authToken?: string;
};

export type LocalDesktopConfig = LocalConfigBase & { ui: UiSource };

export type RemoteDesktopConfig = RemoteConfigBase & { ui: UiSource };

export type DesktopConfig = LocalDesktopConfig | RemoteDesktopConfig;

export const resolveDesktopConfig = (
  env: NodeJS.ProcessEnv,
  cwd: string
): Result<DesktopConfig, ConfigError> => {
  const mode = parseMode(env[EnvKey.Mode]);
  if (mode.type === ResultType.Err) {
    return mode;
  }

  const uiSource = resolveUiSource(env, cwd);
  if (uiSource.type === ResultType.Err) {
    return uiSource;
  }

  if (mode.value === DesktopMode.Remote) {
    const remote = resolveRemoteConfig(env);
    if (remote.type === ResultType.Err) {
      return remote;
    }
    return ok({
      ...remote.value,
      ui: uiSource.value
    });
  }

  const local = resolveLocalConfig(env, cwd);
  if (local.type === ResultType.Err) {
    return local;
  }
  return ok({
    ...local.value,
    ui: uiSource.value
  });
};

const parseMode = (value: string | undefined): Result<DesktopMode, ConfigError> => {
  if (!value) {
    return ok(DesktopMode.Local);
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === DesktopMode.Local || normalized === DesktopMode.Remote) {
    return ok(normalized);
  }
  return err({
    code: ConfigErrorCode.InvalidMode,
    message: `${ConfigErrorMessage.InvalidMode}: ${value}`
  });
};

const resolveUiSource = (
  env: NodeJS.ProcessEnv,
  cwd: string
): Result<UiSource, ConfigError> => {
  const mode = resolveUiMode(env);
  if (mode.type === ResultType.Err) {
    return mode;
  }

  if (mode.value === UiMode.Dev) {
    const urlValue = readOptional(env[EnvKey.UiDevUrl]) ?? DefaultUi.DevUrl;
    const normalized = normalizeUiUrl(urlValue);
    if (normalized.type === ResultType.Err) {
      return normalized;
    }
    return ok({
      mode: UiMode.Dev,
      url: normalized.value
    });
  }

  const entryPath = resolvePath(
    cwd,
    readOptional(env[EnvKey.UiProdIndex]) ?? DefaultUi.ProdIndex
  );
  const assetsPath = resolvePath(
    cwd,
    readOptional(env[EnvKey.UiProdAssets]) ?? DefaultUi.ProdAssets
  );
  const entryUrl = pathToFileURL(entryPath).toString();
  return ok({
    mode: UiMode.Prod,
    entryPath,
    entryUrl,
    assetsPath
  });
};

const resolveUiMode = (env: NodeJS.ProcessEnv): Result<UiMode, ConfigError> => {
  const explicit = readOptional(env[EnvKey.UiMode]);
  if (explicit) {
    const normalized = explicit.toLowerCase();
    if (normalized === UiMode.Dev || normalized === UiMode.Prod) {
      return ok(normalized);
    }
    return err({
      code: ConfigErrorCode.InvalidUiMode,
      message: `${ConfigErrorMessage.InvalidUiMode}: ${explicit}`
    });
  }

  const nodeEnv = readOptional(env["NODE_ENV"]);
  if (nodeEnv && nodeEnv.toLowerCase() === "development") {
    return ok(UiMode.Dev);
  }

  return ok(DefaultUi.Mode);
};

const resolveRemoteConfig = (
  env: NodeJS.ProcessEnv
): Result<RemoteConfigBase, ConfigError> => {
  const urlValue = env[EnvKey.RemoteUrl];
  if (!urlValue || urlValue.trim().length === 0) {
    return err({
      code: ConfigErrorCode.MissingRemoteUrl,
      message: ConfigErrorMessage.MissingRemoteUrl
    });
  }

  const normalizedUrl = normalizeUrl(urlValue);
  if (normalizedUrl.type === ResultType.Err) {
    return normalizedUrl;
  }

  const authToken = readOptional(env[EnvKey.AuthToken]);
  const base: RemoteConfigBase = {
    mode: DesktopMode.Remote,
    serverUrl: normalizedUrl.value
  };

  if (authToken) {
    return ok({
      ...base,
      authToken
    });
  }

  return ok(base);
};

const resolveLocalConfig = (
  env: NodeJS.ProcessEnv,
  cwd: string
): Result<LocalConfigBase, ConfigError> => {
  const authToken = readRequiredAuthToken(env);
  if (authToken.type === ResultType.Err) {
    return authToken;
  }

  const workspaceRoots = readRequiredWorkspaceRoots(env);
  if (workspaceRoots.type === ResultType.Err) {
    return workspaceRoots;
  }

  const port = parsePort(env[EnvKey.ServerPort], DefaultServer.Port);
  if (port.type === ResultType.Err) {
    return port;
  }

  const host = readOptional(env[EnvKey.ServerHost]) ?? DefaultServer.Host;
  const commandAllowlist = parseAllowlist(env[EnvKey.CommandAllowlist]);
  const entryPath = resolveEntryPath(env[EnvKey.ServerEntry], cwd);
  const serverUrl = buildServerUrl(host, port.value);

  return ok({
    mode: DesktopMode.Local,
    serverUrl,
    server: {
      entryPath,
      host,
      port: port.value,
      authToken: authToken.value,
      workspaceRoots: workspaceRoots.value,
      commandAllowlist
    }
  });
};

const parsePort = (
  value: string | undefined,
  fallback: number
): Result<number, ConfigError> => {
  if (!value) {
    return ok(fallback);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return err({
      code: ConfigErrorCode.InvalidServerPort,
      message: `${ConfigErrorMessage.InvalidServerPort}: ${value}`
    });
  }
  return ok(parsed);
};

const readRequiredAuthToken = (env: NodeJS.ProcessEnv): Result<string, ConfigError> => {
  const token = readOptional(env[EnvKey.AuthToken]);
  if (!token) {
    return err({
      code: ConfigErrorCode.MissingAuthToken,
      message: ConfigErrorMessage.MissingAuthToken
    });
  }
  return ok(token);
};

const readRequiredWorkspaceRoots = (
  env: NodeJS.ProcessEnv
): Result<ReadonlyArray<string>, ConfigError> => {
  const roots = parseAllowlist(env[EnvKey.WorkspaceRoots]);
  if (roots.length === 0) {
    return err({
      code: ConfigErrorCode.MissingWorkspaceRoots,
      message: ConfigErrorMessage.MissingWorkspaceRoots
    });
  }
  return ok(roots);
};

const parseAllowlist = (value: string | undefined): ReadonlyArray<string> => {
  if (!value) {
    return [];
  }
  const entries = value.split(/[;,]/);
  const normalized: string[] = [];
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      normalized.push(trimmed);
    }
  }
  return normalized;
};

const resolveEntryPath = (value: string | undefined, cwd: string): string => {
  const raw = readOptional(value) ?? DefaultPaths.ServerEntry;
  return resolvePath(cwd, raw);
};

const readOptional = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildServerUrl = (host: string, port: number): string => {
  const url = new URL(`http://${host}`);
  url.port = String(port);
  return trimTrailingSlash(url.toString());
};

const normalizeUrl = (value: string): Result<string, ConfigError> => {
  try {
    const parsed = new URL(value.trim());
    if (!isAllowedProtocol(parsed.protocol)) {
      return err({
        code: ConfigErrorCode.InvalidRemoteUrl,
        message: ConfigErrorMessage.InvalidRemoteUrl
      });
    }
    return ok(trimTrailingSlash(parsed.toString()));
  } catch {
    return err({
      code: ConfigErrorCode.InvalidRemoteUrl,
      message: ConfigErrorMessage.InvalidRemoteUrl
    });
  }
};

const normalizeUiUrl = (value: string): Result<string, ConfigError> => {
  try {
    const parsed = new URL(value.trim());
    if (!isAllowedProtocol(parsed.protocol)) {
      return err({
        code: ConfigErrorCode.InvalidUiDevUrl,
        message: ConfigErrorMessage.InvalidUiDevUrl
      });
    }
    return ok(trimTrailingSlash(parsed.toString()));
  } catch {
    return err({
      code: ConfigErrorCode.InvalidUiDevUrl,
      message: ConfigErrorMessage.InvalidUiDevUrl
    });
  }
};

const isAllowedProtocol = (protocol: string): boolean =>
  protocol === "http:" || protocol === "https:";

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;
