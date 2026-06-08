import { describe, expect, it } from "vitest";
import {
  ProjectSessionEventName,
  clearProjectSession,
  createProjectSessionStorage,
  readActiveProjectSessionLabel,
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

  it("persists workflow-only recent projects without a root path", () => {
    const storage = createMemoryStorage();
    const session = createProjectSessionStorage(storage);

    writeProjectSession(
      {
        projectRootPath: "",
        projectName: "Workflow Lab"
      },
      storage
    );
    session.saveRecentProject({
      rootPath: null,
      name: "Workflow Lab"
    });

    expect(readProjectSession(storage)).toEqual({
      projectRootPath: null,
      projectName: "Workflow Lab",
      recentProjects: [
        {
          rootPath: null,
          name: "Workflow Lab"
        }
      ]
    });
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
      projectRootPath: null,
      projectName: "",
      recentProjects: [
        {
          rootPath: "D:/projects/Iteronix",
          name: "Iteronix"
        }
      ]
    });
  });

  it("dispatches a browser event when the active project session changes", () => {
    const storage = createMemoryStorage();
    const dispatched: string[] = [];
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: storage,
        dispatchEvent: (event: Event) => {
          dispatched.push(event.type);
          return true;
        }
      }
    });

    try {
      writeProjectSession(
        {
          projectRootPath: "D:/projects/Iteronix",
          projectName: "Iteronix"
        },
        storage
      );
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow
        });
      }
    }

    expect(dispatched).toEqual([ProjectSessionEventName.Changed]);
  });

  it("derives the sidebar label from the active project session", () => {
    expect(
      readActiveProjectSessionLabel({
        projectRootPath: "D:\\projects\\Iteronix",
        projectName: "",
        recentProjects: []
      })
    ).toBe("Iteronix");

    expect(
      readActiveProjectSessionLabel({
        projectRootPath: "D:\\projects\\Iteronix",
        projectName: "Workbench",
        recentProjects: []
      })
    ).toBe("Workbench");
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
