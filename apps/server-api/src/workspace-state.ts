import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HistoryEvent, HistoryRunRecord } from "./history";
import type { KanbanBoard, KanbanColumn, KanbanTask } from "./kanban";
import type { Project } from "./projects";
import type { ProviderSelection, ProviderSettingsRecord } from "./providers";

export const WorkspaceStateVersion = {
  Current: 1
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export type WorkspaceWorkflowLimits = {
  infiniteLoops: boolean;
  maxLoops: number;
  externalCalls: boolean;
};

export type WorkspaceNotifications = {
  soundEnabled: boolean;
  webhookUrl: string;
};

export type WorkspaceProviderProfile = JsonRecord;

export type WorkspaceSettingsSnapshot = {
  profileId: string;
  providerProfiles: ReadonlyArray<WorkspaceProviderProfile>;
  workflowLimits: WorkspaceWorkflowLimits;
  notifications: WorkspaceNotifications;
};

export type WorkspaceWorkbenchHistory = {
  runs: ReadonlyArray<JsonRecord>;
  evals: ReadonlyArray<JsonRecord>;
};

export type WorkspaceState = {
  version: typeof WorkspaceStateVersion.Current;
  activeProjectId: string | null;
  projects: ReadonlyArray<Project>;
  settings: WorkspaceSettingsSnapshot;
  providerSelections: ReadonlyArray<ProviderSelection>;
  providerSettings: ReadonlyArray<ProviderSettingsRecord>;
  kanban: {
    boards: ReadonlyArray<KanbanBoard>;
    columns: ReadonlyArray<KanbanColumn>;
    tasks: ReadonlyArray<KanbanTask>;
  };
  qualityHistory: {
    runs: ReadonlyArray<HistoryRunRecord>;
    events: ReadonlyArray<HistoryEvent>;
  };
  workbenchHistory: WorkspaceWorkbenchHistory;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceStateStore = {
  load: () => Promise<WorkspaceState>;
  save: (state: WorkspaceState) => Promise<WorkspaceState>;
  update: (
    updater: (state: WorkspaceState) => WorkspaceState
  ) => Promise<WorkspaceState>;
};

const DefaultProfileId = "default";
const DefaultMaxLoops = 50;
const JsonIndent = 2;
const DefaultProviderKind = "codex-cli";
const DefaultPromptMode = "stdin";

export const createFileWorkspaceStateStore = (
  stateFilePath: string
): WorkspaceStateStore => {
  const load = async (): Promise<WorkspaceState> => {
    try {
      const raw = await readFile(stateFilePath, "utf8");
      return parseWorkspaceState(JSON.parse(raw));
    } catch {
      return createDefaultWorkspaceState();
    }
  };

  const save = async (state: WorkspaceState): Promise<WorkspaceState> => {
    const normalized = parseWorkspaceState(state);
    await mkdir(dirname(stateFilePath), {
      recursive: true
    });
    const tempFilePath = `${stateFilePath}.tmp`;
    await writeFile(tempFilePath, JSON.stringify(normalized, null, JsonIndent), "utf8");
    await rename(tempFilePath, stateFilePath);
    return normalized;
  };

  const update = async (
    updater: (state: WorkspaceState) => WorkspaceState
  ): Promise<WorkspaceState> => save(updater(await load()));

  return {
    load,
    save,
    update
  };
};

export const createDefaultWorkspaceState = (): WorkspaceState => {
  const now = new Date().toISOString();
  return {
    version: WorkspaceStateVersion.Current,
    activeProjectId: null,
    projects: [],
    settings: createDefaultSettingsSnapshot(),
    providerSelections: [],
    providerSettings: [],
    kanban: {
      boards: [],
      columns: [],
      tasks: []
    },
    qualityHistory: {
      runs: [],
      events: []
    },
    workbenchHistory: {
      runs: [],
      evals: []
    },
    createdAt: now,
    updatedAt: now
  };
};

export const parseWorkspaceState = (value: unknown): WorkspaceState => {
  if (!isRecord(value)) {
    return createDefaultWorkspaceState();
  }

  const defaults = createDefaultWorkspaceState();
  const createdAt = readString(value, "createdAt") ?? defaults.createdAt;

  return {
    version: WorkspaceStateVersion.Current,
    activeProjectId: readNullableString(value, "activeProjectId"),
    projects: readProjectArray(value["projects"]),
    settings: readSettingsSnapshot(value["settings"]),
    providerSelections: readProviderSelections(value["providerSelections"]),
    providerSettings: readProviderSettings(value["providerSettings"]),
    kanban: readKanbanSnapshot(value["kanban"]),
    qualityHistory: readQualityHistory(value["qualityHistory"]),
    workbenchHistory: readWorkbenchHistory(value["workbenchHistory"]),
    createdAt,
    updatedAt: readString(value, "updatedAt") ?? createdAt
  };
};

export const createWorkspaceStateFromStores = (input: {
  projectSnapshot: {
    projects: ReadonlyArray<Project>;
    activeProjectId: string | null;
  };
  providerSnapshot: {
    selections: ReadonlyArray<ProviderSelection>;
    settings: ReadonlyArray<ProviderSettingsRecord>;
  };
  kanbanSnapshot: {
    boards: ReadonlyArray<KanbanBoard>;
    columns: ReadonlyArray<KanbanColumn>;
    tasks: ReadonlyArray<KanbanTask>;
  };
  historySnapshot: {
    runs?: ReadonlyArray<HistoryRunRecord>;
    events?: ReadonlyArray<HistoryEvent>;
  };
  settings: WorkspaceSettingsSnapshot;
  workbenchHistory: WorkspaceWorkbenchHistory;
  previousState?: WorkspaceState;
}): WorkspaceState => {
  const now = new Date().toISOString();
  return parseWorkspaceState({
    version: WorkspaceStateVersion.Current,
    activeProjectId: input.projectSnapshot.activeProjectId,
    projects: input.projectSnapshot.projects,
    settings: input.settings,
    providerSelections: input.providerSnapshot.selections,
    providerSettings: input.providerSnapshot.settings,
    kanban: input.kanbanSnapshot,
    qualityHistory: {
      runs: input.historySnapshot.runs ?? [],
      events: input.historySnapshot.events ?? []
    },
    workbenchHistory: input.workbenchHistory,
    createdAt: input.previousState?.createdAt ?? now,
    updatedAt: now
  });
};

const createDefaultSettingsSnapshot = (): WorkspaceSettingsSnapshot => ({
  profileId: DefaultProfileId,
  providerProfiles: [
    {
      id: "codex-cli-default",
      name: "Codex CLI",
      providerKind: DefaultProviderKind,
      modelId: "",
      endpointUrl: "",
      command: "codex",
      promptMode: DefaultPromptMode
    }
  ],
  workflowLimits: {
    infiniteLoops: false,
    maxLoops: DefaultMaxLoops,
    externalCalls: true
  },
  notifications: {
    soundEnabled: true,
    webhookUrl: ""
  }
});

const readSettingsSnapshot = (value: unknown): WorkspaceSettingsSnapshot => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot();
  }

  const defaults = createDefaultSettingsSnapshot();
  const providerProfiles = readJsonRecordArray(value["providerProfiles"]);

  return {
    profileId: readString(value, "profileId") ?? defaults.profileId,
    providerProfiles: providerProfiles.length > 0 ? providerProfiles : defaults.providerProfiles,
    workflowLimits: readWorkflowLimits(value["workflowLimits"]),
    notifications: readNotifications(value["notifications"])
  };
};

