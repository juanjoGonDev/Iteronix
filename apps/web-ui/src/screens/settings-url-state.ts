import {
  applyUrlStatePatch,
  readEnumUrlParam,
  readNonEmptyUrlParam,
} from "../shared/url-state.js";

export const SettingsUrlTab = {
  General: "general",
  Provider: "provider",
  Limits: "limits",
  Notifications: "notifications",
  Api: "api",
} as const;

export type SettingsUrlTab =
  (typeof SettingsUrlTab)[keyof typeof SettingsUrlTab];

export type SettingsUrlState = {
  activeTab: SettingsUrlTab | null;
  selectedProviderId: string | null;
};

export type SettingsUrlPatch = {
  activeTab?: SettingsUrlTab | null;
  selectedProviderId?: string | null;
};

const SettingsRoutePath = "/settings";
const SettingsUrlParam = {
  Tab: "tab",
  Profile: "profile",
} as const;
const SettingsTabs = Object.values(SettingsUrlTab);

export const readSettingsUrlState = (urlInput: string): SettingsUrlState => {
  const url = new URL(urlInput, "http://localhost");
  return {
    activeTab: readEnumUrlParam(
      url.searchParams.get(SettingsUrlParam.Tab),
      SettingsTabs,
    ),
    selectedProviderId: readNonEmptyUrlParam(
      url.searchParams.get(SettingsUrlParam.Profile),
    ),
  };
};

export const applySettingsUrlPatch = (
  urlInput: string,
  patch: SettingsUrlPatch,
): string =>
  applyUrlStatePatch(urlInput, SettingsRoutePath, {
    [SettingsUrlParam.Tab]: patch.activeTab,
    [SettingsUrlParam.Profile]: patch.selectedProviderId,
  });

export const readSettingsUrlStateFromLocation = (
  location: Location,
): SettingsUrlState =>
  readSettingsUrlState(
    `${location.pathname}${location.search}${location.hash}`,
  );
