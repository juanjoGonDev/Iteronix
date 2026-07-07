import { describe, expect, it } from "vitest";

import {
  applyExplorerUrlPatch,
  readExplorerUrlState,
} from "./explorer-url-state.js";

describe("explorer url state", () => {
  it("reads useful explorer deep state", () => {
    expect(
      readExplorerUrlState(
        "http://localhost/explorer?section=search&file=apps%2Fweb-ui%2Fsrc%2Fmain.ts&q=router&regex=1&case=0&word=1",
      ),
    ).toEqual({
      activeSidebarSection: "search",
      selectedFilePath: "apps/web-ui/src/main.ts",
      searchQuery: "router",
      regex: true,
      matchCase: false,
      wholeWord: true,
    });
  });

  it("does not accept absolute paths", () => {
    expect(
      readExplorerUrlState("http://localhost/explorer?file=C%3A%5Csecret.txt"),
    ).toMatchObject({
      selectedFilePath: null,
    });
  });

  it("applies patches on explorer route", () => {
    expect(
      applyExplorerUrlPatch("http://localhost/explorer?section=files", {
        activeSidebarSection: "search",
        selectedFilePath: "README.md",
        regex: true,
      }),
    ).toBe("/explorer?section=search&file=README.md&regex=1");
  });
});