const readWorkflowLimits = (value: unknown): WorkspaceWorkflowLimits => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot().workflowLimits;
  }

  return {
    infiniteLoops: readBoolean(value, "infiniteLoops") ?? false,
    maxLoops: readPositiveInteger(value, "maxLoops") ?? DefaultMaxLoops,
    externalCalls: readBoolean(value, "externalCalls") ?? true
  };
};

const readNotifications = (value: unknown): WorkspaceNotifications => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot().notifications;
  }

  return {
    soundEnabled: readBoolean(value, "soundEnabled") ?? true,
    webhookUrl: readString(value, "webhookUrl") ?? ""
  };
};

const readProjectArray = (value: unknown): ReadonlyArray<Project> =>
  readRecordArray(value).flatMap((record) => {
    const id = readString(record, "id");
    const name = readString(record, "name");
    const createdAt = readString(record, "createdAt");
    const updatedAt = readString(record, "updatedAt");
    if (!id || !name || !createdAt || !updatedAt) {
      return [];
    }

    return [{
      id,
      name,
      rootPath: readNullableString(record, "rootPath"),
      createdAt,
      updatedAt
    }];
  });

const readProviderSelections = (value: unknown): ReadonlyArray<ProviderSelection> =>
  readRecordArray(value).flatMap((record) => {
    const projectId = readString(record, "projectId");
    const profileId = readString(record, "profileId");
    const providerId = readString(record, "providerId");
    const updatedAt = readString(record, "updatedAt");
    if (!projectId || !profileId || !providerId || !updatedAt) {
      return [];
    }

    return [{
      projectId,
      profileId,
      providerId,
      updatedAt
    }];
  });

