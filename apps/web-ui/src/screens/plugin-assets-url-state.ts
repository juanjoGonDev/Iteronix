export const PluginAssetsUrlMode = {
  Catalog: "catalog",
  Create: "create",
  Edit: "edit",
} as const;

export type PluginAssetsUrlMode =
  (typeof PluginAssetsUrlMode)[keyof typeof PluginAssetsUrlMode];
export type PluginAssetsUrlState = {
  mode: PluginAssetsUrlMode;
  pluginId: string | null;
};
export type PluginAssetsUrlPatch = Partial<PluginAssetsUrlState>;

const QueryKey = { Mode: "mode", Plugin: "plugin" } as const;

export const readPluginAssetsUrlState = (
  value: string,
): PluginAssetsUrlState => {
  const url = new URL(value);
  const mode = readMode(url.searchParams.get(QueryKey.Mode));
  const pluginId = readOptionalString(url.searchParams.get(QueryKey.Plugin));
  return mode === PluginAssetsUrlMode.Edit && !pluginId
    ? { mode: PluginAssetsUrlMode.Catalog, pluginId: null }
    : { mode, pluginId };
};

export const applyPluginAssetsUrlPatch = (
  value: string,
  patch: PluginAssetsUrlPatch,
): string => {
  const url = new URL(value);
  const next = { ...readPluginAssetsUrlState(value), ...patch };
  const normalized =
    next.mode === PluginAssetsUrlMode.Edit && !next.pluginId
      ? { mode: PluginAssetsUrlMode.Catalog, pluginId: null }
      : next;
  writeParameter(
    url,
    QueryKey.Mode,
    normalized.mode === PluginAssetsUrlMode.Catalog ? null : normalized.mode,
  );
  writeParameter(url, QueryKey.Plugin, normalized.pluginId);
  return `${url.pathname}${url.search}${url.hash}`;
};

const readMode = (value: string | null): PluginAssetsUrlMode =>
  value === PluginAssetsUrlMode.Create || value === PluginAssetsUrlMode.Edit
    ? value
    : PluginAssetsUrlMode.Catalog;
const readOptionalString = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};
const writeParameter = (url: URL, key: string, value: string | null): void => {
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
};
