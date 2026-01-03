import { resolve as resolvePath } from "node:path";
import {
  ConfigErrorCode,
  ConfigErrorMessage,
  DefaultPaths,
  DefaultServer,
  DesktopMode,
  EnvKey
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

export type LocalDesktopConfig = {
  mode: typeof DesktopMode.Local;
  serverUrl: string;
  server: LocalServerConfig;
};

export type RemoteDesktopConfig = {
  mode: typeof DesktopMode.Remote;
  serverUrl: string;
  authToken?: string;
};

export type DesktopConfig = LocalDesktopConfig | RemoteDesktopConfig;

export const resolveDesktopConfig = (
  env: NodeJS.ProcessEnv,
  cwd: string
): Result<DesktopConfig, ConfigError> => {
  const mode = parseMode(env[EnvKey.Mode]);
  if (mode.type === ResultType.Err) {
    return mode;
  }

  if (mode.value === DesktopMode.Remote) {
    return resolveRemoteConfig(env);
  }

  return resolveLocalConfig(env, cwd);
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

const resolveRemoteConfig = (
  env: NodeJS.ProcessEnv
): Result<RemoteDesktopConfig, ConfigError> => {
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
  const base: RemoteDesktopConfig = {
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
): Result<LocalDesktopConfig, ConfigError> => {
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

const isAllowedProtocol = (protocol: string): boolean =>
  protocol === "http:" || protocol === "https:";

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;
