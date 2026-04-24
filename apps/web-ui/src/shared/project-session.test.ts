import { describe, expect, it } from "vitest";
import {
  clearProjectSession,
  createProjectSessionStorage,
  readProjectSession,
  writeProjectSession
} from "./project-session.js";

describe("project session storage", () => {
  it("persists the current project root and recent entries", () => {
    const storage = createMemoryStorage();
    const session = createProjectSessionStorage(storage);

    writeProjectSession(
      {
        projectRootPath: "D:/projects/Iteronix",
        projectName: "Iteronix"
      },
      storage
    );
    session.saveRecentProject({
      rootPath: "D:/projects/Iteronix",
      name: "Iteronix"
    });
    session.saveRecentProject({
      rootPath: "D:/projects/Another",
      name: "Another"
    });
    session.saveRecentProject({
      rootPath: "D:/projects/Iteronix",
      name: "Iteronix"
    });

    const persisted = readProjectSession(storage);

    expect(persisted.projectRootPath).toBe("D:/projects/Iteronix");
    expect(persisted.recentProjects).toEqual([
      {
        rootPath: "D:/projects/Iteronix",
        name: "Iteronix"
      },
      {
        rootPath: "D:/projects/Another",
        name: "Another"
      }
    ]);
  });

  it("clears the active project without dropping recent entries", () => {
    const storage = createMemoryStorage();
    const session = createProjectSessionStorage(storage);

    session.saveRecentProject({
      rootPath: "D:/projects/Iteronix",
      name: "Iteronix"
    });
    writeProjectSession(
      {
        projectRootPath: "D:/projects/Iteronix",
        projectName: "Iteronix",
        recentProjects: [
          {
            rootPath: "D:/projects/Iteronix",
            name: "Iteronix"
          }
        ]
      },
      storage
    );

    clearProjectSession(storage);

    expect(readProjectSession(storage)).toEqual({
      projectRootPath: "",
      projectName: "",
      recentProjects: [
        {
          rootPath: "D:/projects/Iteronix",
          name: "Iteronix"
        }
      ]
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
