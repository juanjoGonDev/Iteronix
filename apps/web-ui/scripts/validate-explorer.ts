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
  SearchDebounceWaitMs: 360,
  ViewportWidth: 1440,
  ViewportHeight: 1600,
  CompactViewportWidth: 390,
  CompactViewportHeight: 844,
  CompactSidebarMaxWidth: 96
} as const;

const RequestPath = {
  ProjectOpen: "/projects/open",
  FilesTree: "/files/tree",
  FilesRead: "/files/read",
  FilesSearch: "/files/search"
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
  ProjectLoaded: "Iteronix",
  FileContentMarker: "render(): string {",
  SearchRegexValue: "RENDER\\(\\)",
  RemovedPanelLabel: "Project session",
  LanguageBadge: "TypeScript"
} as const;

const Selector = {
  ActivityExplorer: '[data-testid="explorer-activity-explorer"]',
  ActivitySearch: '[data-testid="explorer-activity-search"]',
  SidebarProjectLabel: '[data-testid="sidebar-project-label"]',
  SearchInput: '[data-testid="explorer-search-input"]',
  SearchToggleRegex: '[data-testid="explorer-search-toggle-regex"]',
  SearchResults: '[data-testid="explorer-search-results"]',
  SearchResultFile: '[data-testid="explorer-search-result-file-src-screens-explorer-ts"]',
  SearchResultMatch: '[data-testid="explorer-search-result-match-src-screens-explorer-ts-2"]',
  ExpandAll: '[data-testid="explorer-expand-all"]',
  CollapseAll: '[data-testid="explorer-collapse-all"]',
  SidebarHide: '[data-testid="explorer-sidebar-hide"]',
  SidebarPanel: '[data-testid="explorer-sidebar-panel"]',
  SearchInputTestId: "explorer-search-input",
  ExplorerNodeSrc: '[data-testid="explorer-node-src"]',
  ExplorerNodeNestedFile: '[data-testid="explorer-node-src-screens-explorer-ts"]',
  LanguageBadge: '[data-testid="explorer-language-badge"]',
  FileContent: '[data-testid="explorer-file-content"]',
  CompactExplorer: '[data-testid="explorer-compact-panel-explorer"]',
  CompactSearch: '[data-testid="explorer-compact-panel-search"]',
  CompactEditor: '[data-testid="explorer-compact-panel-editor"]'
} as const;

const FixtureProject = {
  id: "project-explorer-browser",
  name: "Iteronix",
  rootPath: "D:/projects/Iteronix",
  createdAt: "2026-04-28T10:00:00.000Z",
  updatedAt: "2026-04-28T10:05:00.000Z"
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

const FixtureSearchResults = {
  regex: [
    {
      path: "src/screens/Explorer.ts",
      name: "Explorer.ts",
      matches: [
        {
          lineNumber: 2,
          lineText: "  render(): string {",
          ranges: [
            {
              start: 2,
              end: 10
            }
          ]
        }
      ]
    }
  ]
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

    await validateDesktopExplorer(browser);
    await validateCompactExplorer(browser);
  } finally {
    if (browser) {
      await browser.close();
    }

    stubServer.close();
    await stopProcess(previewServer);
  }

  console.log("Browser validation passed for the Explorer screen.");
}

