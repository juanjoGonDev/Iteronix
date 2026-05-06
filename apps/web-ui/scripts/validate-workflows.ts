import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import {
  DefaultServerConnection,
  LocalStorageKey as ServerStorageKey
} from "../src/shared/server-config.js";
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
  StubApiBaseUrl: "http://127.0.0.1:4108",
  PreviewHealthPath: "/index.html",
  StubHealthPath: "/health",
  WorkflowsRoute: ROUTES.WORKFLOWS,
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 18000,
  UiPollingIntervalMs: 200,
  ViewportWidth: 1600,
  ViewportHeight: 1080,
  MobileViewportWidth: 390,
  MobileViewportHeight: 844
} as const;

const RequestPath = {
  WorkspaceStateGet: "/workspace/state/get",
  WorkspaceStateUpdate: "/workspace/state/update",
  DefinitionsList: "/workflows/definitions/list",
  DefinitionsGet: "/workflows/definitions/get",
  DefinitionsUpsert: "/workflows/definitions/upsert",
  DefinitionsDelete: "/workflows/definitions/delete",
  AssetsList: "/workflows/assets/list",
  AssetsGet: "/workflows/assets/get",
  AssetsUpsert: "/workflows/assets/upsert",
  AssetsDelete: "/workflows/assets/delete",
  AssetsUsage: "/workflows/assets/usage",
  ExecutionsList: "/workflows/executions/list",
  ExecutionsGet: "/workflows/executions/get",
  ExecutionsDelete: "/workflows/executions/delete"
} as const;

const ResponseHeader = {
  AllowOrigin: "Access-Control-Allow-Origin",
  AllowHeaders: "Access-Control-Allow-Headers",
  AllowMethods: "Access-Control-Allow-Methods",
  ContentType: "Content-Type"
} as const;

const WorkflowSelector = {
  Root: "workflows-editor-root",
  CanvasViewport: "workflows-canvas-viewport",
  ConnectionHint: "workflows-connection-hint",
  ConnectionPreview: "workflows-connection-preview",
  WorkflowCreate: "workflows-create",
  WorkflowSave: "workflows-save",
  WorkflowNameInput: "workflows-name-input",
  WorkflowDescriptionInput: "workflows-description-input",
  NodeLabelInput: "workflows-node-label-input",
  SectionNodes: "workflows-section-nodes",
  CompactCanvas: "workflows-compact-canvas",
  NodePalettePrefix: "workflows-node-palette-"
} as const;

const WorkflowNodeKind = {
  TriggerManual: "trigger.manual",
  AssetPrompt: "asset.prompt",
  AssetInstruction: "asset.instruction",
  AssetGuardrail: "asset.guardrail",
  AiAgent: "ai.agent",
  AiProviderRun: "ai.provider-run",
  LogicCondition: "logic.condition",
  LogicMerge: "logic.merge",
  HumanReview: "human.review",
  TerminalResponse: "terminal.response"
} as const;

type WorkflowNodeKind = typeof WorkflowNodeKind[keyof typeof WorkflowNodeKind];

type StubProjectRecord = {
  id: string;
  name: string;
  rootPath: string | null;
  createdAt: string;
  updatedAt: string;
};

type StubWorkflowAssetRecord = {
  id: string;
  workspaceId: string;
  projectId?: string;
  kind: "prompt" | "instruction" | "guardrail";
  scope: "workspace" | "project";
  name: string;
  slug: string;
  description: string;
  body: string;
  language: string;
  version: number;
  tags: ReadonlyArray<string>;
  outputContract?: Record<string, unknown>;
  guardrail?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

type StubWorkflowNodeRecord = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  position: { x: number; y: number };
  width: number;
  collapsed: boolean;
  config: {
    assetId?: string;
    role?: string;
    provider?: Record<string, unknown>;
    reviewPolicy?: {
      requireHumanDecision: boolean;
    };
  };
  inputPorts: ReadonlyArray<{ id: string; name: string; acceptsMany: boolean }>;
  outputPorts: ReadonlyArray<{ id: string; name: string; acceptsMany: boolean }>;
  attachedGuardrails: ReadonlyArray<{ assetId: string; order: number; enabled: boolean }>;
  outputContract?: Record<string, unknown>;
};

type StubWorkflowDefinitionRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
  trigger: {
    kind: "manual";
    enabled: boolean;
    config: Record<string, unknown>;
  };
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  nodes: ReadonlyArray<StubWorkflowNodeRecord>;
  edges: ReadonlyArray<{
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    mapping: {
      mode: string;
      entries: ReadonlyArray<unknown>;
    };
  }>;
  executionPolicy: {
    maxNodeRetries: number;
    allowManualCheckpointResume: boolean;
  };
  defaultContextPolicy: {
    language: string;
    carryMessagesLimit: number;
    carryArtifactLimit: number;
  };
  tags: ReadonlyArray<string>;
};

type StubExecutionRecord = {
  id: string;
  workflowId: string;
  projectId: string;
  triggerKind: "manual";
  status: "completed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  warningsCount: number;
  errorsCount: number;
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostEur: number;
    latencyMs: number;
  };
  contextSessionId: string;
  nodeRuns: ReadonlyArray<unknown>;
};

