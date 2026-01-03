import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPersistedConfig,
  readPersistedConfig,
  resolveConfigPath,
  writePersistedConfig
} from "./persistence";
import { EnvKey, PersistenceErrorCode } from "./constants";
import { ResultType } from "./result";

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "iteronix-desktop-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { force: true, recursive: true });
  }
  tempDirs.length = 0;
});

describe("resolveConfigPath", () => {
  it("uses explicit config path when set", () => {
    const dir = createTempDir();
    const path = join(dir, "custom.json");
    const env: NodeJS.ProcessEnv = {
      [EnvKey.ConfigPath]: path
    };

    const result = resolveConfigPath(env);

    expect(result).toBe(resolvePath(path));
  });
});

describe("readPersistedConfig", () => {
  it("returns empty config when file is missing", () => {
    const dir = createTempDir();
    const path = join(dir, "missing.json");

    const result = readPersistedConfig(path);

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.remoteUrl).toBeUndefined();
    }
  });

  it("returns error for invalid data", () => {
    const dir = createTempDir();
    const path = join(dir, "bad.json");
    writeFileSync(path, JSON.stringify({ remoteUrl: 42 }), "utf8");

    const result = readPersistedConfig(path);

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(PersistenceErrorCode.InvalidData);
    }
  });
});

describe("writePersistedConfig", () => {
  it("writes and reads persisted remote url", () => {
    const dir = createTempDir();
    const path = join(dir, "config.json");

    const saved = writePersistedConfig(path, { remoteUrl: "https://api.example.com" });
    expect(saved.type).toBe(ResultType.Ok);

    const loaded = readPersistedConfig(path);
    expect(loaded.type).toBe(ResultType.Ok);
    if (loaded.type === ResultType.Ok) {
      expect(loaded.value.remoteUrl).toBe("https://api.example.com");
    }
  });
});

describe("clearPersistedConfig", () => {
  it("clears persisted config", () => {
    const dir = createTempDir();
    const path = join(dir, "config.json");

    const saved = writePersistedConfig(path, { remoteUrl: "https://api.example.com" });
    expect(saved.type).toBe(ResultType.Ok);

    const cleared = clearPersistedConfig(path);
    expect(cleared.type).toBe(ResultType.Ok);

    const loaded = readPersistedConfig(path);
    expect(loaded.type).toBe(ResultType.Ok);
    if (loaded.type === ResultType.Ok) {
      expect(loaded.value.remoteUrl).toBeUndefined();
    }
  });
});
