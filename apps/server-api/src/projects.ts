import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { ErrorMessage } from "./constants";
import { ResultType, err, ok, type Result } from "./result";

export type Project = {
  id: string;
  name: string;
  rootPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCreateInput = {
  name: string;
  rootPath: string | null;
};

export type ProjectOpenInput = {
  rootPath: string | null;
  name?: string;
};

export const ProjectStoreErrorCode = {
  Conflict: "conflict",
  InvalidInput: "invalid_input",
  NotFound: "not_found"
} as const;

export type ProjectStoreErrorCode =
  typeof ProjectStoreErrorCode[keyof typeof ProjectStoreErrorCode];

export type ProjectStoreError = {
  code: ProjectStoreErrorCode;
  message: string;
};

export type ProjectStore = {
  create: (input: ProjectCreateInput) => Result<Project, ProjectStoreError>;
  open: (input: ProjectOpenInput) => Result<Project, ProjectStoreError>;
  getById: (id: string) => Result<Project, ProjectStoreError>;
  getActive: () => Result<Project | undefined, ProjectStoreError>;
  setActive: (id: string | null) => Result<Project | undefined, ProjectStoreError>;
  snapshot: () => ProjectStoreSnapshot;
};

export type ProjectStoreSnapshot = {
  projects: ReadonlyArray<Project>;
  activeProjectId: string | null;
};

export type ProjectStoreSeed = Partial<ProjectStoreSnapshot>;

export const createProjectStore = (seed: ProjectStoreSeed = {}): ProjectStore => {
  const projectsById = new Map<string, Project>();
  const projectsByRoot = new Map<string, string>();
  let activeProjectId = seed.activeProjectId ?? null;

  for (const project of seed.projects ?? []) {
    projectsById.set(project.id, project);
    projectsByRoot.set(readProjectKey(project.rootPath ?? undefined, project.name), project.id);
  }

  if (activeProjectId !== null && !projectsById.has(activeProjectId)) {
    activeProjectId = null;
  }

  const create = (input: ProjectCreateInput): Result<Project, ProjectStoreError> =>
    withActiveProject(createProject(projectsById, projectsByRoot, input));

  const open = (input: ProjectOpenInput): Result<Project, ProjectStoreError> =>
    withActiveProject(openProject(projectsById, projectsByRoot, input));

  const getById = (id: string): Result<Project, ProjectStoreError> =>
    getProjectById(projectsById, id);

  const getActive = (): Result<Project | undefined, ProjectStoreError> => {
    if (activeProjectId === null) {
      return ok(undefined);
    }

    return getProjectById(projectsById, activeProjectId);
  };

  const setActive = (id: string | null): Result<Project | undefined, ProjectStoreError> => {
    if (id === null) {
      activeProjectId = null;
      return ok(undefined);
    }

    const project = getProjectById(projectsById, id);
    if (project.type === ResultType.Err) {
      return project;
    }

    activeProjectId = project.value.id;
    return ok(project.value);
  };

  const snapshot = (): ProjectStoreSnapshot => ({
    projects: Array.from(projectsById.values()),
    activeProjectId
  });

  const withActiveProject = (
    result: Result<Project, ProjectStoreError>
  ): Result<Project, ProjectStoreError> => {
    if (result.type === ResultType.Ok) {
      activeProjectId = result.value.id;
    }

    return result;
  };

  return {
    create,
    open,
    getById,
    getActive,
    setActive,
    snapshot
  };
};

const createProject = (
  projectsById: Map<string, Project>,
  projectsByRoot: Map<string, string>,
  input: ProjectCreateInput
): Result<Project, ProjectStoreError> => {
  const rootPath = normalizePath(input.rootPath);
  const name = normalizePath(input.name);
  if (!name) {
    return err({
      code: ProjectStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingName
    });
  }

  const projectKey = readProjectKey(rootPath, name);
  if (projectsByRoot.has(projectKey)) {
    return err({
      code: ProjectStoreErrorCode.Conflict,
      message: ErrorMessage.ProjectExists
    });
  }

  const project = createProjectEntity({
    name,
    rootPath: rootPath ?? null
  });

  projectsById.set(project.id, project);
  projectsByRoot.set(projectKey, project.id);

  return ok(project);
};

const openProject = (
  projectsById: Map<string, Project>,
  projectsByRoot: Map<string, string>,
  input: ProjectOpenInput
): Result<Project, ProjectStoreError> => {
  const rootPath = normalizePath(input.rootPath);
  const explicitName = normalizePath(input.name);
  const name = explicitName ?? readNameFromRootPath(rootPath);
  if (!name) {
    return err({
      code: ProjectStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingName
    });
  }

  const projectKey = readProjectKey(rootPath, name);
  const existingId = projectsByRoot.get(projectKey);
  if (existingId) {
    const existing = projectsById.get(existingId);
    if (existing) {
      return ok(existing);
    }
  }

  const project = createProjectEntity({
    name,
    rootPath: rootPath ?? null
  });

  projectsById.set(project.id, project);
  projectsByRoot.set(projectKey, project.id);

  return ok(project);
};

const getProjectById = (
  projectsById: Map<string, Project>,
  id: string
): Result<Project, ProjectStoreError> => {
  const project = projectsById.get(id);
  if (!project) {
    return err({
      code: ProjectStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  return ok(project);
};

const createProjectEntity = (input: ProjectCreateInput): Project => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: input.name,
    rootPath: input.rootPath,
    createdAt: now,
    updatedAt: now
  };
};

const normalizePath = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readNameFromRootPath = (rootPath: string | undefined): string | undefined => {
  if (!rootPath) {
    return undefined;
  }

  return basename(rootPath) || rootPath;
};

const readProjectKey = (
  rootPath: string | undefined,
  name: string
): string => rootPath ?? `workflow:${name.toLocaleLowerCase()}`;
