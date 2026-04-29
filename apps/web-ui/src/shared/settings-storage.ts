import type { StorageLike } from "./server-config.js";
import {
  ProviderKind,
  createDefaultProviderProfiles,
  normalizeProviderProfiles,
  type ProviderProfileRecord,
  type ProviderPromptMode
} from "../screens/settings-state.js";

export const DefaultSettingsProfileId = "default";
const SettingsSnapshotStorageKey = "iteronix_settings_snapshot";

export type WorkflowLimitsSettings = {
  infiniteLoops: boolean;
  maxLoops: number;
  externalCalls: boolean;
};

export type NotificationsSettings = {
  soundEnabled: boolean;
  webhookUrl: string;
};

export type SettingsSnapshot = {
  profileId: string;
  providerProfiles: ReadonlyArray<ProviderProfileRecord>;
  workflowLimits: WorkflowLimitsSettings;
  notifications: NotificationsSettings;
};

export type SettingsStorage = {
  load: () => SettingsSnapshot;
  save: (input: SettingsSnapshot) => SettingsSnapshot;
  reset: () => SettingsSnapshot;
};

const DefaultWorkflowLimits: WorkflowLimitsSettings = {
  infiniteLoops: false,
  maxLoops: 50,
  externalCalls: true
};

const DefaultNotifications: NotificationsSettings = {
  soundEnabled: true,
  webhookUrl: ""
};

let settingsSnapshotCache = createDefaultSettingsSnapshot();

export const createSettingsStorage = (storage?: StorageLike): SettingsStorage => ({
  load: () => readSettingsSnapshot(storage),
  save: (input) => writeSettingsSnapshot(input, storage),
  reset: () => writeSettingsSnapshot(createDefaultSettingsSnapshot(), storage)
});

export const readSettingsSnapshot = (storage?: StorageLike): SettingsSnapshot => {
  if (storage) {
    const raw = storage.getItem(SettingsSnapshotStorageKey);
    if (!raw) {
      return createDefaultSettingsSnapshot();
    }

    try {
      return parseSettingsSnapshot(JSON.parse(raw));
    } catch {
      return createDefaultSettingsSnapshot();
    }
  }

  return settingsSnapshotCache;
};

export const writeSettingsSnapshot = (
  input: SettingsSnapshot,
  storage?: StorageLike
): SettingsSnapshot => {
  const normalized = normalizeSettingsSnapshot(input);
  if (storage) {
    storage.setItem(SettingsSnapshotStorageKey, JSON.stringify(normalized));
  } else {
    settingsSnapshotCache = normalized;
  }
  return normalized;
};

export const hydrateSettingsSnapshot = (input: SettingsSnapshot): SettingsSnapshot =>
  writeSettingsSnapshot(input);

export function createDefaultSettingsSnapshot(): SettingsSnapshot {
  return {
    profileId: DefaultSettingsProfileId,
    providerProfiles: createDefaultProviderProfiles(),
    workflowLimits: {
      ...DefaultWorkflowLimits
    },
    notifications: {
      ...DefaultNotifications
    }
  };
}

export const parseSettingsSnapshot = (value: unknown): SettingsSnapshot => {
  if (!isRecord(value)) {
    return createDefaultSettingsSnapshot();
  }

  const defaults = createDefaultSettingsSnapshot();
  return normalizeSettingsSnapshot({
    profileId: readOptionalString(value, "profileId") ?? defaults.profileId,
    providerProfiles: normalizeProviderProfiles(value["providerProfiles"]),
    workflowLimits: parseWorkflowLimits(value["workflowLimits"]),
    notifications: parseNotifications(value["notifications"])
  });
};

export const normalizeSettingsSnapshot = (input: SettingsSnapshot): SettingsSnapshot => {
  const profileId = normalizeText(input.profileId) || DefaultSettingsProfileId;
  const providerProfiles = normalizeProviderProfiles(input.providerProfiles);

  return {
    profileId,
    providerProfiles: providerProfiles.length > 0 ? providerProfiles : createDefaultProviderProfiles(),
    workflowLimits: normalizeWorkflowLimits(input.workflowLimits),
    notifications: normalizeNotifications(input.notifications)
  };
};

const parseWorkflowLimits = (value: unknown): WorkflowLimitsSettings => {
  if (!isRecord(value)) {
    return {
      ...DefaultWorkflowLimits
    };
  }

  return normalizeWorkflowLimits({
    infiniteLoops: readOptionalBoolean(value, "infiniteLoops") ?? DefaultWorkflowLimits.infiniteLoops,
    maxLoops: readOptionalNumber(value, "maxLoops") ?? DefaultWorkflowLimits.maxLoops,
    externalCalls: readOptionalBoolean(value, "externalCalls") ?? DefaultWorkflowLimits.externalCalls
  });
};

const parseNotifications = (value: unknown): NotificationsSettings => {
  if (!isRecord(value)) {
    return {
      ...DefaultNotifications
    };
  }

  return normalizeNotifications({
    soundEnabled: readOptionalBoolean(value, "soundEnabled") ?? DefaultNotifications.soundEnabled,
    webhookUrl: readOptionalString(value, "webhookUrl") ?? DefaultNotifications.webhookUrl
  });
};

const normalizeWorkflowLimits = (value: WorkflowLimitsSettings): WorkflowLimitsSettings => ({
  infiniteLoops: value.infiniteLoops,
  maxLoops: normalizePositiveInteger(value.maxLoops, DefaultWorkflowLimits.maxLoops),
  externalCalls: value.externalCalls
});

const normalizeNotifications = (value: NotificationsSettings): NotificationsSettings => ({
  soundEnabled: value.soundEnabled,
  webhookUrl: normalizeText(value.webhookUrl)
});

const normalizePositiveInteger = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.round(value));
  return normalized;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readOptionalString = (
  value: Record<string, unknown>,
  key: string
): string | undefined => {
  const entry = value[key];
  return typeof entry === "string" ? normalizeText(entry) : undefined;
};

const readOptionalBoolean = (
  value: Record<string, unknown>,
  key: string
): boolean | undefined => {
  const entry = value[key];
  return typeof entry === "boolean" ? entry : undefined;
};

const readOptionalNumber = (
  value: Record<string, unknown>,
  key: string
): number | undefined => {
  const entry = value[key];
  return typeof entry === "number" && Number.isFinite(entry) ? entry : undefined;
};

const normalizeText = (value: string): string => value.trim();

export type { ProviderProfileRecord, ProviderPromptMode };
export { ProviderKind };
