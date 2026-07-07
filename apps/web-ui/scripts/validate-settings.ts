import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import {
  DefaultServerConnection,
  LocalStorageKey as ServerStorageKey,
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
  StubApiBaseUrl: "http://127.0.0.1:4104",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  SettingsRoute: ROUTES.SETTINGS,
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 18000,
  UiPollingIntervalMs: 200,
  ViewportWidth: 1480,
  ViewportHeight: 1280,
  MobileViewportWidth: 390,
  MobileViewportHeight: 844,
} as const;

const RequestPath = {
  WorkspaceStateGet: "/workspace/state/get",
  WorkspaceStateUpdate: "/workspace/state/update",
  ProjectOpen: "/projects/open",
  ProvidersList: "/providers/list",
  ProvidersSettings: "/providers/settings",
  Webhook: "/webhook/test",
} as const;

const ResponseHeader = {
  AllowOrigin: "Access-Control-Allow-Origin",
  AllowHeaders: "Access-Control-Allow-Headers",
  AllowMethods: "Access-Control-Allow-Methods",
  ContentType: "Content-Type",
} as const;

const ValidationText = {
  ScreenTitle: "Settings",
  ProviderHeading: "Provider profiles",
  SaveChanges: "Save changes",
  TestPayload: "Test payload",
  CheckConnection: "Check connection",
  AnthropicProfileName: "Claude Coder",
  AnthropicModelId: "claude-sonnet-4-20250514",
  NotificationsUrl: "http://127.0.0.1:4104/webhook/test",
  SaveNotice: "Settings saved.",
  SettingsServerBackedNotice:
    "Provider profiles, workflow limits, notifications, server URL and auth token persist on the current server workspace.",
  WebhookNotice: "Webhook test payload delivered successfully.",
  ConnectionNotice: "Connection OK.",
} as const;

const ProviderKind = {
  CodexCli: "codex-cli",
  OpenAI: "openai",
  Anthropic: "anthropic",
  Ollama: "ollama",
} as const;

type ProviderKind = (typeof ProviderKind)[keyof typeof ProviderKind];

type StubProjectRecord = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

type ProviderSettingsRequestRecord = {
  projectId: string;
  profileId: string;
  providerId: string;
  config: Record<string, unknown>;
};

type StubServerState = {
  providerSettingsRequests: ProviderSettingsRequestRecord[];
  webhookPayloadCount: number;
  workspaceSettings: Record<string, unknown>;
};

const fixtureProject: StubProjectRecord = {
  id: "settings-project",
  name: "Iteronix",
  rootPath: "D:\\projects\\Iteronix",
  createdAt: "2026-04-28T08:00:00.000Z",
  updatedAt: "2026-04-28T08:00:00.000Z",
};

const runtimeOptions = parseBrowserValidationRuntimeOptions(
  process.argv.slice(2),
);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");

await validateSettingsScreen();

