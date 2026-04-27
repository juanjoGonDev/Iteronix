import { describe, expect, it } from "vitest";
import type { ExplorerFileEntryRecord } from "../shared/explorer-client.js";
import {
  buildExplorerTreeNodes,
  filterExplorerTreeNodes,
  flattenExplorerTreeNodes,
  mergeExplorerDirectoryChildren,
  readExplorerFileLanguage,
  toggleExplorerDirectory
} from "./explorer-state.js";

describe("explorer state helpers", () => {
  it("sorts directories before files and flattens expanded nodes", () => {
    const rootEntries: ReadonlyArray<ExplorerFileEntryRecord> = [
      {
        path: "README.md",
        name: "README.md",
        kind: "file"
      },
      {
        path: "src",
        name: "src",
        kind: "directory"
      }
    ];

    const tree = buildExplorerTreeNodes(rootEntries);

    expect(tree.map((node) => node.path)).toEqual(["src", "README.md"]);
    expect(flattenExplorerTreeNodes(tree).map((item) => item.node.path)).toEqual([
      "src",
      "README.md"
    ]);
  });

  it("merges loaded children into a directory and toggles expansion", () => {
    const rootEntries: ReadonlyArray<ExplorerFileEntryRecord> = [
      {
        path: "src",
        name: "src",
        kind: "directory"
      }
    ];
    const childEntries: ReadonlyArray<ExplorerFileEntryRecord> = [
      {
        path: "src/index.ts",
        name: "index.ts",
        kind: "file"
      }
    ];

    const initialTree = buildExplorerTreeNodes(rootEntries);
    const expandedTree = mergeExplorerDirectoryChildren(initialTree, "src", childEntries);
    const collapsedTree = toggleExplorerDirectory(expandedTree, "src");

    expect(flattenExplorerTreeNodes(expandedTree).map((item) => item.node.path)).toEqual([
      "src",
      "src/index.ts"
    ]);
    expect(flattenExplorerTreeNodes(collapsedTree).map((item) => item.node.path)).toEqual([
      "src"
    ]);
  });

  it("filters the tree while preserving matching ancestors and derives language labels", () => {
    const tree = mergeExplorerDirectoryChildren(
      buildExplorerTreeNodes([
        {
          path: "src",
          name: "src",
          kind: "directory"
        },
        {
          path: "package.json",
          name: "package.json",
          kind: "file"
        }
      ]),
      "src",
      [
        {
          path: "src/Explorer.ts",
          name: "Explorer.ts",
          kind: "file"
        }
      ]
    );

    const filtered = filterExplorerTreeNodes(tree, "explorer");

    expect(flattenExplorerTreeNodes(filtered).map((item) => item.node.path)).toEqual([
      "src",
      "src/Explorer.ts"
    ]);
    expect(readExplorerFileLanguage("src/Explorer.ts")).toBe("TypeScript");
    expect(readExplorerFileLanguage("README.md")).toBe("Markdown");
  });
});
