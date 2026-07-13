import { createDefaultWorkflowCatalogState } from "../../../packages/shared/src/workflows";
import type { WorkflowCatalogState } from "../../../packages/shared/src/workflows";
import type { ProviderSelection, ProviderSettingsRecord } from "./providers";

export const WorkspaceStateVersion = {
  Current: 1,
} as const;

type JsonPrimitive = string | number | boolean | null;
type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

type WorkspaceWorkflowLimits = {
  infiniteLoops: boolean;
  maxLoops: number;
  externalCalls: boolean;
};

type WorkspaceNotifications = {
  soundEnabled: boolean;
  webhookUrl: string;
};

type WorkspaceProviderProfile = JsonRecord;

export type WorkspaceSettingsSnapshot = {
  profileId: string;
  providerProfiles: ReadonlyArray<WorkspaceProviderProfile>;
  workflowLimits: WorkspaceWorkflowLimits;
  notifications: WorkspaceNotifications;
  serverConnection: {
    serverUrl: string;
    authToken: string;
  };
};

export type WorkspaceState = {
  version: typeof WorkspaceStateVersion.Current;
  revision: number;
  settings: WorkspaceSettingsSnapshot;
  providerSelections: ReadonlyArray<ProviderSelection>;
  providerSettings: ReadonlyArray<ProviderSettingsRecord>;
  workflows: WorkflowCatalogState;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceStateStore = {
  load: () => Promise<WorkspaceState>;
  save: (state: WorkspaceState) => Promise<WorkspaceState>;
  update: (
    updater: (state: WorkspaceState) => WorkspaceState,
  ) => Promise<WorkspaceState>;
};

const DefaultProfileId = "default";
const DefaultMaxLoops = 50;
const DefaultServerUrl = "http://localhost:4000";
const DefaultAuthToken = "dev-token";

export const createDefaultWorkspaceState = (): WorkspaceState => {
  const now = new Date().toISOString();
  return {
    version: WorkspaceStateVersion.Current,
    revision: 0,
    settings: createDefaultSettingsSnapshot(),
    providerSelections: [],
    providerSettings: [],
    workflows: createDefaultWorkflowCatalogState(),
    createdAt: now,
    updatedAt: now,
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
    revision: readNonNegativeInteger(value, "revision") ?? 0,
    settings: readSettingsSnapshot(value["settings"]),
    providerSelections: readProviderSelections(value["providerSelections"]),
    providerSettings: readProviderSettings(value["providerSettings"]),
    workflows: readWorkflowCatalogState(value["workflows"]),
    createdAt,
    updatedAt: readString(value, "updatedAt") ?? createdAt,
  };
};

export const createWorkspaceStateFromStores = (input: {
  providerSnapshot: {
    selections: ReadonlyArray<ProviderSelection>;
    settings: ReadonlyArray<ProviderSettingsRecord>;
  };
  settings: WorkspaceSettingsSnapshot;
  workflowSnapshot: WorkflowCatalogState;
  previousState?: WorkspaceState;
}): WorkspaceState => {
  const now = new Date().toISOString();
  return parseWorkspaceState({
    version: WorkspaceStateVersion.Current,
    revision: input.previousState?.revision ?? 0,
    settings: input.settings,
    providerSelections: input.providerSnapshot.selections,
    providerSettings: input.providerSnapshot.settings,
    workflows: input.workflowSnapshot,
    createdAt: input.previousState?.createdAt ?? now,
    updatedAt: now,
  });
};

export const redactWorkspaceState = (state: WorkspaceState): WorkspaceState =>
  redactUnknownValue(state) as WorkspaceState;

const createDefaultSettingsSnapshot = (): WorkspaceSettingsSnapshot => ({
  profileId: DefaultProfileId,
  providerProfiles: [],
  workflowLimits: {
    infiniteLoops: false,
    maxLoops: DefaultMaxLoops,
    externalCalls: true,
  },
  notifications: {
    soundEnabled: true,
    webhookUrl: "",
  },
  serverConnection: {
    serverUrl: DefaultServerUrl,
    authToken: DefaultAuthToken,
  },
});

const readSettingsSnapshot = (value: unknown): WorkspaceSettingsSnapshot => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot();
  }

  const defaults = createDefaultSettingsSnapshot();
  const providerProfiles = readJsonRecordArray(value["providerProfiles"]).map(
    redactJsonRecord,
  );

  return {
    profileId: readString(value, "profileId") ?? defaults.profileId,
    providerProfiles:
      providerProfiles.length > 0
        ? providerProfiles
        : defaults.providerProfiles,
    workflowLimits: readWorkflowLimits(value["workflowLimits"]),
    notifications: readNotifications(value["notifications"]),
    serverConnection: readServerConnection(value["serverConnection"]),
  };
};

