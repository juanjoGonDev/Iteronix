import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import type { WorkbenchHistoryState } from "../src/shared/workbench-types.js";
import {
  assertBrowserValidationBuildOutput,
  captureBrowserValidationScreenshot,
  parseBrowserValidationRuntimeOptions,
  prepareBrowserValidationDirectory,
  startPreviewServer,
  stopProcess,
  waitForCondition as waitForBrowserValidationCondition,
  waitForHttpReady
} from "./browser-validation-runtime.js";

const ValidationConfig = {
  BaseUrl: "http://127.0.0.1:4000",
  PreviewHealthPath: "/index.html",
  HistoryRoute: "/history",
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 15000,
  UiPollingIntervalMs: 200,
  ViewportWidth: 1440,
  ViewportHeight: 1400,
  AuthToken: "dev-token"
} as const;

const LocalStorageKey = {
  ServerUrl: "iteronix_server_url",
  AuthToken: "iteronix_auth_token",
  WorkbenchHistory: "iteronix_workbench_history"
} as const;

const ValidationText = {
  ScreenTitle: "Run history",
  FocusAction: "Focus evidence",
  ClearFilter: "Clear filter",
  RetrievedHeading: "Retrieved chunks",
  ReadmeUri: "/README.md",
  ReadmeEvidenceLine: "2 chunks from /README.md",
  AllEvidenceLine: "3 recorded chunks",
  ReadmeChunkA: "Evidence README chunk 0",
  ReadmeChunkB: "Evidence README chunk 1",
  ArchitectureChunk: "Evidence Architecture chunk 0"
} as const;

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");
const runtimeOptions = parseBrowserValidationRuntimeOptions(process.argv.slice(2));

const historyFixture: WorkbenchHistoryState = {
  runs: [
    {
      id: "run-browser-validation",
      kind: "skill",
      skillName: "example-skill",
      sessionId: "session-browser-validation",
      question: "What does Iteronix include?",
      createdAt: "2026-04-24T01:00:00.000Z",
      updatedAt: "2026-04-24T01:00:00.000Z",
      status: "completed",
      memory: [],
      result: {
        skill: {
          metadata: {
            name: "example-skill",
            version: "1.0.0",
            description: "Example skill browser validation fixture",
            tags: ["rag", "browser"]
          }
        },
        output: {
          answer: "Iteronix includes hierarchical memory, skills, RAG, MCP interoperability, evaluations and a shared AI workbench UI.",
          confidence: 0.92
        },
        citations: [
          {
            chunkId: "README.md#1",
            sourceId: "README.md",
            uri: "/README.md",
            snippet: "Collapsed README citation for browser validation.",
            retrievedAt: "2026-04-24T01:00:00.000Z",
            updatedAt: "2026-04-24T01:00:00.000Z",
            score: 0.95,
            sourceType: "repo_doc"
          },
          {
            chunkId: "docs/AI_WORKBENCH.md#0",
            sourceId: "docs/AI_WORKBENCH.md",
            uri: "/docs/AI_WORKBENCH.md",
            snippet: "Collapsed architecture citation for browser validation.",
            retrievedAt: "2026-04-24T01:00:00.000Z",
            updatedAt: "2026-04-24T01:00:00.000Z",
            score: 0.91,
            sourceType: "repo_doc"
          }
        ],
        confidence: {
          score: 0.92,
          label: "high",
          signals: ["repo_doc", "agreement"]
        },
        evidenceReport: {
          traceId: "trace-browser-validation",
          sessionId: "session-browser-validation",
          decisions: ["retrieval enabled", "browser validation fixture"],
          guardrailsTriggered: [],
          retrievedSources: [
            {
              chunkId: "README.md#0",
              sourceId: "README.md",
              uri: "/README.md",
              snippet: "Evidence README chunk 0",
              retrievedAt: "2026-04-24T01:00:00.000Z",
              updatedAt: "2026-04-24T01:00:00.000Z",
              score: 0.94,
              sourceType: "repo_doc"
            },
            {
              chunkId: "README.md#1",
              sourceId: "README.md",
              uri: "/README.md",
              snippet: "Evidence README chunk 1",
              retrievedAt: "2026-04-24T01:00:00.000Z",
              updatedAt: "2026-04-24T01:00:00.000Z",
              score: 0.95,
              sourceType: "repo_doc"
            },
            {
              chunkId: "docs/AI_WORKBENCH.md#0",
              sourceId: "docs/AI_WORKBENCH.md",
              uri: "/docs/AI_WORKBENCH.md",
              snippet: "Evidence Architecture chunk 0",
              retrievedAt: "2026-04-24T01:00:00.000Z",
              updatedAt: "2026-04-24T01:00:00.000Z",
              score: 0.91,
              sourceType: "repo_doc"
            }
          ],
          confidence: {
            score: 0.92,
            label: "high",
            signals: ["repo_doc", "agreement"]
          },
          usage: {
            promptTokens: 120,
            completionTokens: 48,
            totalTokens: 168,
            estimatedCostUsd: 0.0042,
            latencyMs: 220
          }
        },
        traceId: "trace-browser-validation",
        usage: {
          promptTokens: 120,
          completionTokens: 48,
          totalTokens: 168,
          estimatedCostUsd: 0.0042,
          latencyMs: 220
        }
      }
    }
  ],
  evals: []
};

