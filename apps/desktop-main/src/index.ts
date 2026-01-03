import { ConfigErrorMessage, DesktopMode, UiMode } from "./constants";
import {
  resolveDesktopConfig,
  type LocalServerConfig,
  type LocalServerConfigInput
} from "./config";
import { err, ok, ResultType, type Result } from "./result";
import { createSecretStore, type SecretError, type SecretStore } from "./secrets";
import { startLocalServer } from "./server";

const run = async (): Promise<void> => {
  const config = resolveDesktopConfig(process.env, process.cwd());

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

  if (config.value.mode === DesktopMode.Local) {
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
  }
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

const exitWithError = (message: string): void => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

void run();
