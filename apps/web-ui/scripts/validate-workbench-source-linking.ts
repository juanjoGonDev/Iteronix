import { access, mkdir } from "node:fs/promises";
import { constants as FsConstants } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import type { WorkbenchHistoryState } from "../src/shared/workbench-types.js";

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
  await assertBuildOutputExists();
  await mkdir(screenshotDirectory, { recursive: true });

  const previewServer = startPreviewServer();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    await waitForHttpReady(`${ValidationConfig.BaseUrl}${ValidationConfig.PreviewHealthPath}`);

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
    await captureScreenshot(page, "before-focus");

    await clickCitationFocusAction(page, ValidationText.ReadmeUri);
    await waitForRetrievedChunksState(page, {
      required: [
        ValidationText.ReadmeEvidenceLine,
        ValidationText.ReadmeChunkA,
        ValidationText.ReadmeChunkB
      ],
      forbidden: [ValidationText.ArchitectureChunk]
    });
    await captureScreenshot(page, "after-focus");

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
    await captureScreenshot(page, "after-clear");

    console.log("Browser validation passed for linked citation source focus.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(previewServer);
  }
}

function startPreviewServer(): ChildProcess {
  return spawn("pnpm", ["preview"], {
    cwd: projectRoot,
    stdio: "pipe",
    shell: process.platform === "win32"
  });
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

async function captureScreenshot(page: Page, suffix: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(
    screenshotDirectory,
    `${timestamp}_${suffix}_workbench-source-linking.png`
  );

  await page.screenshot({
    path: outputPath,
    fullPage: true
  });
}

async function assertBuildOutputExists(): Promise<void> {
  try {
    await access(buildOutputPath, FsConstants.F_OK);
  } catch {
    throw new Error(`Build output missing at ${buildOutputPath}. Run pnpm build before this validation.`);
  }
}

async function waitForHttpReady(url: string): Promise<void> {
  await waitForCondition(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }, `HTTP readiness for ${url}`, ValidationConfig.PreviewStartupTimeoutMs);
}

async function waitForCondition(
  check: () => Promise<boolean>,
  label: string,
  timeoutMs: number = ValidationConfig.UiPollingTimeoutMs
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }

    await delay(ValidationConfig.UiPollingIntervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore"
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
  await delay(250);
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
