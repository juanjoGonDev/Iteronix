import { DefaultServerConfig, EnvKey, ErrorMessage } from "./constants";
import type { McpServerConfiguration } from "./mcp-connection-port";

export type ServerConfig = {
  port: number;
  host: string;
  authToken: string;
  databaseUrl: string;
  mcpServers?: ReadonlyArray<McpServerConfiguration>;
};

export const loadConfig = (env: NodeJS.ProcessEnv): ServerConfig => {
  const port = parsePort(env[EnvKey.Port]);
  const host = env[EnvKey.Host] ?? DefaultServerConfig.Host;
  const authToken = env[EnvKey.AuthToken];
  const databaseUrl = env[EnvKey.DatabaseUrl];
  const mcpServers = parseMcpServers(env[EnvKey.McpServers]);

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
    mcpServers,
  };
};

const parseMcpServers = (
  value: string | undefined,
): ReadonlyArray<McpServerConfiguration> => {
  if (!value || value.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("MCP_SERVERS must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("MCP_SERVERS must be an array.");
  }
  const servers = parsed.map(readMcpServerConfiguration);
  if (
    new Set(servers.map((server) => server.serverId)).size !== servers.length
  ) {
    throw new Error("MCP_SERVERS must not contain duplicate server ids.");
  }
  return servers;
};

const readMcpServerConfiguration = (value: unknown): McpServerConfiguration => {
  if (!isRecord(value)) {
    throw new Error("MCP_SERVERS entries are invalid.");
  }
  const serverId = value["serverId"];
  const endpoint = value["endpoint"];
  const token = value["token"];
  const allowedToolIds = value["allowedToolIds"];
  if (
    typeof serverId !== "string" ||
    serverId.trim().length === 0 ||
    typeof endpoint !== "string" ||
    !isMcpEndpoint(endpoint) ||
    typeof token !== "string" ||
    token.trim().length === 0 ||
    !isAllowedToolIds(allowedToolIds)
  ) {
    throw new Error("MCP_SERVERS entries are invalid.");
  }
  return { serverId, endpoint, token, allowedToolIds };
};

const isPostgresUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
};

const isMcpEndpoint = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && isLoopbackHost(url.hostname))
    );
  } catch {
    return false;
  }
};

const isLoopbackHost = (value: string): boolean =>
  value === "localhost" || value === "127.0.0.1" || value === "[::1]";

const isAllowedToolIds = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (toolId) => typeof toolId === "string" && toolId.trim().length > 0,
  ) &&
  new Set(value).size === value.length;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
