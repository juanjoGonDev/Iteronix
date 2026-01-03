import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  BearerPrefix,
  BearerScheme,
  ErrorMessage,
  HeaderName,
  HttpMethod,
  HttpStatus,
  MimeType,
  ProjectField,
  RoutePath
} from "./constants";
import { loadConfig, type ServerConfig } from "./config";
import {
  createProjectStore,
  ProjectStoreErrorCode,
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

  const rootPath = readRequiredString(value, ProjectField.RootPath);
  if (rootPath.type === ResultType.Err) {
    return rootPath;
  }

  const name = readRequiredString(value, ProjectField.Name);
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

  const rootPath = readRequiredString(value, ProjectField.RootPath);
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
  key: string
): Result<string, ApiError> => {
  const value = record[key];
  if (typeof value !== "string") {
    return err({
      status: HttpStatus.BadRequest,
      message: key === ProjectField.RootPath
        ? ErrorMessage.MissingRootPath
        : ErrorMessage.MissingName
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return err({
      status: HttpStatus.BadRequest,
      message: key === ProjectField.RootPath
        ? ErrorMessage.MissingRootPath
        : ErrorMessage.MissingName
    });
  }

  return ok(trimmed);
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
  typeof chunk === "string" ? chunk : chunk.toString("utf8");
