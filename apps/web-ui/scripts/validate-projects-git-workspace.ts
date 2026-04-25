import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import { DefaultServerConnection, LocalStorageKey } from "../src/shared/server-config.js";
import type { ProjectRecord } from "../src/shared/workbench-types.js";
import {
  assertBrowserValidationBuildOutput,
  captureBrowserValidationScreenshot,
  parseBrowserValidationRuntimeOptions,
  prepareBrowserValidationDirectory,
  startPreviewServer,
  stopProcess,
  waitForCondition,
  waitForHttpReady
} from "./browser-validation-runtime.js";

const ValidationConfig = {
  PreviewBaseUrl: "http://127.0.0.1:4000",
  StubApiBaseUrl: "http://127.0.0.1:4102",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  ProjectsRoute: ROUTES.PROJECTS,
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 18000,
  UiPollingIntervalMs: 200,
  ViewportWidth: 1440,
  ViewportHeight: 1600
} as const;

const RequestPath = {
  ProjectOpen: "/projects/open",
  QualityGatesList: "/quality-gates/list",
  QualityGatesEvents: "/quality-gates/events",
  GitStatus: "/git/status",
  GitDiff: "/git/diff",
  GitCommit: "/git/commit"
} as const;

const ResponseHeader = {
  AllowOrigin: "Access-Control-Allow-Origin",
  AllowHeaders: "Access-Control-Allow-Headers",
  AllowMethods: "Access-Control-Allow-Methods",
  ContentType: "Content-Type"
} as const;

const ValidationText = {
  ScreenTitle: "Projects",
  OpenProject: "Open project",
  StagedDiffButton: "Staged diff (2)",
  CreateCommit: "Create commit",
  InvalidCommit: "Use a Conventional Commit message such as feat(projects): add git workspace panel.",
  CommitCreated: "Commit 9f3c2ad1 created.",
  StagedDiffZero: "Staged diff (0)",
  StagedDiffMarker: "diff --git a/apps/web-ui/src/screens/Projects.ts b/apps/web-ui/src/screens/Projects.ts",
  UnstagedDiffMarker: "diff --git a/apps/web-ui/src/shared/quality-gates-client.ts b/apps/web-ui/src/shared/quality-gates-client.ts"
} as const;

const FixtureTimestamp = {
  ProjectCreatedAt: "2026-04-25T08:00:00.000Z",
  ProjectUpdatedAt: "2026-04-25T08:10:00.000Z"
} as const;

const FixtureProject: ProjectRecord = {
  id: "project-git-browser",
  name: "Iteronix",
  rootPath: "D:/projects/Iteronix",
  createdAt: FixtureTimestamp.ProjectCreatedAt,
  updatedAt: FixtureTimestamp.ProjectUpdatedAt
};

const FixtureRepositoryBeforeCommit = {
  branch: "feature/git-ui",
  upstream: "origin/feature/git-ui",
  ahead: 2,
  behind: 0,
  clean: false,
  stagedCount: 2,
  unstagedCount: 1,
  untrackedCount: 1,
  entries: [
    {
      path: "apps/web-ui/src/screens/Projects.ts",
      indexStatus: "M",
      workingTreeStatus: " ",
      staged: true,
      unstaged: false,
      untracked: false
    },
    {
      path: "apps/web-ui/src/shared/git-client.ts",
      indexStatus: "A",
      workingTreeStatus: " ",
      staged: true,
      unstaged: false,
      untracked: false
    },
    {
      path: "apps/web-ui/src/shared/quality-gates-client.ts",
      indexStatus: " ",
      workingTreeStatus: "M",
      staged: false,
      unstaged: true,
      untracked: false
    },
    {
      path: "apps/web-ui/src/screens/GitDetails.ts",
      indexStatus: "?",
      workingTreeStatus: "?",
      staged: false,
      unstaged: false,
      untracked: true
    }
  ]
} as const;

const FixtureRepositoryAfterCommit = {
  branch: "feature/git-ui",
  upstream: "origin/feature/git-ui",
  ahead: 3,
  behind: 0,
  clean: false,
  stagedCount: 0,
  unstagedCount: 1,
  untrackedCount: 1,
  entries: [
    {
      path: "apps/web-ui/src/shared/quality-gates-client.ts",
      indexStatus: " ",
      workingTreeStatus: "M",
      staged: false,
      unstaged: true,
      untracked: false
    },
    {
      path: "apps/web-ui/src/screens/GitDetails.ts",
      indexStatus: "?",
      workingTreeStatus: "?",
      staged: false,
      unstaged: false,
      untracked: true
    }
  ]
} as const;

