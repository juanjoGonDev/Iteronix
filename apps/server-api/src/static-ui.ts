import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

const UiEntryFileName = "index.html";
const UiAssetDirectory = "dist";

const ContentTypeByExtension: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
} as const;

export const createStaticUiRequestHandler =
  (
    root: string,
  ): ((request: IncomingMessage, response: ServerResponse) => void) =>
  (request, response) => {
    if (tryServeStaticUi(request, response, root)) {
      return;
    }

    response.statusCode = 404;
    response.end();
  };

export const tryServeStaticUi = (
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
): boolean => {
  if (request.method !== "GET" || !request.url) {
    return false;
  }

  const rootPath = resolve(root);
  const requestPath = new URL(request.url, "http://localhost").pathname;
  const relativePath = readStaticUiRelativePath(requestPath);
  if (!relativePath) {
    return false;
  }
  const filePath = resolve(rootPath, relativePath);

  if (!filePath.startsWith(`${rootPath}${sep}`) && filePath !== rootPath) {
    return false;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }

  response.writeHead(200, {
    "content-type":
      ContentTypeByExtension[extname(filePath)] ?? "application/octet-stream",
  });
  response.end(readFileSync(filePath));
  return true;
};

const readStaticUiRelativePath = (path: string): string | null => {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decodedPath === "/" || !decodedPath.includes(".")) {
    return UiEntryFileName;
  }

  if (decodedPath === `/${UiEntryFileName}`) {
    return UiEntryFileName;
  }

  return decodedPath.startsWith(`/${UiAssetDirectory}/`)
    ? decodedPath.slice(1)
    : null;
};