const readWorkflowLimits = (value: unknown): WorkspaceWorkflowLimits => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot().workflowLimits;
  }

  return {
    infiniteLoops: readBoolean(value, "infiniteLoops") ?? false,
    maxLoops: readPositiveInteger(value, "maxLoops") ?? DefaultMaxLoops,
    externalCalls: readBoolean(value, "externalCalls") ?? true,
  };
};

const readNotifications = (value: unknown): WorkspaceNotifications => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot().notifications;
  }

  return {
    soundEnabled: readBoolean(value, "soundEnabled") ?? true,
    webhookUrl: readString(value, "webhookUrl") ?? "",
  };
};

const readServerConnection = (
  value: unknown,
): WorkspaceSettingsSnapshot["serverConnection"] => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot().serverConnection;
  }

  return {
    serverUrl: readString(value, "serverUrl") ?? DefaultServerUrl,
    authToken: readString(value, "authToken") ?? DefaultAuthToken,
  };
};

const readProviderSelections = (
  value: unknown,
): ReadonlyArray<ProviderSelection> =>
  readRecordArray(value).flatMap((record) => {
    const profileId = readString(record, "profileId");
    const providerId = readString(record, "providerId");
    const updatedAt = readString(record, "updatedAt");
    if (!profileId || !providerId || !updatedAt) {
      return [];
    }

    return [{ profileId, providerId, updatedAt }];
  });

const readProviderSettings = (
  value: unknown,
): ReadonlyArray<ProviderSettingsRecord> =>
  readRecordArray(value).flatMap((record) => {
    const profileId = readString(record, "profileId");
    const providerId = readString(record, "providerId");
    const updatedAt = readString(record, "updatedAt");
    const config = isRecord(record["config"])
      ? redactUnknownRecord(record["config"])
      : {};
    if (!profileId || !providerId || !updatedAt) {
      return [];
    }

    return [{ profileId, providerId, config, updatedAt }];
  });

const readWorkflowCatalogState = (value: unknown): WorkflowCatalogState => {
  if (!isRecord(value)) {
    return createDefaultWorkflowCatalogState();
  }

  return {
    definitions: readJsonRecordArray(
      value["definitions"],
    ) as WorkflowCatalogState["definitions"],
    definitionVersions: readJsonRecordArray(
      value["definitionVersions"],
    ) as NonNullable<WorkflowCatalogState["definitionVersions"]>,
    assets: readJsonRecordArray(
      value["assets"],
    ) as WorkflowCatalogState["assets"],
    assetUsages: readJsonRecordArray(
      value["assetUsages"],
    ) as WorkflowCatalogState["assetUsages"],
    executions: readJsonRecordArray(
      value["executions"],
    ) as WorkflowCatalogState["executions"],
  };
};

const readJsonRecordArray = (value: unknown): ReadonlyArray<JsonRecord> =>
  readRecordArray(value).flatMap((record) => {
    const json = toJsonRecord(record);
    return json ? [json] : [];
  });

const readRecordArray = (
  value: unknown,
): ReadonlyArray<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const toJsonRecord = (
  record: Record<string, unknown>,
): JsonRecord | undefined => {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    const jsonValue = toJsonValue(value);
    if (jsonValue !== undefined) {
      output[key] = jsonValue;
    }
  }

  return output;
};

const redactJsonRecord = (record: JsonRecord): JsonRecord => {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      continue;
    }
    output[key] = redactJsonValue(value);
  }

  return output;
};

const redactUnknownRecord = (
  record: Record<string, unknown>,
): Record<string, unknown> => {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      continue;
    }
    output[key] = redactUnknownValue(value);
  }

  return output;
};

const redactJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }

  return isJsonRecord(value) ? redactJsonRecord(value) : value;
};

const redactUnknownValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactUnknownValue);
  }

  return isRecord(value) ? redactUnknownRecord(value) : value;
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
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const readBoolean = (
  record: Record<string, unknown>,
  key: string,
): boolean | undefined => {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
};

const readPositiveInteger = (
  record: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(1, Math.round(value));
};

const readNonNegativeInteger = (
  record: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = record[key];
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    return undefined;
  }

  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isJsonRecord = (value: JsonValue): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSensitiveKey = (key: string): boolean =>
  /^(?:auth(?:entication|orization)?(?:token)?|token|secret|password|api[-_]?key)$/i.test(
    key,
  );
