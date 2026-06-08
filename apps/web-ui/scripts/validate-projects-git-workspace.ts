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
  GitStage: "/git/stage",
  GitUnstage: "/git/unstage",
  GitRevert: "/git/revert",
  GitCommit: "/git/commit",
  GitBranchesList: "/git/branches/list",
  GitBranchesCreate: "/git/branches/create",
  GitBranchesCheckout: "/git/branches/checkout",
  GitBranchesPush: "/git/branches/push",
  GitBranchesPublish: "/git/branches/publish"
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
  UnstagedDiffButton: "Unstaged diff (1)",
  CreateCommit: "Create commit",
  InvalidCommit: "Use a Conventional Commit message such as feat(projects): add git workspace panel.",
  BranchCreated: "Branch feature/browser-validation created.",
  BranchSwitched: "Switched to branch feature/browser-validation.",
  BranchPublished: "Published branch feature/browser-validation to origin/feature/browser-validation.",
  BranchPushed: "Pushed branch feature/browser-validation to origin/feature/browser-validation.",
  BranchSynced: "Current branch is already synced with origin/feature/browser-validation.",
  BulkStageSuccess: "2 files staged.",
  BulkUnstageSuccess: "2 files moved out of the index.",
  QualityGatesReverted: "Unstaged changes reverted for apps/web-ui/src/shared/quality-gates-client.ts.",
  CommitCreated: "Commit 9f3c2ad1 created.",
  StagedDiffZero: "Staged diff (0)",
  UnstagedDiffZero: "Unstaged diff (0)",
  StagedDiffMarker: "diff --git a/apps/web-ui/src/screens/Projects.ts b/apps/web-ui/src/screens/Projects.ts",
  ProjectsStateDiffMarker: "diff --git a/apps/web-ui/src/screens/projects-state.ts b/apps/web-ui/src/screens/projects-state.ts",
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

const FixtureFilePath = {
  Projects: "apps/web-ui/src/screens/Projects.ts",
  ProjectsState: "apps/web-ui/src/screens/projects-state.ts",
  QualityGatesClient: "apps/web-ui/src/shared/quality-gates-client.ts",
  GitDetails: "apps/web-ui/src/screens/GitDetails.ts",
  GitSummary: "apps/web-ui/src/screens/GitSummary.ts"
} as const;

const StubFileStatus = {
  Staged: "staged",
  Unstaged: "unstaged",
  Untracked: "untracked"
} as const;

type StubFileStatus = typeof StubFileStatus[keyof typeof StubFileStatus];

