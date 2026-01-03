import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { ErrorMessage } from "./constants";
import { err, ok, type Result } from "./result";

export type Project = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCreateInput = {
  name: string;
  rootPath: string;
};

export type ProjectOpenInput = {
  rootPath: string;
  name?: string;
};

export const ProjectStoreErrorCode = {
  Conflict: "conflict",
  InvalidInput: "invalid_input"
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
};

export const createProjectStore = (): ProjectStore => {
  const projectsById = new Map<string, Project>();
  const projectsByRoot = new Map<string, string>();

  const create = (input: ProjectCreateInput): Result<Project, ProjectStoreError> =>
    createProject(projectsById, projectsByRoot, input);

  const open = (input: ProjectOpenInput): Result<Project, ProjectStoreError> =>
    openProject(projectsById, projectsByRoot, input);

  return {
    create,
    open
  };
};

const createProject = (
  projectsById: Map<string, Project>,
  projectsByRoot: Map<string, string>,
  input: ProjectCreateInput
): Result<Project, ProjectStoreError> => {
  const rootPath = normalizePath(input.rootPath);
  if (!rootPath) {
    return err({
      code: ProjectStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingRootPath
    });
  }

  const name = normalizePath(input.name);
  if (!name) {
    return err({
      code: ProjectStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingName
    });
  }

  if (projectsByRoot.has(rootPath)) {
    return err({
      code: ProjectStoreErrorCode.Conflict,
      message: ErrorMessage.ProjectExists
    });
  }

  const project = createProjectEntity({
    name,
    rootPath
  });

  projectsById.set(project.id, project);
  projectsByRoot.set(project.rootPath, project.id);

  return ok(project);
};

const openProject = (
  projectsById: Map<string, Project>,
  projectsByRoot: Map<string, string>,
  input: ProjectOpenInput
): Result<Project, ProjectStoreError> => {
  const rootPath = normalizePath(input.rootPath);
  if (!rootPath) {
    return err({
      code: ProjectStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingRootPath
    });
  }

  const existingId = projectsByRoot.get(rootPath);
  if (existingId) {
    const existing = projectsById.get(existingId);
    if (existing) {
      return ok(existing);
    }
  }

  const name = normalizePath(input.name) ?? basename(rootPath) ?? rootPath;
  const project = createProjectEntity({
    name,
    rootPath
  });

  projectsById.set(project.id, project);
  projectsByRoot.set(project.rootPath, project.id);

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

const normalizePath = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};