const FixtureDiff = {
  Staged: [
    "diff --git a/apps/web-ui/src/screens/Projects.ts b/apps/web-ui/src/screens/Projects.ts",
    "index 1a2b3c4..5d6e7f8 100644",
    "--- a/apps/web-ui/src/screens/Projects.ts",
    "+++ b/apps/web-ui/src/screens/Projects.ts",
    "@@ -12,6 +12,9 @@",
    "+import { createGitClient } from \"../shared/git-client.js\";"
  ].join("\n"),
  Unstaged: [
    "diff --git a/apps/web-ui/src/shared/quality-gates-client.ts b/apps/web-ui/src/shared/quality-gates-client.ts",
    "index 0f0f0f0..1a1a1a1 100644",
    "--- a/apps/web-ui/src/shared/quality-gates-client.ts",
    "+++ b/apps/web-ui/src/shared/quality-gates-client.ts",
    "@@ -1,5 +1,8 @@",
    "+export type QualityGatesClient = {"
  ].join("\n")
} as const;

const FixtureCommit = {
  hash: "9f3c2ad1",
  message: "feat(projects): add git workspace panel"
} as const;

type StubState = {
  committed: boolean;
};

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");
const runtimeOptions = parseBrowserValidationRuntimeOptions(process.argv.slice(2));

await validateProjectsGitWorkspace();

async function validateProjectsGitWorkspace(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots
  });

  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startGitWorkspaceStubServer();
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
    await page.goto(`${ValidationConfig.PreviewBaseUrl}${ValidationConfig.ProjectsRoute}`, {
      waitUntil: "networkidle0"
    });

    await waitForPageText(page, ValidationText.ScreenTitle);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "before-open",
      artifactName: "projects-git-workspace"
    });

    await setInputValueByTestId(page, "quality-gates-project-root", FixtureProject.rootPath);
    await clickNamedButton(page, ValidationText.OpenProject);
    await waitForPageTexts(page, [
      FixtureProject.name,
      FixtureRepositoryBeforeCommit.branch,
      "apps/web-ui/src/screens/Projects.ts"
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-open",
      artifactName: "projects-git-workspace"
    });

    await clickNamedButton(page, ValidationText.StagedDiffButton);
    await waitForPageTexts(page, [
      ValidationText.StagedDiffMarker,
      "Create commit"
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-staged-diff",
      artifactName: "projects-git-workspace"
    });

    await typeIntoInputByTestId(page, "git-commit-message", "ship it");
    await waitForPageText(page, ValidationText.InvalidCommit);

    await typeIntoInputByTestId(page, "git-commit-message", FixtureCommit.message);
    await waitForButtonEnabled(page, ValidationText.CreateCommit);
    await clickNamedButton(page, ValidationText.CreateCommit);
    await waitForPageTexts(page, [
      ValidationText.CommitCreated,
      ValidationText.StagedDiffZero,
      ValidationText.UnstagedDiffMarker
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-commit",
      artifactName: "projects-git-workspace"
    });

    console.log("Browser validation passed for the Projects git workspace flow.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stubServer.close();
    await stopProcess(previewServer);
  }
}

