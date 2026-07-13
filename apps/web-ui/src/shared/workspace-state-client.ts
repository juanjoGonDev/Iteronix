import { requestJson } from "./server-api-client.js";
import {
  hydrateSettingsSnapshot,
  parseSettingsSnapshot,
  type SettingsSnapshot,
} from "./settings-storage.js";

const EndpointPath = {
  WorkspaceStateGet: "/workspace/state/get",
  WorkspaceStateUpdate: "/workspace/state/update",
} as const;

export type WorkspaceStateSnapshot = {
  settings: SettingsSnapshot;
};

export type WorkspaceStateClient = {
  load: () => Promise<WorkspaceStateSnapshot>;
  update: (input: {
    settings?: SettingsSnapshot;
  }) => Promise<WorkspaceStateSnapshot>;
};

export const createWorkspaceStateClient = (): WorkspaceStateClient => ({
  load: () =>
    requestJson({
      path: EndpointPath.WorkspaceStateGet,
      body: {},
      parse: parseWorkspaceStateResponse,
    }),
  update: (input) =>
    requestJson({
      path: EndpointPath.WorkspaceStateUpdate,
      body: input,
      parse: parseWorkspaceStateResponse,
    }),
});

export const hydrateWorkspaceStateClients = (
  state: WorkspaceStateSnapshot,
): void => {
  hydrateSettingsSnapshot(state.settings);
};

const parseWorkspaceStateResponse = (
  value: unknown,
): WorkspaceStateSnapshot => {
  const root = readRecord(value, "workspaceStateResponse");
  const state = readRecord(root["state"], "workspaceStateResponse.state");

  return {
    settings: parseSettingsSnapshot(state["settings"]),
  };
};

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};
