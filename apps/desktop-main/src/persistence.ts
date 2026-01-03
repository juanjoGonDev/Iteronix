import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";
import {
  DefaultPaths,
  EnvKey,
  PersistenceErrorCode,
  PersistenceErrorMessage
} from "./constants";
import { err, ok, type Result } from "./result";

export type PersistedConfig = {
  remoteUrl?: string;
};

export type PersistenceError = {
  code: PersistenceErrorCode;
  message: string;
};

export const resolveConfigPath = (env: NodeJS.ProcessEnv): string => {
  const explicit = readOptional(env[EnvKey.ConfigPath]);
  if (explicit) {
    return resolvePath(explicit);
  }
  const configDir = resolveDefaultConfigDir(env);
  return resolvePath(configDir, DefaultPaths.ConfigFileName);
};

export const readPersistedConfig = (
  filePath: string
): Result<PersistedConfig, PersistenceError> => {
  if (!existsSync(filePath)) {
    return ok({});
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    if (raw.trim().length === 0) {
      return err({
        code: PersistenceErrorCode.InvalidData,
        message: PersistenceErrorMessage.InvalidData
      });
    }
    const parsed: unknown = JSON.parse(raw);
    return parsePersistedConfig(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return err({
        code: PersistenceErrorCode.InvalidData,
        message: PersistenceErrorMessage.InvalidData
      });
    }
    return err({
      code: PersistenceErrorCode.ReadFailed,
      message: PersistenceErrorMessage.ReadFailed
    });
  }
};

export const writePersistedConfig = (
  filePath: string,
  config: PersistedConfig
): Result<void, PersistenceError> => {
  try {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
    return ok(undefined);
  } catch {
    return err({
      code: PersistenceErrorCode.WriteFailed,
      message: PersistenceErrorMessage.WriteFailed
    });
  }
};

export const clearPersistedConfig = (
  filePath: string
): Result<void, PersistenceError> => {
  if (!existsSync(filePath)) {
    return ok(undefined);
  }
  try {
    unlinkSync(filePath);
    return ok(undefined);
  } catch {
    return err({
      code: PersistenceErrorCode.DeleteFailed,
      message: PersistenceErrorMessage.DeleteFailed
    });
  }
};

const resolveDefaultConfigDir = (env: NodeJS.ProcessEnv): string => {
  const appData = readOptional(env["APPDATA"]);
  if (appData) {
    return resolvePath(appData, DefaultPaths.ConfigDirName);
  }

  const xdg = readOptional(env["XDG_CONFIG_HOME"]);
  if (xdg) {
    return resolvePath(xdg, DefaultPaths.ConfigDirName);
  }

  if (process.platform === "darwin") {
    return resolvePath(
      homedir(),
      "Library",
      "Application Support",
      DefaultPaths.ConfigDirName
    );
  }

  const home = readOptional(env["HOME"]) ?? homedir();
  return resolvePath(home, ".config", DefaultPaths.ConfigDirName);
};

const parsePersistedConfig = (
  value: unknown
): Result<PersistedConfig, PersistenceError> => {
  if (!isRecord(value)) {
    return err({
      code: PersistenceErrorCode.InvalidData,
      message: PersistenceErrorMessage.InvalidData
    });
  }

  const remoteValue = value["remoteUrl"];
  if (remoteValue === undefined) {
    return ok({});
  }
  if (typeof remoteValue !== "string") {
    return err({
      code: PersistenceErrorCode.InvalidData,
      message: PersistenceErrorMessage.InvalidData
    });
  }
  const trimmed = remoteValue.trim();
  if (trimmed.length === 0) {
    return ok({});
  }
  return ok({
    remoteUrl: trimmed
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readOptional = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
