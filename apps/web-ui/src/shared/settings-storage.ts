import type { StorageLike } from "./server-config.js";
import {
  ProviderKind,
  createDefaultProviderProfiles,
  normalizeProviderProfiles,
  type ProviderProfileRecord,
  type ProviderPromptMode
} from "../screens/settings-state.js";

const LocalStorageKey = {
  SettingsSnapshot: "iteronix_settings_snapshot"
} as const;

export const DefaultSettingsProfileId = "default";

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

export const createSettingsStorage = (
  storage: StorageLike = window.localStorage
): SettingsStorage => ({
  load: () => readSettingsSnapshot(storage),
  save: (input) => writeSettingsSnapshot(input, storage),
  reset: () => writeSettingsSnapshot(createDefaultSettingsSnapshot(), storage)
});

export const readSettingsSnapshot = (
  storage: StorageLike = window.localStorage
): SettingsSnapshot => {
  const raw = storage.getItem(LocalStorageKey.SettingsSnapshot);
  if (!raw) {
    return createDefaultSettingsSnapshot();
  }

  try {
    return parseSettingsSnapshot(JSON.parse(raw));
  } catch {
    return createDefaultSettingsSnapshot();
  }
};

export const writeSettingsSnapshot = (
  input: SettingsSnapshot,
  storage: StorageLike = window.localStorage
): SettingsSnapshot => {
  const normalized = normalizeSettingsSnapshot(input);
  storage.setItem(LocalStorageKey.SettingsSnapshot, JSON.stringify(normalized));
  return normalized;
};

const createDefaultSettingsSnapshot = (): SettingsSnapshot => ({
  profileId: DefaultSettingsProfileId,
  providerProfiles: createDefaultProviderProfiles(),
  workflowLimits: {
    ...DefaultWorkflowLimits
  },
  notifications: {
    ...DefaultNotifications
  }
});

const parseSettingsSnapshot = (value: unknown): SettingsSnapshot => {
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

const normalizeSettingsSnapshot = (input: SettingsSnapshot): SettingsSnapshot => {
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