async function validateSettingsScreen(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots,
  });

  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startSettingsStubServer();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    await waitForHttpReady(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.PreviewHealthPath}`,
      {
        timeoutMs: ValidationConfig.PreviewStartupTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    await waitForHttpReady(
      `${ValidationConfig.StubApiBaseUrl}${ValidationConfig.StubHealthPath}`,
      {
        timeoutMs: ValidationConfig.PreviewStartupTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });

    const firstContext = await browser.createBrowserContext();
    const page = await firstContext.newPage();
    await page.setViewport({
      width: ValidationConfig.ViewportWidth,
      height: ValidationConfig.ViewportHeight,
    });
    await seedBrowserStorage(page);
    await page.goto(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.SettingsRoute}`,
      {
        waitUntil: "networkidle0",
      },
    );

    await waitForPageTexts(page, [
      ValidationText.ScreenTitle,
      ValidationText.ProviderHeading,
      fixtureProject.name,
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "settings-initial",
      artifactName: "settings",
    });

    await clickNamedButton(page, "Add Anthropic");
    await waitForPageText(page, readProviderCardLabel(ProviderKind.Anthropic));
    await waitForTestId(page, "settings-provider-api-key");
    await setInputValueByTestId(
      page,
      "settings-provider-name",
      ValidationText.AnthropicProfileName,
    );
    await setInputValueByTestId(
      page,
      "settings-provider-model",
      ValidationText.AnthropicModelId,
    );
    await setInputValueByTestId(
      page,
      "settings-provider-api-key",
      "anthropic-session-secret",
    );

    await clickNamedButton(page, "Workflow Limits");
    await waitForTestId(page, "settings-max-loops");
    await setInputValueByTestId(page, "settings-max-loops", "21");
    await toggleSwitchByTestId(page, "settings-external-calls", false);
    await toggleSwitchByTestId(page, "settings-infinite-loops", true);

    await clickNamedButton(page, "Notifications");
    await waitForTestId(page, "settings-webhook-url");
    await setInputValueByTestId(
      page,
      "settings-webhook-url",
      ValidationText.NotificationsUrl,
    );
    await waitForButtonEnabled(page, ValidationText.TestPayload);
    await clickNamedButton(page, ValidationText.TestPayload);
    await waitForPageText(page, ValidationText.WebhookNotice);

    await clickNamedButton(page, "API Access");
    await waitForTestId(page, "settings-server-url");
    await clickNamedButton(page, ValidationText.CheckConnection);
    await waitForPageText(page, ValidationText.ConnectionNotice);

    await clickNamedButton(page, "Providers");
    await clickNamedButton(page, ValidationText.SaveChanges);
    await waitForPageText(page, ValidationText.SaveNotice);
    await waitForCondition(
      async () => stubServer.state.providerSettingsRequests.length === 1,
      "provider settings sync",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    assertPersistedWorkspaceSettings(stubServer.state.workspaceSettings);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "settings-saved",
      artifactName: "settings",
    });

    await clickNamedButton(page, "General");
    await waitForPageText(page, ValidationText.SettingsServerBackedNotice);

    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForPageTexts(page, [
      ValidationText.ScreenTitle,
      ValidationText.SettingsServerBackedNotice,
    ]);
    await clickNamedButton(page, "Providers");
    await waitForPageText(page, ValidationText.AnthropicProfileName);
    await clickElementContainingText(
      page,
      "button",
      ValidationText.AnthropicProfileName,
    );
    await waitForTestId(page, "settings-provider-api-key");
    await waitForInputValue(
      page,
      "settings-provider-name",
      ValidationText.AnthropicProfileName,
    );
    await waitForInputValue(
      page,
      "settings-provider-model",
      ValidationText.AnthropicModelId,
    );
    await waitForInputValue(
      page,
      "settings-provider-api-key",
      "anthropic-session-secret",
    );

    await clickNamedButton(page, "Workflow Limits");
    await waitForInputValue(page, "settings-max-loops", "21");
    await waitForSwitchValue(page, "settings-external-calls", false);
    await waitForSwitchValue(page, "settings-infinite-loops", true);

    await clickNamedButton(page, "Notifications");
    await waitForInputValue(
      page,
      "settings-webhook-url",
      ValidationText.NotificationsUrl,
    );
    await clickNamedButton(page, "API Access");
    await waitForInputValue(
      page,
      "settings-server-url",
      ValidationConfig.StubApiBaseUrl,
    );
    await waitForInputValue(
      page,
      "settings-auth-token",
      DefaultServerConnection.authToken,
    );
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "settings-reloaded",
      artifactName: "settings",
    });

    const secondContext = await browser.createBrowserContext();
    const secondPage = await secondContext.newPage();
    await secondPage.setViewport({
      width: ValidationConfig.ViewportWidth,
      height: ValidationConfig.ViewportHeight,
    });
    await seedBrowserStorage(secondPage);
    await secondPage.goto(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.SettingsRoute}`,
      {
        waitUntil: "networkidle0",
      },
    );
    await waitForPageTexts(secondPage, [
      ValidationText.ScreenTitle,
      ValidationText.AnthropicProfileName,
    ]);
    await clickNamedButton(secondPage, "Workflow Limits");
    await waitForInputValue(secondPage, "settings-max-loops", "21");
    await waitForSwitchValue(secondPage, "settings-external-calls", false);
    await waitForSwitchValue(secondPage, "settings-infinite-loops", true);
    await clickNamedButton(secondPage, "Notifications");
    await waitForInputValue(
      secondPage,
      "settings-webhook-url",
      ValidationText.NotificationsUrl,
    );
    await waitForSwitchValue(secondPage, "settings-sound-enabled", true);
    await clickNamedButton(secondPage, "API Access");
    await waitForInputValue(
      secondPage,
      "settings-server-url",
      ValidationConfig.StubApiBaseUrl,
    );
    await waitForInputValue(
      secondPage,
      "settings-auth-token",
      DefaultServerConnection.authToken,
    );
    await clickNamedButton(secondPage, "Providers");
    await waitForPageText(secondPage, ValidationText.AnthropicProfileName);
    await clickElementContainingText(
      secondPage,
      "button",
      ValidationText.AnthropicProfileName,
    );
    await waitForInputValue(
      secondPage,
      "settings-provider-model",
      ValidationText.AnthropicModelId,
    );
    await clickNamedButton(secondPage, "General");
    await waitForPageText(
      secondPage,
      ValidationText.SettingsServerBackedNotice,
    );
    await clickNamedButton(secondPage, "Providers");
    await captureBrowserValidationScreenshot({
      page: secondPage,
      directory: screenshotDirectory,
      suffix: "settings-second-context-before-remove",
      artifactName: "settings",
    });
    await clickProviderRemoveButton(
      secondPage,
      ValidationText.AnthropicProfileName,
    );
    await captureBrowserValidationScreenshot({
      page: secondPage,
      directory: screenshotDirectory,
      suffix: "settings-second-context-after-remove-click",
      artifactName: "settings",
    });
    await waitForCondition(
      async () => {
        const state = await secondPage.evaluate((profileName: string) => {
          const rows = Array.from(document.querySelectorAll("button"))
            .map((button) => button.closest("div.rounded-xl, div.border"))
            .filter((entry): entry is Element => entry instanceof Element);
          const profileStillListed = rows.some((row) =>
            row.textContent?.includes(profileName),
          );
          const selectedHeading = Array.from(document.querySelectorAll("h2"))
            .map((element) => element.textContent?.trim() ?? "")
            .includes(profileName);
          return {
            profileStillListed,
            selectedHeading,
          };
        }, ValidationText.AnthropicProfileName);

        return !state.profileStillListed && !state.selectedHeading;
      },
      "anthropic profile removed from second context",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    await clickNamedButton(secondPage, ValidationText.SaveChanges);
    await waitForPageText(secondPage, ValidationText.SaveNotice);
    await captureBrowserValidationScreenshot({
      page: secondPage,
      directory: screenshotDirectory,
      suffix: "settings-second-context-removed",
      artifactName: "settings",
    });

    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForCondition(
      async () => {
        const bodyText = await page.evaluate(() => document.body.innerText);
        return !bodyText.includes(ValidationText.AnthropicProfileName);
      },
      "anthropic profile removal reflected in first context",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );

    await page.setViewport({
      width: ValidationConfig.MobileViewportWidth,
      height: ValidationConfig.MobileViewportHeight,
    });
    await page.goto(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.SettingsRoute}`,
      {
        waitUntil: "networkidle0",
      },
    );
    await waitForPageText(page, ValidationText.ScreenTitle);
    await waitForCondition(
      async () => {
        const bodyText = await page.evaluate(() => document.body.innerText);
        return !bodyText.includes(ValidationText.AnthropicProfileName);
      },
      "mobile view reflects persisted provider removal",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "settings-mobile",
      artifactName: "settings",
    });

    assertProviderSyncRequest(stubServer.state.providerSettingsRequests[0]);
    if (stubServer.state.webhookPayloadCount !== 1) {
      throw new Error(
        `Expected exactly one webhook test payload, received ${stubServer.state.webhookPayloadCount}.`,
      );
    }

    await secondPage.close();
    await secondContext.close();
    await page.close();
    await firstContext.close();
    console.log("Browser validation passed for settings screen.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stubServer.close();
    await stopProcess(previewServer);
  }
}

