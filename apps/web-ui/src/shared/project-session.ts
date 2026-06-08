import type { StorageLike } from "./server-config.js";

const ProjectSessionStorageKey = "iteronix_project_session";
const RecentProjectsLimit = 6;

export const ProjectSessionEventName = {
  Changed: "iteronix:project-session-changed"
} as const;

export type RecentProjectEntry = {
  rootPath: string | null;
  name: string;
};

export type ProjectSessionState = {
  projectRootPath: string | null;
  projectName: string;
  recentProjects: ReadonlyArray<RecentProjectEntry>;
};

export type ProjectSessionStorage = {
  load: () => ProjectSessionState;
  saveRecentProject: (project: RecentProjectEntry) => ProjectSessionState;
};

let projectSessionCache = createEmptyProjectSession();

export const createProjectSessionStorage = (
  storage?: StorageLike
): ProjectSessionStorage => ({
  load: () => {
    void storage;
    return readProjectSession();
  },
  saveRecentProject: (project) => {
    void storage;
    const current = readProjectSession(storage);
    const normalizedProject = normalizeRecentProject(project);
    const nextState = {
      ...current,
      recentProjects: [
        normalizedProject,
        ...current.recentProjects.filter(
          (entry) => readRecentProjectKey(entry) !== readRecentProjectKey(normalizedProject)
        )
      ].slice(0, RecentProjectsLimit)
    };

    writeProjectSession(nextState, storage);
    return nextState;
  }
});

export const readProjectSession = (
  storage?: StorageLike
): ProjectSessionState => {
  if (storage) {
    const raw = storage.getItem(ProjectSessionStorageKey);
    if (!raw) {
      return createEmptyProjectSession();
    }

    try {
      return parseProjectSession(JSON.parse(raw));
    } catch {
      return createEmptyProjectSession();
    }
  }

  return projectSessionCache;
};

export const writeProjectSession = (
  input: Partial<ProjectSessionState>,
  storage?: StorageLike
): ProjectSessionState => {
  const current = readProjectSession(storage);
  const nextState = {
    projectRootPath: Object.hasOwn(input, "projectRootPath")
      ? normalizeNullableText(input.projectRootPath)
      : current.projectRootPath,
    projectName: normalizeText(input.projectName ?? current.projectName),
    recentProjects: normalizeRecentProjects(
      input.recentProjects ?? current.recentProjects
    )
  };

  if (storage) {
    storage.setItem(ProjectSessionStorageKey, JSON.stringify(nextState));
  } else {
    projectSessionCache = nextState;
  }
  notifyProjectSessionChanged();
  return nextState;
};

export const clearProjectSession = (
  storage?: StorageLike
): ProjectSessionState =>
  writeProjectSession(
    {
      projectRootPath: null,
      projectName: "",
      recentProjects: readProjectSession(storage).recentProjects
    },
    storage
  );

export const hydrateProjectSession = (input: ProjectSessionState): ProjectSessionState =>
  writeProjectSession(input);

export const readActiveProjectSessionLabel = (
  session: ProjectSessionState
): string => {
  const explicitName = normalizeText(session.projectName);
  if (explicitName.length > 0) {
    return explicitName;
  }

  return readProjectRootName(session.projectRootPath ?? "");
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

    if (project.rootPath === null && project.name.length === 0) {
      continue;
    }

    if (!normalized.some((item) => readRecentProjectKey(item) === readRecentProjectKey(project))) {
      normalized.push(project);
    }
  }

  return normalized.slice(0, RecentProjectsLimit);
};

const parseProjectSession = (value: unknown): ProjectSessionState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyProjectSession();
  }

  const record = value as Record<string, unknown>;
  return {
    projectRootPath: normalizeNullableText(record["projectRootPath"]),
    projectName: normalizeText(record["projectName"]),
    recentProjects: normalizeRecentProjects(record["recentProjects"])
  };
};

const normalizeRecentProject = (value: {
  rootPath: unknown;
  name: unknown;
}): RecentProjectEntry => ({
  rootPath: normalizeNullableText(value.rootPath),
  name: normalizeText(value.name)
});

const readRecentProjectKey = (project: RecentProjectEntry): string =>
  project.rootPath !== null
    ? `root:${project.rootPath}`
    : `workflow:${project.name.toLocaleLowerCase()}`;

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeNullableText = (value: unknown): string | null => {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
};

function createEmptyProjectSession(): ProjectSessionState {
  return {
    projectRootPath: null,
    projectName: "",
    recentProjects: []
  };
}

const readProjectRootName = (value: string): string => {
  const normalized = normalizeText(value).replace(/\\/g, "/");
  if (normalized.length === 0) {
    return "";
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments.at(-1) ?? normalized;
};

const notifyProjectSessionChanged = (): void => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(new Event(ProjectSessionEventName.Changed));
};