await validateWorkbenchSourceLinking();

async function validateWorkbenchSourceLinking(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots
  });

  const previewServer = startPreviewServer(projectRoot);
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    await waitForHttpReady(`${ValidationConfig.BaseUrl}${ValidationConfig.PreviewHealthPath}`, {
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
    await page.goto(`${ValidationConfig.BaseUrl}${ValidationConfig.HistoryRoute}`, {
      waitUntil: "networkidle0"
    });
    await waitForPageText(page, ValidationText.ScreenTitle);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "before-focus",
      artifactName: "workbench-source-linking"
    });

    await clickCitationFocusAction(page, ValidationText.ReadmeUri);
    await waitForRetrievedChunksState(page, {
      required: [
        ValidationText.ReadmeEvidenceLine,
        ValidationText.ReadmeChunkA,
        ValidationText.ReadmeChunkB
      ],
      forbidden: [ValidationText.ArchitectureChunk]
    });
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-focus",
      artifactName: "workbench-source-linking"
    });

    await clickNamedButton(page, ValidationText.ClearFilter);
    await waitForRetrievedChunksState(page, {
      required: [
        ValidationText.AllEvidenceLine,
        ValidationText.ReadmeChunkA,
        ValidationText.ReadmeChunkB,
        ValidationText.ArchitectureChunk
      ],
      forbidden: []
    });
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-clear",
      artifactName: "workbench-source-linking"
    });

    console.log("Browser validation passed for linked citation source focus.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(previewServer);
  }
}

async function seedBrowserStorage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(
    (payload: {
      history: WorkbenchHistoryState;
      serverUrl: string;
      authToken: string;
      keys: typeof LocalStorageKey;
    }) => {
      window.localStorage.setItem(payload.keys.WorkbenchHistory, JSON.stringify(payload.history));
      window.localStorage.setItem(payload.keys.ServerUrl, payload.serverUrl);
      window.localStorage.setItem(payload.keys.AuthToken, payload.authToken);
    },
    {
      history: historyFixture,
      serverUrl: ValidationConfig.BaseUrl,
      authToken: ValidationConfig.AuthToken,
      keys: LocalStorageKey
    }
  );
}

async function clickCitationFocusAction(page: Page, sourceUri: string): Promise<void> {
  const clicked = await page.evaluate(
    (input: { sourceUri: string; buttonLabel: string }) => {
      const candidates = Array.from(document.querySelectorAll("div"));
      const card = candidates.find((element) => {
        const text = element.textContent ?? "";
        return text.includes(input.sourceUri) && text.includes(input.buttonLabel);
      });

      if (!card) {
        return false;
      }

      const button = Array.from(card.querySelectorAll("button")).find(
        (element) => element.textContent?.trim() === input.buttonLabel
      );

      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }

      button.click();
      return true;
    },
    {
      sourceUri,
      buttonLabel: ValidationText.FocusAction
    }
  );

  if (!clicked) {
    throw new Error(`Could not click "${ValidationText.FocusAction}" for ${sourceUri}`);
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

async function waitForRetrievedChunksState(
  page: Page,
  input: {
    required: ReadonlyArray<string>;
    forbidden: ReadonlyArray<string>;
  }
): Promise<void> {
  await waitForCondition(async () => {
    const sectionText = await readRetrievedChunksPanelText(page);

    return (
      input.required.every((value) => sectionText.includes(value)) &&
      input.forbidden.every((value) => !sectionText.includes(value))
    );
  }, `retrieved chunk state: +${input.required.join(", ")} -${input.forbidden.join(", ")}`);
}

async function readRetrievedChunksPanelText(page: Page): Promise<string> {
  return page.evaluate((headingText: string) => {
    const heading = Array.from(document.querySelectorAll("h3")).find(
      (element) => element.textContent?.trim() === headingText
    );

    const panel = heading?.parentElement?.parentElement?.parentElement;
    return panel?.textContent ?? "";
  }, ValidationText.RetrievedHeading);
}

async function waitForPageText(page: Page, text: string): Promise<void> {
  await waitForCondition(async () => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    return bodyText.includes(text);
  }, `page text "${text}"`);
}

async function waitForCondition(
  check: () => Promise<boolean>,
  label: string
): Promise<void> {
  await waitForBrowserValidationCondition(check, label, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}