async function startSettingsStubServer(): Promise<{
  state: StubServerState;
  close: () => Promise<void>;
}> {
  const state: StubServerState = {
    providerSettingsRequests: [],
    webhookPayloadCount: 0,
    workspaceSettings: createDefaultWorkspaceSettings(),
  };
  const server = createServer((request, response) => {
    void handleStubRequest(request, response, state);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(4104, "127.0.0.1", () => resolve());
    server.on("error", (error) => reject(error));
  });

  return {
    state,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

async function handleStubRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubServerState,
): Promise<void> {
  const requestUrl = new URL(
    request.url ?? "/",
    ValidationConfig.StubApiBaseUrl,
  );

  if (requestUrl.pathname === ValidationConfig.StubHealthPath) {
    writeJson(response, 200, {
      ok: true,
    });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, createCorsHeaders());
    response.end();
    return;
  }

  if (requestUrl.pathname !== RequestPath.Webhook && !isAuthorized(request)) {
    writeJson(response, 401, {
      message: "Unauthorized",
    });
    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === RequestPath.WorkspaceStateGet
  ) {
    writeJson(response, 200, {
      state: createWorkspaceState(state.workspaceSettings),
    });
    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === RequestPath.WorkspaceStateUpdate
  ) {
    const body = await readJsonBody(request);
    if (isRecord(body) && isRecord(body["settings"])) {
      state.workspaceSettings = body["settings"];
    }
    writeJson(response, 200, {
      state: createWorkspaceState(state.workspaceSettings),
    });
    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === RequestPath.ProjectOpen
  ) {
    const body = await readJsonBody(request);
    const rootPath = readRequiredString(body, "rootPath");

    if (rootPath !== fixtureProject.rootPath) {
      writeJson(response, 400, {
        message: "Unexpected project root",
      });
      return;
    }

    writeJson(response, 200, {
      project: fixtureProject,
    });
    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === RequestPath.ProvidersList
  ) {
    writeJson(response, 200, {
      providers: [
        {
          id: "codex-cli",
          displayName: "Codex CLI",
          type: "cli",
          auth: {
            type: "none",
          },
          settingsSchema: {
            type: "object",
          },
        },
      ],
    });
    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === RequestPath.ProvidersSettings
  ) {
    const body = await readJsonBody(request);
    const projectId = readRequiredString(body, "projectId");
    const profileId = readRequiredString(body, "profileId");
    const providerId = readRequiredString(body, "providerId");
    const config = readRequiredRecord(body, "config");

    state.providerSettingsRequests.push({
      projectId,
      profileId,
      providerId,
      config,
    });

    writeJson(response, 200, {
      settings: {
        projectId,
        profileId,
        providerId,
        config,
        updatedAt: "2026-04-28T08:10:00.000Z",
      },
    });
    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === RequestPath.Webhook
  ) {
    state.webhookPayloadCount += 1;
    writeJson(response, 200, {
      ok: true,
    });
    return;
  }

  writeJson(response, 404, {
    message: "Not found",
  });
}

