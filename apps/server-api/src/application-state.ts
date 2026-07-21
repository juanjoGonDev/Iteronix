import {
  createDefaultWorkflowCatalogState,
  WorkflowAssetScope,
} from "../../../packages/shared/src/workflows";
import type { WorkflowCatalogState } from "../../../packages/shared/src/workflows";
import type { ProviderSelection, ProviderSettingsRecord } from "./providers";
import {
  ExternalApiKeyScopeKind,
  type ExternalApiKeyRecord,
} from "../../../packages/domain/src/external-api-keys";
import {
  parseGovernanceLifecycles,
  type GovernanceLifecycle,
} from "../../../packages/domain/src/governance-lifecycle";
import {
  createDefaultIdeAuthState,
  parseIdeAuthState,
  type IdeAuthState,
} from "./ide-auth";
import {
  createEditableAssetCatalog,
  parseEditableAssetCatalog,
  type EditableAssetCatalog,
} from "./editable-assets";
import {
  createMemoryDocumentCatalog,
  parseMemoryDocumentCatalog,
  type MemoryDocumentCatalog,
} from "./memory-rag";

const ApplicationStateVersion = {
  Current: 1,
} as const;

type JsonPrimitive = string | number | boolean | null;
type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

type ApplicationWorkflowLimits = {
  infiniteLoops: boolean;
  maxLoops: number;
  externalCalls: boolean;
};

type ApplicationNotifications = {
  soundEnabled: boolean;
  webhookUrl: string;
};

type ApplicationProviderProfile = JsonRecord;

export type ApplicationSettingsSnapshot = {
  profileId: string;
  providerProfiles: ReadonlyArray<ApplicationProviderProfile>;
  workflowLimits: ApplicationWorkflowLimits;
  notifications: ApplicationNotifications;
};

export type ApplicationState = {
  version: typeof ApplicationStateVersion.Current;
  revision: number;
  settings: ApplicationSettingsSnapshot;
  providerSelections: ReadonlyArray<ProviderSelection>;
  providerSettings: ReadonlyArray<ProviderSettingsRecord>;
  workflows: WorkflowCatalogState;
  externalApiKeys: ReadonlyArray<ExternalApiKeyRecord>;
  governanceLifecycles: ReadonlyArray<GovernanceLifecycle>;
  editableAssets: EditableAssetCatalog;
  memoryDocuments: MemoryDocumentCatalog;
  ideAuth: IdeAuthState;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStateStore = {
  load: () => Promise<ApplicationState>;
  save: (state: ApplicationState) => Promise<ApplicationState>;
  update: (
    updater: (state: ApplicationState) => ApplicationState,
  ) => Promise<ApplicationState>;
};

const DefaultProfileId = "default";
const DefaultMaxLoops = 50;
const LegacyWorkflowAssetScope = "workspace";

export const createDefaultApplicationState = (): ApplicationState => {
  const now = new Date().toISOString();
  return {
    version: ApplicationStateVersion.Current,
    revision: 0,
    settings: createDefaultSettingsSnapshot(),
    providerSelections: [],
    providerSettings: [],
    workflows: createDefaultWorkflowCatalogState(),
    externalApiKeys: [],
    governanceLifecycles: [],
    editableAssets: createEditableAssetCatalog(),
    memoryDocuments: createMemoryDocumentCatalog(),
    ideAuth: createDefaultIdeAuthState(),
    createdAt: now,
    updatedAt: now,
  };
};

export const parseApplicationState = (value: unknown): ApplicationState => {
  const application = readApplicationEnvelope(value);
  if (!application) {
    return createDefaultApplicationState();
  }

  const defaults = createDefaultApplicationState();
  const createdAt = readString(application, "createdAt") ?? defaults.createdAt;

  return {
    version: ApplicationStateVersion.Current,
    revision: readNonNegativeInteger(application, "revision") ?? 0,
    settings: readSettingsSnapshot(application["settings"]),
    providerSelections: readProviderSelections(
      application["providerSelections"],
    ),
    providerSettings: readProviderSettings(application["providerSettings"]),
    workflows: readWorkflowCatalogState(application["workflows"]),
    externalApiKeys: readExternalApiKeys(application["externalApiKeys"]),
    governanceLifecycles: parseGovernanceLifecycles(
      application["governanceLifecycles"],
    ),
    editableAssets: parseEditableAssetCatalog(application["editableAssets"]),
    memoryDocuments: parseMemoryDocumentCatalog(application["memoryDocuments"]),
    ideAuth: parseIdeAuthState(application["ideAuth"]),
    createdAt,
    updatedAt: readString(application, "updatedAt") ?? createdAt,
  };
};

export const createApplicationStateFromStores = (input: {
  providerSnapshot: {
    selections: ReadonlyArray<ProviderSelection>;
    settings: ReadonlyArray<ProviderSettingsRecord>;
  };
  settings: ApplicationSettingsSnapshot;
  workflowSnapshot: WorkflowCatalogState;
  externalApiKeys?: ReadonlyArray<ExternalApiKeyRecord>;
  governanceLifecycles?: ReadonlyArray<GovernanceLifecycle>;
  editableAssets?: EditableAssetCatalog;
  memoryDocuments?: MemoryDocumentCatalog;
  ideAuth?: IdeAuthState;
  previousState?: ApplicationState;
}): ApplicationState => {
  const now = new Date().toISOString();
  return parseApplicationState({
    version: ApplicationStateVersion.Current,
    revision: input.previousState?.revision ?? 0,
    settings: input.settings,
    providerSelections: input.providerSnapshot.selections,
    providerSettings: input.providerSnapshot.settings,
    workflows: input.workflowSnapshot,
    externalApiKeys:
      input.externalApiKeys ?? input.previousState?.externalApiKeys ?? [],
    governanceLifecycles:
      input.governanceLifecycles ??
      input.previousState?.governanceLifecycles ??
      [],
    editableAssets:
      input.editableAssets ??
      input.previousState?.editableAssets ??
      createEditableAssetCatalog(),
    memoryDocuments:
      input.memoryDocuments ??
      input.previousState?.memoryDocuments ??
      createMemoryDocumentCatalog(),
    ideAuth:
      input.ideAuth ??
      input.previousState?.ideAuth ??
      createDefaultIdeAuthState(),
    createdAt: input.previousState?.createdAt ?? now,
    updatedAt: now,
  });
};

export const redactApplicationState = (
  state: ApplicationState,
): ApplicationState => redactUnknownValue(state) as ApplicationState;

const readExternalApiKeys = (
  value: unknown,
): ReadonlyArray<ExternalApiKeyRecord> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = readString(entry, "id");
    const name = readString(entry, "name");
    const secretHash = readString(entry, "secretHash");
    const createdAt = readString(entry, "createdAt");
    const scope = readExternalApiKeyScope(entry["scope"]);
    if (!id || !name || !secretHash || !createdAt || !scope) {
      return [];
    }

    const lastUsedAt = readString(entry, "lastUsedAt");
    const revokedAt = readString(entry, "revokedAt");
    const key: ExternalApiKeyRecord = {
      id,
      name,
      scope,
      secretHash,
      createdAt,
      ...(lastUsedAt ? { lastUsedAt } : {}),
      ...(revokedAt ? { revokedAt } : {}),
    };
    return [key];
  });
};

