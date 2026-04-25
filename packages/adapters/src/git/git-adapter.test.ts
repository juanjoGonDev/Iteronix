import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ResultType } from "../../../domain/src/result";
import {
  GitCommandName,
  GitErrorCode,
  createGitCliAdapter
} from "./git-adapter";

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

describe("git cli adapter", () => {
  it("reads repository status and diff for staged and unstaged changes", async () => {
    const repo = await createTempGitRepository();
    const adapter = createGitCliAdapter();

    await writeFile(join(repo.path, "tracked.txt"), "changed\n", "utf8");
    await writeFile(join(repo.path, "staged.txt"), "staged\n", "utf8");
    runGit(repo.path, ["add", "staged.txt"]);

    const status = await adapter.getStatus({
      rootPath: repo.path
    });

    expect(status.type).toBe(ResultType.Ok);
    if (status.type !== ResultType.Ok) {
      return;
    }

    expect(status.value.entries).toHaveLength(2);
    expect(status.value.clean).toBe(false);
    expect(status.value.stagedCount).toBe(1);
    expect(status.value.unstagedCount).toBe(1);

    const stagedEntry = status.value.entries.find((entry) => entry.path === "staged.txt");
    const unstagedEntry = status.value.entries.find((entry) => entry.path === "tracked.txt");

    expect(stagedEntry?.staged).toBe(true);
    expect(stagedEntry?.unstaged).toBe(false);
    expect(unstagedEntry?.staged).toBe(false);
    expect(unstagedEntry?.unstaged).toBe(true);

    const unstagedDiff = await adapter.getDiff({
      rootPath: repo.path,
      staged: false
    });

    expect(unstagedDiff.type).toBe(ResultType.Ok);
    if (unstagedDiff.type === ResultType.Ok) {
      expect(unstagedDiff.value.diff).toContain("tracked.txt");
      expect(unstagedDiff.value.staged).toBe(false);
    }

    const stagedDiff = await adapter.getDiff({
      rootPath: repo.path,
      staged: true
    });

    expect(stagedDiff.type).toBe(ResultType.Ok);
    if (stagedDiff.type === ResultType.Ok) {
      expect(stagedDiff.value.diff).toContain("staged.txt");
      expect(stagedDiff.value.staged).toBe(true);
    }
  });

  it("creates a commit and returns the new hash", async () => {
    const repo = await createTempGitRepository();
    const adapter = createGitCliAdapter();

    await writeFile(join(repo.path, "commit.txt"), "commit body\n", "utf8");
    runGit(repo.path, ["add", "commit.txt"]);

    const commit = await adapter.createCommit({
      rootPath: repo.path,
      message: "feat(server-api): add git endpoints"
    });

    expect(commit.type).toBe(ResultType.Ok);
    if (commit.type !== ResultType.Ok) {
      return;
    }

    expect(commit.value.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.value.message).toBe("feat(server-api): add git endpoints");

    const head = runGit(repo.path, ["rev-parse", "HEAD"]).trim();
    const message = await readFile(join(repo.path, ".git", "COMMIT_EDITMSG"), "utf8");

    expect(commit.value.hash).toBe(head);
    expect(message).toContain("feat(server-api): add git endpoints");
  });

  it("reports a not-a-repository error", async () => {
    const root = await mkdtemp(join(tmpdir(), "iteronix-git-adapter-"));
    tempRoots.push(root);

    const adapter = createGitCliAdapter();
    const result = await adapter.getStatus({
      rootPath: root
    });

    expect(result.type).toBe(ResultType.Err);
    if (result.type === ResultType.Err) {
      expect(result.error.code).toBe(GitErrorCode.NotRepository);
      expect(result.error.command).toBe(GitCommandName);
    }
  });

  it("stages and unstages selected paths", async () => {
    const repo = await createTempGitRepository();
    const adapter = createGitCliAdapter();

    await writeFile(join(repo.path, "tracked.txt"), "updated tracked\n", "utf8");
    await writeFile(join(repo.path, "new-file.txt"), "new file\n", "utf8");

    const staged = await adapter.stagePaths({
      rootPath: repo.path,
      paths: ["tracked.txt", "new-file.txt"]
    });

    expect(staged.type).toBe(ResultType.Ok);
    if (staged.type !== ResultType.Ok) {
      return;
    }

    expect(staged.value.paths).toEqual(["tracked.txt", "new-file.txt"]);

    const stagedStatus = await adapter.getStatus({
      rootPath: repo.path
    });

    expect(stagedStatus.type).toBe(ResultType.Ok);
    if (stagedStatus.type !== ResultType.Ok) {
      return;
    }

    expect(stagedStatus.value.stagedCount).toBe(2);
    expect(stagedStatus.value.entries.every((entry) => entry.staged)).toBe(true);

    const unstaged = await adapter.unstagePaths({
      rootPath: repo.path,
      paths: ["tracked.txt"]
    });

    expect(unstaged.type).toBe(ResultType.Ok);
    if (unstaged.type !== ResultType.Ok) {
      return;
    }

    expect(unstaged.value.paths).toEqual(["tracked.txt"]);

    const unstagedStatus = await adapter.getStatus({
      rootPath: repo.path
    });

    expect(unstagedStatus.type).toBe(ResultType.Ok);
    if (unstagedStatus.type !== ResultType.Ok) {
      return;
    }

    const trackedEntry = unstagedStatus.value.entries.find((entry) => entry.path === "tracked.txt");
    const newEntry = unstagedStatus.value.entries.find((entry) => entry.path === "new-file.txt");

    expect(trackedEntry?.staged).toBe(false);
    expect(trackedEntry?.unstaged).toBe(true);
    expect(newEntry?.staged).toBe(true);
  });

  it("reverts unstaged tracked changes for selected paths", async () => {
    const repo = await createTempGitRepository();
    const adapter = createGitCliAdapter();

    await writeFile(join(repo.path, "tracked.txt"), "updated tracked\n", "utf8");

    const reverted = await adapter.revertPaths({
      rootPath: repo.path,
      paths: ["tracked.txt"]
    });

    expect(reverted.type).toBe(ResultType.Ok);
    if (reverted.type !== ResultType.Ok) {
      return;
    }

    expect(reverted.value.paths).toEqual(["tracked.txt"]);

    const content = await readFile(join(repo.path, "tracked.txt"), "utf8");

    expect(normalizeLineEndings(content)).toBe("initial\n");
  });
});

const createTempGitRepository = async (): Promise<{ path: string }> => {
  const root = await mkdtemp(join(tmpdir(), "iteronix-git-adapter-"));
  const repoPath = join(root, "repo");
  tempRoots.push(root);

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
    path: repoPath
  };
};

const runGit = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync(GitCommandName, [...args], {
    cwd,
    encoding: "utf8"
  });

const normalizeLineEndings = (value: string): string =>
  value.replace(/\r\n/gu, "\n");