const readProviderSettings = (value: unknown): ReadonlyArray<ProviderSettingsRecord> =>
  readRecordArray(value).flatMap((record) => {
    const projectId = readString(record, "projectId");
    const profileId = readString(record, "profileId");
    const providerId = readString(record, "providerId");
    const updatedAt = readString(record, "updatedAt");
    const config = isRecord(record["config"]) ? record["config"] : {};
    if (!projectId || !profileId || !providerId || !updatedAt) {
      return [];
    }

    return [{
      projectId,
      profileId,
      providerId,
      config,
      updatedAt
    }];
  });

const readKanbanSnapshot = (value: unknown): WorkspaceState["kanban"] => {
  if (!isRecord(value)) {
    return {
      boards: [],
      columns: [],
      tasks: []
    };
  }

  return {
    boards: readJsonRecordArray(value["boards"]) as ReadonlyArray<KanbanBoard>,
    columns: readJsonRecordArray(value["columns"]) as ReadonlyArray<KanbanColumn>,
    tasks: readJsonRecordArray(value["tasks"]) as ReadonlyArray<KanbanTask>
  };
};

const readQualityHistory = (value: unknown): WorkspaceState["qualityHistory"] => {
  if (!isRecord(value)) {
    return {
      runs: [],
      events: []
    };
  }

  return {
    runs: readJsonRecordArray(value["runs"]) as ReadonlyArray<HistoryRunRecord>,
    events: readJsonRecordArray(value["events"]) as ReadonlyArray<HistoryEvent>
  };
};

const readWorkbenchHistory = (value: unknown): WorkspaceWorkbenchHistory => {
  if (!isRecord(value)) {
    return {
      runs: [],
      evals: []
    };
  }

  return {
    runs: readJsonRecordArray(value["runs"]),
    evals: readJsonRecordArray(value["evals"])
  };
};

const readJsonRecordArray = (value: unknown): ReadonlyArray<JsonRecord> =>
  readRecordArray(value).flatMap((record) => {
    const json = toJsonRecord(record);
    return json ? [json] : [];
  });

const readRecordArray = (value: unknown): ReadonlyArray<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const toJsonRecord = (record: Record<string, unknown>): JsonRecord | undefined => {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    const jsonValue = toJsonValue(value);
    if (jsonValue !== undefined) {
      output[key] = jsonValue;
    }
  }

  return output;
};

const toJsonValue = (value: unknown): JsonValue | undefined => {
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const jsonValue = toJsonValue(entry);
      return jsonValue === undefined ? [] : [jsonValue];
    });
  }

  if (isRecord(value)) {
    return toJsonRecord(value);
  }

  return undefined;
};

const readString = (
  record: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const readNullableString = (
  record: Record<string, unknown>,
  key: string
): string | null => readString(record, key) ?? null;

const readBoolean = (
  record: Record<string, unknown>,
  key: string
): boolean | undefined => {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
};

const readPositiveInteger = (
  record: Record<string, unknown>,
  key: string
): number | undefined => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(1, Math.round(value));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
