import {
  hydrateProjectSession,
  type ProjectSessionState
} from "./project-session.js";
import { requestJson } from "./server-api-client.js";
import {
  hydrateSettingsSnapshot,
  parseSettingsSnapshot,
  type SettingsSnapshot
} from "./settings-storage.js";
import {
  hydrateWorkbenchHistory
} from "./workbench-history.js";
import {
  parseWorkbenchHistoryState
} from "./workbench-codec.js";
import type {
  ProjectRecord,
  WorkbenchHistoryState
} from "./workbench-types.js";

const EndpointPath = {
  WorkspaceStateGet: "/workspace/state/get",
  WorkspaceStateUpdate: "/workspace/state/update"
} as const;

export type WorkspaceStateSnapshot = {
  activeProjectId: string | null;
  projects: ReadonlyArray<ProjectRecord>;
  settings: SettingsSnapshot;
  workbenchHistory: WorkbenchHistoryState;
};

export type WorkspaceStateClient = {
  load: () => Promise<WorkspaceStateSnapshot>;
  update: (input: {
    settings?: SettingsSnapshot;
    workbenchHistory?: WorkbenchHistoryState;
    activeProjectId?: string | null;
  }) => Promise<WorkspaceStateSnapshot>;
};

export const createWorkspaceStateClient = (): WorkspaceStateClient => ({
  load: () =>
    requestJson({
      path: EndpointPath.WorkspaceStateGet,
      body: {},
      parse: parseWorkspaceStateResponse
    }),
  update: (input) =>
    requestJson({
      path: EndpointPath.WorkspaceStateUpdate,
      body: input,
      parse: parseWorkspaceStateResponse
    })
});

export const hydrateWorkspaceStateClients = (
  state: WorkspaceStateSnapshot
): void => {
  hydrateProjectSession(readProjectSessionFromWorkspaceState(state));
  hydrateSettingsSnapshot(state.settings);
  hydrateWorkbenchHistory(state.workbenchHistory);
};

export const parseWorkspaceStateResponse = (
  value: unknown
): WorkspaceStateSnapshot => {
  const root = readRecord(value, "workspaceStateResponse");
  const state = readRecord(root["state"], "workspaceStateResponse.state");

  return {
    activeProjectId: readNullableString(state, "activeProjectId"),
    projects: readArray(state, "projects").map((project) =>
      parseProjectRecord(readRecord(project, "projectRecord"))
    ),
    settings: parseSettingsSnapshot(state["settings"]),
    workbenchHistory: parseWorkbenchHistoryState(state["workbenchHistory"])
  };
};

export const readProjectSessionFromWorkspaceState = (
  state: WorkspaceStateSnapshot
): ProjectSessionState => {
  const activeProject = state.projects.find(
    (project) => project.id === state.activeProjectId
  ) ?? null;
  const recentProjects = state.projects.map((project) => ({
    rootPath: project.rootPath,
    name: project.name
  }));

  return {
    projectRootPath: activeProject?.rootPath ?? null,
    projectName: activeProject?.name ?? "",
    recentProjects
  };
};

const parseProjectRecord = (value: Record<string, unknown>): ProjectRecord => ({
  id: readString(value, "id"),
  name: readString(value, "name"),
  rootPath: readNullableString(value, "rootPath"),
  createdAt: readString(value, "createdAt"),
  updatedAt: readString(value, "updatedAt")
});

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readArray = (
  value: Record<string, unknown>,
  key: string
): ReadonlyArray<unknown> => {
  const entry = value[key];
  if (!Array.isArray(entry)) {
    return [];
  }

  return entry;
};

const readString = (
  value: Record<string, unknown>,
  key: string
): string => {
  const entry = value[key];
  if (typeof entry !== "string") {
    throw new Error(`Invalid ${key}`);
  }

  return entry;
};

const readNullableString = (
  value: Record<string, unknown>,
  key: string
): string | null => {
  const entry = value[key];
  return typeof entry === "string" && entry.trim().length > 0 ? entry : null;
};
