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
  StubApiBaseUrl: "http://127.0.0.1:4109",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  Route: ROUTES.HISTORY,
  StartupTimeoutMs: 30000,
  PollingTimeoutMs: 18000,
  PollingIntervalMs: 200,
  ViewportWidth: 1440,
  ViewportHeight: 900,
} as const;

const CreatedAt = "2026-07-07T09:30:00.000Z";
const SourceId = "source-url-1";
const RunId = "run-url-1";

const HistoryState = {
  runs: [
    {
      id: RunId,
      kind: "workflow",
      skillName: "url-state-workflow",
      sessionId: "session-url-1",
      question: "Validate URL state",
      createdAt: CreatedAt,
      updatedAt: CreatedAt,
      status: "completed",
      memory: [],
      result: {
        status: "completed",
        steps: [
          {
            stage: "planner",
            status: "completed",
            summary: "History detail restored from URL.",
            timestamp: CreatedAt,
          },
        ],
        final: {
          skill: {
            metadata: {
              name: "URL history skill",
              version: "1.0.0",
              description: "Browser validation fixture",
              tags: ["url"],
            },
          },
          output: {
            answer: "History selected detail restored",
            confidence: 0.94,
          },
          citations: [
            {
              chunkId: "chunk-url-1",
              sourceId: SourceId,
              uri: "memory://history/source-url-1",
              snippet: "History URL evidence source restored.",
              retrievedAt: CreatedAt,
              updatedAt: CreatedAt,
              score: 0.88,
              sourceType: "memory",
            },
          ],
          confidence: {
            score: 0.94,
            label: "high",
            signals: ["url-restored"],
          },
          evidenceReport: {
            traceId: "trace-url-1",
            sessionId: "session-url-1",
            decisions: ["Use URL query params"],
            guardrailsTriggered: [],
            retrievedSources: [
              {
                chunkId: "chunk-url-1",
                sourceId: SourceId,
                uri: "memory://history/source-url-1",
                snippet: "History URL evidence source restored.",
                retrievedAt: CreatedAt,
                updatedAt: CreatedAt,
                score: 0.88,
                sourceType: "memory",
              },
            ],
            confidence: {
              score: 0.94,
              label: "high",
              signals: ["url-restored"],
            },
            usage: {
              promptTokens: 10,
              completionTokens: 12,
              totalTokens: 22,
              estimatedCostUsd: 0.01,
              latencyMs: 120,
            },
          },
          traceId: "trace-url-1",
          usage: {
            promptTokens: 10,
            completionTokens: 12,
            totalTokens: 22,
            estimatedCostUsd: 0.01,
            latencyMs: 120,
          },
        },
      },
    },
  ],
  evals: [
    {
      id: "eval-url-1",
      datasetPath: "fixtures/history.jsonl",
      createdAt: CreatedAt,
      updatedAt: CreatedAt,
      result: {
        summary: { total: 1, passed: 1, failed: 0 },
        results: [
          {
            caseId: "case-url-1",
            passed: true,
            traceId: "trace-eval-1",
            reasons: ["Deep link restored"],
          },
        ],
      },
    },
  ],
} as const;

const runtimeOptions = parseBrowserValidationRuntimeOptions(
  process.argv.slice(2),
);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");

await validateHistoryUrlState();

async function validateHistoryUrlState(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots,
  });
  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startHistoryStubServer();
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
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.Route}?kind=run&id=${RunId}&source=${SourceId}`,
      { waitUntil: "networkidle0" },
    );
    await waitForPageText(page, "History selected detail restored");
    await waitForPageText(page, "History URL evidence source restored.");
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "history-run-source-deeplink",
      artifactName: "history",
    });
    await page.reload({ waitUntil: "networkidle0" });
    await waitForPageText(page, "History selected detail restored");
    await waitForPageText(page, "Confidence 94%");
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "history-run-source-reload",
      artifactName: "history",
    });
    console.log("History URL validation passed.");
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
      historyJson: string;
    }) => {
      window.localStorage.setItem(input.serverUrlKey, input.serverUrl);
      window.localStorage.setItem(input.authTokenKey, input.authToken);
      window.localStorage.setItem(
        "iteronix_workbench_history",
        input.historyJson,
      );
    },
    {
      serverUrlKey: LocalStorageKey.ServerUrl,
      authTokenKey: LocalStorageKey.AuthToken,
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken,
      historyJson: JSON.stringify(HistoryState),
    },
  );
}

async function startHistoryStubServer(): Promise<
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
          activeProjectId: null,
          projects: [],
          settings: {},
          workbenchHistory: HistoryState,
        },
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolveListen) =>
    server.listen(4109, "127.0.0.1", resolveListen),
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
