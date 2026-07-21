export const SkillAssetsUrlMode = {
  Catalog: "catalog",
  Create: "create",
  Edit: "edit",
} as const;

export type SkillAssetsUrlMode =
  (typeof SkillAssetsUrlMode)[keyof typeof SkillAssetsUrlMode];

export type SkillAssetsUrlState = {
  mode: SkillAssetsUrlMode;
  skillId: string | null;
};

export type SkillAssetsUrlPatch = Partial<SkillAssetsUrlState>;

const QueryKey = { Mode: "mode", Skill: "skill" } as const;

export const readSkillAssetsUrlState = (value: string): SkillAssetsUrlState => {
  const url = new URL(value);
  const mode = readMode(url.searchParams.get(QueryKey.Mode));
  const skillId = readOptionalString(url.searchParams.get(QueryKey.Skill));
  return mode === SkillAssetsUrlMode.Edit && !skillId
    ? { mode: SkillAssetsUrlMode.Catalog, skillId: null }
    : { mode, skillId };
};

export const applySkillAssetsUrlPatch = (
  value: string,
  patch: SkillAssetsUrlPatch,
): string => {
  const url = new URL(value);
  const next = { ...readSkillAssetsUrlState(value), ...patch };
  const normalized =
    next.mode === SkillAssetsUrlMode.Edit && !next.skillId
      ? { mode: SkillAssetsUrlMode.Catalog, skillId: null }
      : next;
  writeParameter(
    url,
    QueryKey.Mode,
    normalized.mode === SkillAssetsUrlMode.Catalog ? null : normalized.mode,
  );
  writeParameter(url, QueryKey.Skill, normalized.skillId);
  return `${url.pathname}${url.search}${url.hash}`;
};

const readMode = (value: string | null): SkillAssetsUrlMode =>
  value === SkillAssetsUrlMode.Create || value === SkillAssetsUrlMode.Edit
    ? value
    : SkillAssetsUrlMode.Catalog;

const readOptionalString = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const writeParameter = (url: URL, key: string, value: string | null): void => {
  if (value === null) {
    url.searchParams.delete(key);
    return;
  }
  url.searchParams.set(key, value);
};
