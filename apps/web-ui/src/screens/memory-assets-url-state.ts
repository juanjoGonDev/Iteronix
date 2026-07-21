export const MemoryAssetsUrlMode = {
  Catalog: "catalog",
  Create: "create",
  Edit: "edit",
} as const;

export type MemoryAssetsUrlMode =
  (typeof MemoryAssetsUrlMode)[keyof typeof MemoryAssetsUrlMode];
export type MemoryAssetsUrlPanel = "config" | "documents";
export type MemoryAssetsUrlState = {
  mode: MemoryAssetsUrlMode;
  memoryId: string | null;
  panel: MemoryAssetsUrlPanel;
};
export type MemoryAssetsUrlPatch = Partial<MemoryAssetsUrlState>;

const QueryKey = { Mode: "mode", Memory: "memory", Panel: "panel" } as const;
const DefaultPanel: MemoryAssetsUrlPanel = "config";

export const readMemoryAssetsUrlState = (
  value: string,
): MemoryAssetsUrlState => {
  const url = new URL(value);
  const mode = readMode(url.searchParams.get(QueryKey.Mode));
  const memoryId = readOptionalString(url.searchParams.get(QueryKey.Memory));
  return mode === MemoryAssetsUrlMode.Edit && !memoryId
    ? { mode: MemoryAssetsUrlMode.Catalog, memoryId: null, panel: DefaultPanel }
    : {
        mode,
        memoryId,
        panel: readPanel(url.searchParams.get(QueryKey.Panel)),
      };
};

export const applyMemoryAssetsUrlPatch = (
  value: string,
  patch: MemoryAssetsUrlPatch,
): string => {
  const url = new URL(value);
  const next = { ...readMemoryAssetsUrlState(value), ...patch };
  const normalized =
    next.mode === MemoryAssetsUrlMode.Edit && !next.memoryId
      ? {
          mode: MemoryAssetsUrlMode.Catalog,
          memoryId: null,
          panel: DefaultPanel,
        }
      : next;
  writeParameter(
    url,
    QueryKey.Mode,
    normalized.mode === MemoryAssetsUrlMode.Catalog ? null : normalized.mode,
  );
  writeParameter(url, QueryKey.Memory, normalized.memoryId);
  writeParameter(
    url,
    QueryKey.Panel,
    normalized.panel === DefaultPanel ? null : normalized.panel,
  );
  return `${url.pathname}${url.search}${url.hash}`;
};

const readMode = (value: string | null): MemoryAssetsUrlMode =>
  value === MemoryAssetsUrlMode.Create || value === MemoryAssetsUrlMode.Edit
    ? value
    : MemoryAssetsUrlMode.Catalog;
const readPanel = (value: string | null): MemoryAssetsUrlPanel =>
  value === "documents" ? "documents" : DefaultPanel;
const readOptionalString = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};
const writeParameter = (url: URL, key: string, value: string | null): void => {
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
};
