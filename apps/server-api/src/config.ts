import { DefaultServerConfig, EnvKey, ErrorMessage } from "./constants";

export type ServerConfig = {
  port: number;
  host: string;
  authToken: string;
};

export const loadConfig = (env: NodeJS.ProcessEnv): ServerConfig => {
  const port = parsePort(env[EnvKey.Port]);
  const host = env[EnvKey.Host] ?? DefaultServerConfig.Host;
  const authToken = env[EnvKey.AuthToken];

  if (!authToken || authToken.trim().length === 0) {
    throw new Error(ErrorMessage.AuthTokenMissing);
  }

  return {
    port,
    host,
    authToken
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
