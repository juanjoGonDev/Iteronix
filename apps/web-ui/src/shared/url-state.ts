export type UrlStatePatch = Record<string, string | null | undefined>;

const SensitiveUrlParamFragments = [
  "apikey",
  "api_key",
  "token",
  "secret",
  "password",
  "credential",
  "bearer",
  "authorization",
] as const;

export const readEnumUrlParam = <TValue extends string>(
  value: string | null,
  allowedValues: ReadonlyArray<TValue>,
): TValue | null => {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return allowedValues.find((item) => item === normalizedValue) ?? null;
};

export const readNonEmptyUrlParam = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const readBooleanUrlParam = (value: string | null): boolean | null => {
  if (value === "1") {
    return true;
  }

  if (value === "0") {
    return false;
  }

  return null;
};

export const readListUrlParam = <TValue extends string>(
  value: string | null,
  allowedValues: ReadonlyArray<TValue>,
): ReadonlyArray<TValue> => {
  if (value === null) {
    return [];
  }

  const items: TValue[] = [];
  for (const rawItem of value.split(",")) {
    const item = readEnumUrlParam(rawItem, allowedValues);
    if (item !== null && !items.includes(item)) {
      items.push(item);
    }
  }

  return items;
};

export const applyUrlStatePatch = (
  urlInput: string,
  routePath: string,
  patch: UrlStatePatch,
): string => {
  const url = new URL(urlInput, "http://localhost");
  url.pathname = routePath;
  removeSensitiveUrlParams(url.searchParams);

  for (const [key, value] of Object.entries(patch)) {
    if (isSensitiveUrlParamName(key)) {
      url.searchParams.delete(key);
      continue;
    }

    if (value === undefined) {
      continue;
    }

    if (value === null || value.length === 0) {
      url.searchParams.delete(key);
      continue;
    }

    url.searchParams.set(key, value);
  }

  const query = url.searchParams.toString();
  return query.length > 0 ? `${routePath}?${query}` : routePath;
};

export const sanitizeUrlStateUrl = (urlInput: string): string => {
  const url = new URL(urlInput, "http://localhost");
  removeSensitiveUrlParams(url.searchParams);
  const query = url.searchParams.toString();
  return query.length > 0 ? `${url.pathname}?${query}` : url.pathname;
};

export const sanitizeBrowserUrlState = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  const currentUrl = `${window.location.pathname}${window.location.search}`;
  const nextUrl = sanitizeUrlStateUrl(currentUrl);
  if (currentUrl !== nextUrl) {
    window.history.replaceState({}, "", nextUrl);
  }
};

export const writeBrowserUrlState = (
  nextUrl: string,
  mode: "push" | "replace",
): void => {
  if (typeof window === "undefined") {
    return;
  }

  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (currentUrl === nextUrl) {
    return;
  }

  if (mode === "push") {
    window.history.pushState({}, "", nextUrl);
    return;
  }

  window.history.replaceState({}, "", nextUrl);
};

const removeSensitiveUrlParams = (searchParams: URLSearchParams): void => {
  for (const key of [...searchParams.keys()]) {
    if (isSensitiveUrlParamName(key)) {
      searchParams.delete(key);
    }
  }
};

const isSensitiveUrlParamName = (key: string): boolean => {
  const normalizedKey = key.trim().toLowerCase();
  return SensitiveUrlParamFragments.some((fragment) =>
    normalizedKey.includes(fragment),
  );
};
