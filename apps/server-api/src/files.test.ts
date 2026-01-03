import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSandboxPath } from "./files";
import { ResultType } from "./result";

describe("resolveSandboxPath", () => {
  it("resolves a child path within the root", () => {
    const root = resolve("workspace-root");
    const result = resolveSandboxPath(root, "src/index.ts");

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.root).toBe(root);
      expect(result.value.target).toBe(resolve(root, "src/index.ts"));
    }
  });

  it("rejects a path outside the root", () => {
    const root = resolve("workspace-root");
    const result = resolveSandboxPath(root, "..");

    expect(result.type).toBe(ResultType.Err);
  });

  it("accepts the root when no target is provided", () => {
    const root = resolve("workspace-root");
    const result = resolveSandboxPath(root, undefined);

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.target).toBe(root);
    }
  });
});
