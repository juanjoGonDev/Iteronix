import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { ErrorMessage } from "./constants";
import { err, ok, type Result } from "./result";

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
};

export const createProjectStore = (): ProjectStore => {
  const projectsById = new Map<string, Project>();
  const projectsByRoot = new Map<string, string>();

  const create = (input: ProjectCreateInput): Result<Project, ProjectStoreError> =>
    createProject(projectsById, projectsByRoot, input);

  const open = (input: ProjectOpenInput): Result<Project, ProjectStoreError> =>
    openProject(projectsById, projectsByRoot, input);

  const getById = (id: string): Result<Project, ProjectStoreError> =>
    getProjectById(projectsById, id);

  return {
    create,
    open,
    getById
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
