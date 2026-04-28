import { describe, expect, it } from "vitest";
import type { ExplorerFileEntryRecord } from "../shared/explorer-client.js";
import {
  buildExplorerTreeNodes,
  closeAllExplorerOpenFiles,
  closeExplorerFileTabsToLeft,
  closeExplorerFileTabsToRight,
  closeExplorerOpenFile,
  filterExplorerTreeNodes,
  flattenExplorerTreeNodes,
  highlightExplorerFileContent,
  openExplorerFile,
  resolveNextExplorerActiveFilePath,
  readExplorerFileIcon,
  mergeExplorerDirectoryChildren,
  readExplorerFileLanguage,
  readExplorerLanguageTheme,
  readExplorerTokenClassName,
  setExplorerFilePinned,
  setExplorerDirectoryExpanded,
  setExplorerTreeExpansion,
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

  it("applies global collapse and expand states to a loaded tree", () => {
    const tree = mergeExplorerDirectoryChildren(
      buildExplorerTreeNodes([
        {
          path: "src",
          name: "src",
          kind: "directory"
        }
      ]),
      "src",
      [
        {
          path: "src/screens",
          name: "screens",
          kind: "directory"
        }
      ]
    );
    const loadedTree = mergeExplorerDirectoryChildren(tree, "src/screens", [
      {
        path: "src/screens/Explorer.ts",
        name: "Explorer.ts",
        kind: "file"
      }
    ]);

    const collapsed = setExplorerTreeExpansion(loadedTree, false);
    const expanded = setExplorerTreeExpansion(loadedTree, true);

    expect(flattenExplorerTreeNodes(collapsed).map((item) => item.node.path)).toEqual([
      "src"
    ]);
    expect(flattenExplorerTreeNodes(expanded).map((item) => item.node.path)).toEqual([
      "src",
      "src/screens",
      "src/screens/Explorer.ts"
    ]);
  });

  it("expands a specific loaded directory without toggling other nodes", () => {
    const tree = mergeExplorerDirectoryChildren(
      buildExplorerTreeNodes([
        {
          path: "src",
          name: "src",
          kind: "directory"
        }
      ]),
      "src",
      [
        {
          path: "src/screens",
          name: "screens",
          kind: "directory"
        }
      ]
    );
    const loadedTree = mergeExplorerDirectoryChildren(tree, "src/screens", [
      {
        path: "src/screens/Explorer.ts",
        name: "Explorer.ts",
        kind: "file"
      }
    ]);
    const collapsed = setExplorerTreeExpansion(loadedTree, false);
    const revealed = setExplorerDirectoryExpanded(
      setExplorerDirectoryExpanded(collapsed, "src", true),
      "src/screens",
      true
    );

    expect(flattenExplorerTreeNodes(revealed).map((item) => item.node.path)).toEqual([
      "src",
      "src/screens",
      "src/screens/Explorer.ts"
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

    const filtered = filterExplorerTreeNodes(tree, "EXPLORER");

    expect(flattenExplorerTreeNodes(filtered).map((item) => item.node.path)).toEqual([
      "src",
      "src/Explorer.ts"
    ]);
    expect(readExplorerFileLanguage("src/Explorer.ts")).toBe("TypeScript");
    expect(readExplorerFileLanguage("README.md")).toBe("Markdown");
  });

  it("derives deterministic language themes for txt, json, ts and js files", () => {
    expect(readExplorerLanguageTheme("notes.txt")).toMatchObject({
      label: "Plain text",
      accentClassName: "text-slate-300"
    });
    expect(readExplorerLanguageTheme("package.json")).toMatchObject({
      label: "JSON",
      accentClassName: "text-amber-300"
    });
    expect(readExplorerLanguageTheme("src/app.ts")).toMatchObject({
      label: "TypeScript",
      accentClassName: "text-sky-300"
    });
    expect(readExplorerLanguageTheme("src/app.js")).toMatchObject({
      label: "JavaScript",
      accentClassName: "text-yellow-300"
    });
    expect(readExplorerFileIcon("notes.txt")).toBe("description");
    expect(readExplorerFileIcon("package.json")).toBe("data_object");
    expect(readExplorerFileIcon("src/app.ts")).toBe("code");
    expect(readExplorerFileIcon("src/app.js")).toBe("code");
  });

  it("produces highlighted tokens for json and typescript previews", () => {
    const jsonLines = highlightExplorerFileContent(
      "package.json",
      '{\n  "name": "iteronix",\n  "private": true\n}'
    );
    const tsLines = highlightExplorerFileContent(
      "src/Explorer.ts",
      [
        "export class Explorer {",
        "  private readonly name = \"Iteronix\";",
        "}"
      ].join("\n")
    );

    expect(jsonLines[1]?.map((token) => token.kind)).toEqual([
      "plain",
      "property",
      "punctuation",
      "plain",
      "string",
      "punctuation"
    ]);
    expect(tsLines[0]?.map((token) => token.kind)).toContain("keyword");
    expect(tsLines[1]?.map((token) => token.kind)).toContain("string");
    expect(readExplorerTokenClassName("keyword")).toBe("text-sky-300");
    expect(readExplorerTokenClassName("property")).toBe("text-rose-300");
    expect(readExplorerTokenClassName("string")).toBe("text-emerald-300");
  });

  it("manages open editor tabs, pinning and directional closing deterministically", () => {
    const opened = openExplorerFile(
      openExplorerFile(
        openExplorerFile([], "README.md"),
        "src/index.ts"
      ),
      "src/screens/Explorer.ts"
    );
    const pinned = setExplorerFilePinned(opened, "README.md", true);
    const closedRight = closeExplorerFileTabsToRight(pinned, "README.md");
    const closedLeft = closeExplorerFileTabsToLeft(pinned, "src/screens/Explorer.ts");
    const removed = closeExplorerOpenFile(pinned, "src/index.ts");

    expect(opened).toEqual([
      { path: "README.md", pinned: false },
      { path: "src/index.ts", pinned: false },
      { path: "src/screens/Explorer.ts", pinned: false }
    ]);
    expect(pinned).toEqual([
      { path: "README.md", pinned: true },
      { path: "src/index.ts", pinned: false },
      { path: "src/screens/Explorer.ts", pinned: false }
    ]);
    expect(closedRight).toEqual([
      { path: "README.md", pinned: true }
    ]);
    expect(closedLeft).toEqual([
      { path: "src/screens/Explorer.ts", pinned: false }
    ]);
    expect(removed).toEqual([
      { path: "README.md", pinned: true },
      { path: "src/screens/Explorer.ts", pinned: false }
    ]);
    expect(closeAllExplorerOpenFiles(pinned)).toEqual([]);
  });

  it("resolves the next active tab after closing or restoring persisted tabs", () => {
    const openFiles = [
      { path: "README.md", pinned: true },
      { path: "src/index.ts", pinned: false },
      { path: "src/screens/Explorer.ts", pinned: false }
    ] as const;

    expect(
      resolveNextExplorerActiveFilePath(openFiles, null, "src/index.ts")
    ).toBe("src/index.ts");
    expect(
      resolveNextExplorerActiveFilePath(
        closeExplorerOpenFile(openFiles, "src/index.ts"),
        "src/index.ts"
      )
    ).toBe("src/screens/Explorer.ts");
    expect(
      resolveNextExplorerActiveFilePath(
        closeExplorerOpenFile(openFiles, "src/screens/Explorer.ts"),
        "src/screens/Explorer.ts"
      )
    ).toBe("src/index.ts");
    expect(resolveNextExplorerActiveFilePath([], "README.md")).toBeNull();
  });
});