function isAuthorized(request: IncomingMessage): boolean {
  return (
    request.headers.authorization ===
    `Bearer ${DefaultServerConnection.authToken}`
  );
}

async function seedBrowserStorage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(
    (payload: {
      serverUrl: string;
      authToken: string;
      serverKeys: typeof ServerStorageKey;
    }) => {
      window.localStorage.setItem(
        payload.serverKeys.ServerUrl,
        payload.serverUrl,
      );
      window.localStorage.setItem(
        payload.serverKeys.AuthToken,
        payload.authToken,
      );
    },
    {
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken,
      serverKeys: ServerStorageKey,
    },
  );
}

function createWorkspaceState(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  return {
    activeProjectId: fixtureProject.id,
    projects: [fixtureProject],
    settings,
    workbenchHistory: {
      runs: [],
      evals: [],
    },
  };
}

function createDefaultWorkspaceSettings(): Record<string, unknown> {
  return {
    profileId: "default",
    providerProfiles: [
      {
        id: "codex-cli-default",
        name: "Codex CLI",
        providerKind: "codex-cli",
        modelId: "",
        endpointUrl: "",
        command: "codex",
        promptMode: "stdin",
      },
    ],
    workflowLimits: {
      infiniteLoops: false,
      maxLoops: 50,
      externalCalls: true,
    },
    notifications: {
      soundEnabled: true,
      webhookUrl: "",
    },
    serverConnection: {
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken,
    },
  };
}

function assertProviderSyncRequest(
  request: ProviderSettingsRequestRecord | undefined,
): void {
  if (!request) {
    throw new Error("Expected one provider sync request.");
  }

  if (request.projectId !== fixtureProject.id) {
    throw new Error(
      `Unexpected project id in provider sync: ${request.projectId}`,
    );
  }

  if (request.providerId !== ProviderKind.CodexCli) {
    throw new Error(
      `Unexpected provider id in provider sync: ${request.providerId}`,
    );
  }
}

