import { ConfigErrorMessage, DesktopMode, EnvKey, UiMode } from "./constants";
import {
  resolveDesktopConfig,
  type LocalServerConfig,
  type LocalServerConfigInput,
  type RemoteDesktopConfig
} from "./config";
import { err, ok, ResultType, type Result } from "./result";
import {
  clearPersistedConfig,
  readPersistedConfig,
  resolveConfigPath,
  writePersistedConfig,
  type PersistedConfig,
  type PersistenceError
} from "./persistence";
import { createSecretStore, type SecretError, type SecretStore } from "./secrets";
import { startLocalServer } from "./server";

const run = async (): Promise<void> => {
  const configPath = resolveConfigPath(process.env);
  const disconnect = parseDisconnectFlag(process.env[EnvKey.RemoteDisconnect]);
  const persisted = loadPersistedConfig(configPath, disconnect);
  if (persisted.type === ResultType.Err) {
    exitWithError(persisted.error.message);
    return;
  }

  const envForConfig = buildEnvForConfig(process.env, persisted.value, disconnect);
  const config = resolveDesktopConfig(envForConfig, process.cwd());

  if (config.type === ResultType.Err) {
    exitWithError(config.error.message);
    return;
  }

  const secrets = createSecretStore();
  process.stdout.write(`Secrets provider: ${secrets.provider}\n`);

  if (config.value.ui.mode === UiMode.Dev) {
    process.stdout.write(`UI source: ${config.value.ui.url}\n`);
  } else {
    process.stdout.write(`UI source: ${config.value.ui.entryUrl}\n`);
  }

  if (config.value.mode === DesktopMode.Remote) {
    const persistedResult = persistRemoteConfig(
      config.value,
      configPath,
      disconnect
    );
    if (persistedResult.type === ResultType.Err) {
      exitWithError(persistedResult.error.message);
    }
    return;
  }

  const authToken = await resolveAuthToken(config.value.server.authToken, secrets);
  if (authToken.type === ResultType.Err) {
    exitWithError(authToken.error.message);
    return;
  }

  const serverConfig = buildLocalServerConfig(config.value.server, authToken.value);
  const server = startLocalServer(serverConfig);
  if (server.type === ResultType.Err) {
    exitWithError(server.error.message);
  }
};

const parseDisconnectFlag = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
};

const loadPersistedConfig = (
  filePath: string,
  disconnect: boolean
): Result<PersistedConfig, PersistenceError> => {
  if (disconnect) {
    const cleared = clearPersistedConfig(filePath);
    if (cleared.type === ResultType.Err) {
      return cleared;
    }
    return ok({});
  }
  return readPersistedConfig(filePath);
};

const buildEnvForConfig = (
  env: NodeJS.ProcessEnv,
  persisted: PersistedConfig,
  disconnect: boolean
): NodeJS.ProcessEnv => {
  const nextEnv: NodeJS.ProcessEnv = { ...env };
  if (disconnect) {
    delete nextEnv[EnvKey.RemoteUrl];
    return nextEnv;
  }

  const currentUrl = readOptional(nextEnv[EnvKey.RemoteUrl]);
  if (!currentUrl && persisted.remoteUrl) {
    nextEnv[EnvKey.RemoteUrl] = persisted.remoteUrl;
  }
  return nextEnv;
};

const persistRemoteConfig = (
  config: RemoteDesktopConfig,
  filePath: string,
  disconnect: boolean
): Result<void, PersistenceError> => {
  if (disconnect) {
    return ok(undefined);
  }
  if (!config.serverUrl) {
    return ok(undefined);
  }
  return writePersistedConfig(filePath, {
    remoteUrl: config.serverUrl
  });
};

const resolveAuthToken = async (
  provided: string | undefined,
  store: SecretStore
): Promise<Result<string, AuthTokenError | SecretError>> => {
  if (provided) {
    const saved = await store.setAuthToken(provided);
    if (saved.type === ResultType.Err) {
      return saved;
    }
    return ok(provided);
  }

  const stored = await store.getAuthToken();
  if (stored.type === ResultType.Err) {
    return stored;
  }
  if (stored.value) {
    return ok(stored.value);
  }
  return err({
    message: ConfigErrorMessage.MissingAuthToken
  });
};

const buildLocalServerConfig = (
  input: LocalServerConfigInput,
  authToken: string
): LocalServerConfig => ({
  entryPath: input.entryPath,
  host: input.host,
  port: input.port,
  authToken,
  workspaceRoots: input.workspaceRoots,
  commandAllowlist: input.commandAllowlist
});

type AuthTokenError = {
  message: string;
};

const readOptional = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const exitWithError = (message: string): void => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

void run();