const readApplicationEnvelope = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isRecord(value["application"])) {
    return value["application"];
  }

  if (isRecord(value["workspace"])) {
    return value["workspace"];
  }

  return value;
};

const readExternalApiKeyScope = (
  value: unknown,
): ExternalApiKeyRecord["scope"] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value["kind"] === ExternalApiKeyScopeKind.AllWorkflows) {
    return { kind: ExternalApiKeyScopeKind.AllWorkflows };
  }

  if (
    value["kind"] !== ExternalApiKeyScopeKind.SelectedWorkflows ||
    !Array.isArray(value["workflowIds"])
  ) {
    return undefined;
  }

  const workflowIds = value["workflowIds"].filter(
    (workflowId): workflowId is string =>
      typeof workflowId === "string" && workflowId.length > 0,
  );
  return {
    kind: ExternalApiKeyScopeKind.SelectedWorkflows,
    workflowIds: [...new Set(workflowIds)],
  };
};

const createDefaultSettingsSnapshot = (): ApplicationSettingsSnapshot => ({
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
});

const readSettingsSnapshot = (value: unknown): ApplicationSettingsSnapshot => {
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
  };
};

const readWorkflowLimits = (value: unknown): ApplicationWorkflowLimits => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot().workflowLimits;
  }

  return {
    infiniteLoops: readBoolean(value, "infiniteLoops") ?? false,
    maxLoops: readPositiveInteger(value, "maxLoops") ?? DefaultMaxLoops,
    externalCalls: readBoolean(value, "externalCalls") ?? true,
  };
};

const readNotifications = (value: unknown): ApplicationNotifications => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot().notifications;
  }

  return {
    soundEnabled: readBoolean(value, "soundEnabled") ?? true,
    webhookUrl: readString(value, "webhookUrl") ?? "",
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
      migrateLegacyWorkflowAssetScopes(value["assets"]),
    ) as WorkflowCatalogState["assets"],
    assetUsages: readJsonRecordArray(
      value["assetUsages"],
    ) as WorkflowCatalogState["assetUsages"],
    executions: readJsonRecordArray(
      value["executions"],
    ) as WorkflowCatalogState["executions"],
  };
};

const migrateLegacyWorkflowAssetScopes = (value: unknown): unknown => {
  if (!isUnknownArray(value)) {
    return value;
  }

  return value.map((asset) =>
    isRecord(asset) && asset["scope"] === LegacyWorkflowAssetScope
      ? { ...asset, scope: WorkflowAssetScope.Global }
      : asset,
  );
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

const isUnknownArray = (value: unknown): value is ReadonlyArray<unknown> =>
  Array.isArray(value);

const isJsonRecord = (value: JsonValue): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSensitiveKey = (key: string): boolean =>
  /^(?:(?:auth(?:entication|orization)?|access|refresh|webhook)?token|(?:client)?secret|password|api[-_]?key)$/i.test(
    key,
  );
