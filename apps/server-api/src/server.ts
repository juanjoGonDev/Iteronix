import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  BearerPrefix,
  BearerScheme,
  ErrorMessage,
  FileField,
  HeaderName,
  HttpMethod,
  HttpStatus,
  MimeType,
  ProjectField,
  RoutePath,
  TextEncoding
} from "./constants";
import { loadConfig, type ServerConfig } from "./config";
import {
  listFileTree,
  readFileContent,
  writeFileContent
} from "./files";
import {
  createProjectStore,
  ProjectStoreErrorCode,
  type Project,
  type ProjectCreateInput,
  type ProjectOpenInput,
  type ProjectStore
} from "./projects";
import { err, ok, ResultType, type Result } from "./result";

export const startServer = (): void => {
  const config = loadConfig(process.env);
  const store = createProjectStore();
  const server = createServer((req, res) => {
    void handleRequest(req, res, config, store);
  });

  server.listen(config.port, config.host);
};

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  store: ProjectStore
): Promise<void> => {
  if (!req.url || !req.method) {
    respondError(res, {
      status: HttpStatus.BadRequest,
      message: ErrorMessage.MissingUrl
    });
    return;
  }

  if (!isAuthorized(req, config.authToken)) {
    respondUnauthorized(res);
    return;
  }

  const url = new URL(req.url, `http://${config.host}`);
  const path = url.pathname;
  const method = req.method;

  if (path === RoutePath.ProjectsCreate) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleCreateProject(req, res, store);
    return;
  }

  if (path === RoutePath.ProjectsOpen) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleOpenProject(req, res, store);
    return;
  }

  if (path === RoutePath.FilesTree) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileTree(req, res, store);
    return;
  }

  if (path === RoutePath.FilesRead) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileRead(req, res, store);
    return;
  }

  if (path === RoutePath.FilesWrite) {
    if (method !== HttpMethod.Post) {
      respondMethodNotAllowed(res);
      return;
    }

    await handleFileWrite(req, res, store);
    return;
  }

  respondError(res, {
    status: HttpStatus.NotFound,
    message: ErrorMessage.NotFound
  });
};

const handleCreateProject = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseCreateProject(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const created = store.create(parsed.value);
  if (created.type === ResultType.Err) {
    respondError(res, mapProjectStoreError(created.error));
    return;
  }

  respondJson(res, HttpStatus.Created, {
    project: created.value
  });
};

const handleOpenProject = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseOpenProject(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const opened = store.open(parsed.value);
  if (opened.type === ResultType.Err) {
    respondError(res, mapProjectStoreError(opened.error));
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    project: opened.value
  });
};

const handleFileTree = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileTreeRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const treeResult = await listFileTree(
    projectResult.value.rootPath,
    parsed.value.path
  );
  if (treeResult.type === ResultType.Err) {
    respondError(res, treeResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    entries: treeResult.value
  });
};

const handleFileRead = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileReadRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const readResult = await readFileContent(
    projectResult.value.rootPath,
    parsed.value.path
  );
  if (readResult.type === ResultType.Err) {
    respondError(res, readResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    content: readResult.value.content
  });
};

const handleFileWrite = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: ProjectStore
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (bodyResult.type === ResultType.Err) {
    respondError(res, bodyResult.error);
    return;
  }

  const parsed = parseFileWriteRequest(bodyResult.value);
  if (parsed.type === ResultType.Err) {
    respondError(res, parsed.error);
    return;
  }

  const projectResult = getProjectById(store, parsed.value.projectId);
  if (projectResult.type === ResultType.Err) {
    respondError(res, projectResult.error);
    return;
  }

  const writeResult = await writeFileContent(
    projectResult.value.rootPath,
    parsed.value.path,
    parsed.value.content
  );
  if (writeResult.type === ResultType.Err) {
    respondError(res, writeResult.error);
    return;
  }

  respondJson(res, HttpStatus.Ok, {
    bytesWritten: writeResult.value.bytesWritten
  });
};

type ApiError = {
  status: number;
  message: string;
};

const readJsonBody = async (
  req: IncomingMessage
): Promise<Result<unknown, ApiError>> =>
  new Promise((resolve) => {
    const chunks: string[] = [];

    req.on("data", (chunk: Buffer | string) => {
      chunks.push(chunkToString(chunk));
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(
          err({
            status: HttpStatus.BadRequest,
            message: ErrorMessage.EmptyBody
          })
        );
        return;
      }

      const raw = chunks.join("");
      const parsed = parseJson(raw);
      if (parsed.type === ResultType.Err) {
        resolve(parsed);
        return;
      }

      resolve(ok(parsed.value));
    });

    req.on("error", (error: Error) => {
      resolve(
        err({
          status: HttpStatus.BadRequest,
          message: error.message
        })
      );
    });
  });