async function validateDesktopExplorer(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>
): Promise<void> {
  const page = await browser.newPage();
  await page.setViewport({
    width: ValidationConfig.ViewportWidth,
    height: ValidationConfig.ViewportHeight
  });
  await seedBrowserStorage(page);
  await page.goto(`${ValidationConfig.PreviewBaseUrl}${ValidationConfig.ExplorerRoute}`, {
    waitUntil: "networkidle0"
  });

  await waitForPageText(page, ValidationText.ProjectLoaded);
  await waitForCondition(async () => {
    const label = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return element?.textContent ?? "";
    }, Selector.SidebarProjectLabel);
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
  await waitForSelector(page, Selector.ActivityExplorer);
  await waitForSelector(page, Selector.ActivitySearch);
  await captureBrowserValidationScreenshot({
    page,
    directory: screenshotDirectory,
    suffix: "desktop-after-load",
    artifactName: "explorer"
  });

  await page.click(Selector.ActivitySearch);
  await waitForSelector(page, Selector.SearchInput);
  await page.click(Selector.SearchToggleRegex);
  await waitForSelector(page, Selector.SearchInput);
  await focusSearchInput(page);
  await page.keyboard.type(ValidationText.SearchRegexValue, {
    delay: 30
  });
  await delay(ValidationConfig.SearchDebounceWaitMs);
  await waitForCondition(async () => {
    const activeTestId = await page.evaluate(() => {
      const activeElement = document.activeElement;
      return activeElement instanceof HTMLElement
        ? activeElement.dataset["testid"] ?? null
        : null;
    });

    return activeTestId === Selector.SearchInputTestId;
  }, "search input retains focus after debounce", {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
  await waitForSelector(page, Selector.SearchResults);
  await waitForSelector(page, Selector.SearchResultFile);
  await waitForSelector(page, Selector.SearchResultMatch);
  await captureBrowserValidationScreenshot({
    page,
    directory: screenshotDirectory,
    suffix: "desktop-search-results",
    artifactName: "explorer"
  });

  await page.click(Selector.SearchResultMatch);
  await waitForPageText(page, ValidationText.FileContentMarker);
  await waitForCondition(async () => {
    const badge = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return element?.textContent ?? "";
    }, Selector.LanguageBadge);
    return badge.includes(ValidationText.LanguageBadge);
  }, "language badge", {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
  await waitForSelector(page, '[data-token-kind="keyword"]');
  await waitForSelector(page, '[data-token-kind="string"]');

  await page.click(Selector.ActivityExplorer);
  await waitForSelector(page, Selector.ExpandAll);
  await page.click(Selector.ExpandAll);
  await waitForSelector(page, Selector.ExplorerNodeNestedFile);
  await captureBrowserValidationScreenshot({
    page,
    directory: screenshotDirectory,
    suffix: "desktop-tree-expanded",
    artifactName: "explorer"
  });
  await page.click(Selector.CollapseAll);
  await waitForSelector(page, Selector.ExplorerNodeSrc);
  await waitForCondition(async () => {
    const node = await page.$(Selector.ExplorerNodeNestedFile);
    return node === null;
  }, "nested node hidden after collapse all", {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });

  await page.click(Selector.SidebarHide);
  await waitForCondition(async () => {
    const panel = await page.$(Selector.SidebarPanel);
    return panel === null;
  }, "sidebar panel hidden", {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
  await page.click(Selector.ActivityExplorer);
  await waitForSelector(page, Selector.SidebarPanel);
  await captureBrowserValidationScreenshot({
    page,
    directory: screenshotDirectory,
    suffix: "desktop-sidebar-restored",
    artifactName: "explorer"
  });

  await page.close();
}

async function validateCompactExplorer(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>
): Promise<void> {
  const page = await browser.newPage();
  await page.setViewport({
    width: ValidationConfig.CompactViewportWidth,
    height: ValidationConfig.CompactViewportHeight
  });
  await seedBrowserStorage(page);
  await page.goto(`${ValidationConfig.PreviewBaseUrl}${ValidationConfig.ExplorerRoute}`, {
    waitUntil: "networkidle0"
  });

  await waitForCondition(async () => {
    const sidebarWidth = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="app-sidebar-shell"]');
      return element instanceof HTMLElement ? element.getBoundingClientRect().width : null;
    });

    return sidebarWidth !== null && sidebarWidth <= ValidationConfig.CompactSidebarMaxWidth;
  }, "compact sidebar rail width", {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });

  await page.click(Selector.ActivitySearch);
  await waitForSelector(page, Selector.SearchInput);
  await page.click(Selector.SearchToggleRegex);
  await waitForSelector(page, Selector.SearchInput);
  await focusSearchInput(page);
  await page.keyboard.type(ValidationText.SearchRegexValue, {
    delay: 30
  });
  await delay(ValidationConfig.SearchDebounceWaitMs);
  await waitForSelector(page, Selector.SearchResultMatch);
  await page.click(Selector.SearchResultMatch);
  await waitForSelector(page, Selector.FileContent);
  await waitForSelector(page, Selector.CompactExplorer);
  await page.click(Selector.CompactExplorer);
  await waitForSelector(page, Selector.SidebarPanel);
  await waitForSelector(page, Selector.ExplorerNodeSrc);
  await captureBrowserValidationScreenshot({
    page,
    directory: screenshotDirectory,
    suffix: "compact-panel-restored",
    artifactName: "explorer"
  });

  await page.close();
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

async function focusSearchInput(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (element instanceof HTMLInputElement) {
      element.focus();
    }
  }, Selector.SearchInput);
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

  if (url.pathname === RequestPath.FilesSearch) {
    respondJson(response, 200, {
      results: FixtureSearchResults.regex
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
