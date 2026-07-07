import { createServer, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import {
  DefaultServerConnection,
  LocalStorageKey,
} from "../src/shared/server-config.js";
import {
  assertBrowserValidationBuildOutput,
  captureBrowserValidationScreenshot,
  parseBrowserValidationRuntimeOptions,
  prepareBrowserValidationDirectory,
  startPreviewServer,
  stopProcess,
  waitForCondition,
  waitForHttpReady,
} from "./browser-validation-runtime.js";

const ValidationConfig = {
  PreviewBaseUrl: "http://127.0.0.1:4000",
  StubApiBaseUrl: "http://127.0.0.1:4108",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  Route: ROUTES.KANBAN,
  StartupTimeoutMs: 30000,
  PollingTimeoutMs: 18000,
  PollingIntervalMs: 200,
  ViewportWidth: 1440,
  ViewportHeight: 900,
} as const;

const Project = {
  id: "kanban-url-project",
  name: "URL Kanban",
  rootPath: "D:/projects/Iteronix",
  createdAt: "2026-07-07T09:00:00.000Z",
  updatedAt: "2026-07-07T09:05:00.000Z",
} as const;

const Board = {
  id: "kanban-url-board",
  projectId: Project.id,
  name: "Iteronix Board",
  createdAt: Project.createdAt,
  updatedAt: Project.updatedAt,
} as const;

const Columns = [
  {
    id: "ideas-column",
    boardId: Board.id,
    name: "IDEAS",
    position: 0,
    createdAt: Project.createdAt,
    updatedAt: Project.updatedAt,
  },
  {
    id: "todo-column",
    boardId: Board.id,
    name: "TODO",
    position: 1,
    createdAt: Project.createdAt,
    updatedAt: Project.updatedAt,
  },
  {
    id: "progress-column",
    boardId: Board.id,
    name: "IN_PROGRESS",
    position: 2,
    createdAt: Project.createdAt,
    updatedAt: Project.updatedAt,
  },
  {
    id: "qa-column",
    boardId: Board.id,
    name: "QA",
    position: 3,
    createdAt: Project.createdAt,
    updatedAt: Project.updatedAt,
  },
  {
    id: "done-column",
    boardId: Board.id,
    name: "DONE",
    position: 4,
    createdAt: Project.createdAt,
    updatedAt: Project.updatedAt,
  },
] as const;

const Task = {
  id: "task-url-1",
  boardId: Board.id,
  columnId: "todo-column",
  title: "URL restored task",
  description: "Task modal survives reload from query state.",
  position: 0,
  createdAt: Project.createdAt,
  updatedAt: Project.updatedAt,
} as const;

const runtimeOptions = parseBrowserValidationRuntimeOptions(
  process.argv.slice(2),
);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");

await validateKanbanUrlState();

async function validateKanbanUrlState(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots,
  });
  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startKanbanStubServer();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    await waitForHttpReady(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.PreviewHealthPath}`,
      {
        timeoutMs: ValidationConfig.StartupTimeoutMs,
        intervalMs: ValidationConfig.PollingIntervalMs,
      },
    );
    await waitForHttpReady(
      `${ValidationConfig.StubApiBaseUrl}${ValidationConfig.StubHealthPath}`,
      {
        timeoutMs: ValidationConfig.StartupTimeoutMs,
        intervalMs: ValidationConfig.PollingIntervalMs,
      },
    );
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({
      width: ValidationConfig.ViewportWidth,
      height: ValidationConfig.ViewportHeight,
    });
    await seedBrowserStorage(page);
    await page.goto(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.Route}?task=${Task.id}`,
      { waitUntil: "networkidle0" },
    );
    await waitForSelector(page, '[data-testid="kanban-task-modal"]');
    await waitForPageText(page, Task.title);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "kanban-task-modal-deeplink",
      artifactName: "kanban",
    });
    await page.reload({ waitUntil: "networkidle0" });
    await waitForSelector(page, '[data-testid="kanban-task-modal"]');
    await waitForTextareaValue(page, Task.description);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "kanban-task-modal-reload",
      artifactName: "kanban",
    });
    console.log("Kanban URL validation passed.");
  } finally {
    await browser?.close();
    await closeServer(stubServer);
    stopProcess(previewServer);
  }
}

async function seedBrowserStorage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(
    (input: {
      serverUrlKey: string;
      authTokenKey: string;
      serverUrl: string;
      authToken: string;
      session: string;
    }) => {
      window.localStorage.setItem(input.serverUrlKey, input.serverUrl);
      window.localStorage.setItem(input.authTokenKey, input.authToken);
      window.localStorage.setItem("iteronix_project_session", input.session);
    },
    {
      serverUrlKey: LocalStorageKey.ServerUrl,
      authTokenKey: LocalStorageKey.AuthToken,
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken,
      session: JSON.stringify({
        projectRootPath: Project.rootPath,
        projectName: Project.name,
        recentProjects: [{ rootPath: Project.rootPath, name: Project.name }],
      }),
    },
  );
}

async function startKanbanStubServer(): Promise<
  ReturnType<typeof createServer>
> {
  const server = createServer((request, response) => {
    setCors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.url === "/health") {
      writeJson(response, { ok: true });
      return;
    }
    if (request.url === "/workspace/state/get") {
      writeJson(response, {
        state: {
          activeProjectId: Project.id,
          projects: [Project],
          settings: {},
          workbenchHistory: { runs: [], evals: [] },
        },
      });
      return;
    }
    if (request.url === "/projects/open") {
      writeJson(response, { project: Project });
      return;
    }
    if (request.url === "/kanban/boards/list") {
      writeJson(response, { boards: [Board] });
      return;
    }
    if (request.url === "/kanban/columns/list") {
      writeJson(response, { columns: Columns });
      return;
    }
    if (request.url === "/kanban/tasks/list") {
      writeJson(response, { tasks: [Task] });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolveListen) =>
    server.listen(4108, "127.0.0.1", resolveListen),
  );
  return server;
}

function setCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function writeJson(response: ServerResponse, value: unknown): void {
  response.setHeader("Content-Type", "application/json");
  response.writeHead(200);
  response.end(JSON.stringify(value));
}

async function waitForPageText(page: Page, value: string): Promise<void> {
  await waitForCondition(
    async () => {
      const text = await page.evaluate(() => document.body.textContent ?? "");
      return text.includes(value);
    },
    `page text ${value}`,
    {
      timeoutMs: ValidationConfig.PollingTimeoutMs,
      intervalMs: ValidationConfig.PollingIntervalMs,
    },
  );
}

async function waitForSelector(page: Page, selector: string): Promise<void> {
  await waitForCondition(
    async () => (await page.$(selector)) !== null,
    `selector ${selector}`,
    {
      timeoutMs: ValidationConfig.PollingTimeoutMs,
      intervalMs: ValidationConfig.PollingIntervalMs,
    },
  );
}

async function waitForTextareaValue(page: Page, value: string): Promise<void> {
  await waitForCondition(
    async () =>
      page.evaluate((expectedValue) => {
        const textarea = document.querySelector("textarea");
        return textarea instanceof HTMLTextAreaElement
          ? textarea.value === expectedValue
          : false;
      }, value),
    `textarea value ${value}`,
    {
      timeoutMs: ValidationConfig.PollingTimeoutMs,
      intervalMs: ValidationConfig.PollingIntervalMs,
    },
  );
}

async function closeServer(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveClose();
    });
  });
}