const parseCreateProject = (
  value: unknown
): Result<ProjectCreateInput, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const rootPath = readRequiredString(
    value,
    ProjectField.RootPath,
    ErrorMessage.MissingRootPath
  );
  if (rootPath.type === ResultType.Err) {
    return rootPath;
  }

  const name = readRequiredString(
    value,
    ProjectField.Name,
    ErrorMessage.MissingName
  );
  if (name.type === ResultType.Err) {
    return name;
  }

  return ok({
    name: name.value,
    rootPath: rootPath.value
  });
};

const parseOpenProject = (
  value: unknown
): Result<ProjectOpenInput, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const rootPath = readRequiredString(
    value,
    ProjectField.RootPath,
    ErrorMessage.MissingRootPath
  );
  if (rootPath.type === ResultType.Err) {
    return rootPath;
  }

  const name = readOptionalString(value, ProjectField.Name);

  if (name) {
    return ok({
      name,
      rootPath: rootPath.value
    });
  }

  return ok({
    rootPath: rootPath.value
  });
};

const parseFileTreeRequest = (
  value: unknown
): Result<{ projectId: string; path?: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    FileField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const path = readOptionalString(value, FileField.Path);

  if (path) {
    return ok({
      projectId: projectId.value,
      path
    });
  }

  return ok({
    projectId: projectId.value
  });
};

const parseFileReadRequest = (
  value: unknown
): Result<{ projectId: string; path: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    FileField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const path = readRequiredString(
    value,
    FileField.Path,
    ErrorMessage.MissingPath
  );
  if (path.type === ResultType.Err) {
    return path;
  }

  return ok({
    projectId: projectId.value,
    path: path.value
  });
};

const parseFileWriteRequest = (
  value: unknown
): Result<{ projectId: string; path: string; content: string }, ApiError> => {
  if (!isRecord(value)) {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidBody
    });
  }

  const projectId = readRequiredString(
    value,
    FileField.ProjectId,
    ErrorMessage.MissingProjectId
  );
  if (projectId.type === ResultType.Err) {
    return projectId;
  }

  const path = readRequiredString(
    value,
    FileField.Path,
    ErrorMessage.MissingPath
  );
  if (path.type === ResultType.Err) {
    return path;
  }

  const content = readRequiredStringAllowEmpty(
    value,
    FileField.Content,
    ErrorMessage.MissingContent
  );
  if (content.type === ResultType.Err) {
    return content;
  }

  return ok({
    projectId: projectId.value,
    path: path.value,
    content: content.value
  });
};

const getProjectById = (
  store: ProjectStore,
  id: string
): Result<Project, ApiError> => {
  const result = store.getById(id);
  if (result.type === ResultType.Err) {
    return err(mapProjectStoreError(result.error));
  }

  return ok(result.value);
};

const mapProjectStoreError = (error: {
  code: ProjectStoreErrorCode;
  message: string;
}): ApiError => {
  if (error.code === ProjectStoreErrorCode.Conflict) {
    return {
      status: HttpStatus.Conflict,
      message: error.message
    };
  }

  if (error.code === ProjectStoreErrorCode.NotFound) {
    return {
      status: HttpStatus.NotFound,
      message: error.message
    };
  }

  return {
    status: HttpStatus.BadRequest,
    message: error.message
  };
};

const isAuthorized = (req: IncomingMessage, authToken: string): boolean => {
  const header = req.headers[HeaderName.Authorization];
  const value = typeof header === "string" ? header : undefined;

  if (!value) {
    return false;
  }

  const token = extractBearerToken(value);
  if (!token) {
    return false;
  }

  return token === authToken;
};

const extractBearerToken = (header: string): string | undefined => {
  if (!header.startsWith(BearerPrefix)) {
    return undefined;
  }

  const token = header.slice(BearerPrefix.length).trim();
  return token.length > 0 ? token : undefined;
};

const respondUnauthorized = (res: ServerResponse): void => {
  res.setHeader(HeaderName.WwwAuthenticate, BearerScheme);
  respondError(res, {
    status: HttpStatus.Unauthorized,
    message: ErrorMessage.Unauthorized
  });
};

const respondMethodNotAllowed = (res: ServerResponse): void => {
  respondError(res, {
    status: HttpStatus.MethodNotAllowed,
    message: ErrorMessage.MethodNotAllowed
  });
};

const respondError = (res: ServerResponse, error: ApiError): void => {
  respondJson(res, error.status, {
    error: {
      message: error.message
    }
  });
};

const respondJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);

  res.statusCode = status;
  res.setHeader(HeaderName.ContentType, MimeType.Json);
  res.end(payload);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRequiredString = (
  record: Record<string, unknown>,
  key: string,
  missingMessage: string
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage
    });
  }

  return ok(trimmed);
};

const readRequiredStringAllowEmpty = (
  record: Record<string, unknown>,
  key: string,
  missingMessage: string
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: missingMessage
    });
  }

  return ok(value);
};

const readOptionalString = (
  record: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseJson = (raw: string): Result<unknown, ApiError> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return ok(parsed);
  } catch {
    return err({
      status: HttpStatus.BadRequest,
      message: ErrorMessage.InvalidJson
    });
  }
};

const chunkToString = (chunk: Buffer | string): string =>
  typeof chunk === "string" ? chunk : chunk.toString(TextEncoding);
