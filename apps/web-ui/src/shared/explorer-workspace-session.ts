import type { ExplorerOpenFile } from "../screens/explorer-state.js";
import type { StorageLike } from "./server-config.js";

const LocalStorageKey = {
  ExplorerWorkspace: "iteronix_explorer_workspace"
} as const;

type PersistedExplorerWorkspaceState = {
  rootPath: string;
  openFiles: ReadonlyArray<ExplorerOpenFile>;
  activeFilePath: string | null;
};

export type ExplorerWorkspaceState = {
  openFiles: ReadonlyArray<ExplorerOpenFile>;
  activeFilePath: string | null;
};

export const readExplorerWorkspaceState = (
  rootPath: string,
  storage: StorageLike = window.localStorage
): ExplorerWorkspaceState => {
  const normalizedRootPath = normalizeText(rootPath);
  if (normalizedRootPath.length === 0) {
    return createEmptyExplorerWorkspaceState();
  }

  const persistedState = readPersistedExplorerWorkspaceStates(storage).find(
    (entry) => entry.rootPath === normalizedRootPath
  );

  if (!persistedState) {
    return createEmptyExplorerWorkspaceState();
  }

  return {
    openFiles: persistedState.openFiles,
    activeFilePath: persistedState.activeFilePath
  };
};

export const writeExplorerWorkspaceState = (
  rootPath: string,
  state: ExplorerWorkspaceState,
  storage: StorageLike = window.localStorage
): ExplorerWorkspaceState => {
  const normalizedRootPath = normalizeText(rootPath);
  if (normalizedRootPath.length === 0) {
    return createEmptyExplorerWorkspaceState();
  }

  const nextState = normalizeExplorerWorkspaceState(state);
  const currentStates = readPersistedExplorerWorkspaceStates(storage).filter(
    (entry) => entry.rootPath !== normalizedRootPath
  );

  storage.setItem(
    LocalStorageKey.ExplorerWorkspace,
    JSON.stringify([
      ...currentStates,
      {
        rootPath: normalizedRootPath,
        ...nextState
      }
    ])
  );

  return nextState;
};

const readPersistedExplorerWorkspaceStates = (
  storage: StorageLike
): ReadonlyArray<PersistedExplorerWorkspaceState> => {
  const raw = storage.getItem(LocalStorageKey.ExplorerWorkspace);
  if (!raw) {
    return [];
  }

  try {
    return parsePersistedExplorerWorkspaceStates(JSON.parse(raw));
  } catch {
    return [];
  }
};

const parsePersistedExplorerWorkspaceStates = (
  value: unknown
): ReadonlyArray<PersistedExplorerWorkspaceState> => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedStates: PersistedExplorerWorkspaceState[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const rootPath = normalizeText(record["rootPath"]);
    if (rootPath.length === 0) {
      continue;
    }

    if (normalizedStates.some((state) => state.rootPath === rootPath)) {
      continue;
    }

    normalizedStates.push({
      rootPath,
      ...normalizeExplorerWorkspaceState({
        openFiles: record["openFiles"],
        activeFilePath: record["activeFilePath"]
      })
    });
  }

  return normalizedStates;
};

const normalizeExplorerWorkspaceState = (
  value: {
    openFiles: unknown;
    activeFilePath: unknown;
  }
): ExplorerWorkspaceState => {
  const openFiles = normalizeExplorerOpenFiles(value.openFiles);
  const activeFilePath = normalizeText(value.activeFilePath);

  return {
    openFiles,
    activeFilePath: openFiles.some((entry) => entry.path === activeFilePath)
      ? activeFilePath
      : null
  };
};

const normalizeExplorerOpenFiles = (
  value: unknown
): ReadonlyArray<ExplorerOpenFile> => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedOpenFiles: ExplorerOpenFile[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const path = normalizeText(record["path"]);
    if (path.length === 0 || normalizedOpenFiles.some((item) => item.path === path)) {
      continue;
    }

    normalizedOpenFiles.push({
      path,
      pinned: Boolean(record["pinned"])
    });
  }

  return normalizedOpenFiles;
};

const createEmptyExplorerWorkspaceState = (): ExplorerWorkspaceState => ({
  openFiles: [],
  activeFilePath: null
});

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