async function startGitWorkspaceStubServer(): Promise<{
  close: () => Promise<void>;
}> {
  const state: StubState = {
    committed: false
  };
  const server = createServer((request, response) => {
    void handleStubRequest(request, response, state);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(4102, "127.0.0.1", () => resolve());
    server.on("error", (error) => reject(error));
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

async function handleStubRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubState
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", ValidationConfig.StubApiBaseUrl);

  if (requestUrl.pathname === ValidationConfig.StubHealthPath) {
    writeJson(response, 200, {
      ok: true
    });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, createCorsHeaders());
    response.end();
    return;
  }

  if (!isAuthorized(request)) {
    writeJson(response, 401, {
      message: "Unauthorized"
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.ProjectOpen) {
    await handleProjectOpen(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.QualityGatesList) {
    writeJson(response, 200, {
      runs: []
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.QualityGatesEvents) {
    writeJson(response, 200, {
      events: []
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitStatus) {
    await handleGitStatus(request, response, state);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitDiff) {
    await handleGitDiff(request, response, state);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitCommit) {
    await handleGitCommit(request, response, state);
    return;
  }

  writeJson(response, 404, {
    message: "Not found"
  });
}

async function handleProjectOpen(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await readJsonBody(request);
  const rootPath = readRequiredString(body, "rootPath");

  if (rootPath !== FixtureProject.rootPath) {
    writeJson(response, 400, {
      message: "Unexpected project root"
    });
    return;
  }

  writeJson(response, 200, {
    project: FixtureProject
  });
}

async function handleGitStatus(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubState
): Promise<void> {
  const body = await readJsonBody(request);
  const projectId = readRequiredString(body, "projectId");

  if (projectId !== FixtureProject.id) {
    writeJson(response, 400, {
      message: "Unexpected project id"
    });
    return;
  }

  writeJson(response, 200, {
    repository: state.committed ? FixtureRepositoryAfterCommit : FixtureRepositoryBeforeCommit
  });
}

async function handleGitDiff(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubState
): Promise<void> {
  const body = await readJsonBody(request);
  const projectId = readRequiredString(body, "projectId");
  const staged = readRequiredBoolean(body, "staged");

  if (projectId !== FixtureProject.id) {
    writeJson(response, 400, {
      message: "Unexpected project id"
    });
    return;
  }

  if (staged) {
    writeJson(response, 200, {
      staged: true,
      diff: state.committed ? "" : FixtureDiff.Staged
    });
    return;
  }

  writeJson(response, 200, {
    staged: false,
    diff: FixtureDiff.Unstaged
  });
}

async function handleGitCommit(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubState
): Promise<void> {
  const body = await readJsonBody(request);
  const projectId = readRequiredString(body, "projectId");
  const message = readRequiredString(body, "message");

  if (projectId !== FixtureProject.id) {
    writeJson(response, 400, {
      message: "Unexpected project id"
    });
    return;
  }

  if (message !== FixtureCommit.message) {
    writeJson(response, 400, {
      message: "Unexpected commit message"
    });
    return;
  }

  state.committed = true;

  writeJson(response, 201, {
    commit: FixtureCommit
  });
}

function isAuthorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${DefaultServerConnection.authToken}`;
}

async function seedBrowserStorage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(
    (payload: {
      serverUrl: string;
      authToken: string;
      keys: typeof LocalStorageKey;
    }) => {
      window.localStorage.setItem(payload.keys.ServerUrl, payload.serverUrl);
      window.localStorage.setItem(payload.keys.AuthToken, payload.authToken);
    },
    {
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken,
      keys: LocalStorageKey
    }
  );
}

async function setInputValueByTestId(
  page: Page,
  testId: string,
  value: string
): Promise<void> {
  const updated = await page.evaluate(
    (input: {
      testId: string;
      value: string;
    }) => {
      const element = document.querySelector(`[data-testid="${input.testId}"]`);
      if (!(element instanceof HTMLInputElement)) {
        return false;
      }

      element.value = input.value;
      element.dispatchEvent(new Event("input", {
        bubbles: true
      }));
      element.dispatchEvent(new Event("change", {
        bubbles: true
      }));
      return true;
    },
    {
      testId,
      value
    }
  );

  if (!updated) {
    throw new Error(`Could not set input ${testId}`);
  }
}

async function typeIntoInputByTestId(
  page: Page,
  testId: string,
  value: string
): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector);
  await page.click(selector, {
    clickCount: 3
  });
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}

async function clickNamedButton(page: Page, label: string): Promise<void> {
  const clicked = await page.evaluate((buttonLabel: string) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => element.textContent?.trim() === buttonLabel
    );

    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }

    button.click();
    return true;
  }, label);

  if (!clicked) {
    throw new Error(`Could not click "${label}"`);
  }
}

async function waitForPageText(page: Page, text: string): Promise<void> {
  await waitForCondition(async () => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    return bodyText.includes(text);
  }, `page text "${text}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForPageTexts(
  page: Page,
  expectedTexts: ReadonlyArray<string>
): Promise<void> {
  await waitForCondition(async () => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    return expectedTexts.every((text) => bodyText.includes(text));
  }, `page texts "${expectedTexts.join(", ")}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForButtonEnabled(page: Page, label: string): Promise<void> {
  await waitForCondition(async () => {
    return page.evaluate((buttonLabel: string) => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (element) => element.textContent?.trim() === buttonLabel
      );

      return button instanceof HTMLButtonElement && button.disabled === false;
    }, label);
  }, `button "${label}" enabled`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const normalized = normalizeRequestChunk(chunk);
    if (normalized) {
      chunks.push(normalized);
    }
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function normalizeRequestChunk(chunk: unknown): Buffer | null {
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  return null;
}

function readRequiredString(value: unknown, key: string): string {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const nested = value[key];
  if (typeof nested !== "string" || nested.trim().length === 0) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.trim();
}

function readRequiredBoolean(value: unknown, key: string): boolean {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const nested = value[key];
  if (typeof nested !== "boolean") {
    throw new Error(`Invalid ${key}`);
  }

  return nested;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: Readonly<Record<string, unknown>>
): void {
  response.writeHead(statusCode, {
    ...createCorsHeaders(),
    [ResponseHeader.ContentType]: "application/json"
  });
  response.end(JSON.stringify(value));
}

function createCorsHeaders(): Record<string, string> {
  return {
    [ResponseHeader.AllowOrigin]: "*",
    [ResponseHeader.AllowHeaders]: "Authorization, Content-Type",
    [ResponseHeader.AllowMethods]: "GET, POST, OPTIONS"
  };
}