const FixtureDiff = {
  ProjectsStaged: [
    "diff --git a/apps/web-ui/src/screens/Projects.ts b/apps/web-ui/src/screens/Projects.ts",
    "index 1a2b3c4..5d6e7f8 100644",
    "--- a/apps/web-ui/src/screens/Projects.ts",
    "+++ b/apps/web-ui/src/screens/Projects.ts",
    "@@ -12,6 +12,9 @@",
    "+import { createGitClient } from \"../shared/git-client.js\";"
  ].join("\n"),
  ProjectsStateStaged: [
    "diff --git a/apps/web-ui/src/screens/projects-state.ts b/apps/web-ui/src/screens/projects-state.ts",
    "index 1234567..89abcde 100644",
    "--- a/apps/web-ui/src/screens/projects-state.ts",
    "+++ b/apps/web-ui/src/screens/projects-state.ts",
    "@@ -1,5 +1,12 @@",
    "+export const readGitSelectionCount = () => 2;"
  ].join("\n"),
  GitDetailsStaged: [
    "diff --git a/apps/web-ui/src/screens/GitDetails.ts b/apps/web-ui/src/screens/GitDetails.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/apps/web-ui/src/screens/GitDetails.ts",
    "@@ -0,0 +1,5 @@",
    "+export const GitDetails = \"ready\";"
  ].join("\n"),
  GitSummaryStaged: [
    "diff --git a/apps/web-ui/src/screens/GitSummary.ts b/apps/web-ui/src/screens/GitSummary.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/apps/web-ui/src/screens/GitSummary.ts",
    "@@ -0,0 +1,5 @@",
    "+export const GitSummary = \"ready\";"
  ].join("\n"),
  QualityGatesUnstaged: [
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
  files: Record<string, StubFile>;
  currentBranch: string;
  localBranches: string[];
  remoteBranches: string[];
  trackedUpstreams: Record<string, string>;
  aheadCount: number;
};

type StubFile = {
  path: string;
  tracked: boolean;
  status: StubFileStatus;
  stagedDiff?: string;
  unstagedDiff?: string;
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

    await setInputValueByTestId(page, "quality-gates-project-root", FixtureProject.rootPath ?? "");
    await clickNamedButton(page, ValidationText.OpenProject);
    await waitForPageTexts(page, [
      FixtureProject.name,
      "feature/git-ui",
      "develop",
      "origin/release/next",
      FixtureFilePath.Projects,
      FixtureFilePath.ProjectsState,
      FixtureFilePath.QualityGatesClient,
      FixtureFilePath.GitDetails,
      FixtureFilePath.GitSummary
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-open",
      artifactName: "projects-git-workspace"
    });

    await typeIntoInputByTestId(page, "git-branch-name", "feature/browser-validation");
    await waitForButtonEnabled(page, "Create branch");
    await clickNamedButton(page, "Create branch");
    await waitForPageTexts(page, [
      ValidationText.BranchCreated,
      "feature/browser-validation"
    ]);
    await clickGitBranchAction(page, "feature/browser-validation", "Checkout");
    await waitForPageText(page, ValidationText.BranchSwitched);
    await waitForCurrentBranch(page, "feature/browser-validation");
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-branch-checkout",
      artifactName: "projects-git-workspace"
    });

    await waitForButtonEnabled(page, "Publish branch");
    await clickNamedButton(page, "Publish branch");
    await waitForPageTexts(page, [
      ValidationText.BranchPublished,
      "origin/feature/browser-validation"
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-branch-publish",
      artifactName: "projects-git-workspace"
    });

    await setGitPathSelection(page, FixtureFilePath.GitDetails, true);
    await setGitPathSelection(page, FixtureFilePath.GitSummary, true);
    await waitForPageText(page, "Stage selected (2)");
    await clickNamedButton(page, "Stage selected (2)");
    await waitForPageTexts(page, [
      ValidationText.BulkStageSuccess,
      "Staged changes",
      FixtureFilePath.GitDetails,
      FixtureFilePath.GitSummary,
      "Staged diff (4)"
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-bulk-stage",
      artifactName: "projects-git-workspace"
    });

    await clickGitRowAction(page, FixtureFilePath.Projects, "Focus diff");
    await waitForFocusedPath(page, FixtureFilePath.Projects);
    await waitForDiffOutput(page, {
      includes: [ValidationText.StagedDiffMarker],
      excludes: [ValidationText.ProjectsStateDiffMarker]
    });
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-focus-staged-file",
      artifactName: "projects-git-workspace"
    });

    await setGitPathSelection(page, FixtureFilePath.GitDetails, true);
    await setGitPathSelection(page, FixtureFilePath.GitSummary, true);
    await waitForPageText(page, "Unstage selected (2)");
    await clickNamedButton(page, "Unstage selected (2)");
    await waitForPageTexts(page, [
      ValidationText.BulkUnstageSuccess,
      "Untracked files",
      FixtureFilePath.GitDetails,
      FixtureFilePath.GitSummary,
      "Staged diff (2)"
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-bulk-unstage",
      artifactName: "projects-git-workspace"
    });

    await clickGitRowAction(page, FixtureFilePath.QualityGatesClient, "Focus diff");
    await waitForFocusedPath(page, FixtureFilePath.QualityGatesClient);
    await waitForDiffOutput(page, {
      includes: [ValidationText.UnstagedDiffMarker],
      excludes: [ValidationText.StagedDiffMarker]
    });

    const revertDialog = waitForNextDialog(
      page,
      readRevertDialogMessage(FixtureFilePath.QualityGatesClient)
    );
    await clickGitRowAction(page, FixtureFilePath.QualityGatesClient, "Revert");
    await revertDialog;
    await waitForPageTexts(page, [
      ValidationText.QualityGatesReverted,
      ValidationText.UnstagedDiffZero
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-revert",
      artifactName: "projects-git-workspace"
    });

    await clickNamedButton(page, ValidationText.StagedDiffButton);
    await waitForPageTexts(page, [
      ValidationText.StagedDiffMarker,
      ValidationText.ProjectsStateDiffMarker,
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
      ValidationText.UnstagedDiffZero,
      FixtureFilePath.GitDetails
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-commit",
      artifactName: "projects-git-workspace"
    });

    await waitForButtonEnabled(page, "Push upstream");
    await clickNamedButton(page, "Push upstream");
    await waitForPageTexts(page, [
      ValidationText.BranchPushed,
      ValidationText.BranchSynced
    ]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "after-push",
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
    files: createInitialStubFiles(),
    currentBranch: "feature/git-ui",
    localBranches: ["feature/git-ui", "develop"],
    remoteBranches: ["origin/feature/git-ui", "origin/release/next"],
    trackedUpstreams: {
      "feature/git-ui": "origin/feature/git-ui"
    },
    aheadCount: 2
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

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitStage) {
    await handleGitPathMutation(request, response, state, "stage");
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitUnstage) {
    await handleGitPathMutation(request, response, state, "unstage");
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitRevert) {
    await handleGitPathMutation(request, response, state, "revert");
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitCommit) {
    await handleGitCommit(request, response, state);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitBranchesList) {
    await handleGitBranchesList(request, response, state);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitBranchesCreate) {
    await handleGitBranchMutation(request, response, state, "create");
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitBranchesCheckout) {
    await handleGitBranchMutation(request, response, state, "checkout");
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitBranchesPublish) {
    await handleGitBranchRemoteMutation(request, response, state, "publish");
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === RequestPath.GitBranchesPush) {
    await handleGitBranchRemoteMutation(request, response, state, "push");
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
    repository: createGitRepositoryResponse(state)
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

  writeJson(response, 200, {
    staged,
    diff: createGitDiffResponse(state, staged)
  });
}