function assertPersistedWorkspaceSettings(
  settings: Record<string, unknown>,
): void {
  if (!isRecord(settings["workflowLimits"])) {
    throw new Error(
      "Expected workflow limits to persist in workspace settings.",
    );
  }

  const workflowLimits = settings["workflowLimits"];
  if (workflowLimits["maxLoops"] !== 21) {
    throw new Error(
      `Expected persisted maxLoops to be 21, received ${String(workflowLimits["maxLoops"])}`,
    );
  }
  if (workflowLimits["infiniteLoops"] !== true) {
    throw new Error("Expected persisted infiniteLoops to be true.");
  }
  if (workflowLimits["externalCalls"] !== false) {
    throw new Error("Expected persisted externalCalls to be false.");
  }

  if (!isRecord(settings["notifications"])) {
    throw new Error("Expected notifications to persist in workspace settings.");
  }

  const notifications = settings["notifications"];
  if (notifications["webhookUrl"] !== ValidationText.NotificationsUrl) {
    throw new Error(
      `Expected persisted webhookUrl to be ${ValidationText.NotificationsUrl}.`,
    );
  }
  if (notifications["soundEnabled"] !== true) {
    throw new Error("Expected persisted soundEnabled to remain true.");
  }

  if (!isRecord(settings["serverConnection"])) {
    throw new Error(
      "Expected serverConnection to persist in workspace settings.",
    );
  }

  const serverConnection = settings["serverConnection"];
  if (serverConnection["serverUrl"] !== ValidationConfig.StubApiBaseUrl) {
    throw new Error(
      `Expected persisted serverUrl to be ${ValidationConfig.StubApiBaseUrl}.`,
    );
  }
  if (serverConnection["authToken"] !== DefaultServerConnection.authToken) {
    throw new Error(
      `Expected persisted authToken to be ${DefaultServerConnection.authToken}.`,
    );
  }
}

async function clickNamedButton(page: Page, label: string): Promise<void> {
  const clicked = await page.evaluate((buttonLabel: string) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (element) => {
        const text = element.textContent?.trim() ?? "";
        return (
          text.includes(buttonLabel) &&
          element instanceof HTMLButtonElement &&
          !element.disabled
        );
      },
    );

    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }

    button.click();
    return true;
  }, label);

  if (!clicked) {
    throw new Error(`Could not click button "${label}".`);
  }
}

async function clickProviderRemoveButton(
  page: Page,
  profileName: string,
): Promise<void> {
  const clicked = await page.evaluate(
    (input: { profileName: string }) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const candidate of buttons) {
        if (!(candidate instanceof HTMLButtonElement) || candidate.disabled) {
          continue;
        }

        if ((candidate.textContent?.trim() ?? "") !== "Remove") {
          continue;
        }

        let current: HTMLElement | null = candidate;
        while (current) {
          const className = current.className;
          if (
            typeof className === "string" &&
            className.includes("border-primary") &&
            (current.textContent?.includes(input.profileName) ?? false)
          ) {
            candidate.click();
            return true;
          }

          current = current.parentElement;
        }
      }

      return false;
    },
    {
      profileName,
    },
  );

  if (!clicked) {
    throw new Error(`Could not click remove for provider "${profileName}".`);
  }
}

async function clickElementContainingText(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  const clicked = await page.evaluate(
    (input: { selector: string; text: string }) => {
      const element = Array.from(
        document.querySelectorAll(input.selector),
      ).find((entry) => entry.textContent?.includes(input.text));

      if (!(element instanceof HTMLElement)) {
        return false;
      }

      element.click();
      return true;
    },
    {
      selector,
      text,
    },
  );

  if (!clicked) {
    throw new Error(`Could not click ${selector} containing "${text}".`);
  }
}

async function setInputValueByTestId(
  page: Page,
  testId: string,
  value: string,
): Promise<void> {
  const updated = await page.evaluate(
    (input: { testId: string; value: string }) => {
      const element = document.querySelector(`[data-testid="${input.testId}"]`);
      if (
        !(element instanceof HTMLInputElement) &&
        !(element instanceof HTMLSelectElement)
      ) {
        return false;
      }

      element.value = input.value;
      element.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      );
      return true;
    },
    {
      testId,
      value,
    },
  );

  if (!updated) {
    throw new Error(`Could not set value for ${testId}.`);
  }
}

