import { DefaultServerConfig, EnvKey, ErrorMessage } from "./constants";
import type { McpServerConfiguration } from "./mcp-connection-port";

export type ServerAdminCredentials = {
  email: string;
  password: string;
};

export type ServerConfig = {
  port: number;
  host: string;
  /**
   * Optional shared bearer token. The browser UI never sends it: it authenticates
   * with its IDE session cookie, so internal routes are usable without a token.
   * When set, callers may still authenticate with `Authorization: Bearer <token>`.
   */
  authToken?: string;
  databaseUrl: string;
  mcpServers?: ReadonlyArray<McpServerConfiguration>;
  /** Administrator account maintained from the environment at startup. */
  admin?: ServerAdminCredentials;
  /** Browser origins allowed to carry an IDE session for internal API routes. */
  ideUiOrigins?: ReadonlyArray<string>;
  /**
   * Additional plugin registry keys the server trusts for registration. The
   * built-in reference plugin is always trusted; these keys only extend the
   * allowlist so operators can register process-isolated plugins without code
   * changes. The browser may never widen this set.
   */
  trustedPluginIds?: ReadonlyArray<string>;
};

export const loadConfig = (env: NodeJS.ProcessEnv): ServerConfig => {
  const port = parsePort(env[EnvKey.Port]);
  const host = env[EnvKey.Host] ?? DefaultServerConfig.Host;
  const authToken = readOptionalValue(env[EnvKey.AuthToken]);
  const databaseUrl = env[EnvKey.DatabaseUrl];
  const mcpServers = parseMcpServers(env[EnvKey.McpServers]);

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error(ErrorMessage.DatabaseUrlMissing);
  }

  if (!isPostgresUrl(databaseUrl)) {
    throw new Error(ErrorMessage.DatabaseUrlInvalid);
  }

  return {
    port,
    host,
    ...(authToken ? { authToken } : {}),
    databaseUrl,
    mcpServers,
    admin: parseAdminCredentials(env),
    ideUiOrigins: parseIdeUiOrigins(env, port),
    trustedPluginIds: parseTrustedPluginIds(env),
  };
};

export const readTrustedPluginIds = (
  config: ServerConfig,
): ReadonlyArray<string> => [
  ...new Set([ReferencePluginKey, ...(config.trustedPluginIds ?? [])]),
];

export const ReferencePluginKey = "reference.echo";
const TrustedPluginKeyPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const parseTrustedPluginIds = (
  env: NodeJS.ProcessEnv,
): ReadonlyArray<string> => {
  const configured = (env[EnvKey.TrustedPluginIds] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const invalid = configured.filter(
    (entry) => !TrustedPluginKeyPattern.test(entry),
  );
  if (invalid.length > 0) {
    throw new Error(
      `${EnvKey.TrustedPluginIds} contains invalid plugin keys: ${invalid.join(", ")}. Use dot-separated lowercase alphanumeric segments.`,
    );
  }
  return [...new Set(configured)];
};

export const readAdminCredentials = (
  config: ServerConfig,
): ServerAdminCredentials =>
  config.admin ?? {
    email: DefaultServerConfig.AdminEmail,
    password: DefaultServerConfig.AdminPassword,
  };

export const readIdeUiOrigins = (config: ServerConfig): ReadonlyArray<string> =>
  config.ideUiOrigins ?? DefaultServerConfig.IdeUiOrigins;

const parseAdminCredentials = (
  env: NodeJS.ProcessEnv,
): ServerAdminCredentials => ({
  email:
    readOptionalValue(env[EnvKey.AdminEmail]) ?? DefaultServerConfig.AdminEmail,
  password:
    readOptionalValue(env[EnvKey.AdminPassword]) ??
    DefaultServerConfig.AdminPassword,
});

const parseIdeUiOrigins = (
  env: NodeJS.ProcessEnv,
  port: number,
): ReadonlyArray<string> => {
  const configured = (env[EnvKey.IdeUiOrigins] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return configured.length > 0
    ? configured
    : [
        ...new Set([
          ...DefaultServerConfig.IdeUiOrigins,
          ...loopbackOrigins(port),
        ]),
      ];
};

const loopbackOrigins = (port: number): ReadonlyArray<string> => [
  `http://localhost:${port.toString()}`,
  `http://127.0.0.1:${port.toString()}`,
];

const readOptionalValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