async function handleGitPathMutation(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubState,
  operation: "stage" | "unstage" | "revert"
): Promise<void> {
  const body = await readJsonBody(request);
  const projectId = readRequiredString(body, "projectId");
  const paths = readRequiredStringArray(body, "paths");

  if (projectId !== FixtureProject.id) {
    writeJson(response, 400, {
      message: "Unexpected project id"
    });
    return;
  }

  try {
    for (const path of paths) {
      if (operation === "stage") {
        applyGitStage(state, path);
      } else if (operation === "unstage") {
        applyGitUnstage(state, path);
      } else {
        applyGitRevert(state, path);
      }
    }
  } catch (error) {
    writeJson(response, 400, {
      message: error instanceof Error ? error.message : "Invalid git mutation"
    });
    return;
  }

  writeJson(response, 200, {
    paths
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

  applyGitCommit(state);

  writeJson(response, 201, {
    commit: FixtureCommit
  });
}

async function handleGitBranchesList(
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
    branches: {
      local: state.localBranches.map((name) => ({
        name,
        current: state.currentBranch === name,
        remote: false,
        ...(state.trackedUpstreams[name]
          ? {
              upstream: state.trackedUpstreams[name]
            }
          : {})
      })),
      remote: state.remoteBranches.map((name) => ({
        name,
        current: false,
        remote: true
      }))
    }
  });
}

