import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createGitCliAdapter, GitCommandName } from "../../../packages/adapters/src/git/git-adapter";
import { ErrorMessage, HttpStatus } from "./constants";
import {
  executeGitPathOperation,
  executeGitCommit,
  executeGitDiff,
  executeGitStatus,
  parseGitCommitRequest,
  parseGitPathRequest
} from "./git";
import { createProjectStore } from "./projects";
import { ResultType } from "./result";
import { createCommandPolicy, createWorkspacePolicy } from "./sandbox";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (path) => {
      await rm(path, {
        recursive: true,
        force: true
      });
    })
  );
});

describe("git api", () => {
  it("returns repository status and staged diff for an opened project", async () => {
    const repo = await createTempGitRepository();
    const store = createProjectStore();
    const opened = store.open({
      rootPath: repo.path
    });

    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    await writeFile(join(repo.path, "tracked.txt"), "changed\n", "utf8");
    await writeFile(join(repo.path, "staged.txt"), "staged\n", "utf8");
    runGit(repo.path, ["add", "staged.txt"]);

    const workspacePolicy = createWorkspacePolicy([repo.workspaceRoot]);
    const commandPolicy = createCommandPolicy([GitCommandName], workspacePolicy);
    const adapter = createGitCliAdapter();

    const status = await executeGitStatus(
      {
        projectId: opened.value.id
      },
      {
        projectStore: store,
        workspacePolicy,
        commandPolicy,
        git: adapter
      }
    );

    expect(status.type).toBe(ResultType.Ok);
    if (status.type !== ResultType.Ok) {
      return;
    }

    expect(status.value.entries.some((entry) => entry.path === "tracked.txt")).toBe(true);
    expect(status.value.entries.some((entry) => entry.path === "staged.txt")).toBe(true);

    const diff = await executeGitDiff(
      {
        projectId: opened.value.id,
        staged: true
      },
      {
        projectStore: store,
        workspacePolicy,
        commandPolicy,
        git: adapter
      }
    );

    expect(diff.type).toBe(ResultType.Ok);
    if (diff.type === ResultType.Ok) {
      expect(diff.value.diff).toContain("staged.txt");
      expect(diff.value.staged).toBe(true);
    }
  });

  it("creates a commit with a conventional commit message", async () => {
    const repo = await createTempGitRepository();
    const store = createProjectStore();
    const opened = store.open({
      rootPath: repo.path
    });

    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    await writeFile(join(repo.path, "commit.txt"), "commit body\n", "utf8");
    runGit(repo.path, ["add", "commit.txt"]);

    const workspacePolicy = createWorkspacePolicy([repo.workspaceRoot]);
    const commandPolicy = createCommandPolicy([GitCommandName], workspacePolicy);
    const adapter = createGitCliAdapter();

    const commit = await executeGitCommit(
      {
        projectId: opened.value.id,
        message: "feat(server-api): add git status endpoint"
      },
      {
        projectStore: store,
        workspacePolicy,
        commandPolicy,
        git: adapter
      }
    );

    expect(commit.type).toBe(ResultType.Ok);
    if (commit.type === ResultType.Ok) {
      expect(commit.value.hash).toMatch(/^[0-9a-f]{40}$/);
      expect(commit.value.message).toBe("feat(server-api): add git status endpoint");
    }
  });

  it("rejects invalid conventional commit messages", async () => {
    const parsed = parseGitCommitRequest({
      projectId: "project-1",
      message: "update stuff"
    });

    expect(parsed.type).toBe(ResultType.Err);
    if (parsed.type === ResultType.Err) {
      expect(parsed.error.status).toBe(HttpStatus.BadRequest);
      expect(parsed.error.message).toBe(ErrorMessage.InvalidCommitMessage);
    }
  });

  it("parses git path operation requests with one or more paths", () => {
    const parsed = parseGitPathRequest({
      projectId: "project-1",
      paths: [" tracked.txt ", "src/index.ts"]
    });

    expect(parsed.type).toBe(ResultType.Ok);
    if (parsed.type === ResultType.Ok) {
      expect(parsed.value).toEqual({
        projectId: "project-1",
        paths: ["tracked.txt", "src/index.ts"]
      });
    }
  });

  it("stages, unstages and reverts paths through the api contract", async () => {
    const repo = await createTempGitRepository();
    const store = createProjectStore();
    const opened = store.open({
      rootPath: repo.path
    });

    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    await writeFile(join(repo.path, "tracked.txt"), "changed\n", "utf8");
    await writeFile(join(repo.path, "new-file.txt"), "new file\n", "utf8");

    const workspacePolicy = createWorkspacePolicy([repo.workspaceRoot]);
    const commandPolicy = createCommandPolicy([GitCommandName], workspacePolicy);
    const adapter = createGitCliAdapter();
    const dependencies = {
      projectStore: store,
      workspacePolicy,
      commandPolicy,
      git: adapter
    };

    const staged = await executeGitPathOperation(
      {
        projectId: opened.value.id,
        paths: ["tracked.txt", "new-file.txt"]
      },
      "stage",
      dependencies
    );

    expect(staged.type).toBe(ResultType.Ok);
    if (staged.type !== ResultType.Ok) {
      return;
    }

    expect(staged.value.paths).toEqual(["tracked.txt", "new-file.txt"]);

    const unstaged = await executeGitPathOperation(
      {
        projectId: opened.value.id,
        paths: ["tracked.txt"]
      },
      "unstage",
      dependencies
    );

    expect(unstaged.type).toBe(ResultType.Ok);
    if (unstaged.type !== ResultType.Ok) {
      return;
    }

    expect(unstaged.value.paths).toEqual(["tracked.txt"]);

    const reverted = await executeGitPathOperation(
      {
        projectId: opened.value.id,
        paths: ["tracked.txt"]
      },
      "revert",
      dependencies
    );

    expect(reverted.type).toBe(ResultType.Ok);
    if (reverted.type !== ResultType.Ok) {
      return;
    }

    expect(reverted.value.paths).toEqual(["tracked.txt"]);

    const status = await executeGitStatus(
      {
        projectId: opened.value.id
      },
      dependencies
    );

    expect(status.type).toBe(ResultType.Ok);
    if (status.type === ResultType.Ok) {
      expect(status.value.stagedCount).toBe(1);
      expect(status.value.unstagedCount).toBe(0);
      expect(status.value.entries.some((entry) => entry.path === "new-file.txt" && entry.staged)).toBe(true);
    }
  });

  it("rejects repositories outside the configured workspace root", async () => {
    const repo = await createTempGitRepository();
    const store = createProjectStore();
    const opened = store.open({
      rootPath: repo.path
    });

    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    const workspacePolicy = createWorkspacePolicy([join(repo.workspaceRoot, "different-root")]);
    const commandPolicy = createCommandPolicy([GitCommandName], workspacePolicy);
    const adapter = createGitCliAdapter();

    const status = await executeGitStatus(
      {
        projectId: opened.value.id
      },
      {
        projectStore: store,
        workspacePolicy,
        commandPolicy,
        git: adapter
      }
    );

    expect(status.type).toBe(ResultType.Err);
    if (status.type === ResultType.Err) {
      expect(status.error.status).toBe(HttpStatus.Forbidden);
      expect(status.error.message).toBe(ErrorMessage.WorkspaceNotAllowed);
    }
  });
});

const createTempGitRepository = async (): Promise<{
  path: string;
  workspaceRoot: string;
}> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "iteronix-server-git-"));
  const repoPath = join(workspaceRoot, "repo");
  tempRoots.push(workspaceRoot);

  await mkdir(repoPath, {
    recursive: true
  });

  runGit(repoPath, ["init"]);
  runGit(repoPath, ["config", "user.name", "Iteronix Test"]);
  runGit(repoPath, ["config", "user.email", "iteronix@example.com"]);
  await writeFile(join(repoPath, "tracked.txt"), "initial\n", "utf8");
  runGit(repoPath, ["add", "tracked.txt"]);
  runGit(repoPath, ["commit", "-m", "chore(test): seed repository"]);

  return {
    path: repoPath,
    workspaceRoot
  };
};

const runGit = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync(GitCommandName, [...args], {
    cwd,
    encoding: "utf8"
  });
