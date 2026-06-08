import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import { DefaultServerConnection, LocalStorageKey } from "../src/shared/server-config.js";
import type { QualityGateEventRecord } from "../src/shared/workbench-types.js";
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
import {
  createQualityGatesValidationFixture,
  encodeQualityGateProgressEvent
} from "./quality-gates-validation-fixture.js";

const ValidationConfig = {
  PreviewBaseUrl: "http://127.0.0.1:4000",
  StubApiBaseUrl: "http://127.0.0.1:4101",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  ProjectsRoute: ROUTES.PROJECTS,
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 18000,
  UiPollingIntervalMs: 200,
  ViewportWidth: 1440,
  ViewportHeight: 1400
} as const;

const RequestPath = {
  ProjectOpen: "/projects/open",
  QualityGatesRun: "/quality-gates/run",
  QualityGatesList: "/quality-gates/list",
  QualityGatesEvents: "/quality-gates/events",
  QualityGatesStream: "/quality-gates/stream"
} as const;

const ResponseHeader = {
  AllowOrigin: "Access-Control-Allow-Origin",
  AllowHeaders: "Access-Control-Allow-Headers",
  AllowMethods: "Access-Control-Allow-Methods",
  ContentType: "Content-Type",
  CacheControl: "Cache-Control",
  Connection: "Connection"
} as const;

const ValidationText = {
  ScreenTitle: "Projects",
  RunDetailHeading: "Run detail",
  EventDetailHeading: "Event detail",
  RunHistoryHeading: "Run history",
  OpenProject: "Open project",
  RunSelected: "Run selected",
  ProjectRootRequired: "A project name or root path is required.",
  ProjectOpened: "opened",
  RunningLint: "Running lint",
  TypecheckPassed: "Typecheck passed",
  HistoryPassed: "4/4 passed",
  RunPassedValue: "4/4"
} as const;

type StubServerState = {
  runStarted: boolean;
  pollCount: number;
  streamServed: boolean;
  events: QualityGateEventRecord[];
};

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");
const runtimeOptions = parseBrowserValidationRuntimeOptions(process.argv.slice(2));
const fixture = createQualityGatesValidationFixture();

await validateQualityGatesProjects();

async function validateQualityGatesProjects(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots
  });

  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startQualityGatesStubServer();
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
      artifactName: "workbench-quality-gates"
    });

    await setInputValueByTestId(page, "quality-gates-project-root", "");
    await clickNamedButton(page, ValidationText.OpenProject);
    await waitForToastText(page, ValidationText.ProjectRootRequired);
    await assertNoLegacyInlineNotice(page);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-toast",
      artifactName: "workbench-quality-gates"
    });

    await setInputValueByTestId(page, "quality-gates-project-root", fixture.project.rootPath ?? "");
    await clickNamedButton(page, ValidationText.OpenProject);
    await waitForPageTexts(page, [
      fixture.project.name,
      fixture.project.rootPath ?? "",
      ValidationText.ProjectOpened
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-open",
      artifactName: "workbench-quality-gates"
    });

    await clickNamedButton(page, ValidationText.RunSelected);
    await waitForPageTexts(page, [
      ValidationText.RunningLint,
      ValidationText.TypecheckPassed
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-stream",
      artifactName: "workbench-quality-gates"
    });

    await waitForPanelTexts(page, ValidationText.RunDetailHeading, [
      ValidationText.RunPassedValue
    ]);
    await waitForPanelTexts(page, ValidationText.EventDetailHeading, [
      ValidationText.TypecheckPassed
    ]);
    await waitForPanelTexts(page, ValidationText.RunHistoryHeading, [
      ValidationText.HistoryPassed
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-polling",
      artifactName: "workbench-quality-gates"
    });

    console.log("Browser validation passed for quality gates projects flow.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stubServer.close();
    await stopProcess(previewServer);
  }
}

