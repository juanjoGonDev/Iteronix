import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createGitCliAdapter, GitCommandName } from "../../../packages/adapters/src/git/git-adapter";
import { ErrorMessage, HttpStatus } from "./constants";
import {
  executeGitBranchCheckout,
  executeGitBranchCreate,
  executeGitBranchList,
  executeGitBranchPublish,
  executeGitBranchPush,
  executeGitPathOperation,
  executeGitCommit,
  executeGitDiff,
  executeGitStatus,
  parseGitBranchMutationRequest,
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

  it("rejects invalid branch names", () => {
    const parsed = parseGitBranchMutationRequest({
      projectId: "project-1",
      branchName: "bad branch"
    });

    expect(parsed.type).toBe(ResultType.Err);
    if (parsed.type === ResultType.Err) {
      expect(parsed.error.status).toBe(HttpStatus.BadRequest);
      expect(parsed.error.message).toBe(ErrorMessage.InvalidBranchName);
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

  it("lists branches, creates one and checks it out through the api contract", async () => {
    const repo = await createTempGitRepository({
      withRemote: true
    });
    const store = createProjectStore();
    const opened = store.open({
      rootPath: repo.path
    });

    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    const workspacePolicy = createWorkspacePolicy([repo.workspaceRoot]);
    const commandPolicy = createCommandPolicy([GitCommandName], workspacePolicy);
    const adapter = createGitCliAdapter();
    const dependencies = {
      projectStore: store,
      workspacePolicy,
      commandPolicy,
      git: adapter
    };

    const branches = await executeGitBranchList(
      {
        projectId: opened.value.id
      },
      dependencies
    );

    expect(branches.type).toBe(ResultType.Ok);
    if (branches.type !== ResultType.Ok) {
      return;
    }

    expect(branches.value.local.some((branch) => branch.name === repo.defaultBranch && branch.current)).toBe(true);
    expect(branches.value.remote.some((branch) => branch.name === "origin/feature/remote-only")).toBe(true);

    const created = await executeGitBranchCreate(
      {
        projectId: opened.value.id,
        branchName: "feature/server-first"
      },
      dependencies
    );

    expect(created.type).toBe(ResultType.Ok);
    if (created.type !== ResultType.Ok) {
      return;
    }

    expect(created.value.name).toBe("feature/server-first");

    const checkedOut = await executeGitBranchCheckout(
      {
        projectId: opened.value.id,
        branchName: "feature/server-first"
      },
      dependencies
    );

    expect(checkedOut.type).toBe(ResultType.Ok);
    if (checkedOut.type !== ResultType.Ok) {
      return;
    }

    expect(checkedOut.value.name).toBe("feature/server-first");

    const status = await executeGitStatus(
      {
        projectId: opened.value.id
      },
      dependencies
    );

    expect(status.type).toBe(ResultType.Ok);
    if (status.type === ResultType.Ok) {
      expect(status.value.branch).toBe("feature/server-first");
    }
  });

  it("publishes the current branch to origin and pushes the upstream through the api contract", async () => {
    const repo = await createTempGitRepository({
      withRemote: true
    });
    const store = createProjectStore();
    const opened = store.open({
      rootPath: repo.path
    });

    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    runGit(repo.path, ["checkout", "feature/local-only"]);

    const workspacePolicy = createWorkspacePolicy([repo.workspaceRoot]);
    const commandPolicy = createCommandPolicy([GitCommandName], workspacePolicy);
    const adapter = createGitCliAdapter();
    const dependencies = {
      projectStore: store,
      workspacePolicy,
      commandPolicy,
      git: adapter
    };

    const published = await executeGitBranchPublish(
      {
        projectId: opened.value.id
      },
      dependencies
    );

    expect(published.type).toBe(ResultType.Ok);
    if (published.type !== ResultType.Ok) {
      return;
    }

    expect(published.value.name).toBe("feature/local-only");
    expect(published.value.upstream).toBe("origin/feature/local-only");

    const publishedStatus = await executeGitStatus(
      {
        projectId: opened.value.id
      },
      dependencies
    );

    expect(publishedStatus.type).toBe(ResultType.Ok);
    if (publishedStatus.type !== ResultType.Ok) {
      return;
    }

    expect(publishedStatus.value.upstream).toBe("origin/feature/local-only");

    await writeFile(join(repo.path, "tracked.txt"), "push update\n", "utf8");
    runGit(repo.path, ["add", "tracked.txt"]);
    runGit(repo.path, ["commit", "-m", "feat(test): push upstream"]);

    const pushed = await executeGitBranchPush(
      {
        projectId: opened.value.id
      },
      dependencies
    );

    expect(pushed.type).toBe(ResultType.Ok);
    if (pushed.type !== ResultType.Ok) {
      return;
    }

    if (!repo.remotePath) {
      throw new Error("Expected remote repository");
    }

    expect(pushed.value.name).toBe("feature/local-only");
    expect(pushed.value.upstream).toBe("origin/feature/local-only");
    expect(runGit(repo.path, ["rev-parse", "HEAD"]).trim()).toBe(
      runGit(repo.remotePath, ["rev-parse", "refs/heads/feature/local-only"]).trim()
    );
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

const createTempGitRepository = async (
  input: {
    withRemote?: boolean;
  } = {}
): Promise<{
  path: string;
  workspaceRoot: string;
  defaultBranch: string;
  remotePath?: string;
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
  const defaultBranch = runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  runGit(repoPath, ["branch", "feature/local-only"]);

  let remotePath: string | undefined;

  if (input.withRemote === true) {
    remotePath = join(workspaceRoot, "remote.git");
    runGit(workspaceRoot, ["init", "--bare", remotePath]);
    runGit(repoPath, ["remote", "add", "origin", remotePath]);
    runGit(repoPath, ["push", "-u", "origin", defaultBranch]);
    runGit(repoPath, ["checkout", "-b", "feature/remote-only"]);
    runGit(repoPath, ["push", "-u", "origin", "feature/remote-only"]);
    runGit(repoPath, ["checkout", defaultBranch]);
    runGit(repoPath, ["branch", "-D", "feature/remote-only"]);
  }

  return {
    path: repoPath,
    workspaceRoot,
    defaultBranch,
    ...(remotePath ? { remotePath } : {})
  };
};

const runGit = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync(GitCommandName, [...args], {
    cwd,
    encoding: "utf8"
  });