type StubAssetUsageRecord = {
  assetId: string;
  workflowId: string;
  projectId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  role: "primary" | "instruction" | "guardrail";
  createdAt: string;
};

type StubServerState = {
  settings: Record<string, unknown>;
  definitions: StubWorkflowDefinitionRecord[];
  assets: StubWorkflowAssetRecord[];
  executions: StubExecutionRecord[];
  nextWorkflowId: number;
  nextAssetId: number;
};

const fixtureProject: StubProjectRecord = {
  id: "workflows-project",
  name: "Iteronix",
  rootPath: "D:\\projects\\Iteronix",
  createdAt: "2026-05-06T08:00:00.000Z",
  updatedAt: "2026-05-06T08:00:00.000Z"
};

const ValidationText = {
  ScreenTitle: "Workflows",
  CurrentProject: fixtureProject.name,
  WorkflowName: "Daily updates workflow",
  WorkflowDescription: "Server-backed workflow for the integrated editor.",
  PromptNodeLabel: "Primary prompt",
  ProviderNodeLabel: "Codex run",
  WorkflowCreatedNotice: "Workflow definition created.",
  WorkflowSavedNotice: "Workflow saved to the server workspace.",
  ConnectionAddedNotice: "Connection added.",
  ConnectionHintTitle: "Connect nodes",
  ConnectionModeTitle: "Connection mode"
} as const;

const runtimeOptions = parseBrowserValidationRuntimeOptions(process.argv.slice(2));
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(projectRoot, "screenshots");
const buildOutputPath = join(projectRoot, "dist", "index.js");

await validateWorkflowsScreen();

async function validateWorkflowsScreen(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots
  });

  const previewServer = startPreviewServer(projectRoot);
  const stubServer = await startWorkflowStubServer();
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
    await page.goto(`${ValidationConfig.PreviewBaseUrl}${ValidationConfig.WorkflowsRoute}`, {
      waitUntil: "networkidle0"
    });

    await waitForTestId(page, WorkflowSelector.Root);
    await waitForPageTexts(page, [ValidationText.ScreenTitle, ValidationText.CurrentProject]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-initial",
      artifactName: "workflows"
    });

    await clickByTestId(page, WorkflowSelector.WorkflowCreate);
    await waitForPageText(page, ValidationText.WorkflowCreatedNotice);
    await waitForTestId(page, WorkflowSelector.ConnectionHint);
    await waitForPageText(page, ValidationText.ConnectionHintTitle);

    await clickByTestId(page, WorkflowSelector.SectionNodes);
    await waitForNodePalette(page);
    await clickByTestId(page, `${WorkflowSelector.NodePalettePrefix}${WorkflowNodeKind.AssetPrompt}`);
    await waitForPageText(page, "Prompt asset created.");
    await setInputValueByTestId(page, WorkflowSelector.NodeLabelInput, ValidationText.PromptNodeLabel);
    await waitForNodeCardText(page, ValidationText.PromptNodeLabel);

    await clickByTestId(page, `${WorkflowSelector.NodePalettePrefix}${WorkflowNodeKind.AiProviderRun}`);
    await waitForNodeCardCount(page, 4);
    const nodeCardTestIds = await readNodeCardTestIds(page);
    const triggerCardTestId = nodeCardTestIds[0];
    const promptCardTestId = nodeCardTestIds[2];
    const providerCardTestId = nodeCardTestIds[3];
    if (!triggerCardTestId || !promptCardTestId || !providerCardTestId) {
      throw new Error("Expected trigger, prompt and provider node cards to exist.");
    }
    await clickEditButtonWithinNodeCard(page, providerCardTestId);
    await setInputValueByTestId(page, WorkflowSelector.NodeLabelInput, ValidationText.ProviderNodeLabel);
    await waitForNodeCardText(page, ValidationText.ProviderNodeLabel);
    const beforePosition = await readNodeCardPosition(page, providerCardTestId);
    await dragNodeCard(page, providerCardTestId, 140, 96);
    await waitForCondition(async () => {
      const afterPosition = await readNodeCardPosition(page, providerCardTestId);
      return afterPosition.left !== beforePosition.left || afterPosition.top !== beforePosition.top;
    }, "provider node drag movement", {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs
    });

    await startConnectionDragFromNodePort(page, triggerCardTestId, "output · Run");
    await waitForPageText(page, ValidationText.ConnectionModeTitle);
    await waitForTestId(page, WorkflowSelector.ConnectionPreview);
    await finishConnectionDragOnNodePort(page, promptCardTestId, "input · Context");
    await waitForEdgeCount(page, 1);
    await startConnectionDragFromNodePort(page, triggerCardTestId, "output · Run");
    await waitForTestId(page, WorkflowSelector.ConnectionPreview);
    await finishConnectionDragOnNodePort(page, providerCardTestId, "input · Input");
    await waitForEdgeCount(page, 2);

    await clickCanvasBackground(page);
    await waitForTestId(page, WorkflowSelector.WorkflowNameInput);
    await setInputValueByTestId(page, WorkflowSelector.WorkflowNameInput, ValidationText.WorkflowName);
    await waitForInputValue(page, WorkflowSelector.WorkflowNameInput, ValidationText.WorkflowName);
    await setTextAreaValueByTestId(page, WorkflowSelector.WorkflowDescriptionInput, ValidationText.WorkflowDescription);

    await clickByTestId(page, WorkflowSelector.WorkflowSave);
    await waitForPageText(page, ValidationText.WorkflowSavedNotice);
    assertPersistedWorkflow(stubServer.state);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-saved",
      artifactName: "workflows"
    });

    await page.reload({
      waitUntil: "networkidle0"
    });
    await waitForPageTexts(page, [
      ValidationText.WorkflowName,
      ValidationText.PromptNodeLabel,
      ValidationText.ProviderNodeLabel
    ]);
    await waitForInputValue(page, WorkflowSelector.WorkflowNameInput, ValidationText.WorkflowName);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-reloaded",
      artifactName: "workflows"
    });

    await page.setViewport({
      width: ValidationConfig.MobileViewportWidth,
      height: ValidationConfig.MobileViewportHeight
    });
    await page.goto(`${ValidationConfig.PreviewBaseUrl}${ValidationConfig.WorkflowsRoute}`, {
      waitUntil: "networkidle0"
    });
    await waitForTestId(page, WorkflowSelector.CompactCanvas);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-mobile",
      artifactName: "workflows"
    });

    await page.close();
    console.log("Browser validation passed for workflows screen.");
  } finally {
    if (browser) {
      await browser.close();
    }
    await stubServer.close();
    await stopProcess(previewServer);
  }
}

