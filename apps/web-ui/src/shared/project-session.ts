import type { StorageLike } from "./server-config.js";

const LocalStorageKey = {
  ProjectSession: "iteronix_project_session"
} as const;

const RecentProjectsLimit = 6;

export type RecentProjectEntry = {
  rootPath: string;
  name: string;
};

export type ProjectSessionState = {
  projectRootPath: string;
  projectName: string;
  recentProjects: ReadonlyArray<RecentProjectEntry>;
};

export type ProjectSessionStorage = {
  load: () => ProjectSessionState;
  saveRecentProject: (project: RecentProjectEntry) => ProjectSessionState;
};

export const createProjectSessionStorage = (
  storage: StorageLike = window.localStorage
): ProjectSessionStorage => ({
  load: () => readProjectSession(storage),
  saveRecentProject: (project) => {
    const current = readProjectSession(storage);
    const normalizedProject = normalizeRecentProject(project);
    const nextState = {
      ...current,
      recentProjects: [
        normalizedProject,
        ...current.recentProjects.filter(
          (entry) => entry.rootPath !== normalizedProject.rootPath
        )
      ].slice(0, RecentProjectsLimit)
    };

    writeProjectSession(nextState, storage);
    return nextState;
  }
});

export const readProjectSession = (
  storage: StorageLike = window.localStorage
): ProjectSessionState => {
  const raw = storage.getItem(LocalStorageKey.ProjectSession);
  if (!raw) {
    return createEmptyProjectSession();
  }

  try {
    return parseProjectSession(JSON.parse(raw));
  } catch {
    return createEmptyProjectSession();
  }
};

export const writeProjectSession = (
  input: Partial<ProjectSessionState>,
  storage: StorageLike = window.localStorage
): ProjectSessionState => {
  const current = readProjectSession(storage);
  const nextState = {
    projectRootPath: normalizeText(
      input.projectRootPath ?? current.projectRootPath
    ),
    projectName: normalizeText(input.projectName ?? current.projectName),
    recentProjects: normalizeRecentProjects(
      input.recentProjects ?? current.recentProjects
    )
  };

  storage.setItem(LocalStorageKey.ProjectSession, JSON.stringify(nextState));
  return nextState;
};

export const clearProjectSession = (
  storage: StorageLike = window.localStorage
): ProjectSessionState =>
  writeProjectSession(
    {
      projectRootPath: "",
      projectName: "",
      recentProjects: readProjectSession(storage).recentProjects
    },
    storage
  );

const parseProjectSession = (value: unknown): ProjectSessionState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyProjectSession();
  }

  const record = value as Record<string, unknown>;
  return {
    projectRootPath: normalizeText(record["projectRootPath"]),
    projectName: normalizeText(record["projectName"]),
    recentProjects: normalizeRecentProjects(record["recentProjects"])
  };
};

const normalizeRecentProjects = (
  value: unknown
): ReadonlyArray<RecentProjectEntry> => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: RecentProjectEntry[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const project = normalizeRecentProject({
      rootPath: record["rootPath"],
      name: record["name"]
    });

    if (project.rootPath.length === 0) {
      continue;
    }

    if (!normalized.some((item) => item.rootPath === project.rootPath)) {
      normalized.push(project);
    }
  }

  return normalized.slice(0, RecentProjectsLimit);
};

const normalizeRecentProject = (value: {
  rootPath: unknown;
  name: unknown;
}): RecentProjectEntry => ({
  rootPath: normalizeText(value.rootPath),
  name: normalizeText(value.name)
});

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const createEmptyProjectSession = (): ProjectSessionState => ({
  projectRootPath: "",
  projectName: "",
  recentProjects: []
});
