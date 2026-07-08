import { describe, expect, it } from "vitest";

import {
  applyProjectsUrlPatch,
  readProjectsUrlState,
} from "./projects-url-state.js";

describe("projects url state", () => {
  it("reads run, gates, diff scope and focused path", () => {
    expect(
      readProjectsUrlState(
        "http://localhost/projects?run=r1&gates=lint,typecheck,unknown&diff=unstaged&path=src%2Fmain.ts",
      ),
    ).toEqual({
      selectedRunId: "r1",
      selectedGates: ["lint", "typecheck"],
      selectedGitDiffScope: "unstaged",
      focusedGitDiffPath: "src/main.ts",
    });
  });

  it("rejects invalid diff scope, blank values and unsafe paths", () => {
    expect(
      readProjectsUrlState("http://localhost/projects?run=&diff=all&path="),
    ).toEqual({
      selectedRunId: null,
      selectedGates: [],
      selectedGitDiffScope: null,
      focusedGitDiffPath: null,
    });

    expect(
      readProjectsUrlState(
        "http://localhost/projects?path=%5C%5Cserver%5Cshare%5Csecret.ts",
      ).focusedGitDiffPath,
    ).toBeNull();
  });

  it("applies projects query patches", () => {
    expect(
      applyProjectsUrlPatch("http://localhost/projects?run=r1", {
        selectedRunId: null,
        selectedGitDiffScope: "staged",
      }),
    ).toBe("/projects?diff=staged");
  });
});
