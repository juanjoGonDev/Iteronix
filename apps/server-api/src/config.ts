import { DefaultServerConfig, EnvKey, ErrorMessage } from "./constants";

export type ServerConfig = {
  port: number;
  host: string;
  authToken: string;
  databaseUrl: string;
};

export const loadConfig = (env: NodeJS.ProcessEnv): ServerConfig => {
  const port = parsePort(env[EnvKey.Port]);
  const host = env[EnvKey.Host] ?? DefaultServerConfig.Host;
  const authToken = env[EnvKey.AuthToken];
  const databaseUrl = env[EnvKey.DatabaseUrl];

  if (!authToken || authToken.trim().length === 0) {
    throw new Error(ErrorMessage.AuthTokenMissing);
  }

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error(ErrorMessage.DatabaseUrlMissing);
  }

  if (!isPostgresUrl(databaseUrl)) {
    throw new Error(ErrorMessage.DatabaseUrlInvalid);
  }

  return {
    port,
    host,
    authToken,
    databaseUrl,
  };
};

const isPostgresUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
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