async function startQualityGatesStubServer(): Promise<{
  close: () => Promise<void>;
}> {
  const state: StubServerState = {
    runStarted: false,
    pollCount: 0,
    streamServed: false,
    events: []
  };
  const server = createServer((request, response) => {
    void handleStubRequest(request, response, state);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(4101, "127.0.0.1", () => resolve());
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
  state: StubServerState
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

  if (request.method === "POST" && requestUrl.pathname === RequestPath.QualityGatesRun) {
    await handleQualityGatesRun(request, response, state);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.QualityGatesList) {
    await handleQualityGatesList(response, state);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.QualityGatesEvents) {
    await handleQualityGatesEvents(response, state);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === RequestPath.QualityGatesStream) {
    await handleQualityGatesStream(requestUrl, response, state);
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

  if (rootPath !== fixture.project.rootPath) {
    writeJson(response, 400, {
      message: "Unexpected project root"
    });
    return;
  }

  writeJson(response, 200, {
    project: fixture.project
  });
}

async function handleQualityGatesRun(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubServerState
): Promise<void> {
  const body = await readJsonBody(request);
  const projectId = readRequiredString(body, "projectId");

  if (projectId !== fixture.project.id) {
    writeJson(response, 400, {
      message: "Unexpected project id"
    });
    return;
  }

  state.runStarted = true;
  state.pollCount = 0;
  state.streamServed = false;
  state.events = [];

  writeJson(response, 200, {
    run: fixture.runningRun
  });
}

async function handleQualityGatesList(
  response: ServerResponse,
  state: StubServerState
): Promise<void> {
  const runs = state.runStarted ? fixture.readRunsForPoll(state.pollCount) : [];
  if (state.runStarted) {
    state.pollCount += 1;
  }

  writeJson(response, 200, {
    runs
  });
}

async function handleQualityGatesEvents(
  response: ServerResponse,
  state: StubServerState
): Promise<void> {
  writeJson(response, 200, {
    events: state.runStarted ? state.events : []
  });
}

async function handleQualityGatesStream(
  requestUrl: URL,
  response: ServerResponse,
  state: StubServerState
): Promise<void> {
  if (!state.runStarted || requestUrl.searchParams.get("runId") !== fixture.runningRun.id) {
    writeJson(response, 404, {
      message: "Run not found"
    });
    return;
  }

  response.writeHead(200, {
    ...createCorsHeaders(),
    [ResponseHeader.ContentType]: "text/event-stream",
    [ResponseHeader.CacheControl]: "no-cache",
    [ResponseHeader.Connection]: "keep-alive"
  });

  if (state.streamServed) {
    response.end();
    return;
  }

  state.streamServed = true;

  for (const event of fixture.streamEvents) {
    if (!state.events.some((item) => item.id === event.id)) {
      state.events.push(event);
    }
    response.write(encodeQualityGateProgressEvent(event));
    await delay(250);
  }

  response.end();
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

async function waitForPanelTexts(
  page: Page,
  headingText: string,
  expectedTexts: ReadonlyArray<string>
): Promise<void> {
  await waitForCondition(async () => {
    const panelText = await page.evaluate((input: { headingText: string }) => {
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (element) => element.textContent?.trim() === input.headingText
      );

      return heading?.parentElement?.parentElement?.parentElement?.textContent ?? "";
    }, {
      headingText
    });

    return expectedTexts.every((text) => panelText.includes(text));
  }, `panel "${headingText}" texts "${expectedTexts.join(", ")}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForToastText(page: Page, text: string): Promise<void> {
  await waitForCondition(async () => {
    const toastText = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid^=\"toast-\"]"))
        .map((element) => element.textContent ?? "")
        .join("\n")
    );
    return toastText.includes(text);
  }, `toast text "${text}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function assertNoLegacyInlineNotice(page: Page): Promise<void> {
  const hasLegacyNotice = await page.evaluate(() =>
    Array.from(document.querySelectorAll("div")).some((element) => {
      const className = element.getAttribute("class") ?? "";
      return className.includes("bg-rose-500/10") || className.includes("bg-emerald-500/10");
    })
  );

  if (hasLegacyNotice) {
    throw new Error("Legacy inline alert markup is still visible.");
  }
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
