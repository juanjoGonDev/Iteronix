import { describe, expect, it } from "vitest";
import {
  readExplorerWorkspaceState,
  writeExplorerWorkspaceState
} from "./explorer-workspace-session.js";

describe("explorer workspace session", () => {
  it("persists open files, pin state and active file per project root", () => {
    const storage = createMemoryStorage();

    writeExplorerWorkspaceState(
      "D:/projects/Iteronix",
      {
        openFiles: [
          {
            path: "README.md",
            pinned: true
          },
          {
            path: "src/screens/Explorer.ts",
            pinned: false
          }
        ],
        activeFilePath: "src/screens/Explorer.ts"
      },
      storage
    );
    writeExplorerWorkspaceState(
      "D:/projects/Another",
      {
        openFiles: [
          {
            path: "index.ts",
            pinned: false
          }
        ],
        activeFilePath: "index.ts"
      },
      storage
    );

    expect(
      readExplorerWorkspaceState("D:/projects/Iteronix", storage)
    ).toEqual({
      openFiles: [
        {
          path: "README.md",
          pinned: true
        },
        {
          path: "src/screens/Explorer.ts",
          pinned: false
        }
      ],
      activeFilePath: "src/screens/Explorer.ts"
    });
    expect(
      readExplorerWorkspaceState("D:/projects/Another", storage)
    ).toEqual({
      openFiles: [
        {
          path: "index.ts",
          pinned: false
        }
      ],
      activeFilePath: "index.ts"
    });
  });

  it("normalizes invalid persisted explorer workspace payloads", () => {
    const storage = createMemoryStorage();
    storage.setItem("iteronix_explorer_workspace", JSON.stringify([
      {
        rootPath: "D:/projects/Iteronix",
        openFiles: [
          {
            path: "README.md",
            pinned: true
          },
          {
            path: "",
            pinned: true
          },
          {
            path: "README.md",
            pinned: false
          }
        ],
        activeFilePath: 42
      }
    ]));

    expect(
      readExplorerWorkspaceState("D:/projects/Iteronix", storage)
    ).toEqual({
      openFiles: [
        {
          path: "README.md",
          pinned: true
        }
      ],
      activeFilePath: null
    });
  });
});

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
};
