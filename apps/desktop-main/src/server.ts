import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { ServerEnvKey, ServerStartErrorCode } from "./constants";
import { err, ok, type Result } from "./result";
import type { LocalServerConfig } from "./config";

export type LocalServerHandle = {
  process: ChildProcess;
  stop: () => void;
};

export type ServerStartError = {
  code: ServerStartErrorCode;
  message: string;
};

export const startLocalServer = (
  config: LocalServerConfig
): Result<LocalServerHandle, ServerStartError> => {
  if (!existsSync(config.entryPath)) {
    return err({
      code: ServerStartErrorCode.EntryMissing,
      message: `Server entry not found: ${config.entryPath}`
    });
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [ServerEnvKey.Port]: String(config.port),
    [ServerEnvKey.Host]: config.host,
    [ServerEnvKey.AuthToken]: config.authToken,
    [ServerEnvKey.WorkspaceRoots]: config.workspaceRoots.join(";")
  };

  if (config.commandAllowlist.length > 0) {
    env[ServerEnvKey.CommandAllowlist] = config.commandAllowlist.join(";");
  }

  const child = spawn(process.execPath, [config.entryPath], {
    env,
    stdio: "inherit"
  });

  return ok({
    process: child,
    stop: () => {
      if (!child.killed) {
        child.kill();
      }
    }
  });
};
