import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ErrorMessage, HttpStatus } from "./constants";
import { ResultType } from "./result";
import { createCommandPolicy, createWorkspacePolicy } from "./sandbox";

const RootName = "workspace-root";
const ChildName = "child";
const OtherRootName = "other-root";
const AllowedCommand = "git";
const BlockedCommand = "npm";

describe("workspace policy", () => {
  it("allows paths within the allowlist", () => {
    const root = resolve(RootName);
    const policy = createWorkspacePolicy([root]);
    const result = policy.assertPathAllowed(resolve(root, ChildName));

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value).toBe(resolve(root, ChildName));
    }
  });

  it("rejects paths outside the allowlist", () => {
    const root = resolve(RootName);
    const policy = createWorkspacePolicy([root]);
    const result = policy.assertPathAllowed(resolve(OtherRootName));

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.status).toBe(HttpStatus.Forbidden);
      expect(result.error.message).toBe(ErrorMessage.WorkspaceNotAllowed);
    }
  });
});

describe("command policy", () => {
  it("allows an allowlisted command within the root", () => {
    const root = resolve(RootName);
    const workspacePolicy = createWorkspacePolicy([root]);
    const commandPolicy = createCommandPolicy([AllowedCommand], workspacePolicy);
    const result = commandPolicy.assertCommandAllowed({
      command: AllowedCommand,
      rootPath: root,
      cwd: resolve(root, ChildName)
    });

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.command).toBe(AllowedCommand);
    }
  });

  it("rejects a non-allowlisted command", () => {
    const root = resolve(RootName);
    const workspacePolicy = createWorkspacePolicy([root]);
    const commandPolicy = createCommandPolicy([AllowedCommand], workspacePolicy);
    const result = commandPolicy.assertCommandAllowed({
      command: BlockedCommand,
      rootPath: root
    });

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.status).toBe(HttpStatus.Forbidden);
      expect(result.error.message).toBe(ErrorMessage.CommandNotAllowed);
    }
  });

  it("rejects commands outside the allowed root", () => {
    const root = resolve(RootName);
    const workspacePolicy = createWorkspacePolicy([root]);
    const commandPolicy = createCommandPolicy([AllowedCommand], workspacePolicy);
    const result = commandPolicy.assertCommandAllowed({
      command: AllowedCommand,
      rootPath: root,
      cwd: resolve(OtherRootName)
    });

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.status).toBe(HttpStatus.Forbidden);
      expect(result.error.message).toBe(ErrorMessage.WorkspaceNotAllowed);
    }
  });
});
