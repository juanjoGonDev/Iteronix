import { describe, expect, it } from "vitest";
import {
  parseGitCommitResponse,
  parseGitDiffResponse,
  parseGitPathOperationResponse,
  parseGitStatusResponse
} from "./git-client.js";

describe("git client codecs", () => {
  it("parses repository status, diff and commit responses", () => {
    const repository = parseGitStatusResponse({
      repository: {
        branch: "feature/git-ui",
        upstream: "origin/feature/git-ui",
        ahead: 2,
        behind: 0,
        clean: false,
        stagedCount: 2,
        unstagedCount: 1,
        untrackedCount: 1,
        entries: [
          {
            path: "apps/web-ui/src/screens/Projects.ts",
            indexStatus: "M",
            workingTreeStatus: " ",
            staged: true,
            unstaged: false,
            untracked: false
          },
          {
            path: "apps/web-ui/src/shared/git-client.ts",
            indexStatus: " ",
            workingTreeStatus: "M",
            staged: false,
            unstaged: true,
            untracked: false
          },
          {
            path: "apps/web-ui/src/screens/Git.ts",
            indexStatus: "?",
            workingTreeStatus: "?",
            staged: false,
            unstaged: false,
            untracked: true
          }
        ]
      }
    });
    const stagedDiff = parseGitDiffResponse({
      staged: true,
      diff: "diff --git a/file.ts b/file.ts"
    });
    const pathOperation = parseGitPathOperationResponse({
      paths: [
        "apps/web-ui/src/shared/git-client.ts",
        "apps/web-ui/src/screens/Projects.ts"
      ]
    });
    const commit = parseGitCommitResponse({
      commit: {
        hash: "9f3c2ad1",
        message: "feat(projects): add git workspace"
      }
    });

    expect(repository.branch).toBe("feature/git-ui");
    expect(repository.stagedCount).toBe(2);
    expect(repository.entries[2]?.untracked).toBe(true);
    expect(stagedDiff.staged).toBe(true);
    expect(stagedDiff.diff).toContain("diff --git");
    expect(pathOperation.paths).toEqual([
      "apps/web-ui/src/shared/git-client.ts",
      "apps/web-ui/src/screens/Projects.ts"
    ]);
    expect(commit.hash).toBe("9f3c2ad1");
  });
});
