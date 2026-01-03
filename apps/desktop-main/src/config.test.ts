import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDesktopConfig } from "./config";
import {
  ConfigErrorCode,
  DefaultPaths,
  DefaultServer,
  DesktopMode,
  EnvKey
} from "./constants";
import { ResultType } from "./result";

describe("resolveDesktopConfig", () => {
  it("defaults to local mode when unset", () => {
    const cwd = process.cwd();
    const env: NodeJS.ProcessEnv = {
      [EnvKey.AuthToken]: "token",
      [EnvKey.WorkspaceRoots]: "C:\\repo;D:\\work"
    };

    const result = resolveDesktopConfig(env, cwd);

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok && result.value.mode === DesktopMode.Local) {
      expect(result.value.serverUrl).toBe(`http://${DefaultServer.Host}:${DefaultServer.Port}`);
      expect(result.value.server.entryPath).toBe(
        resolvePath(cwd, DefaultPaths.ServerEntry)
      );
      expect(result.value.server.workspaceRoots).toEqual(["C:\\repo", "D:\\work"]);
    }
  });

  it("rejects unknown mode", () => {
    const cwd = process.cwd();
    const env: NodeJS.ProcessEnv = {
      [EnvKey.Mode]: "invalid"
    };

    const result = resolveDesktopConfig(env, cwd);

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(ConfigErrorCode.InvalidMode);
    }
  });

  it("accepts remote mode with url", () => {
    const cwd = process.cwd();
    const env: NodeJS.ProcessEnv = {
      [EnvKey.Mode]: DesktopMode.Remote,
      [EnvKey.RemoteUrl]: "https://api.example.com/"
    };

    const result = resolveDesktopConfig(env, cwd);

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok && result.value.mode === DesktopMode.Remote) {
      expect(result.value.serverUrl).toBe("https://api.example.com");
    }
  });
});