async function startWorkflowStubServer(): Promise<{
  state: StubServerState;
  close: () => Promise<void>;
}> {
  const state: StubServerState = {
    settings: createDefaultWorkspaceSettings(),
    definitions: [],
    assets: [],
    executions: [],
    nextWorkflowId: 1,
    nextAssetId: 1
  };
  const server = createServer((request, response) => {
    void handleStubRequest(request, response, state);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(4108, "127.0.0.1", () => resolve());
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

  if (request.method !== "POST") {
    writeJson(response, 405, {
      message: "Method not allowed"
    });
    return;
  }

  const body = await readJsonBody(request);

  if (requestUrl.pathname === RequestPath.WorkspaceStateGet) {
    writeJson(response, 200, {
      state: createWorkspaceState(state.settings)
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.WorkspaceStateUpdate) {
    if (isRecord(body) && isRecord(body["settings"])) {
      state.settings = body["settings"];
    }
    writeJson(response, 200, {
      state: createWorkspaceState(state.settings)
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsList) {
    const projectId = readRequiredString(body, "projectId");
    writeJson(response, 200, {
      definitions: state.definitions.filter((definition) => definition.projectId === projectId)
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsGet) {
    const workflowId = readRequiredString(body, "workflowId");
    const definition = state.definitions.find((entry) => entry.id === workflowId);
    if (!definition) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    writeJson(response, 200, { definition });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsUpsert) {
    const projectId = readRequiredString(body, "projectId");
    const definitionInput = readRequiredRecord(body, "definition");
    const now = "2026-05-06T08:15:00.000Z";
    const existingId = readOptionalString(definitionInput, "id");
    const existingIndex = existingId
      ? state.definitions.findIndex((entry) => entry.id === existingId)
      : -1;
    const nextDefinition = createDefinitionRecord({
      definitionInput,
      projectId,
      ...(existingIndex >= 0 && state.definitions[existingIndex]
        ? { existing: state.definitions[existingIndex] }
        : {}),
      workflowId: existingIndex >= 0
        ? state.definitions[existingIndex]?.id ?? `workflow-${state.nextWorkflowId}`
        : `workflow-${state.nextWorkflowId}`,
      updatedAt: now
    });
    if (existingIndex >= 0) {
      state.definitions[existingIndex] = nextDefinition;
    } else {
      state.nextWorkflowId += 1;
      state.definitions.push(nextDefinition);
    }
    writeJson(response, 200, {
      definition: nextDefinition
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsDelete) {
    const workflowId = readRequiredString(body, "workflowId");
    const existingIndex = state.definitions.findIndex((entry) => entry.id === workflowId);
    if (existingIndex < 0) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    const [definition] = state.definitions.splice(existingIndex, 1);
    writeJson(response, 200, { definition });
    return;
  }

  if (requestUrl.pathname === RequestPath.AssetsList) {
    const projectId = readRequiredString(body, "projectId");
    const workspaceId = readRequiredString(body, "workspaceId");
    writeJson(response, 200, {
      assets: state.assets.filter((asset) =>
        asset.workspaceId === workspaceId &&
        (asset.projectId === undefined || asset.projectId === projectId)
      )
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.AssetsGet) {
    const assetId = readRequiredString(body, "assetId");
    const asset = state.assets.find((entry) => entry.id === assetId);
    if (!asset) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    writeJson(response, 200, { asset });
    return;
  }

  if (requestUrl.pathname === RequestPath.AssetsUpsert) {
    const projectId = readRequiredString(body, "projectId");
    const assetInput = readRequiredRecord(body, "asset");
    const now = "2026-05-06T08:15:30.000Z";
    const existingId = readOptionalString(assetInput, "id");
    const existingIndex = existingId
      ? state.assets.findIndex((entry) => entry.id === existingId)
      : -1;
    const nextAsset = createAssetRecord({
      assetInput,
      projectId,
      ...(existingIndex >= 0 && state.assets[existingIndex]
        ? { existing: state.assets[existingIndex] }
        : {}),
      assetId: existingIndex >= 0
        ? state.assets[existingIndex]?.id ?? `asset-${state.nextAssetId}`
        : `asset-${state.nextAssetId}`,
      updatedAt: now
    });
    if (existingIndex >= 0) {
      state.assets[existingIndex] = nextAsset;
    } else {
      state.nextAssetId += 1;
      state.assets.push(nextAsset);
    }
    writeJson(response, 200, {
      asset: nextAsset
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.AssetsDelete) {
    const assetId = readRequiredString(body, "assetId");
    const existingIndex = state.assets.findIndex((entry) => entry.id === assetId);
    if (existingIndex < 0) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    const [asset] = state.assets.splice(existingIndex, 1);
    writeJson(response, 200, { asset });
    return;
  }

  if (requestUrl.pathname === RequestPath.AssetsUsage) {
    const assetId = readOptionalString(body, "assetId");
    const workflowId = readOptionalString(body, "workflowId");
    const projectId = readOptionalString(body, "projectId");
    writeJson(response, 200, {
      usages: readAssetUsages(state).filter((usage) =>
        (assetId === undefined || usage.assetId === assetId) &&
        (workflowId === undefined || usage.workflowId === workflowId) &&
        (projectId === undefined || usage.projectId === projectId)
      )
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.ExecutionsList) {
    const projectId = readRequiredString(body, "projectId");
    const workflowId = readOptionalString(body, "workflowId");
    writeJson(response, 200, {
      executions: state.executions.filter((execution) =>
        execution.projectId === projectId &&
        (workflowId === undefined || execution.workflowId === workflowId)
      )
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.ExecutionsGet) {
    const executionId = readRequiredString(body, "executionId");
    const execution = state.executions.find((entry) => entry.id === executionId);
    if (!execution) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    writeJson(response, 200, { execution });
    return;
  }

  if (requestUrl.pathname === RequestPath.ExecutionsDelete) {
    const executionId = readRequiredString(body, "executionId");
    const existingIndex = state.executions.findIndex((entry) => entry.id === executionId);
    if (existingIndex < 0) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    const [execution] = state.executions.splice(existingIndex, 1);
    writeJson(response, 200, { execution });
    return;
  }

  writeJson(response, 404, {
    message: "Not found"
  });
}

function createWorkspaceState(settings: Record<string, unknown>): Record<string, unknown> {
  return {
    activeProjectId: fixtureProject.id,
    projects: [fixtureProject],
    settings,
    workbenchHistory: {
      runs: [],
      evals: []
    }
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
    },
    serverConnection: {
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken
    }
  };
}

function createDefinitionRecord(input: {
  definitionInput: Record<string, unknown>;
  projectId: string;
  existing?: StubWorkflowDefinitionRecord;
  workflowId: string;
  updatedAt: string;
}): StubWorkflowDefinitionRecord {
  const createdAt = input.existing?.createdAt ?? input.updatedAt;
  const version = input.existing ? input.existing.version + 1 : 1;
  return {
    id: input.workflowId,
    workspaceId: readRequiredString(input.definitionInput, "workspaceId"),
    projectId: input.projectId,
    name: readRequiredString(input.definitionInput, "name"),
    description: readStringValue(input.definitionInput, "description"),
    status: readStatusValue(input.definitionInput, "status"),
    version,
    createdAt,
    updatedAt: input.updatedAt,
    trigger: readTriggerRecord(input.definitionInput, "trigger"),
    viewport: readViewportRecord(input.definitionInput, "viewport"),
    nodes: readNodeArray(input.definitionInput, "nodes"),
    edges: readEdgeArray(input.definitionInput, "edges"),
    executionPolicy: readExecutionPolicyRecord(input.definitionInput, "executionPolicy"),
    defaultContextPolicy: readContextPolicyRecord(input.definitionInput, "defaultContextPolicy"),
    tags: readStringArray(input.definitionInput, "tags")
  };
}

function createAssetRecord(input: {
  assetInput: Record<string, unknown>;
  projectId: string;
  existing?: StubWorkflowAssetRecord;
  assetId: string;
  updatedAt: string;
}): StubWorkflowAssetRecord {
  const createdAt = input.existing?.createdAt ?? input.updatedAt;
  const version = input.existing ? input.existing.version + 1 : 1;
  const scope = readAssetScopeValue(input.assetInput, "scope");
  const projectId = scope === "project" ? input.projectId : undefined;
  const outputContract = readOptionalRecord(input.assetInput, "outputContract");
  const guardrail = readOptionalRecord(input.assetInput, "guardrail");
  const archivedAt = readOptionalString(input.assetInput, "archivedAt");

  return {
    id: input.assetId,
    workspaceId: readRequiredString(input.assetInput, "workspaceId"),
    ...(projectId ? { projectId } : {}),
    kind: readAssetKindValue(input.assetInput, "kind"),
    scope,
    name: readRequiredString(input.assetInput, "name"),
    slug: readRequiredString(input.assetInput, "slug"),
    description: readStringValue(input.assetInput, "description"),
    body: readStringValue(input.assetInput, "body"),
    language: readStringValue(input.assetInput, "language"),
    version,
    tags: readStringArray(input.assetInput, "tags"),
    ...(outputContract ? { outputContract } : {}),
    ...(guardrail ? { guardrail } : {}),
    createdAt,
    updatedAt: input.updatedAt,
    ...(archivedAt ? { archivedAt } : {})
  };
}

function readAssetUsages(
  state: StubServerState
): ReadonlyArray<StubAssetUsageRecord> {
  return state.definitions.flatMap((definition) =>
    definition.nodes.flatMap((node) => {
      const primaryUsage = node.config.assetId
        ? [{
            assetId: node.config.assetId,
            workflowId: definition.id,
            projectId: definition.projectId,
            nodeId: node.id,
            nodeKind: node.kind,
            role: node.kind === WorkflowNodeKind.AssetInstruction ? "instruction" as const : "primary" as const,
            createdAt: definition.updatedAt
          }]
        : [];
      const guardrailUsages = node.attachedGuardrails.map((guardrail) => ({
        assetId: guardrail.assetId,
        workflowId: definition.id,
        projectId: definition.projectId,
        nodeId: node.id,
        nodeKind: node.kind,
        role: "guardrail" as const,
        createdAt: definition.updatedAt
      }));

      return [...primaryUsage, ...guardrailUsages];
    })
  );
}

async function seedBrowserStorage(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(
    (payload: {
      serverUrl: string;
      authToken: string;
      serverKeys: typeof ServerStorageKey;
    }) => {
      window.localStorage.setItem(payload.serverKeys.ServerUrl, payload.serverUrl);
      window.localStorage.setItem(payload.serverKeys.AuthToken, payload.authToken);
    },
    {
      serverUrl: ValidationConfig.StubApiBaseUrl,
      authToken: DefaultServerConnection.authToken,
      serverKeys: ServerStorageKey
    }
  );
}

async function waitForNodePalette(page: Page): Promise<void> {
  const requiredKinds: ReadonlyArray<WorkflowNodeKind> = [
    WorkflowNodeKind.TriggerManual,
    WorkflowNodeKind.AssetPrompt,
    WorkflowNodeKind.AssetInstruction,
    WorkflowNodeKind.AiAgent,
    WorkflowNodeKind.AiProviderRun,
    WorkflowNodeKind.AssetGuardrail,
    WorkflowNodeKind.LogicCondition,
    WorkflowNodeKind.LogicMerge,
    WorkflowNodeKind.HumanReview,
    WorkflowNodeKind.TerminalResponse
  ];

  for (const kind of requiredKinds) {
    await waitForTestId(page, `${WorkflowSelector.NodePalettePrefix}${kind}`);
  }
}

async function clickByTestId(page: Page, testId: string): Promise<void> {
  const clicked = await page.evaluate((selector: string) => {
    const element = document.querySelector(`[data-testid="${selector}"]`);
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    element.click();
    return true;
  }, testId);

  if (!clicked) {
    throw new Error(`Could not click ${testId}.`);
  }
}

async function setInputValueByTestId(
  page: Page,
  testId: string,
  value: string
): Promise<void> {
  const updated = await page.evaluate(
    (payload: { testId: string; value: string }) => {
      const element = document.querySelector(`[data-testid="${payload.testId}"]`);
      if (!(element instanceof HTMLInputElement)) {
        return false;
      }
      element.value = payload.value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
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

async function setTextAreaValueByTestId(
  page: Page,
  testId: string,
  value: string
): Promise<void> {
  const updated = await page.evaluate(
    (payload: { testId: string; value: string }) => {
      const element = document.querySelector(`[data-testid="${payload.testId}"]`);
      if (!(element instanceof HTMLTextAreaElement)) {
        return false;
      }
      element.value = payload.value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    {
      testId,
      value
    }
  );

  if (!updated) {
    throw new Error(`Could not set textarea ${testId}.`);
  }
}

async function clickCanvasBackground(page: Page): Promise<void> {
  const clicked = await page.evaluate((selector: string) => {
    const element = document.querySelector(`[data-testid="${selector}"]`);
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: rect.left + 40,
      clientY: rect.top + 40
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: rect.left + 40,
      clientY: rect.top + 40
    }));
    return true;
  }, WorkflowSelector.CanvasViewport);

  if (!clicked) {
    throw new Error("Could not click the workflow canvas background.");
  }
}

async function readNodeCardTestIds(page: Page): Promise<ReadonlyArray<string>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid^='workflows-node-card-']"))
      .map((element) => element.getAttribute("data-testid"))
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
}

async function readNodeCardPosition(
  page: Page,
  testId: string
): Promise<{ left: number; top: number }> {
  const position = await page.evaluate((selector: string) => {
    const element = document.querySelector(`[data-testid="${selector}"]`);
    if (!(element instanceof HTMLElement)) {
      return null;
    }
    const left = Number.parseFloat(element.style.left);
    const top = Number.parseFloat(element.style.top);
    return {
      left: Number.isFinite(left) ? Math.round(left) : 0,
      top: Number.isFinite(top) ? Math.round(top) : 0
    };
  }, testId);

  if (!position) {
    throw new Error(`Could not read node position for ${testId}.`);
  }

  return position;
}

async function dragNodeCard(
  page: Page,
  testId: string,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const moved = await page.evaluate((payload: { testId: string; deltaX: number; deltaY: number }) => {
    const handle = document.querySelector(`[data-testid="${payload.testId}"] [data-drag-handle]`);
    if (!(handle instanceof HTMLElement)) {
      return false;
    }

    const rect = handle.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + Math.min(rect.height / 2, 24);
    handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: startX,
      clientY: startY
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: startX + payload.deltaX,
      clientY: startY + payload.deltaY
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: startX + payload.deltaX,
      clientY: startY + payload.deltaY
    }));
    return true;
  }, {
    testId,
    deltaX,
    deltaY
  });

  if (!moved) {
    throw new Error(`Could not drag ${testId}.`);
  }
}

async function startConnectionDragFromNodePort(
  page: Page,
  testId: string,
  title: string
): Promise<void> {
  const started = await page.evaluate((payload: { testId: string; title: string }) => {
    const card = document.querySelector(`[data-testid="${payload.testId}"]`);
    if (!(card instanceof HTMLElement)) {
      return false;
    }

    const port = Array.from(card.querySelectorAll("button")).find(
      (button) => button.getAttribute("title") === payload.title
    );
    if (!(port instanceof HTMLButtonElement)) {
      return false;
    }

    const rect = port.getBoundingClientRect();
    const clientX = rect.right - Math.min(18, rect.width * 0.14);
    const clientY = rect.top + rect.height / 2;
    port.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX,
      clientY
    }));
    return true;
  }, {
    testId,
    title
  });

  if (!started) {
    throw new Error(`Could not start connection drag from ${title} in ${testId}.`);
  }
}

async function finishConnectionDragOnNodePort(
  page: Page,
  testId: string,
  title: string
): Promise<void> {
  const finished = await page.evaluate((payload: { testId: string; title: string }) => {
    const card = document.querySelector(`[data-testid="${payload.testId}"]`);
    if (!(card instanceof HTMLElement)) {
      return false;
    }

    const port = Array.from(card.querySelectorAll("button")).find(
      (button) => button.getAttribute("title") === payload.title
    );
    if (!(port instanceof HTMLButtonElement)) {
      return false;
    }

    const rect = port.getBoundingClientRect();
    const clientX = rect.left + Math.min(18, rect.width * 0.14);
    const clientY = rect.top + rect.height / 2;
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX,
      clientY
    }));
    port.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX,
      clientY
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX,
      clientY
    }));
    return true;
  }, {
    testId,
    title
  });

  if (!finished) {
    throw new Error(`Could not finish connection drag on ${title} in ${testId}.`);
  }
}

async function clickEditButtonWithinNodeCard(
  page: Page,
  testId: string
): Promise<void> {
  const clicked = await page.evaluate((selector: string) => {
    const card = document.querySelector(`[data-testid="${selector}"]`);
    if (!(card instanceof HTMLElement)) {
      return false;
    }
    const button = Array.from(card.querySelectorAll("button")).find(
      (entry) => {
        const label = entry.textContent?.trim();
        return label === "Edit" || label === "Selected";
      }
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  }, testId);

  if (!clicked) {
    throw new Error(`Could not click Edit in ${testId}.`);
  }
}

async function waitForInputValue(
  page: Page,
  testId: string,
  expectedValue: string
): Promise<void> {
  await waitForCondition(async () => {
    const value = await page.evaluate((selector: string) => {
      const element = document.querySelector(`[data-testid="${selector}"]`);
      if (!(element instanceof HTMLInputElement)) {
        return null;
      }
      return element.value;
    }, testId);

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

async function waitForPageTexts(page: Page, texts: ReadonlyArray<string>): Promise<void> {
  await waitForCondition(async () => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    return texts.every((text) => bodyText.includes(text));
  }, `page texts "${texts.join(", ")}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForTestId(page: Page, testId: string): Promise<void> {
  await waitForCondition(async () => {
    const exists = await page.evaluate((selector: string) => {
      const element = document.querySelector(`[data-testid="${selector}"]`);
      return element instanceof HTMLElement;
    }, testId);
    return exists;
  }, `test id "${testId}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForNodeCardText(page: Page, text: string): Promise<void> {
  await waitForCondition(async () => {
    const exists = await page.evaluate((label: string) =>
      Array.from(document.querySelectorAll("[data-testid^='workflows-node-card-']"))
        .some((element) => element.textContent?.includes(label) ?? false)
    , text);
    return exists;
  }, `node card text "${text}"`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForNodeCardCount(page: Page, expectedCount: number): Promise<void> {
  await waitForCondition(async () => {
    const count = await page.evaluate(() =>
      document.querySelectorAll("[data-testid^='workflows-node-card-']").length
    );
    return count === expectedCount;
  }, `node card count ${String(expectedCount)}`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

async function waitForEdgeCount(page: Page, expectedCount: number): Promise<void> {
  await waitForCondition(async () => {
    const count = await page.evaluate(() =>
      document.querySelectorAll("[data-testid='workflows-edge']").length
    );
    return count === expectedCount;
  }, `workflow edge count ${String(expectedCount)}`, {
    timeoutMs: ValidationConfig.UiPollingTimeoutMs,
    intervalMs: ValidationConfig.UiPollingIntervalMs
  });
}

function assertPersistedWorkflow(state: StubServerState): void {
  if (state.definitions.length !== 1) {
    throw new Error(`Expected one persisted workflow, received ${state.definitions.length}.`);
  }

  const definition = state.definitions[0];
  if (!definition) {
    throw new Error("Expected persisted workflow definition.");
  }

  if (definition.name !== ValidationText.WorkflowName) {
    throw new Error(`Unexpected persisted workflow name: ${definition.name}`);
  }

  if (definition.description !== ValidationText.WorkflowDescription) {
    throw new Error(`Unexpected persisted workflow description: ${definition.description}`);
  }

  if (definition.nodes.length !== 4) {
    throw new Error(`Expected four workflow nodes after authoring, received ${definition.nodes.length}.`);
  }

  if (!definition.nodes.some((node) => node.label === ValidationText.PromptNodeLabel)) {
    throw new Error(`Expected prompt node label to persist. Received: ${definition.nodes.map((node) => node.label).join(", ")}`);
  }

  if (!definition.nodes.some((node) => node.label === ValidationText.ProviderNodeLabel)) {
    throw new Error(`Expected provider node label to persist. Received: ${definition.nodes.map((node) => node.label).join(", ")}`);
  }

  if (definition.edges.length !== 2) {
    throw new Error(`Expected two saved edges, received ${definition.edges.length}.`);
  }

  if (state.assets.length !== 1 || state.assets[0]?.kind !== "prompt") {
    throw new Error("Expected one persisted prompt asset.");
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

function isAuthorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${DefaultServerConnection.authToken}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredRecord(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const nested = value[key];
  if (!isRecord(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested;
}

function readOptionalRecord(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
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

function readStringValue(value: unknown, key: string): string {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${key}`);
  }

  return nested;
}

function readOptionalString(
  value: unknown,
  key: string
): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const nested = value[key];
  if (typeof nested !== "string") {
    return undefined;
  }

  const trimmed = nested.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringArray(
  value: Record<string, unknown>,
  key: string
): ReadonlyArray<string> {
  const nested = value[key];
  if (!Array.isArray(nested) || nested.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error(`Invalid ${key}`);
    }
    return entry;
  });
}

function readTriggerRecord(
  value: Record<string, unknown>,
  key: string
): StubWorkflowDefinitionRecord["trigger"] {
  const nested = readRequiredRecord(value, key);
  return {
    kind: "manual",
    enabled: readBooleanValue(nested, "enabled"),
    config: readRequiredObjectValue(nested, "config")
  };
}

function readViewportRecord(
  value: Record<string, unknown>,
  key: string
): StubWorkflowDefinitionRecord["viewport"] {
  const nested = readRequiredRecord(value, key);
  return {
    x: readNumberValue(nested, "x"),
    y: readNumberValue(nested, "y"),
    zoom: readNumberValue(nested, "zoom")
  };
}

function readNodeArray(
  value: Record<string, unknown>,
  key: string
): ReadonlyArray<StubWorkflowNodeRecord> {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.map((entry) => readNodeRecord(entry));
}

function readNodeRecord(value: unknown): StubWorkflowNodeRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid node");
  }

  const outputContract = readOptionalRecord(value, "outputContract");

  return {
    id: readRequiredString(value, "id"),
    kind: readNodeKindValue(value, "kind"),
    label: readRequiredString(value, "label"),
    position: {
      x: readNumberValue(readRequiredRecord(value, "position"), "x"),
      y: readNumberValue(readRequiredRecord(value, "position"), "y")
    },
    width: readNumberValue(value, "width"),
    collapsed: readBooleanValue(value, "collapsed"),
    config: readNodeConfigRecord(readRequiredRecord(value, "config")),
    inputPorts: readPortArray(value, "inputPorts"),
    outputPorts: readPortArray(value, "outputPorts"),
    attachedGuardrails: readAttachedGuardrails(value, "attachedGuardrails"),
    ...(outputContract ? { outputContract } : {})
  };
}

function readNodeConfigRecord(
  value: Record<string, unknown>
): StubWorkflowNodeRecord["config"] {
  const assetId = readOptionalString(value, "assetId");
  const role = readOptionalString(value, "role");
  const provider = readOptionalRecord(value, "provider");
  const reviewPolicyValue = readOptionalRecord(value, "reviewPolicy");
  const reviewPolicy = reviewPolicyValue
    ? {
        requireHumanDecision: readBooleanValue(reviewPolicyValue, "requireHumanDecision")
      }
    : undefined;

  return {
    ...(assetId ? { assetId } : {}),
    ...(role ? { role } : {}),
    ...(provider ? { provider } : {}),
    ...(reviewPolicy ? { reviewPolicy } : {})
  };
}

function readPortArray(
  value: Record<string, unknown>,
  key: string
): ReadonlyArray<{ id: string; name: string; acceptsMany: boolean }> {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid ${key}`);
    }
    return {
      id: readRequiredString(entry, "id"),
      name: readRequiredString(entry, "name"),
      acceptsMany: readBooleanValue(entry, "acceptsMany")
    };
  });
}

function readAttachedGuardrails(
  value: Record<string, unknown>,
  key: string
): ReadonlyArray<{ assetId: string; order: number; enabled: boolean }> {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid ${key}`);
    }

    return {
      assetId: readRequiredString(entry, "assetId"),
      order: readNumberValue(entry, "order"),
      enabled: readBooleanValue(entry, "enabled")
    };
  });
}

function readEdgeArray(
  value: Record<string, unknown>,
  key: string
): ReadonlyArray<StubWorkflowDefinitionRecord["edges"][number]> {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid ${key}`);
    }
    return {
      id: readRequiredString(entry, "id"),
      sourceNodeId: readRequiredString(entry, "sourceNodeId"),
      sourcePortId: readRequiredString(entry, "sourcePortId"),
      targetNodeId: readRequiredString(entry, "targetNodeId"),
      targetPortId: readRequiredString(entry, "targetPortId"),
      mapping: {
        mode: readRequiredString(readRequiredRecord(entry, "mapping"), "mode"),
        entries: readArrayValue(readRequiredRecord(entry, "mapping"), "entries")
      }
    };
  });
}

function readExecutionPolicyRecord(
  value: Record<string, unknown>,
  key: string
): StubWorkflowDefinitionRecord["executionPolicy"] {
  const nested = readRequiredRecord(value, key);
  return {
    maxNodeRetries: readNumberValue(nested, "maxNodeRetries"),
    allowManualCheckpointResume: readBooleanValue(nested, "allowManualCheckpointResume")
  };
}

function readContextPolicyRecord(
  value: Record<string, unknown>,
  key: string
): StubWorkflowDefinitionRecord["defaultContextPolicy"] {
  const nested = readRequiredRecord(value, key);
  return {
    language: readRequiredString(nested, "language"),
    carryMessagesLimit: readNumberValue(nested, "carryMessagesLimit"),
    carryArtifactLimit: readNumberValue(nested, "carryArtifactLimit")
  };
}

function readArrayValue(
  value: Record<string, unknown>,
  key: string
): ReadonlyArray<unknown> {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested;
}

function readRequiredObjectValue(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const nested = value[key];
  if (!isRecord(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested;
}

function readNumberValue(value: Record<string, unknown>, key: string): number {
  const nested = value[key];
  if (typeof nested !== "number" || Number.isNaN(nested)) {
    throw new Error(`Invalid ${key}`);
  }
  return nested;
}

function readBooleanValue(value: Record<string, unknown>, key: string): boolean {
  const nested = value[key];
  if (typeof nested !== "boolean") {
    throw new Error(`Invalid ${key}`);
  }
  return nested;
}

function readStatusValue(
  value: Record<string, unknown>,
  key: string
): StubWorkflowDefinitionRecord["status"] {
  const nested = readRequiredString(value, key);
  if (nested === "draft" || nested === "published" || nested === "archived") {
    return nested;
  }
  throw new Error(`Invalid ${key}`);
}

function readNodeKindValue(
  value: Record<string, unknown>,
  key: string
): WorkflowNodeKind {
  const nested = readRequiredString(value, key);
  if (Object.values(WorkflowNodeKind).includes(nested as WorkflowNodeKind)) {
    return nested as WorkflowNodeKind;
  }
  throw new Error(`Invalid ${key}`);
}

function readAssetKindValue(
  value: Record<string, unknown>,
  key: string
): StubWorkflowAssetRecord["kind"] {
  const nested = readRequiredString(value, key);
  if (nested === "prompt" || nested === "instruction" || nested === "guardrail") {
    return nested;
  }
  throw new Error(`Invalid ${key}`);
}

function readAssetScopeValue(
  value: Record<string, unknown>,
  key: string
): StubWorkflowAssetRecord["scope"] {
  const nested = readRequiredString(value, key);
  if (nested === "workspace" || nested === "project") {
    return nested;
  }
  throw new Error(`Invalid ${key}`);
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