async function handleGitBranchRemoteMutation(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubState,
  operation: "publish" | "push"
): Promise<void> {
  const body = await readJsonBody(request);
  const projectId = readRequiredString(body, "projectId");

  if (projectId !== FixtureProject.id) {
    writeJson(response, 400, {
      message: "Unexpected project id"
    });
    return;
  }

  const branchName = state.currentBranch;
  const upstream = `origin/${branchName}`;

  if (operation === "publish") {
    state.trackedUpstreams[branchName] = upstream;
    if (!state.remoteBranches.includes(upstream)) {
      state.remoteBranches = [...state.remoteBranches, upstream];
    }

    writeJson(response, 201, {
      branch: {
        name: branchName,
        upstream
      }
    });
    return;
  }

  if (!state.trackedUpstreams[branchName]) {
    writeJson(response, 400, {
      message: "Current branch has no upstream configured."
    });
    return;
  }

  state.aheadCount = 0;

  writeJson(response, 200, {
    branch: {
      name: branchName,
      upstream
    }
  });
}

async function handleGitBranchMutation(
  request: IncomingMessage,
  response: ServerResponse,
  state: StubState,
  operation: "create" | "checkout"
): Promise<void> {
  const body = await readJsonBody(request);
  const projectId = readRequiredString(body, "projectId");
  const branchName = readRequiredString(body, "branchName");

  if (projectId !== FixtureProject.id) {
    writeJson(response, 400, {
      message: "Unexpected project id"
    });
    return;
  }

  if (operation === "create") {
    if (!state.localBranches.includes(branchName)) {
      state.localBranches = [...state.localBranches, branchName];
    }

    writeJson(response, 201, {
      branch: {
        name: branchName
      }
    });
    return;
  }

  if (!state.localBranches.includes(branchName)) {
    writeJson(response, 400, {
      message: "Unexpected branch"
    });
    return;
  }

  state.currentBranch = branchName;

  writeJson(response, 200, {
    branch: {
      name: branchName
    }
  });
}

function createInitialStubFiles(): Record<string, StubFile> {
  return {
    [FixtureFilePath.Projects]: {
      path: FixtureFilePath.Projects,
      tracked: true,
      status: StubFileStatus.Staged,
      stagedDiff: FixtureDiff.ProjectsStaged
    },
    [FixtureFilePath.ProjectsState]: {
      path: FixtureFilePath.ProjectsState,
      tracked: true,
      status: StubFileStatus.Staged,
      stagedDiff: FixtureDiff.ProjectsStateStaged
    },
    [FixtureFilePath.QualityGatesClient]: {
      path: FixtureFilePath.QualityGatesClient,
      tracked: true,
      status: StubFileStatus.Unstaged,
      unstagedDiff: FixtureDiff.QualityGatesUnstaged
    },
    [FixtureFilePath.GitDetails]: {
      path: FixtureFilePath.GitDetails,
      tracked: false,
      status: StubFileStatus.Untracked,
      stagedDiff: FixtureDiff.GitDetailsStaged
    },
    [FixtureFilePath.GitSummary]: {
      path: FixtureFilePath.GitSummary,
      tracked: false,
      status: StubFileStatus.Untracked,
      stagedDiff: FixtureDiff.GitSummaryStaged
    }
  };
}

