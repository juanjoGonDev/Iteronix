import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createHistoryStore, HistoryEventType, HistoryRunStatus } from "./history";
import { createKanbanStore } from "./kanban";
import { createProjectStore } from "./projects";
import { createProviderStore } from "./providers";
import {
  WorkspaceStateVersion,
  createDefaultWorkspaceState,
  createFileWorkspaceStateStore
} from "./workspace-state";

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

describe("workspace state persistence", () => {
  it("creates a default state when the file does not exist", async () => {
    const stateFile = await createTempStateFile();
    const store = createFileWorkspaceStateStore(stateFile);

    const state = await store.load();

    expect(state.version).toBe(WorkspaceStateVersion.Current);
    expect(state.projects).toEqual([]);
    expect(state.activeProjectId).toBeNull();
    expect(state.settings.providerProfiles.length).toBeGreaterThan(0);
  });

  it("persists projects, active project, settings and workbench history atomically", async () => {
    const stateFile = await createTempStateFile();
    const store = createFileWorkspaceStateStore(stateFile);
    const initial = createDefaultWorkspaceState();

    const saved = await store.save({
      ...initial,
      activeProjectId: "project-1",
      projects: [
        {
          id: "project-1",
          name: "Iteronix",
          rootPath: "D:/projects/Iteronix",
          createdAt: "2026-04-29T10:00:00.000Z",
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ],
      settings: {
        ...initial.settings,
        profileId: "workspace",
        workflowLimits: {
          infiniteLoops: true,
          maxLoops: 75,
          externalCalls: false
        }
      },
      workbenchHistory: {
        runs: [
          {
            id: "run-1",
            kind: "skill"
          }
        ],
        evals: []
      }
    });

    const loaded = await store.load();
    const raw = await readFile(stateFile, "utf8");

    expect(JSON.parse(raw)).toMatchObject({
      activeProjectId: "project-1"
    });
    expect(loaded).toEqual(saved);
  });

  it("hydrates server stores from a persisted workspace snapshot", () => {
    const projectStore = createProjectStore({
      activeProjectId: "project-1",
      projects: [
        {
          id: "project-1",
          name: "Iteronix",
          rootPath: "D:/projects/Iteronix",
          createdAt: "2026-04-29T10:00:00.000Z",
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ]
    });
    const providerStore = createProviderStore({
      selections: [
        {
          projectId: "project-1",
          profileId: "planner",
          providerId: "codex-cli",
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ],
      settings: [
        {
          projectId: "project-1",
          profileId: "planner",
          providerId: "codex-cli",
          config: {
            command: "codex"
          },
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ]
    });
    const kanbanStore = createKanbanStore({
      boards: [
        {
          id: "board-1",
          projectId: "project-1",
          name: "Main",
          createdAt: "2026-04-29T10:00:00.000Z",
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ],
      columns: [
        {
          id: "column-1",
          boardId: "board-1",
          name: "TODO",
          position: 0,
          createdAt: "2026-04-29T10:00:00.000Z",
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ],
      tasks: [
        {
          id: "task-1",
          boardId: "board-1",
          columnId: "column-1",
          title: "Persist workspace",
          position: 0,
          createdAt: "2026-04-29T10:00:00.000Z",
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ]
    });
    const historyStore = createHistoryStore({
      runs: [
        {
          id: "run-1",
          providerId: "quality-gates",
          modelId: "local",
          status: HistoryRunStatus.Completed,
          createdAt: "2026-04-29T10:00:00.000Z",
          updatedAt: "2026-04-29T10:00:00.000Z",
          input: "lint",
          projectId: "project-1"
        }
      ],
      events: [
        {
          id: "event-1",
          runId: "run-1",
          type: HistoryEventType.Done,
          data: {
            status: "completed"
          },
          timestamp: "2026-04-29T10:00:00.000Z"
        }
      ]
    });

    expect(projectStore.snapshot().activeProjectId).toBe("project-1");
    expect(providerStore.snapshot().settings).toHaveLength(1);
    expect(kanbanStore.snapshot().tasks).toHaveLength(1);
    expect(historyStore.snapshot().events).toHaveLength(1);
  });
});

const createTempStateFile = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "iteronix-workspace-state-"));
  tempRoots.push(root);
  return join(root, "workspace-state.json");
};
