export const getStoredValue = (key: string, fallback: string): string => {
  const value = localStorage.getItem(key);
  if (value === null) {
    return fallback;
  }
  return value;
};

export const setStoredValue = (key: string, value: string): void => {
  if (value === "") {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, value);
};

export const removeStoredValue = (key: string): void => {
  localStorage.removeItem(key);
};

export const loadJson = <T>(
  key: string,
  parse: (value: unknown) => T,
  fallback: T
): T => {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  return parse(parsed);
};

export const saveJson = (key: string, value: unknown): void => {
  localStorage.setItem(key, JSON.stringify(value));
};