function createGitRepositoryResponse(state: StubState): {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  clean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  entries: ReadonlyArray<{
    path: string;
    indexStatus: string;
    workingTreeStatus: string;
    staged: boolean;
    unstaged: boolean;
    untracked: boolean;
  }>;
} {
  const entries = Object.values(state.files)
    .map(createGitStatusEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const stagedCount = entries.filter((entry) => entry.staged).length;
  const unstagedCount = entries.filter((entry) => entry.unstaged).length;
  const untrackedCount = entries.filter((entry) => entry.untracked).length;

  return {
    branch: state.currentBranch,
    ...(state.trackedUpstreams[state.currentBranch]
      ? {
          upstream: state.trackedUpstreams[state.currentBranch]
        }
      : {}),
    ahead: state.aheadCount,
    behind: 0,
    clean: entries.length === 0,
    stagedCount,
    unstagedCount,
    untrackedCount,
    entries
  };
}

function createGitStatusEntry(file: StubFile): {
  path: string;
  indexStatus: string;
  workingTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
} | null {
  if (file.status === StubFileStatus.Staged) {
    return {
      path: file.path,
      indexStatus: file.tracked ? "M" : "A",
      workingTreeStatus: " ",
      staged: true,
      unstaged: false,
      untracked: false
    };
  }

  if (file.status === StubFileStatus.Unstaged) {
    return {
      path: file.path,
      indexStatus: " ",
      workingTreeStatus: "M",
      staged: false,
      unstaged: true,
      untracked: false
    };
  }

  if (file.status === StubFileStatus.Untracked) {
    return {
      path: file.path,
      indexStatus: "?",
      workingTreeStatus: "?",
      staged: false,
      unstaged: false,
      untracked: true
    };
  }

  return null;
}

function createGitDiffResponse(
  state: StubState,
  staged: boolean
): string {
  const diffs = Object.values(state.files)
    .filter((file) =>
      staged
        ? file.status === StubFileStatus.Staged && typeof file.stagedDiff === "string"
        : file.status === StubFileStatus.Unstaged && typeof file.unstagedDiff === "string"
    )
    .map((file) => staged ? file.stagedDiff : file.unstagedDiff)
    .filter((diff): diff is string => typeof diff === "string");

  return diffs.join("\n\n");
}

function applyGitStage(state: StubState, path: string): void {
  const file = readStubFile(state, path);
  state.files[path] = {
    ...file,
    status: StubFileStatus.Staged
  };
}

function applyGitUnstage(state: StubState, path: string): void {
  const file = readStubFile(state, path);
  state.files[path] = {
    ...file,
    status: file.tracked ? StubFileStatus.Unstaged : StubFileStatus.Untracked
  };
}

function applyGitRevert(state: StubState, path: string): void {
  const file = readStubFile(state, path);
  if (!file.tracked || file.status !== StubFileStatus.Unstaged) {
    throw new Error(`Cannot revert ${path}`);
  }

  delete state.files[path];
}

function applyGitCommit(state: StubState): void {
  for (const [path, file] of Object.entries(state.files)) {
    if (file.status === StubFileStatus.Staged) {
      delete state.files[path];
    }
  }

  state.aheadCount += 1;
}

function readStubFile(state: StubState, path: string): StubFile {
  const file = state.files[path];
  if (!file) {
    throw new Error(`Unexpected path ${path}`);
  }

  return file;
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

async function clickGitRowAction(
  page: Page,
  path: string,
  label: string
): Promise<void> {
  const clicked = await page.evaluate(
    (input: {
      path: string;
      label: string;
    }) => {
      const container = Array.from(document.querySelectorAll("div"))
        .filter((element) => {
          const text = element.textContent ?? "";
          return (
            text.includes(input.path) &&
            Array.from(element.querySelectorAll("button")).some(
              (button) => button.textContent?.trim() === input.label
            )
          );
        })
        .sort(
          (left, right) =>
            (left.textContent?.length ?? 0) - (right.textContent?.length ?? 0)
        )[0];
      const button = container
        ? Array.from(container.querySelectorAll("button")).find(
            (element) => element.textContent?.trim() === input.label
          )
        : undefined;

      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }

      button.click();
      return true;
    },
    {
      path,
      label
    }
  );

  if (!clicked) {
    throw new Error(`Could not click "${label}" for ${path}`);
  }
}

async function clickGitBranchAction(
  page: Page,
  branchName: string,
  label: string
): Promise<void> {
  const clicked = await page.evaluate(
    (input: {
      branchName: string;
      label: string;
    }) => {
      const container = Array.from(document.querySelectorAll("div"))
        .filter((element) => {
          const text = element.textContent ?? "";
          return (
            text.includes(input.branchName) &&
            Array.from(element.querySelectorAll("button")).some(
              (button) => button.textContent?.trim() === input.label
            )
          );
        })
        .sort(
          (left, right) =>
            (left.textContent?.length ?? 0) - (right.textContent?.length ?? 0)
        )[0];
      const button = container
        ? Array.from(container.querySelectorAll("button")).find(
            (element) => element.textContent?.trim() === input.label
          )
        : undefined;

      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }

      button.click();
      return true;
    },
    {
      branchName,
      label
    }
  );

  if (!clicked) {
    throw new Error(`Could not click "${label}" for branch ${branchName}`);
  }
}

