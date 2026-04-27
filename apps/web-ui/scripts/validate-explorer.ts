import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import { DefaultServerConnection, LocalStorageKey } from "../src/shared/server-config.js";
import {
  assertBrowserValidationBuildOutput,
  captureBrowserValidationScreenshot,
  delay,
  parseBrowserValidationRuntimeOptions,
  prepareBrowserValidationDirectory,
  startPreviewServer,
  stopProcess,
  waitForCondition,
  waitForHttpReady
} from "./browser-validation-runtime.js";

const ValidationConfig = {
  PreviewBaseUrl: "http://127.0.0.1:4000",
  StubApiBaseUrl: "http://127.0.0.1:4103",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  ExplorerRoute: ROUTES.EXPLORER,
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 18000,
  UiPollingIntervalMs: 200,
  SearchDebounceWaitMs: 260,
  ViewportWidth: 1440,
  ViewportHeight: 1600
} as const;

const RequestPath = {
  ProjectOpen: "/projects/open",
  FilesTree: "/files/tree",
  FilesRead: "/files/read"
} as const;

const ResponseHeader = {
  AllowOrigin: "Access-Control-Allow-Origin",
  AllowHeaders: "Access-Control-Allow-Headers",
  AllowMethods: "Access-Control-Allow-Methods",
  ContentType: "Content-Type"
} as const;

const LocalStorageKeys = {
  ProjectSession: "iteronix_project_session"
} as const;

const ValidationText = {
  ScreenTitle: "Explorer",
  ProjectLoaded: "Iteronix",
  FileContentMarker: "export class Explorer",
  SearchValue: "EXPLORER",
  SearchPrefix: "EXP",
  RemovedPanelLabel: "Project session",
  LanguageBadge: "TypeScript"
} as const;

const FixtureProject = {
  id: "project-explorer-browser",
  name: "Iteronix",
  rootPath: "D:/projects/Iteronix",
  createdAt: "2026-04-27T11:00:00.000Z",
  updatedAt: "2026-04-27T11:05:00.000Z"
} as const;

const FixtureFileTree = {
  root: [
    {
      path: "src",
      name: "src",
      kind: "directory"
    },
    {
      path: "README.md",
      name: "README.md",
      kind: "file"
    }
  ],
  src: [
    {
      path: "src/screens",
      name: "screens",
      kind: "directory"
    },
    {
      path: "src/index.ts",
      name: "index.ts",
      kind: "file"
    }
  ],
  screens: [
    {
      path: "src/screens/Explorer.ts",
      name: "Explorer.ts",
      kind: "file"
    }
  ]
} as const;

const FixtureFileContent = {
  readme: "# Iteronix\n\nRepository overview.",
  index: "export const screen = \"Explorer\";\n",
  explorer: [
    "export class Explorer {",
    "  render(): string {",
    "    return \"Explorer\";",
    "  }",
    "}"
  ].join("\n")
} as const;

const projectRoot = join(import.meta.dirname, "..");
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");
const runtimeOptions = parseBrowserValidationRuntimeOptions(process.argv.slice(2));

await validateExplorerScreen();

