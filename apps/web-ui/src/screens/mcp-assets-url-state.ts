export const McpAssetsUrlMode = {
  Catalog: "catalog",
  Create: "create",
  Edit: "edit",
} as const;

export type McpAssetsUrlMode =
  (typeof McpAssetsUrlMode)[keyof typeof McpAssetsUrlMode];

export type McpAssetsUrlState = {
  mode: McpAssetsUrlMode;
  mcpId: string | null;
};

export type McpAssetsUrlPatch = Partial<McpAssetsUrlState>;

const QueryKey = { Mode: "mode", Mcp: "mcp" } as const;

export const readMcpAssetsUrlState = (value: string): McpAssetsUrlState => {
  const url = new URL(value);
  const mode = readMode(url.searchParams.get(QueryKey.Mode));
  const mcpId = readOptionalString(url.searchParams.get(QueryKey.Mcp));
  return mode === McpAssetsUrlMode.Edit && !mcpId
    ? { mode: McpAssetsUrlMode.Catalog, mcpId: null }
    : { mode, mcpId };
};

export const applyMcpAssetsUrlPatch = (
  value: string,
  patch: McpAssetsUrlPatch,
): string => {
  const url = new URL(value);
  const next = { ...readMcpAssetsUrlState(value), ...patch };
  const normalized =
    next.mode === McpAssetsUrlMode.Edit && !next.mcpId
      ? { mode: McpAssetsUrlMode.Catalog, mcpId: null }
      : next;
  writeParameter(
    url,
    QueryKey.Mode,
    normalized.mode === McpAssetsUrlMode.Catalog ? null : normalized.mode,
  );
  writeParameter(url, QueryKey.Mcp, normalized.mcpId);
  return `${url.pathname}${url.search}${url.hash}`;
};

const readMode = (value: string | null): McpAssetsUrlMode =>
  value === McpAssetsUrlMode.Create || value === McpAssetsUrlMode.Edit
    ? value
    : McpAssetsUrlMode.Catalog;

const readOptionalString = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const writeParameter = (url: URL, key: string, value: string | null): void => {
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
};
