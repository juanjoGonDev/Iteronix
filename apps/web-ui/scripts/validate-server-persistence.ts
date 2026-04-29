import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import { DefaultServerConnection, LocalStorageKey } from "../src/shared/server-config.js";
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
  StubApiBaseUrl: "http://127.0.0.1:4105",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 18000,
  UiPollingIntervalMs: 200,
  ViewportWidth: 1440,
  ViewportHeight: 1200
} as const;

const RequestPath = {
  WorkspaceStateGet: "/workspace/state/get",
  WorkspaceStateUpdate: "/workspace/state/update",
  ProjectOpen: "/projects/open",
  ProvidersList: "/providers/list",
  ProvidersSettings: "/providers/settings"
} as const;

const ResponseHeader = {
  AllowOrigin: "Access-Control-Allow-Origin",
  AllowHeaders: "Access-Control-Allow-Headers",
  AllowMethods: "Access-Control-Allow-Methods",
  ContentType: "Content-Type"
} as const;

const ValidationText = {
  ProjectsTitle: "Projects",
  SettingsTitle: "Settings",
  OpenProject: "Open project",
  SaveChanges: "Save changes",
  AddAnthropic: "Add Anthropic",
  PersistentProfile: "Claude Persistent",
  PersistentModel: "claude-sonnet-4-persistence",
  ProjectName: "Iteronix",
  ProjectRoot: "D:\\projects\\Iteronix"
} as const;

type ProjectRecord = {
  id: string;
  name: string;
  rootPath: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceState = {
  activeProjectId: string | null;
  projects: ProjectRecord[];
  settings: Record<string, unknown>;
  workbenchHistory: Record<string, unknown>;
};

const runtimeOptions = parseBrowserValidationRuntimeOptions(process.argv.slice(2));
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");

await validateServerPersistence();

async function validateServerPersistence(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots
  });

  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startStubServer();
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

    const firstPage = await browser.newPage();
    await firstPage.setViewport({
      width: ValidationConfig.ViewportWidth,
      height: ValidationConfig.ViewportHeight
    });
    await seedConnection(firstPage);
    await firstPage.goto(`${ValidationConfig.PreviewBaseUrl}${ROUTES.PROJECTS}`, {
      waitUntil: "networkidle0"
    });
    await waitForPageText(firstPage, ValidationText.ProjectsTitle);
    await setInputValueByTestId(firstPage, "quality-gates-project-root", ValidationText.ProjectRoot);
    await clickNamedButton(firstPage, ValidationText.OpenProject);
    await waitForPageText(firstPage, ValidationText.ProjectName);
    await firstPage.goto(`${ValidationConfig.PreviewBaseUrl}${ROUTES.SETTINGS}`, {
      waitUntil: "networkidle0"
    });
    await waitForPageText(firstPage, ValidationText.SettingsTitle);
    await clickNamedButton(firstPage, ValidationText.AddAnthropic);
    await setInputValueByTestId(firstPage, "settings-provider-name", ValidationText.PersistentProfile);
    await setInputValueByTestId(firstPage, "settings-provider-model", ValidationText.PersistentModel);
    await clickNamedButton(firstPage, ValidationText.SaveChanges);
    await waitForPageText(firstPage, "Settings saved.");
    await captureBrowserValidationScreenshot({
      page: firstPage,
      directory: screenshotDirectory,
      suffix: "server-persistence-first-context",
      artifactName: "server-persistence"
    });

    const secondPage = await browser.newPage();
    await secondPage.setViewport({
      width: ValidationConfig.ViewportWidth,
      height: ValidationConfig.ViewportHeight
    });
    await seedConnection(secondPage);
    await secondPage.goto(`${ValidationConfig.PreviewBaseUrl}${ROUTES.SETTINGS}`, {
      waitUntil: "networkidle0"
    });
    await waitForPageTexts(secondPage, [
      ValidationText.SettingsTitle,
      ValidationText.ProjectName,
      ValidationText.PersistentProfile
    ]);
    await clickElementContainingText(secondPage, "button", ValidationText.PersistentProfile);
    await waitForInputValue(secondPage, "settings-provider-model", ValidationText.PersistentModel);
    await captureBrowserValidationScreenshot({
      page: secondPage,
      directory: screenshotDirectory,
      suffix: "server-persistence-second-context",
      artifactName: "server-persistence"
    });

    console.log("Browser validation passed for server-first workspace persistence.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stubServer.close();
    await stopProcess(previewServer);
  }
}

async function startStubServer(): Promise<{ close: () => Promise<void> }> {
  const state = createInitialWorkspaceState();
  const server = createServer((request, response) => {
    void handleStubRequest(request, response, state);
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.listen(4105, "127.0.0.1", () => resolvePromise());
    server.on("error", (error) => reject(error));
  });

  return {
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise();
        });
      })
  };
}