async function validateExplorerScreen(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots
  });

  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startExplorerStubServer();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    await waitForHttpReady(`${ValidationConfig.PreviewBaseUrl}${ValidationConfig.PreviewHealthPath}`, {
      timeoutMs: ValidationConfig.PreviewStartupTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });
    await waitForHttpReady(`${ValidationConfig.StubApiBaseUrl}${ValidationConfig.StubHealthPath}`, {
      timeoutMs: ValidationConfig.PreviewStartupTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"]
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: ValidationConfig.ViewportWidth,
      height: ValidationConfig.ViewportHeight
    });
    await seedBrowserStorage(page);
    await page.goto(`${ValidationConfig.PreviewBaseUrl}${ValidationConfig.ExplorerRoute}`, {
      waitUntil: "networkidle0"
    });

    await waitForPageText(page, ValidationText.ScreenTitle);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-load",
      artifactName: "explorer"
    });
    await waitForPageText(page, ValidationText.ProjectLoaded);
    await waitForCondition(async () => {
      const label = await page.evaluate(() => {
        const element = document.querySelector('[data-testid="sidebar-project-label"]');
        return element?.textContent ?? "";
      });
      return label.includes(ValidationText.ProjectLoaded);
    }, "sidebar project label", {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });
    await waitForCondition(async () => {
      const text = await page.evaluate(() => document.body.textContent ?? "");
      return !text.includes(ValidationText.RemovedPanelLabel);
    }, "removed project session panel", {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });
    await waitForSelector(page, '[data-testid="explorer-node-src"]');
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "before-search",
      artifactName: "explorer"
    });

    await page.click('[data-testid="explorer-node-src"]');
    await waitForSelector(page, '[data-testid="explorer-node-src-screens"]');
    await page.click('[data-testid="explorer-node-src-screens"]');
    await waitForSelector(page, '[data-testid="explorer-node-src-screens-explorer-ts"]');

    await page.click('[data-testid="explorer-search-input"]');
    await page.keyboard.type(ValidationText.SearchPrefix, {
      delay: 30
    });
    await waitForCondition(async () => {
      const labels = await page.$$eval('button[data-testid^="explorer-node-"]', (elements) =>
        elements.map((element) => element.textContent ?? "")
      );

      return labels.some((label) => label.includes("README.md"));
    }, "tree unchanged before debounce", {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });
    await page.waitForFunction(
      (value) => {
        const element = document.querySelector('[data-testid="explorer-search-input"]');
        return element instanceof HTMLInputElement && element.value === value;
      },
      {},
      ValidationText.SearchPrefix
    );
    await delay(ValidationConfig.SearchDebounceWaitMs);
    await waitForCondition(async () => {
      const activeTestId = await page.evaluate(() => {
        const activeElement = document.activeElement;
        return activeElement instanceof HTMLElement
          ? activeElement.dataset["testid"] ?? null
          : null;
      });

      return activeTestId === "explorer-search-input";
    }, "search input retains focus after debounce", {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });
    await page.keyboard.type("LORER", {
      delay: 30
    });
    await waitForCondition(async () => {
      const labels = await page.$$eval('button[data-testid^="explorer-node-"]', (elements) =>
        elements.map((element) => element.textContent ?? "")
      );

      return labels.some((label) => label.includes("Explorer.ts")) &&
        !labels.some((label) => label.includes("README.md"));
    }, "filtered explorer tree", {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });

    await page.click('[data-testid="explorer-node-src-screens-explorer-ts"]');
    await waitForPageText(page, ValidationText.FileContentMarker);
    await waitForCondition(async () => {
      const badge = await page.evaluate(() => {
        const element = document.querySelector('[data-testid="explorer-language-badge"]');
        return element?.textContent ?? "";
      });
      return badge.includes(ValidationText.LanguageBadge);
    }, "language badge", {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });
    await waitForSelector(page, '[data-token-kind="keyword"]');
    await waitForSelector(page, '[data-token-kind="string"]');
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-open",
      artifactName: "explorer"
    });
  } finally {
    if (browser) {
      await browser.close();
    }

    stubServer.close();
    await stopProcess(previewServer);
  }

  console.log("Browser validation passed for the Explorer screen.");
}