async function setGitPathSelection(
  page: Page,
  path: string,
  selected: boolean
): Promise<void> {
  await waitForCondition(async () => {
    const result = await page.evaluate((input: {
      path: string;
      selected: boolean;
    }) => {
      const container = Array.from(document.querySelectorAll("div"))
        .filter((element) => {
          const text = element.textContent ?? "";
          return text.includes(input.path);
        })
        .filter((element) =>
          Array.from(element.querySelectorAll('input[type="checkbox"]')).length > 0
        )
        .sort(
          (left, right) =>
            (left.textContent?.length ?? 0) - (right.textContent?.length ?? 0)
        )[0];
      const checkbox = container?.querySelector('input[type="checkbox"]');
      if (!(checkbox instanceof HTMLInputElement)) {
        return false;
      }

      if (checkbox.checked === input.selected) {
        return true;
      }

      checkbox.click();
      return checkbox.checked === input.selected;
    }, {
      path,
      selected
    });

    return result;
  }, `git selection ${selected ? "enable" : "disable"} for ${path}`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

function waitForNextDialog(page: Page, expectedMessage: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Expected dialog "${expectedMessage}"`));
    }, ValidationConfig.UiPollingTimeoutMs);

    page.once("dialog", async (dialog) => {
      clearTimeout(timeout);

      if (dialog.message() !== expectedMessage) {
        reject(new Error(`Unexpected dialog message "${dialog.message()}"`));
        return;
      }

      await dialog.accept();
      resolve();
    });
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

async function waitForFocusedPath(page: Page, path: string): Promise<void> {
  await waitForCondition(async () => {
    return page.evaluate((expectedPath: string) => {
      const element = document.querySelector('[data-testid="git-focused-path"]');
      return element instanceof HTMLElement && element.innerText.includes(expectedPath);
    }, path);
  }, `focused path "${path}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForCurrentBranch(page: Page, branchName: string): Promise<void> {
  await waitForCondition(async () => {
    return page.evaluate((expectedBranch: string) => {
      const element = document.querySelector('[data-testid="git-current-branch"]');
      return element instanceof HTMLElement && element.innerText.includes(expectedBranch);
    }, branchName);
  }, `current branch "${branchName}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForDiffOutput(
  page: Page,
  input: {
    includes: ReadonlyArray<string>;
    excludes: ReadonlyArray<string>;
  }
): Promise<void> {
  await waitForCondition(async () => {
    return page.evaluate((expected: {
      includes: ReadonlyArray<string>;
      excludes: ReadonlyArray<string>;
    }) => {
      const element = document.querySelector('[data-testid="git-diff-output"]');
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const text = element.innerText;
      return (
        expected.includes.every((value) => text.includes(value)) &&
        expected.excludes.every((value) => !text.includes(value))
      );
    }, input);
  }, `diff output ${input.includes.join(", ")}`, {
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

function readRequiredStringArray(value: unknown, key: string): string[] {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const nested = value[key];
  if (!Array.isArray(nested) || nested.length === 0) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`Invalid ${key}`);
    }

    return item.trim();
  });
}

function readRevertDialogMessage(path: string): string {
  return `Revert unstaged changes for ${path}?`;
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
