export const PromptAssetsUrlMode = {
  Catalog: "catalog",
  Create: "create",
  Edit: "edit",
  Delete: "delete",
} as const;

export type PromptAssetsUrlMode =
  (typeof PromptAssetsUrlMode)[keyof typeof PromptAssetsUrlMode];

export type PromptAssetsUrlState = {
  mode: PromptAssetsUrlMode;
  promptId: string | null;
  version: number | null;
};

export type PromptAssetsUrlPatch = Partial<PromptAssetsUrlState>;

const QueryKey = {
  Mode: "mode",
  Prompt: "prompt",
  Version: "version",
} as const;

export const readPromptAssetsUrlState = (
  value: string,
): PromptAssetsUrlState => {
  const url = new URL(value);
  const promptId = readOptionalString(url.searchParams.get(QueryKey.Prompt));
  const version = readPositiveInteger(url.searchParams.get(QueryKey.Version));
  const mode = readMode(url.searchParams.get(QueryKey.Mode));

  if (
    (mode === PromptAssetsUrlMode.Edit ||
      mode === PromptAssetsUrlMode.Delete) &&
    !promptId
  ) {
    return { mode: PromptAssetsUrlMode.Catalog, promptId: null, version: null };
  }

  return { mode, promptId, version };
};

export const applyPromptAssetsUrlPatch = (
  value: string,
  patch: PromptAssetsUrlPatch,
): string => {
  const url = new URL(value);
  const current = readPromptAssetsUrlState(value);
  const next: PromptAssetsUrlState = { ...current, ...patch };
  const normalized =
    next.mode === PromptAssetsUrlMode.Edit && !next.promptId
      ? { mode: PromptAssetsUrlMode.Catalog, promptId: null, version: null }
      : next;

  writeOptionalParameter(
    url,
    QueryKey.Mode,
    normalized.mode === PromptAssetsUrlMode.Catalog ? null : normalized.mode,
  );
  writeOptionalParameter(url, QueryKey.Prompt, normalized.promptId);
  writeOptionalParameter(
    url,
    QueryKey.Version,
    normalized.version?.toString() ?? null,
  );
  return `${url.pathname}${url.search}${url.hash}`;
};

const readMode = (value: string | null): PromptAssetsUrlMode =>
  value === PromptAssetsUrlMode.Create ||
  value === PromptAssetsUrlMode.Edit ||
  value === PromptAssetsUrlMode.Delete
    ? value
    : PromptAssetsUrlMode.Catalog;

const readOptionalString = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const readPositiveInteger = (value: string | null): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const writeOptionalParameter = (
  url: URL,
  key: string,
  value: string | null,
): void => {
  if (value === null) {
    url.searchParams.delete(key);
    return;
  }

  url.searchParams.set(key, value);
};