async function seedBrowserStorage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(
    (input: {
      serverUrlKey: string;
      authTokenKey: string;
      serverUrl: string;
      authToken: string;
      projectSessionKey: string;
      projectSession: {
        projectRootPath: string;
        projectName: string;
        recentProjects: ReadonlyArray<{
          rootPath: string;
          name: string;
        }>;
      };
    }) => {
      window.localStorage.setItem(input.serverUrlKey, input.serverUrl);
      window.localStorage.setItem(input.authTokenKey, input.authToken);
      window.localStorage.setItem(input.projectSessionKey, JSON.stringify(input.projectSession));
    },
    {
      serverUrlKey: LocalStorageKey.ServerUrl,
      authTokenKey: LocalStorageKey.AuthToken,
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken,
      projectSessionKey: LocalStorageKeys.ProjectSession,
      projectSession: {
        projectRootPath: FixtureProject.rootPath,
        projectName: FixtureProject.name,
        recentProjects: [
          {
            rootPath: FixtureProject.rootPath,
            name: FixtureProject.name
          }
        ]
      }
    }
  );
}

async function waitForPageText(page: Page, value: string): Promise<void> {
  await waitForCondition(async () => {
    const text = await page.evaluate(() => document.body.textContent ?? "");
    return text.includes(value);
  }, `page text ${value}`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForSelector(page: Page, selector: string): Promise<void> {
  await waitForCondition(async () => {
    const handle = await page.$(selector);
    return handle !== null;
  }, `selector ${selector}`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function startExplorerStubServer(): Promise<ReturnType<typeof createServer>> {
  const server = createServer((request, response) => {
    void handleExplorerStubRequest(request, response);
  });

  await new Promise<void>((resolve) => {
    server.listen(4103, "127.0.0.1", () => resolve());
  });

  return server;
}

async function handleExplorerStubRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  applyCorsHeaders(response);

  if (!request.url || !request.method) {
    respondJson(response, 400, {
      message: "Missing request URL"
    });
    return;
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const url = new URL(request.url, ValidationConfig.StubApiBaseUrl);

  if (url.pathname === ValidationConfig.StubHealthPath) {
    respondJson(response, 200, {
      ok: true
    });
    return;
  }

  if (request.method !== "POST") {
    respondJson(response, 405, {
      message: "Method not allowed"
    });
    return;
  }

  const body = await readJsonBody(request);

  if (url.pathname === RequestPath.ProjectOpen) {
    respondJson(response, 200, {
      project: FixtureProject
    });
    return;
  }

  if (url.pathname === RequestPath.FilesTree) {
    const path = readOptionalString(body, "path");

    if (path === "src") {
      respondJson(response, 200, {
        entries: FixtureFileTree.src
      });
      return;
    }

    if (path === "src/screens") {
      respondJson(response, 200, {
        entries: FixtureFileTree.screens
      });
      return;
    }

    respondJson(response, 200, {
      entries: FixtureFileTree.root
    });
    return;
  }

  if (url.pathname === RequestPath.FilesRead) {
    const path = readRequiredString(body, "path");

    if (path === "README.md") {
      respondJson(response, 200, {
        content: FixtureFileContent.readme
      });
      return;
    }

    if (path === "src/index.ts") {
      respondJson(response, 200, {
        content: FixtureFileContent.index
      });
      return;
    }

    respondJson(response, 200, {
      content: FixtureFileContent.explorer
    });
    return;
  }

  respondJson(response, 404, {
    message: "Route not found"
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(normalizeRequestChunk(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeRequestChunk(chunk: unknown): Buffer {
  if (typeof chunk === "string") {
    return Buffer.from(chunk, "utf8");
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  throw new Error("Unsupported request chunk.");
}

function applyCorsHeaders(response: ServerResponse): void {
  response.setHeader(ResponseHeader.AllowOrigin, "*");
  response.setHeader(ResponseHeader.AllowHeaders, "authorization, content-type");
  response.setHeader(ResponseHeader.AllowMethods, "GET,POST,OPTIONS");
  response.setHeader(ResponseHeader.ContentType, "application/json");
}

function respondJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.statusCode = statusCode;
  response.end(JSON.stringify(payload));
}

function readOptionalString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" ? entry : undefined;
}

function readRequiredString(value: unknown, key: string): string {
  const entry = readOptionalString(value, key);

  if (!entry) {
    throw new Error(`Missing ${key}`);
  }

  return entry;
}