async function handleStubRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: WorkspaceState
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

  if (request.method === "POST" && requestUrl.pathname === RequestPath.WorkspaceStateGet) {
    writeJson(response, 200, {
      state
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.WorkspaceStateUpdate) {
    const body = await readJsonBody(request);
    applyWorkspaceUpdate(state, body);
    writeJson(response, 200, {
      state
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.ProjectOpen) {
    const project = openFixtureProject(state);
    writeJson(response, 200, {
      project
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.ProvidersList) {
    writeJson(response, 200, {
      providers: [
        {
          id: "codex-cli",
          displayName: "Codex CLI",
          type: "cli",
          auth: {
            type: "none"
          },
          settingsSchema: {
            type: "object"
          }
        }
      ]
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.ProvidersSettings) {
    const body = await readJsonBody(request);
    writeJson(response, 200, {
      settings: {
        projectId: readString(body, "projectId"),
        profileId: readString(body, "profileId"),
        providerId: readString(body, "providerId"),
        config: readRecord(body, "config"),
        updatedAt: "2026-04-29T12:00:00.000Z"
      }
    });
    return;
  }

  writeJson(response, 404, {
    message: "Not found"
  });
}

function createInitialWorkspaceState(): WorkspaceState {
  return {
    activeProjectId: null,
    projects: [],
    settings: {
      profileId: "default",
      providerProfiles: [
        {
          id: "codex-cli-default",
          name: "Codex CLI",
          providerKind: "codex-cli",
          modelId: "",
          endpointUrl: "",
          command: "codex",
          promptMode: "stdin"
        }
      ],
      workflowLimits: {
        infiniteLoops: false,
        maxLoops: 50,
        externalCalls: true
      },
      notifications: {
        soundEnabled: true,
        webhookUrl: ""
      }
    },
    workbenchHistory: {
      runs: [],
      evals: []
    }
  };
}

function openFixtureProject(state: WorkspaceState): ProjectRecord {
  const project: ProjectRecord = {
    id: "project-persisted",
    name: ValidationText.ProjectName,
    rootPath: ValidationText.ProjectRoot,
    createdAt: "2026-04-29T12:00:00.000Z",
    updatedAt: "2026-04-29T12:00:00.000Z"
  };

  state.projects = [project];
  state.activeProjectId = project.id;
  return project;
}

function applyWorkspaceUpdate(state: WorkspaceState, body: unknown): void {
  if (!isRecord(body)) {
    return;
  }

  const settings = body["settings"];
  if (isRecord(settings)) {
    state.settings = settings;
  }

  const workbenchHistory = body["workbenchHistory"];
  if (isRecord(workbenchHistory)) {
    state.workbenchHistory = workbenchHistory;
  }

  const activeProjectId = body["activeProjectId"];
  if (typeof activeProjectId === "string" || activeProjectId === null) {
    state.activeProjectId = activeProjectId;
  }
}

async function seedConnection(page: Page): Promise<void> {
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
    (input: { testId: string; value: string }) => {
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
    throw new Error(`Could not set input ${testId}.`);
  }
}

async function clickNamedButton(page: Page, label: string): Promise<void> {
  const clicked = await page.evaluate((buttonLabel: string) => {
    const button = Array.from(document.querySelectorAll("button")).find((element) =>
      (element.textContent ?? "").includes(buttonLabel)
    );

    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }

    button.click();
    return true;
  }, label);

  if (!clicked) {
    throw new Error(`Could not click button "${label}".`);
  }
}

async function clickElementContainingText(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  const clicked = await page.evaluate(
    (input: { selector: string; text: string }) => {
      const element = Array.from(document.querySelectorAll(input.selector)).find((entry) =>
        entry.textContent?.includes(input.text)
      );

      if (!(element instanceof HTMLElement)) {
        return false;
      }

      element.click();
      return true;
    },
    {
      selector,
      text
    }
  );

  if (!clicked) {
    throw new Error(`Could not click ${selector} containing "${text}".`);
  }
}

async function waitForInputValue(
  page: Page,
  testId: string,
  expectedValue: string
): Promise<void> {
  await waitForCondition(async () => {
    const value = await page.evaluate((input: { testId: string }) => {
      const element = document.querySelector(`[data-testid="${input.testId}"]`);
      return element instanceof HTMLInputElement ? element.value : null;
    }, {
      testId
    });

    return value === expectedValue;
  }, `input ${testId} value ${expectedValue}`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
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

function isAuthorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${DefaultServerConnection.authToken}`;
}

function readString(value: unknown, key: string): string {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const entry = value[key];
  if (typeof entry !== "string") {
    throw new Error(`Invalid ${key}`);
  }

  return entry;
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const entry = value[key];
  if (!isRecord(entry)) {
    throw new Error(`Invalid ${key}`);
  }

  return entry;
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