async function toggleSwitchByTestId(
  page: Page,
  testId: string,
  checked: boolean,
): Promise<void> {
  const updated = await page.evaluate(
    (input: { testId: string; checked: boolean }) => {
      const element = document.querySelector(`[data-testid="${input.testId}"]`);
      if (
        !(element instanceof HTMLButtonElement) ||
        element.getAttribute("role") !== "switch"
      ) {
        return false;
      }

      if (element.getAttribute("aria-checked") !== String(input.checked)) {
        element.click();
      }
      return true;
    },
    {
      testId,
      checked,
    },
  );

  if (!updated) {
    throw new Error(`Could not toggle switch ${testId}.`);
  }
}

async function waitForInputValue(
  page: Page,
  testId: string,
  expectedValue: string,
): Promise<void> {
  await waitForCondition(
    async () => {
      const value = await page.evaluate(
        (input: { testId: string }) => {
          const element = document.querySelector(
            `[data-testid="${input.testId}"]`,
          );
          if (
            !(element instanceof HTMLInputElement) &&
            !(element instanceof HTMLSelectElement)
          ) {
            return null;
          }

          return element.value;
        },
        {
          testId,
        },
      );

      return value === expectedValue;
    },
    `input ${testId} value ${expectedValue}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForSwitchValue(
  page: Page,
  testId: string,
  expectedValue: boolean,
): Promise<void> {
  await waitForCondition(
    async () => {
      const checked = await page.evaluate(
        (input: { testId: string }) => {
          const element = document.querySelector(
            `[data-testid="${input.testId}"]`,
          );
          if (
            !(element instanceof HTMLButtonElement) ||
            element.getAttribute("role") !== "switch"
          ) {
            return null;
          }

          return element.getAttribute("aria-checked") === "true";
        },
        {
          testId,
        },
      );

      return checked === expectedValue;
    },
    `switch ${testId} value ${String(expectedValue)}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForPageText(page: Page, text: string): Promise<void> {
  await waitForCondition(
    async () => {
      const bodyText = await page.evaluate(() => document.body.innerText);
      return bodyText.includes(text);
    },
    `page text "${text}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForPageTexts(
  page: Page,
  expectedTexts: ReadonlyArray<string>,
): Promise<void> {
  await waitForCondition(
    async () => {
      const bodyText = await page.evaluate(() => document.body.innerText);
      return expectedTexts.every((text) => bodyText.includes(text));
    },
    `page texts "${expectedTexts.join(", ")}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForTestId(page: Page, testId: string): Promise<void> {
  await waitForCondition(
    async () => {
      const exists = await page.evaluate(
        (input: { testId: string }) => {
          const element = document.querySelector(
            `[data-testid="${input.testId}"]`,
          );
          return element instanceof HTMLElement;
        },
        {
          testId,
        },
      );

      return exists;
    },
    `test id "${testId}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForButtonEnabled(page: Page, label: string): Promise<void> {
  await waitForCondition(
    async () => {
      const enabled = await page.evaluate((buttonLabel: string) => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (element) => {
            const text = element.textContent?.trim() ?? "";
            return text.includes(buttonLabel);
          },
        );

        return button instanceof HTMLButtonElement && !button.disabled;
      }, label);

      return enabled;
    },
    `button "${label}" enabled`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
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

function readRequiredRecord(
  value: unknown,
  key: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const nested = value[key];
  if (!isRecord(nested)) {
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
  value: Readonly<Record<string, unknown>>,
): void {
  response.writeHead(statusCode, {
    ...createCorsHeaders(),
    [ResponseHeader.ContentType]: "application/json",
  });
  response.end(JSON.stringify(value));
}

function createCorsHeaders(): Record<string, string> {
  return {
    [ResponseHeader.AllowOrigin]: "*",
    [ResponseHeader.AllowHeaders]: "Authorization, Content-Type",
    [ResponseHeader.AllowMethods]: "GET, POST, OPTIONS",
  };
}

function readProviderCardLabel(kind: ProviderKind): string {
  if (kind === ProviderKind.CodexCli) {
    return "Codex CLI";
  }

  if (kind === ProviderKind.OpenAI) {
    return "OpenAI";
  }

  if (kind === ProviderKind.Anthropic) {
    return "Anthropic";
  }

  return "Ollama";
}
