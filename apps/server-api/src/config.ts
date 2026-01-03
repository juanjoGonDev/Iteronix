import { DefaultServerConfig, EnvKey, ErrorMessage } from "./constants";

export type ServerConfig = {
  port: number;
  host: string;
  authToken: string;
  workspaceRoots: ReadonlyArray<string>;
  commandAllowlist: ReadonlyArray<string>;
};

export const loadConfig = (env: NodeJS.ProcessEnv): ServerConfig => {
  const port = parsePort(env[EnvKey.Port]);
  const host = env[EnvKey.Host] ?? DefaultServerConfig.Host;
  const authToken = env[EnvKey.AuthToken];
  const workspaceRoots = parseAllowlist(env[EnvKey.WorkspaceRoots]);
  const commandAllowlist = parseAllowlist(env[EnvKey.CommandAllowlist]);

  if (!authToken || authToken.trim().length === 0) {
    throw new Error(ErrorMessage.AuthTokenMissing);
  }

  if (workspaceRoots.length === 0) {
    throw new Error(ErrorMessage.WorkspaceRootsMissing);
  }

  return {
    port,
    host,
    authToken,
    workspaceRoots,
    commandAllowlist
  };
};

const parsePort = (value: string | undefined): number => {
  if (value === undefined) {
    return DefaultServerConfig.Port;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${ErrorMessage.InvalidPort}: ${value}`);
  }

  return parsed;
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
