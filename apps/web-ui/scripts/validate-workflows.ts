import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import { ROUTES } from "../src/shared/constants.js";
import { LocalStorageKey as ServerStorageKey } from "../src/shared/server-config.js";
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
  WorkflowsRoute: ROUTES.WORKFLOWS,
  PreviewStartupTimeoutMs: 30000,
  UiPollingTimeoutMs: 18000,
  UiPollingIntervalMs: 200,
  ViewportWidth: 1600,
  ViewportHeight: 1080,
  MobileViewportWidth: 390,
  MobileViewportHeight: 844,
} as const;

const RequestPath = {
  SettingsGet: "/settings/get",
  SettingsUpdate: "/settings/update",
  DefinitionsList: "/workflows/definitions/list",
  DefinitionsGet: "/workflows/definitions/get",
  DefinitionsVersions: "/workflows/definitions/versions",
  DefinitionsRestoreVersion: "/workflows/definitions/restore-version",
  DefinitionsRestoreVersionPart: "/workflows/definitions/restore-version-part",
  DefinitionsCloneVersion: "/workflows/definitions/clone-version",
  DefinitionsExportVersion: "/workflows/definitions/export-version",
  DefinitionsExportVersionTimeline:
    "/workflows/definitions/export-version-timeline",
  DefinitionsPreviewImportVersion:
    "/workflows/definitions/preview-import-version",
  DefinitionsImportVersion: "/workflows/definitions/import-version",
  DefinitionsCleanupVersions: "/workflows/definitions/cleanup-versions",
  DefinitionsUpsert: "/workflows/definitions/upsert",
  DefinitionsDelete: "/workflows/definitions/delete",
  AssetsList: "/workflows/assets/list",
  AssetsGet: "/workflows/assets/get",
  AssetsUpsert: "/workflows/assets/upsert",
  AssetsDelete: "/workflows/assets/delete",
  AssetsUsage: "/workflows/assets/usage",
  ExecutionsList: "/workflows/executions/list",
  ExecutionsGet: "/workflows/executions/get",
  ExecutionsDelete: "/workflows/executions/delete",
  ExecutionsStreamNode: "/workflows/executions/stream-node",
} as const;

const ValidationAuthToken = "workflows-validation-token";

const ResponseHeader = {
  AllowOrigin: "Access-Control-Allow-Origin",
  AllowHeaders: "Access-Control-Allow-Headers",
  AllowMethods: "Access-Control-Allow-Methods",
  ContentType: "Content-Type",
} as const;

const WorkflowSelector = {
  Root: "workflows-editor-root",
  CanvasViewport: "workflows-canvas-viewport",
  CanvasZoomOut: "workflows-canvas-zoom-out",
  CanvasResetView: "workflows-canvas-reset-view",
  CanvasZoomIn: "workflows-canvas-zoom-in",
  ConnectionHint: "workflows-connection-hint",
  ConnectionPreview: "workflows-connection-preview",
  EdgeDeletePrefix: "workflows-edge-delete-",
  EdgeHitPrefix: "workflows-edge-hit-",
  WorkflowCreate: "workflows-create",
  WorkflowSave: "workflows-save",
  WorkflowEditHistoryOpen: "workflows-edit-history-open",
  WorkflowEditHistoryModal: "workflows-edit-history-modal",
  WorkflowEditHistoryUndo: "workflows-edit-history-undo",
  WorkflowEditHistoryRedo: "workflows-edit-history-redo",
  WorkflowEditHistoryClose: "workflows-edit-history-close",
  WorkflowNameInput: "workflows-name-input",
  WorkflowDescriptionInput: "workflows-description-input",
  NodeLabelInput: "workflows-node-label-input",
  NodePromptInput: "workflows-node-prompt-input",
  NodeReasoningSelect: "workflows-node-reasoning-select",
  NodeVerbositySelect: "workflows-node-verbosity-select",
  DeepEditorOpenPrefix: "workflows-deep-editor-open-",
  DeepEditorModal: "workflows-deep-editor-modal",
  DeepEditorClose: "workflows-deep-editor-close",
  DeepEditorPromptInput: "workflows-deep-editor-prompt-input",
  DeepEditorPromptHints: "workflows-deep-editor-prompt-hints",
  ExpressionHintPrefix: "workflows-expression-hint-",
  ExpressionHintCopyPrefix: "workflows-expression-hint-copy-",
  ExpressionHintInspectPrefix: "workflows-expression-hint-inspect-",
  DeepEditorRawJsonInput: "workflows-deep-editor-raw-json-input",
  DeepEditorApplyRawJson: "workflows-deep-editor-apply-raw-json",
  DeepEditorOutputTabVisual: "workflows-deep-editor-output-tab-visual",
  DeepEditorOutputTabJson: "workflows-deep-editor-output-tab-json",
  OutputEditorTextarea: "workflows-output-editor-textarea",
  DebugInputTabPrefix: "workflows-debug-input-tab-",
  DebugOutputTabPrefix: "workflows-debug-output-tab-",
  DebugInputSource: "workflows-debug-input-source",
  OutputPinControl: "workflows-output-pin-control",
  NodeModalPrevious: "workflows-node-modal-previous",
  NodeModalNext: "workflows-node-modal-next",
  DeepEditorTabOutput: "workflows-deep-editor-tab-output",
  VariableSearchInput: "workflows-variable-search-input",
  VariableTokenPrefix: "workflows-variable-token-",
  OutputContractAddField: "workflows-output-contract-add-field",
  OutputContractPropertyNamePrefix: "workflows-output-contract-property-name-",
  OutputContractPropertyTypePrefix: "workflows-output-contract-property-type-",
  OutputContractPropertyAddChildPrefix:
    "workflows-output-contract-property-add-child-",
  OutputContractPropertyFormatPrefix:
    "workflows-output-contract-property-format-",
  OutputContractPropertyMinPrefix: "workflows-output-contract-property-min-",
  OutputContractPropertyPatternPrefix:
    "workflows-output-contract-property-pattern-",
  OutputContractStatus: "workflows-output-contract-status",
  MappingTargetPathInput: "workflows-mapping-target-path-input",
  MappingSourcePathInput: "workflows-mapping-source-path-input",
  MappingAddEntry: "workflows-mapping-add-entry",
  GuardrailNewForNode: "workflows-guardrail-new-for-node",
  GuardrailAttachmentEditPrefix: "workflows-guardrail-attachment-edit-",
  GuardrailSeveritySelect: "workflows-guardrail-severity-select",
  GuardrailValidationKindSelect: "workflows-guardrail-validation-kind-select",
  GuardrailValidationTargetSelect:
    "workflows-guardrail-validation-target-select",
  GuardrailValidationPathInput: "workflows-guardrail-validation-path-input",
  GuardrailValidationValueInput: "workflows-guardrail-validation-value-input",
  GuardrailExpressionHints: "workflows-guardrail-expression-hints",
  GuardrailValidationVariablePrefix: "workflows-guardrail-variable-",
  GuardrailValidationMessageInput:
    "workflows-guardrail-validation-message-input",
  GuardrailAddValidation: "workflows-guardrail-add-validation",
  SectionHistory: "workflows-section-history",
  ExecutionSummary: "workflows-execution-summary",
  ExecutionSummaryLatestRun: "workflows-execution-summary-latest-run",
  ExecutionSummaryLatestStatus: "workflows-execution-summary-latest-status",
  ExecutionSummaryStatusDistribution:
    "workflows-execution-summary-status-distribution",
  ExecutionSummaryRuns: "workflows-execution-summary-runs",
  ExecutionSummaryCost: "workflows-execution-summary-cost",
  ExecutionSummaryTokens: "workflows-execution-summary-tokens",
  ExecutionSummaryWarnings: "workflows-execution-summary-warnings",
  ExecutionSummaryErrors: "workflows-execution-summary-errors",
  ExecutionSummaryAttention: "workflows-execution-summary-attention",
  ExecutionSummaryAttentionRuns: "workflows-execution-summary-attention-runs",
  ExecutionSummaryAttentionFailedRuns:
    "workflows-execution-summary-attention-failed-runs",
  ExecutionSummaryAttentionAlertedRuns:
    "workflows-execution-summary-attention-alerted-runs",
  ExecutionFilterAll: "workflows-execution-filter-all",
  ExecutionFilterFailed: "workflows-execution-filter-failed",
  ExecutionFilterAttention: "workflows-execution-filter-attention",
  ExecutionAttentionRunPrefix: "workflows-execution-attention-run-",
  ExecutionCardPrefix: "workflows-execution-card-",
  ExecutionDeletePrefix: "workflows-execution-delete-",
  InspectorPanel: "workflows-inspector-panel",
  ExecutionInspector: "workflows-execution-inspector",
  ExecutionNodeRunPrefix: "workflows-execution-node-run-",
  WorkflowVersionDetailsModal: "workflows-version-details-modal",
  WorkflowVersionDetailsDiff: "workflows-version-details-diff",
  WorkflowVersionDetailsSnapshot: "workflows-version-details-snapshot",
  WorkflowVersionVisualDiff: "workflows-version-visual-diff",
  WorkflowVersionDiffSearch: "workflows-version-diff-search",
  WorkflowVersionActionDialog: "workflows-version-action-dialog",
  WorkflowVersionActionDialogInput: "workflows-version-action-dialog-input",
  WorkflowVersionActionDialogConfirm: "workflows-version-action-dialog-confirm",
  WorkflowVersionDetailsPrefix: "workflows-version-details-",
  WorkflowVersionRestorePrefix: "workflows-version-restore-",
  WorkflowVersionClonePrefix: "workflows-version-clone-",
  WorkflowVersionDownloadPrefix: "workflows-version-download-",
  WorkflowVersionTimelineDownload: "workflows-version-timeline-download",
  WorkflowVersionSearch: "workflows-version-search",
  WorkflowVersionImportText: "workflows-version-import-text",
  WorkflowVersionImportPreview: "workflows-version-import-preview",
  WorkflowVersionImportPreviewMessage:
    "workflows-version-import-preview-message",
  WorkflowVersionImportVersionSelect: "workflows-version-import-version-select",
  WorkflowVersionImportVersionOptionPrefix:
    "workflows-version-import-version-option-",
  WorkflowVersionImportVersionSummary:
    "workflows-version-import-version-summary",
  WorkflowVersionImport: "workflows-version-import",
  WorkflowVersionCleanup: "workflows-version-cleanup",
  WorkflowVersionRetentionKeepLatest: "workflows-version-retention-keep-latest",
  WorkflowVersionCopyToEditor: "workflows-version-copy-to-editor",
  WorkflowVersionRestoreMetadata: "workflows-version-restore-metadata",
  WorkflowVersionRestorePinned: "workflows-version-restore-pinned",
  WorkflowVersionCompareSelect: "workflows-version-compare-select",
  SectionNodes: "workflows-section-nodes",
  SectionAssets: "workflows-section-assets",
  AssetCreatePrefix: "workflows-asset-create-",
  AssetCardPrefix: "workflows-asset-card-",
  CompactCanvas: "workflows-compact-canvas",
  NodeCardPrefix: "workflows-node-card-",
  NodePalettePrefix: "workflows-node-palette-",
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
  TerminalResponse: "terminal.response",
} as const;

type WorkflowNodeKind =
  (typeof WorkflowNodeKind)[keyof typeof WorkflowNodeKind];

type StubWorkflowAssetRecord = {
  id: string;
  kind: "prompt" | "instruction" | "guardrail";
  scope: "workspace";
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
    prompt?: string;
    provider?: Record<string, unknown>;
    reviewPolicy?: {
      requireHumanDecision: boolean;
    };
    pinnedTestOutput?: Record<string, unknown>;
  };
  inputPorts: ReadonlyArray<{ id: string; name: string; acceptsMany: boolean }>;
  outputPorts: ReadonlyArray<{
    id: string;
    name: string;
    acceptsMany: boolean;
  }>;
  attachedGuardrails: ReadonlyArray<{
    assetId: string;
    order: number;
    enabled: boolean;
  }>;
  outputContract?: Record<string, unknown>;
};

type StubWorkflowDefinitionRecord = {
  id: string;
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

type StubWorkflowDefinitionVersionRecord = {
  id: string;
  workflowId: string;
  version: number;
  createdAt: string;
  snapshot: StubWorkflowDefinitionRecord;
  checksum?: string;
  note?: string;
  tags?: ReadonlyArray<string>;
  changeType?: string;
  changeSummary?: string;
};

type StubExecutionRecord = {
  id: string;
  workflowId: string;
  triggerKind: "manual";
  status: "running" | "completed" | "failed" | "awaiting_review" | "canceled";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
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
  nodeRuns: ReadonlyArray<{
    id: string;
    nodeId: string;
    nodeKind: WorkflowNodeKind;
    status: "running" | "completed" | "failed" | "skipped" | "awaiting_review";
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    providerId?: string;
    modelId?: string;
    outputSnapshot?: unknown;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostEur: number;
      latencyMs: number;
    };
    alerts: ReadonlyArray<{
      id: string;
      level: "info" | "success" | "warn" | "error";
      source: "system" | "guardrail" | "provider" | "checkpoint";
      message: string;
      createdAt: string;
    }>;
    guardrailFindings: ReadonlyArray<{
      guardrailAssetId: string;
      nodeId: string;
      severity: "warn" | "error" | "success";
      message: string;
    }>;
  }>;
};

type StubAssetUsageRecord = {
  assetId: string;
  workflowId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  role: "primary" | "instruction" | "guardrail";
  createdAt: string;
};

type StubServerState = {
  settings: Record<string, unknown>;
  definitions: StubWorkflowDefinitionRecord[];
  definitionVersions: StubWorkflowDefinitionVersionRecord[];
  assets: StubWorkflowAssetRecord[];
  executions: StubExecutionRecord[];
  nextWorkflowId: number;
  nextAssetId: number;
  versionExportCount: number;
  versionTimelineExportCount: number;
};

const ValidationText = {
  ScreenTitle: "Workflows",
  WorkflowName: "Daily updates workflow",
  WorkflowDescription: "Server-backed workflow for the integrated editor.",
  PromptNodeLabel: "Primary prompt",
  ProviderNodeLabel: "Codex run",
  ProviderPrompt:
    "Summarize the connected context and return a concise answer.",
  ProviderPromptWithVariable:
    "Summarize the connected context and return a concise answer.{{var|workflow_context||$.workflow.name}}",
  OutputContractField: "summary",
  OutputContractNestedField: "meta",
  OutputContractNestedEmailField: "email",
  OutputContractArrayField: "tags",
  MappingTargetPath: "$.promptSummary",
  MappingSourcePath: "$.result",
  AccumulatedOutputsSourcePath: "accumulated:$",
  AccumulatedOutputsSourceLabel: "All previous outputs",
  GuardrailValidationPath: "$.summary",
  GuardrailValidationMessage: "Summary must be present before continuing.",
  ExecutionCleanId: "execution-clean",
  ExecutionPinnedId: "execution-pinned",
  ExecutionPinnedResponseRunId: "node-run-response-pinned",
  ExecutionPrimaryId: "execution-completed",
  ExecutionSecondaryId: "execution-failed",
  ExecutionCleanSessionId: "ctx-clean",
  ExecutionPrimarySessionId: "ctx-completed",
  ExecutionSecondarySessionId: "ctx-failed",
  ExecutionPrimaryAlert: "Summary guardrail returned a warning.",
  ExecutionPrimaryFinding: "Summary present.",
  ExecutionSecondaryAlert: "Provider request failed after guardrail pass.",
  ExecutionSecondaryFinding: "Missing result blocks completion.",
  ExecutionSecondaryNodeLabel: "Codex run",
  ExecutionPrimaryStartedAt: "2026-05-06T08:16:00.000Z",
  ExecutionSecondaryStartedAt: "2026-05-06T08:20:00.000Z",
  ExecutionCleanStartedAt: "2026-05-06T08:12:00.000Z",
  WorkflowCreatedNotice: "Workflow definition created.",
  WorkflowSavedNotice: "Workflow saved to the server workspace.",
  ExecutionDeletedNotice: "Execution deleted.",
  ConnectionAddedNotice: "Connection added.",
  ConnectionHintTitle: "Connect nodes",
  ConnectionModeTitle: "Connection mode",
  EditedPinnedOutput:
    '{\n  "source": "manual-edit",\n  "value": "browser-pinned-output"\n}',
  EditedPinnedOutputNeedle: "browser-pinned-output",
  HistoryPinnedOutputNeedle: "history-pinned-output",
  StepOutputNeedle: "step-executed-output",
  TriggerExecutedAtToken: "$.executedAt",
  LastOutputToken: "{{var|last_node_output||$}}",
  CurrentInputToken: "{{var|current_input||$}}",
  AccumulatedOutputsToken: "{{var|accumulated_outputs||$}}",
  GuardrailLastOutputToken: "{{var|last_node_output||$.result}}",
  LegacyProviderError: "Workflow 06.6 supports codex-cli profiles only.",
} as const;

const runtimeOptions = parseBrowserValidationRuntimeOptions(
  process.argv.slice(2),
);
const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDirectory = join(appRoot, "screenshots");
const buildOutputPath = join(appRoot, "dist", "index.js");

await validateWorkflowsScreen();

async function validateWorkflowsScreen(): Promise<void> {
  await assertBrowserValidationBuildOutput(buildOutputPath);
  await prepareBrowserValidationDirectory({
    directory: screenshotDirectory,
    preserveScreenshots: runtimeOptions.preserveScreenshots,
  });

  const previewServer = startPreviewServer(appRoot);
  const stubServer = await startWorkflowStubServer();
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

    const page = await browser.newPage();
    await page.setViewport({
      width: ValidationConfig.ViewportWidth,
      height: ValidationConfig.ViewportHeight,
    });
    await seedBrowserStorage(page);
    await page.goto(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.WorkflowsRoute}`,
      {
        waitUntil: "networkidle0",
      },
    );

    await waitForTestId(page, WorkflowSelector.Root);
    await waitForPageTexts(page, [ValidationText.ScreenTitle]);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-initial",
      artifactName: "workflows",
    });

    page.on("dialog", (dialog) => {
      throw new Error(`Unexpected native dialog: ${dialog.message()}`);
    });

    await clickByTestId(page, WorkflowSelector.WorkflowCreate);
    await waitForPageText(page, ValidationText.WorkflowCreatedNotice);
    await waitForTestId(page, WorkflowSelector.CanvasZoomOut);
    await waitForTestId(page, WorkflowSelector.CanvasResetView);
    await waitForTestId(page, WorkflowSelector.CanvasZoomIn);
    await waitForNodeCardCount(page, 2);

    const responseCardTestId = await readNodeCardTestIdByText(page, "Response");
    await doubleClickByTestId(page, responseCardTestId);
    await waitForTestId(page, WorkflowSelector.InspectorPanel);
    await waitForUrlSearchParam(page, "modal", "node-editor");
    await waitForUrlSearchParamExists(page, "node");
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.InspectorPanel);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-node-editor-reload",
      artifactName: "workflows",
    });
    await waitForPageText(
      page,
      "Execute this step to inspect the current node output.",
    );
    await waitForMissingPageText(page, ValidationText.LegacyProviderError);
    await clickByTestId(page, `${WorkflowSelector.DebugInputTabPrefix}schema`);
    await waitForUrlSearchParam(page, "inputTab", "schema");
    await clickByTestId(page, `${WorkflowSelector.DebugOutputTabPrefix}table`);
    await waitForUrlSearchParam(page, "outputTab", "table");
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.InspectorPanel);
    await waitForUrlSearchParam(page, "inputTab", "schema");
    await waitForUrlSearchParam(page, "outputTab", "table");
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-debug-tabs-reload",
      artifactName: "workflows",
    });
    await clickButtonByTitle(page, "Edit output for test runs");
    await waitForUrlSearchParam(page, "editor", "output-editor");
    await waitForTestId(page, WorkflowSelector.OutputEditorTextarea);
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.OutputEditorTextarea);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-output-editor-reload",
      artifactName: "workflows",
    });
    await waitForTextAreaValue(page, WorkflowSelector.OutputEditorTextarea, "");
    await setTextAreaValueByTestId(
      page,
      WorkflowSelector.OutputEditorTextarea,
      ValidationText.EditedPinnedOutput,
    );
    await clickButtonByText(page, "Save");
    if (
      await readTestIdExists(page, WorkflowSelector.WorkflowVersionActionDialog)
    ) {
      await clickByTestId(
        page,
        WorkflowSelector.WorkflowVersionActionDialogConfirm,
      );
    }
    await waitForMissingTestId(page, WorkflowSelector.OutputEditorTextarea);
    await waitForPinnedDefinitionOutput(
      stubServer.state,
      ValidationText.EditedPinnedOutputNeedle,
    );
    await waitForPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await clickButtonByTitle(page, "Close editor");
    await waitForMissingTestId(page, WorkflowSelector.InspectorPanel);
    await clickByTestId(page, WorkflowSelector.WorkflowEditHistoryOpen);
    await waitForTestId(page, WorkflowSelector.WorkflowEditHistoryModal);
    await waitForUrlSearchParam(page, "modal", "edit-history");
    await waitForPageText(page, "Current draft");
    await clickByTestId(page, WorkflowSelector.WorkflowEditHistoryUndo);
    await waitForPageText(page, "redo checkpoint");
    await clickByTestId(page, WorkflowSelector.WorkflowEditHistoryRedo);
    await waitForMissingPageText(page, "redo checkpoint");
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.WorkflowEditHistoryModal);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-edit-history-reload",
      artifactName: "workflows",
    });
    await clickByTestId(page, WorkflowSelector.WorkflowEditHistoryClose);
    await waitForMissingTestId(page, WorkflowSelector.WorkflowEditHistoryModal);

    await clickByTestId(page, WorkflowSelector.SectionAssets);
    await waitForUrlSearchParam(page, "panel", "assets");
    await waitForTestId(page, `${WorkflowSelector.AssetCreatePrefix}prompt`);
    await clickByTestId(page, `${WorkflowSelector.AssetCreatePrefix}prompt`);
    await waitForCondition(
      () => Promise.resolve(stubServer.state.assets.length > 0),
      "prompt asset created",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    const promptAsset = stubServer.state.assets[0];
    if (!promptAsset) {
      throw new Error("Expected prompt asset after creating it.");
    }
    await clickByTestId(
      page,
      `${WorkflowSelector.AssetCardPrefix}${promptAsset.id}`,
    );
    await waitForTestId(page, WorkflowSelector.InspectorPanel);
    await waitForUrlSearchParam(page, "modal", "asset-editor");
    await waitForUrlSearchParam(page, "asset", promptAsset.id);
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.InspectorPanel);
    await waitForUrlSearchParam(page, "modal", "asset-editor");
    await waitForUrlSearchParam(page, "asset", promptAsset.id);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-asset-editor-reload",
      artifactName: "workflows",
    });
    await clickButtonByTitle(page, "Close editor");
    await waitForMissingTestId(page, WorkflowSelector.InspectorPanel);

    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForNodeCardCount(page, 2);
    const reloadedResponseCardTestId = await readNodeCardTestIdByText(
      page,
      "Response",
    );
    await waitForNodeCardText(page, "push_pin");
    await doubleClickByTestId(page, reloadedResponseCardTestId);
    await waitForTestId(page, WorkflowSelector.InspectorPanel);
    await waitForPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await waitForMissingPageText(page, ValidationText.LegacyProviderError);
    await clickButtonByTitle(page, "Close editor");
    await waitForMissingTestId(page, WorkflowSelector.InspectorPanel);

    const savedDefinition = stubServer.state.definitions[0];
    if (!savedDefinition) {
      throw new Error("Expected saved workflow definition before history QA.");
    }
    const savedVersion = stubServer.state.definitionVersions.find(
      (version) => version.workflowId === savedDefinition.id,
    );
    if (!savedVersion) {
      throw new Error(
        "Expected workflow definition version before history QA.",
      );
    }
    await clickByTestId(page, WorkflowSelector.WorkflowEditHistoryOpen);
    await waitForTestId(page, WorkflowSelector.WorkflowEditHistoryModal);
    await waitForTestId(page, WorkflowSelector.WorkflowEditHistoryUndo);
    await waitForTestId(page, WorkflowSelector.WorkflowEditHistoryRedo);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-edit-history",
      artifactName: "workflows",
    });
    await waitForTestId(
      page,
      `${WorkflowSelector.WorkflowVersionDetailsPrefix}${savedVersion.id}`,
    );
    await waitForTestId(
      page,
      `${WorkflowSelector.WorkflowVersionRestorePrefix}${savedVersion.id}`,
    );
    await waitForTestId(
      page,
      `${WorkflowSelector.WorkflowVersionClonePrefix}${savedVersion.id}`,
    );
    await waitForTestId(
      page,
      `${WorkflowSelector.WorkflowVersionDownloadPrefix}${savedVersion.id}`,
    );
    await setInputValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionSearch,
      savedVersion.snapshot.name,
    );
    await waitForTestId(
      page,
      `${WorkflowSelector.WorkflowVersionDetailsPrefix}${savedVersion.id}`,
    );
    await clickByTestId(
      page,
      `${WorkflowSelector.WorkflowVersionDetailsPrefix}${savedVersion.id}`,
    );
    await waitForTestId(page, WorkflowSelector.WorkflowVersionDetailsModal);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionDetailsDiff);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionDetailsSnapshot);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionVisualDiff);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionDiffSearch);
    await setInputValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionDiffSearch,
      "nodes",
    );
    await waitForUrlSearchParam(page, "diff", "nodes");
    await waitForPageText(page, "nodes");
    await waitForTestId(page, WorkflowSelector.WorkflowVersionCompareSelect);
    await selectValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionCompareSelect,
      "draft",
    );
    await waitForUrlSearchParam(page, "compare", "draft");
    await page.reload({ waitUntil: "networkidle0" });
    await waitForTestId(page, WorkflowSelector.WorkflowVersionDetailsModal);
    await waitForUrlSearchParam(page, "diff", "nodes");
    await waitForUrlSearchParam(page, "compare", "draft");
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-version-details-url-compare",
      artifactName: "workflows",
    });
    await waitForTestId(page, WorkflowSelector.WorkflowVersionCopyToEditor);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionRestoreMetadata);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionRestorePinned);
    await clickByTestId(page, WorkflowSelector.WorkflowVersionCopyToEditor);
    await waitForMissingTestId(
      page,
      WorkflowSelector.WorkflowVersionDetailsModal,
    );
    await clickByTestId(
      page,
      `${WorkflowSelector.WorkflowVersionRestorePrefix}${savedVersion.id}`,
    );
    await waitForTestId(page, WorkflowSelector.WorkflowVersionActionDialog);
    await clickByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogConfirm,
    );
    await waitForPageText(page, "Workflow restored to version");
    await clickByTestId(
      page,
      `${WorkflowSelector.WorkflowVersionClonePrefix}${savedVersion.id}`,
    );
    await waitForTestId(page, WorkflowSelector.WorkflowVersionActionDialog);
    await waitForUrlSearchParam(page, "action", "clone");
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.WorkflowEditHistoryModal);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionActionDialog);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-version-action-reload",
      artifactName: "workflows",
    });
    await setInputValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogInput,
      "Browser cloned workflow",
    );
    await clickByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogConfirm,
    );
    await waitForMissingTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialog,
    );
    await waitForCondition(
      () =>
        Promise.resolve(
          stubServer.state.definitions.some(
            (definition) => definition.name === "Browser cloned workflow",
          ),
        ),
      "Expected cloned workflow with edited name.",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    const exportCountBeforeDownload = stubServer.state.versionExportCount;
    await clickByTestId(
      page,
      `${WorkflowSelector.WorkflowVersionDownloadPrefix}${savedVersion.id}`,
    );
    await waitForCondition(
      () =>
        Promise.resolve(
          stubServer.state.versionExportCount > exportCountBeforeDownload,
        ),
      "Expected version export request after download action.",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    const timelineExportCountBeforeDownload =
      stubServer.state.versionTimelineExportCount;
    await clickByTestId(page, WorkflowSelector.WorkflowVersionTimelineDownload);
    await waitForCondition(
      () =>
        Promise.resolve(
          stubServer.state.versionTimelineExportCount >
            timelineExportCountBeforeDownload,
        ),
      "Expected version timeline export request after timeline download action.",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    await setInputValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionRetentionKeepLatest,
      "1",
    );
    await clickByTestId(page, WorkflowSelector.WorkflowVersionCleanup);
    await waitForCondition(
      () =>
        Promise.resolve(
          stubServer.state.definitionVersions.filter(
            (version) => version.workflowId === savedVersion.workflowId,
          ).length <= 1,
        ),
      "Expected workflow version retention cleanup to keep one version.",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    await setTextAreaValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionImportText,
      JSON.stringify({
        schemaVersion: 1,
        workflowId: savedVersion.workflowId,
        versionId: savedVersion.id,
        version: savedVersion.version,
        createdAt: savedVersion.createdAt,
        checksum: savedVersion.checksum ?? "0".repeat(64),
        snapshot: savedVersion.snapshot,
        tags: [],
      }),
    );
    await clickByTestId(page, WorkflowSelector.WorkflowVersionImport);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionActionDialog);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionImportPreview);
    await waitForTestId(
      page,
      WorkflowSelector.WorkflowVersionImportPreviewMessage,
    );
    await setInputValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogInput,
      "Browser imported workflow",
    );
    await clickByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogConfirm,
    );
    await waitForCondition(
      () =>
        Promise.resolve(
          stubServer.state.definitions.some(
            (definition) => definition.name === "Browser imported workflow",
          ),
        ),
      "Expected imported workflow with edited name.",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    const timelineImportPayload = createTimelineImportPayload(savedVersion);
    await setTextAreaValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionImportText,
      JSON.stringify(timelineImportPayload),
    );
    await clickByTestId(page, WorkflowSelector.WorkflowVersionImport);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionActionDialog);
    await waitForTestId(
      page,
      WorkflowSelector.WorkflowVersionImportVersionSelect,
    );
    await waitForTestId(
      page,
      WorkflowSelector.WorkflowVersionImportVersionSummary,
    );
    await waitForTestId(
      page,
      `${WorkflowSelector.WorkflowVersionImportVersionOptionPrefix}timeline-import-v1`,
    );
    await selectValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionImportVersionSelect,
      "timeline-import-v1",
    );
    await waitForPageText(page, "Timeline selected v1");
    await waitForInputToContain(
      page,
      WorkflowSelector.WorkflowVersionActionDialogInput,
      "Timeline selected v1",
    );
    await setInputValueByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogInput,
      "Browser timeline imported workflow",
    );
    await clickByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogConfirm,
    );
    await waitForCondition(
      () =>
        Promise.resolve(
          stubServer.state.definitions.some(
            (definition) =>
              definition.name === "Browser timeline imported workflow" &&
              definition.description === "timeline-v1-description",
          ),
        ),
      "Expected selected timeline version import to create a workflow.",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    await clickByTestId(page, WorkflowSelector.WorkflowEditHistoryClose);
    await waitForMissingTestId(page, WorkflowSelector.WorkflowEditHistoryModal);
    const definitionWithAgent = addConnectedAgentNode(savedDefinition);
    const triggerNode = definitionWithAgent.nodes.find(
      (node) => node.kind === WorkflowNodeKind.TriggerManual,
    );
    if (!triggerNode) {
      throw new Error("Expected trigger node for executedAt variable QA.");
    }
    stubServer.state.definitions = [definitionWithAgent];

    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForNodeCardCount(page, 3);
    const agentCardTestId = await readNodeCardTestIdByText(page, "Agent step");
    await doubleClickByTestId(page, agentCardTestId);
    await waitForPageText(page, "Agent configuration");
    await waitForSelectOptionLabel(
      page,
      WorkflowSelector.MappingSourcePathInput,
      ValidationText.AccumulatedOutputsSourceLabel,
    );
    await selectValueByTestId(
      page,
      WorkflowSelector.MappingSourcePathInput,
      ValidationText.AccumulatedOutputsSourcePath,
    );
    await clickByTestId(page, WorkflowSelector.MappingAddEntry);
    await waitForPageText(
      page,
      `${ValidationText.AccumulatedOutputsSourceLabel} · $`,
    );
    await clickByTestId(page, `${WorkflowSelector.DeepEditorOpenPrefix}prompt`);
    await waitForTestId(page, WorkflowSelector.DeepEditorModal);
    await waitForUrlSearchParam(page, "editor", "deep-editor");
    await clickByTestId(page, WorkflowSelector.DeepEditorTabOutput);
    await waitForUrlSearchParam(page, "deepTab", "output");
    await waitForTestId(page, WorkflowSelector.DeepEditorOutputTabJson);
    await clickByTestId(page, WorkflowSelector.DeepEditorOutputTabJson);
    await waitForUrlSearchParam(page, "deepOutputTab", "json");
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.DeepEditorModal);
    await waitForTestId(page, WorkflowSelector.DeepEditorRawJsonInput);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-deep-editor-reload",
      artifactName: "workflows",
    });
    await clickByTestId(page, WorkflowSelector.DeepEditorTabOutput);
    await clickByTestId(page, WorkflowSelector.DeepEditorOutputTabVisual);
    await clickByTestId(page, WorkflowSelector.DeepEditorClose);
    await waitForMissingTestId(page, WorkflowSelector.DeepEditorModal);
    await clickByTestId(page, `${WorkflowSelector.DeepEditorOpenPrefix}prompt`);
    await waitForTestId(page, WorkflowSelector.DeepEditorModal);
    await setInputValueByTestId(
      page,
      WorkflowSelector.VariableSearchInput,
      "executedAt",
    );
    await waitForExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}node-${triggerNode.id}-${ValidationText.TriggerExecutedAtToken}`,
    );
    await clickByExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}node-${triggerNode.id}-${ValidationText.TriggerExecutedAtToken}`,
    );
    await waitForTextAreaToContain(
      page,
      WorkflowSelector.DeepEditorPromptInput,
      `{{var|node_output|${triggerNode.id}|${ValidationText.TriggerExecutedAtToken}}}`,
    );
    await waitForTestId(page, WorkflowSelector.DeepEditorPromptHints);
    const triggerExpressionHintId = `node_output:${triggerNode.id}:${ValidationText.TriggerExecutedAtToken}`;
    await waitForExactTestId(
      page,
      `${WorkflowSelector.ExpressionHintPrefix}${triggerExpressionHintId}`,
    );
    await waitForPageText(page, "Previous node output · Manual trigger");
    await waitForPageText(page, ValidationText.TriggerExecutedAtToken);
    await waitForPageText(page, "No preview data");
    await waitForExactTestId(
      page,
      `${WorkflowSelector.ExpressionHintInspectPrefix}${triggerExpressionHintId}`,
    );
    await waitForExactTestId(
      page,
      `${WorkflowSelector.ExpressionHintCopyPrefix}${triggerExpressionHintId}`,
    );
    await setInputValueByTestId(
      page,
      WorkflowSelector.VariableSearchInput,
      "current input",
    );
    await waitForExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}input-edge-trigger-agent-executed-at-$`,
    );
    await clickByExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}input-edge-trigger-agent-executed-at-$`,
    );
    await waitForTextAreaToContain(
      page,
      WorkflowSelector.DeepEditorPromptInput,
      ValidationText.CurrentInputToken,
    );
    await setInputValueByTestId(
      page,
      WorkflowSelector.VariableSearchInput,
      "last upstream",
    );
    await waitForExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}last-output-root`,
    );
    await clickByExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}last-output-root`,
    );
    await waitForTextAreaToContain(
      page,
      WorkflowSelector.DeepEditorPromptInput,
      ValidationText.LastOutputToken,
    );
    await setInputValueByTestId(
      page,
      WorkflowSelector.VariableSearchInput,
      "accumulated",
    );
    await waitForExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}accumulated-outputs-root`,
    );
    await clickByExactTestId(
      page,
      `${WorkflowSelector.VariableTokenPrefix}accumulated-outputs-root`,
    );
    await waitForTextAreaToContain(
      page,
      WorkflowSelector.DeepEditorPromptInput,
      ValidationText.AccumulatedOutputsToken,
    );
    await clickByTestId(page, WorkflowSelector.DeepEditorClose);
    await waitForMissingTestId(page, WorkflowSelector.DeepEditorModal);
    await clickByTestId(page, WorkflowSelector.GuardrailNewForNode);
    await waitForCondition(
      () =>
        Promise.resolve(
          stubServer.state.assets.some((asset) => asset.kind === "guardrail"),
        ),
      "guardrail asset created",
      {
        timeoutMs: ValidationConfig.UiPollingTimeoutMs,
        intervalMs: ValidationConfig.UiPollingIntervalMs,
      },
    );
    const guardrailAsset = stubServer.state.assets.find(
      (asset) => asset.kind === "guardrail",
    );
    if (!guardrailAsset) {
      throw new Error("Expected guardrail asset after creating it.");
    }
    await clickByTestId(
      page,
      `${WorkflowSelector.GuardrailAttachmentEditPrefix}${guardrailAsset.id}`,
    );
    await waitForTestId(page, WorkflowSelector.GuardrailValidationValueInput);
    await clickByTestId(
      page,
      `${WorkflowSelector.GuardrailValidationVariablePrefix}last-output-result`,
    );
    await waitForInputToContain(
      page,
      WorkflowSelector.GuardrailValidationValueInput,
      ValidationText.GuardrailLastOutputToken,
    );
    await waitForTestId(page, WorkflowSelector.GuardrailExpressionHints);
    await waitForExactTestId(
      page,
      `${WorkflowSelector.ExpressionHintPrefix}last_node_output::$.result`,
    );
    await waitForPageText(page, "Last upstream output");
    await waitForPageText(page, "$.result");
    await clickButtonByTitle(page, "Close editor");
    await waitForMissingTestId(page, WorkflowSelector.InspectorPanel);

    const connectedHistoryDefinition =
      ensureHistoryNavigationEdge(savedDefinition);
    stubServer.state.definitions = [connectedHistoryDefinition];
    stubServer.state.executions = [
      createPinnedOutputExecutionFixture(connectedHistoryDefinition),
    ];

    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForNodeCardCount(page, 2);
    await clickByTestId(page, WorkflowSelector.SectionHistory);
    await waitForExecutionCardCount(page, 1);
    await mouseClickByTestId(
      page,
      `${WorkflowSelector.ExecutionCardPrefix}${ValidationText.ExecutionPinnedId}`,
    );
    await waitForExecutionCardSelected(
      page,
      `${WorkflowSelector.ExecutionCardPrefix}${ValidationText.ExecutionPinnedId}`,
    );
    await waitForUrlSearchParam(page, "panel", "history");
    await waitForUrlSearchParam(
      page,
      "execution",
      ValidationText.ExecutionPinnedId,
    );
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForExecutionCardSelected(
      page,
      `${WorkflowSelector.ExecutionCardPrefix}${ValidationText.ExecutionPinnedId}`,
    );
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-execution-reload",
      artifactName: "workflows",
    });
    await waitForPageText(page, "Autosave");
    const selectedHistoryResponseCardTestId = await readNodeCardTestIdByText(
      page,
      "Response",
    );
    await mouseClickByTestId(page, selectedHistoryResponseCardTestId);
    await waitForUrlSearchParam(page, "modal", "node-editor");
    await waitForUrlSearchParam(
      page,
      "execution",
      ValidationText.ExecutionPinnedId,
    );
    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForTestId(page, WorkflowSelector.InspectorPanel);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-url-history-node-reload",
      artifactName: "workflows",
    });
    await waitForPageText(page, ValidationText.HistoryPinnedOutputNeedle);
    await clickByTestId(page, WorkflowSelector.NodeModalPrevious);
    await waitForPageText(page, "2026-05-06T08:30:00.000Z");
    await waitForMissingPageText(
      page,
      ValidationText.HistoryPinnedOutputNeedle,
    );
    await waitForMissingPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await clickByTestId(page, WorkflowSelector.NodeModalNext);
    await waitForPageText(page, ValidationText.HistoryPinnedOutputNeedle);
    await waitForMissingPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await clickByTestId(page, WorkflowSelector.OutputPinControl);
    await waitForTestId(page, WorkflowSelector.WorkflowVersionActionDialog);
    await clickByTestId(
      page,
      WorkflowSelector.WorkflowVersionActionDialogConfirm,
    );
    await waitForPinnedDefinitionOutput(
      stubServer.state,
      ValidationText.HistoryPinnedOutputNeedle,
    );
    await waitForMissingPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await clickButtonByTitle(page, "Close editor");

    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForNodeCardCount(page, 2);
    const historyPinnedResponseCardTestId = await readNodeCardTestIdByText(
      page,
      "Response",
    );
    await doubleClickByTestId(page, historyPinnedResponseCardTestId);
    await waitForPageText(page, ValidationText.HistoryPinnedOutputNeedle);
    await waitForMissingPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await waitForMissingPageText(page, ValidationText.LegacyProviderError);
    await clickButtonByText(page, "Execute step");
    await waitForPageText(page, "Executing");
    await waitForPageText(page, ValidationText.StepOutputNeedle);
    await waitForExecutionWithOutput(
      stubServer.state,
      ValidationText.StepOutputNeedle,
    );
    await waitForMissingPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await waitForMissingPageText(page, ValidationText.WorkflowSavedNotice);
    await clickButtonByTitle(page, "Close editor");
    await waitForMissingTestId(page, WorkflowSelector.InspectorPanel);

    await page.reload({
      waitUntil: "networkidle0",
    });
    await waitForNodeCardCount(page, 2);
    const postStepResponseCardTestId = await readNodeCardTestIdByText(
      page,
      "Response",
    );
    await doubleClickByTestId(page, postStepResponseCardTestId);
    await waitForPageText(page, ValidationText.HistoryPinnedOutputNeedle);
    await waitForMissingPageText(page, ValidationText.StepOutputNeedle);
    await waitForMissingPageText(page, ValidationText.EditedPinnedOutputNeedle);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-pinned-output",
      artifactName: "workflows",
    });
    await clickButtonByTitle(page, "Close editor");
    await waitForMissingTestId(page, WorkflowSelector.InspectorPanel);

    await page.setViewport({
      width: ValidationConfig.MobileViewportWidth,
      height: ValidationConfig.MobileViewportHeight,
    });
    await page.goto(
      `${ValidationConfig.PreviewBaseUrl}${ValidationConfig.WorkflowsRoute}`,
      {
        waitUntil: "networkidle0",
      },
    );
    await waitForTestId(page, WorkflowSelector.CompactCanvas);
    await captureBrowserValidationScreenshot({
      page,
      directory: screenshotDirectory,
      suffix: "workflows-mobile",
      artifactName: "workflows",
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
    definitionVersions: [],
    assets: [],
    executions: [],
    nextWorkflowId: 1,
    nextAssetId: 1,
    versionExportCount: 0,
    versionTimelineExportCount: 0,
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

  if (!isAuthorized(request)) {
    writeJson(response, 401, {
      message: "Unauthorized",
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.ExecutionsStreamNode) {
    await handleStreamNodeRequest(requestUrl, response, state);
    return;
  }

  if (request.method !== "POST") {
    writeJson(response, 405, {
      message: "Method not allowed",
    });
    return;
  }

  const body = await readJsonBody(request);

  if (requestUrl.pathname === RequestPath.SettingsGet) {
    writeJson(response, 200, {
      settings: state.settings,
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.SettingsUpdate) {
    if (isRecord(body)) {
      state.settings = body;
    }
    writeJson(response, 200, {
      settings: state.settings,
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsList) {
    writeJson(response, 200, {
      definitions: state.definitions,
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsGet) {
    const workflowId = readRequiredString(body, "workflowId");
    const definition = state.definitions.find(
      (entry) => entry.id === workflowId,
    );
    if (!definition) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    writeJson(response, 200, { definition });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsVersions) {
    const workflowId = readRequiredString(body, "workflowId");
    writeJson(response, 200, {
      versions: state.definitionVersions
        .filter((entry) => entry.workflowId === workflowId)
        .sort((left, right) => right.version - left.version),
    });
    return;
  }

  if (handleDefinitionVersionRequest({ requestUrl, response, state, body })) {
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsUpsert) {
    const definitionInput = readRequiredRecord(body, "definition");
    const now = "2026-05-06T08:15:00.000Z";
    const existingId = readOptionalString(definitionInput, "id");
    const existingIndex = existingId
      ? state.definitions.findIndex((entry) => entry.id === existingId)
      : -1;
    const nextDefinition = createDefinitionRecord({
      definitionInput,
      ...(existingIndex >= 0 && state.definitions[existingIndex]
        ? { existing: state.definitions[existingIndex] }
        : {}),
      workflowId:
        existingIndex >= 0
          ? (state.definitions[existingIndex]?.id ??
            `workflow-${state.nextWorkflowId}`)
          : `workflow-${state.nextWorkflowId}`,
      updatedAt: now,
    });
    if (existingIndex >= 0) {
      state.definitions[existingIndex] = nextDefinition;
    } else {
      state.nextWorkflowId += 1;
      state.definitions.push(nextDefinition);
    }
    state.definitionVersions.push(
      createDefinitionVersionRecord({
        definition: nextDefinition,
        version: state.definitionVersions.length + 1,
      }),
    );
    state.executions = [
      ...state.executions.filter(
        (execution) => execution.workflowId !== nextDefinition.id,
      ),
      ...createExecutionFixtures(nextDefinition),
    ];
    writeJson(response, 200, {
      definition: nextDefinition,
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsDelete) {
    const workflowId = readRequiredString(body, "workflowId");
    const existingIndex = state.definitions.findIndex(
      (entry) => entry.id === workflowId,
    );
    if (existingIndex < 0) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    const [definition] = state.definitions.splice(existingIndex, 1);
    writeJson(response, 200, { definition });
    return;
  }

  if (requestUrl.pathname === RequestPath.AssetsList) {
    writeJson(response, 200, {
      assets: state.assets,
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
    const assetInput = readRequiredRecord(body, "asset");
    const now = "2026-05-06T08:15:30.000Z";
    const existingId = readOptionalString(assetInput, "id");
    const existingIndex = existingId
      ? state.assets.findIndex((entry) => entry.id === existingId)
      : -1;
    const nextAsset = createAssetRecord({
      assetInput,
      ...(existingIndex >= 0 && state.assets[existingIndex]
        ? { existing: state.assets[existingIndex] }
        : {}),
      assetId:
        existingIndex >= 0
          ? (state.assets[existingIndex]?.id ?? `asset-${state.nextAssetId}`)
          : `asset-${state.nextAssetId}`,
      updatedAt: now,
    });
    if (existingIndex >= 0) {
      state.assets[existingIndex] = nextAsset;
    } else {
      state.nextAssetId += 1;
      state.assets.push(nextAsset);
    }
    writeJson(response, 200, {
      asset: nextAsset,
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.AssetsDelete) {
    const assetId = readRequiredString(body, "assetId");
    const existingIndex = state.assets.findIndex(
      (entry) => entry.id === assetId,
    );
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
    writeJson(response, 200, {
      usages: readAssetUsages(state).filter(
        (usage) =>
          (assetId === undefined || usage.assetId === assetId) &&
          (workflowId === undefined || usage.workflowId === workflowId),
      ),
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.ExecutionsList) {
    const workflowId = readOptionalString(body, "workflowId");
    writeJson(response, 200, {
      executions: state.executions.filter(
        (execution) =>
          workflowId === undefined || execution.workflowId === workflowId,
      ),
    });
    return;
  }

  if (requestUrl.pathname === RequestPath.ExecutionsGet) {
    const executionId = readRequiredString(body, "executionId");
    const execution = state.executions.find(
      (entry) => entry.id === executionId,
    );
    if (!execution) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    writeJson(response, 200, { execution });
    return;
  }

  if (requestUrl.pathname === RequestPath.ExecutionsDelete) {
    const executionId = readRequiredString(body, "executionId");
    const existingIndex = state.executions.findIndex(
      (entry) => entry.id === executionId,
    );
    if (existingIndex < 0) {
      writeJson(response, 404, { message: "Not found" });
      return;
    }
    const [execution] = state.executions.splice(existingIndex, 1);
    writeJson(response, 200, { execution });
    return;
  }

  writeJson(response, 404, {
    message: "Not found",
  });
}

function readVersionImportSnapshot(body: unknown): {
  exported: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  checksumValid: boolean;
  schemaSupported: boolean;
} {
  const exported = readRequiredRecord(body, "exported");
  const timelineVersions = exported["versions"];
  if (Array.isArray(timelineVersions)) {
    const requestedVersionId = readOptionalString(body, "versionId");
    const versionRecords = timelineVersions.filter(isRecord);
    const selectedVersion =
      versionRecords.find(
        (version) =>
          requestedVersionId !== undefined &&
          readOptionalString(version, "versionId") === requestedVersionId,
      ) ??
      versionRecords.reduce<Record<string, unknown> | undefined>(
        (latest, version) => {
          if (!latest) {
            return version;
          }
          return readRequiredNumber(version, "version") >
            readRequiredNumber(latest, "version")
            ? version
            : latest;
        },
        undefined,
      );

    if (!selectedVersion) {
      throw new Error("Timeline import has no versions.");
    }

    const snapshot = readRequiredRecord(selectedVersion, "snapshot");
    return {
      exported,
      snapshot,
      checksumValid: typeof selectedVersion["checksum"] === "string",
      schemaSupported: selectedVersion["schemaVersion"] === 1,
    };
  }

  return {
    exported,
    snapshot: readRequiredRecord(exported, "snapshot"),
    checksumValid: typeof exported["checksum"] === "string",
    schemaSupported: exported["schemaVersion"] === 1,
  };
}

function handleDefinitionVersionRequest(input: {
  requestUrl: URL;
  response: ServerResponse;
  state: StubServerState;
  body: unknown;
}): boolean {
  const { requestUrl, response, state, body } = input;

  if (requestUrl.pathname === RequestPath.DefinitionsRestoreVersion) {
    const workflowId = readRequiredString(body, "workflowId");
    const versionId = readRequiredString(body, "versionId");
    const version = state.definitionVersions.find(
      (entry) => entry.workflowId === workflowId && entry.id === versionId,
    );
    if (!version) {
      writeJson(response, 404, { message: "Not found" });
      return true;
    }
    const restored = {
      ...version.snapshot,
      id: workflowId,
      version: version.snapshot.version + 1,
      updatedAt: "2026-05-06T08:20:00.000Z",
    };
    const existingIndex = state.definitions.findIndex(
      (entry) => entry.id === workflowId,
    );
    if (existingIndex >= 0) {
      state.definitions[existingIndex] = restored;
    } else {
      state.definitions.push(restored);
    }
    state.definitionVersions.push(
      createDefinitionVersionRecord({
        definition: restored,
        version: state.definitionVersions.length + 1,
      }),
    );
    writeJson(response, 200, { definition: restored });
    return true;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsRestoreVersionPart) {
    const workflowId = readRequiredString(body, "workflowId");
    const versionId = readRequiredString(body, "versionId");
    const version = state.definitionVersions.find(
      (entry) => entry.workflowId === workflowId && entry.id === versionId,
    );
    const current = state.definitions.find((entry) => entry.id === workflowId);
    if (!version || !current) {
      writeJson(response, 404, { message: "Not found" });
      return true;
    }

    const restored = {
      ...current,
      name: version.snapshot.name,
      description: version.snapshot.description,
      updatedAt: "2026-05-06T08:22:00.000Z",
      version: current.version + 1,
    };
    state.definitions = state.definitions.map((entry) =>
      entry.id === workflowId ? restored : entry,
    );
    state.definitionVersions.push(
      createDefinitionVersionRecord({
        definition: restored,
        version: restored.version,
      }),
    );
    writeJson(response, 200, { definition: restored });
    return true;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsCloneVersion) {
    const workflowId = readRequiredString(body, "workflowId");
    const versionId = readRequiredString(body, "versionId");
    const version = state.definitionVersions.find(
      (entry) => entry.workflowId === workflowId && entry.id === versionId,
    );
    if (!version) {
      writeJson(response, 404, { message: "Not found" });
      return true;
    }

    const requestedName =
      readOptionalString(body, "name") ?? `${version.snapshot.name} copy`;
    const cloned = {
      ...version.snapshot,
      id: `workflow-${state.nextWorkflowId.toString()}`,
      name: requestedName,
      version: 1,
      createdAt: "2026-05-06T08:25:00.000Z",
      updatedAt: "2026-05-06T08:25:00.000Z",
    };
    state.nextWorkflowId += 1;
    state.definitions.push(cloned);
    state.definitionVersions.push(
      createDefinitionVersionRecord({
        definition: cloned,
        version: cloned.version,
      }),
    );
    writeJson(response, 200, { definition: cloned });
    return true;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsExportVersion) {
    const workflowId = readRequiredString(body, "workflowId");
    const versionId = readRequiredString(body, "versionId");
    const version = state.definitionVersions.find(
      (entry) => entry.workflowId === workflowId && entry.id === versionId,
    );
    if (!version) {
      writeJson(response, 404, { message: "Not found" });
      return true;
    }

    state.versionExportCount += 1;
    writeJson(response, 200, {
      exported: {
        schemaVersion: 1,
        workflowId: version.workflowId,
        versionId: version.id,
        version: version.version,
        createdAt: version.createdAt,
        checksum: version.checksum ?? "0".repeat(64),
        snapshot: version.snapshot,
        tags: version.tags ?? [],
      },
    });
    return true;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsExportVersionTimeline) {
    const workflowId = readRequiredString(body, "workflowId");
    const versionIds = readOptionalStringSet(body, "versionIds");
    const versions = state.definitionVersions
      .filter((entry) => entry.workflowId === workflowId)
      .filter((entry) => !versionIds || versionIds.has(entry.id))
      .sort((left, right) => left.version - right.version);
    if (versions.length === 0) {
      writeJson(response, 404, { message: "Not found" });
      return true;
    }

    state.versionTimelineExportCount += 1;
    writeJson(response, 200, {
      exported: {
        schemaVersion: 1,
        workflowId,
        exportedAt: "2026-05-06T08:45:00.000Z",
        versions: versions.map((version) => ({
          schemaVersion: 1,
          workflowId: version.workflowId,
          versionId: version.id,
          version: version.version,
          createdAt: version.createdAt,
          checksum: version.checksum ?? "0".repeat(64),
          snapshot: version.snapshot,
          tags: version.tags ?? [],
        })),
        timeline: versions.map((version) => ({
          versionId: version.id,
          version: version.version,
          createdAt: version.createdAt,
          checksum: version.checksum ?? "0".repeat(64),
          changeType: version.changeType ?? "manual",
          changeSummary: version.changeSummary ?? "Snapshot saved",
          tags: version.tags ?? [],
        })),
      },
    });
    return true;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsPreviewImportVersion) {
    const { snapshot, checksumValid, schemaSupported } =
      readVersionImportSnapshot(body);

    const workflowIdCollision = state.definitions.some(
      (definition) => definition.id === readRequiredString(snapshot, "id"),
    );
    const messages = [
      ...(workflowIdCollision
        ? [
            {
              code: "workflow_id_collision",
              severity: "warning",
              message:
                "Snapshot workflow id already exists and will be regenerated.",
            },
          ]
        : []),
    ];
    writeJson(response, 200, {
      preview: {
        status: messages.length > 0 ? "warning" : "valid",
        schemaSupported,
        checksumValid,
        workflowIdCollision,
        recommendedIdMode: workflowIdCollision ? "regenerate_ids" : "keep_ids",
        suggestedName: readRequiredString(snapshot, "name"),
        messages,
      },
    });
    return true;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsImportVersion) {
    const { snapshot } = readVersionImportSnapshot(body);

    const imported = {
      ...snapshot,
      id: `workflow-${state.nextWorkflowId.toString()}`,
      name:
        readOptionalString(body, "name") ??
        readRequiredString(snapshot, "name"),
      version: 1,
      createdAt: "2026-05-06T08:26:00.000Z",
      updatedAt: "2026-05-06T08:26:00.000Z",
    } as StubWorkflowDefinitionRecord;
    state.nextWorkflowId += 1;
    state.definitions.push(imported);
    state.definitionVersions.push(
      createDefinitionVersionRecord({
        definition: imported,
        version: imported.version,
      }),
    );
    writeJson(response, 200, { definition: imported });
    return true;
  }

  if (requestUrl.pathname === RequestPath.DefinitionsCleanupVersions) {
    const workflowId = readRequiredString(body, "workflowId");
    const keepLatest = readRequiredNumber(body, "keepLatest");
    const sorted = state.definitionVersions
      .filter((entry) => entry.workflowId === workflowId)
      .sort((left, right) => right.version - left.version);
    const kept = sorted.slice(0, keepLatest);
    const removed = sorted.slice(keepLatest);
    state.definitionVersions = state.definitionVersions.filter(
      (entry) =>
        entry.workflowId !== workflowId ||
        kept.some((version) => version.id === entry.id),
    );
    writeJson(response, 200, { kept, removed });
    return true;
  }

  return false;
}

async function handleStreamNodeRequest(
  requestUrl: URL,
  response: ServerResponse,
  state: StubServerState,
): Promise<void> {
  const workflowId = requestUrl.searchParams.get("workflowId") ?? "";
  const nodeId = requestUrl.searchParams.get("nodeId") ?? "";
  const definition = state.definitions.find((entry) => entry.id === workflowId);
  const node = definition?.nodes.find((entry) => entry.id === nodeId);

  if (!definition || !node) {
    writeJson(response, 404, { message: "Not found" });
    return;
  }

  const execution = createStepExecutionFixture(definition, node);
  state.executions = upsertStubExecution(
    state.executions,
    createRunningStepExecutionFixture(execution),
  );

  response.writeHead(200, {
    ...createCorsHeaders(),
    [ResponseHeader.ContentType]: "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  writeStreamEvent(response, "workflow_started", {
    workflowId: definition.id,
    workflowRunId: execution.id,
    startedAt: execution.startedAt,
  });
  writeStreamEvent(response, "node_started", {
    workflowId: definition.id,
    workflowRunId: execution.id,
    nodeId: node.id,
    nodeKind: node.kind,
    label: node.label,
    startedAt: execution.startedAt,
  });
  await waitForStubDelay();
  writeStreamEvent(response, "node_completed", {
    workflowId: definition.id,
    workflowRunId: execution.id,
    nodeId: node.id,
    nodeKind: node.kind,
    label: node.label,
    status: "completed",
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    outputSnapshot: execution.nodeRuns[0]?.outputSnapshot,
    alerts: [],
    guardrailFindings: [],
  });
  state.executions = upsertStubExecution(state.executions, execution);
  writeStreamEvent(response, "workflow_completed", {
    workflowId: definition.id,
    workflowRunId: execution.id,
    finishedAt: execution.finishedAt,
    execution,
  });
  response.end();
}

function writeStreamEvent(
  response: ServerResponse,
  eventName: string,
  data: Record<string, unknown>,
): void {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function waitForStubDelay(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 250);
  });
}

function upsertStubExecution(
  executions: ReadonlyArray<StubExecutionRecord>,
  execution: StubExecutionRecord,
): StubExecutionRecord[] {
  const existingIndex = executions.findIndex(
    (entry) => entry.id === execution.id,
  );
  if (existingIndex < 0) {
    return [execution, ...executions];
  }

  return executions.map((entry, index) =>
    index === existingIndex ? execution : entry,
  );
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
  };
}

function createDefinitionRecord(input: {
  definitionInput: Record<string, unknown>;
  existing?: StubWorkflowDefinitionRecord;
  workflowId: string;
  updatedAt: string;
}): StubWorkflowDefinitionRecord {
  const createdAt = input.existing?.createdAt ?? input.updatedAt;
  const version = input.existing ? input.existing.version + 1 : 1;
  return {
    id: input.workflowId,
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
    executionPolicy: readExecutionPolicyRecord(
      input.definitionInput,
      "executionPolicy",
    ),
    defaultContextPolicy: readContextPolicyRecord(
      input.definitionInput,
      "defaultContextPolicy",
    ),
    tags: readStringArray(input.definitionInput, "tags"),
  };
}

function createDefinitionVersionRecord(input: {
  definition: StubWorkflowDefinitionRecord;
  version: number;
}): StubWorkflowDefinitionVersionRecord {
  return {
    id: `${input.definition.id}-version-${input.version}`,
    workflowId: input.definition.id,
    version: input.version,
    createdAt: input.definition.updatedAt,
    snapshot: input.definition,
  };
}

function createTimelineImportPayload(
  savedVersion: StubWorkflowDefinitionVersionRecord,
): Record<string, unknown> {
  const firstSnapshot: StubWorkflowDefinitionRecord = {
    ...savedVersion.snapshot,
    name: "Timeline selected v1",
    description: "timeline-v1-description",
    updatedAt: "2026-05-06T08:31:00.000Z",
  };
  const secondSnapshot: StubWorkflowDefinitionRecord = {
    ...savedVersion.snapshot,
    name: "Timeline selected v2",
    description: "timeline-v2-description",
    updatedAt: "2026-05-06T08:32:00.000Z",
  };

  return {
    schemaVersion: 1,
    workflowId: savedVersion.workflowId,
    exportedAt: "2026-05-06T08:33:00.000Z",
    versions: [
      {
        schemaVersion: 1,
        workflowId: savedVersion.workflowId,
        versionId: "timeline-import-v1",
        version: 1,
        createdAt: "2026-05-06T08:31:00.000Z",
        checksum: "1".repeat(64),
        snapshot: firstSnapshot,
        tags: ["seed"],
      },
      {
        schemaVersion: 1,
        workflowId: savedVersion.workflowId,
        versionId: "timeline-import-v2",
        version: 2,
        createdAt: "2026-05-06T08:32:00.000Z",
        checksum: "2".repeat(64),
        snapshot: secondSnapshot,
        tags: ["release"],
      },
    ],
    timeline: [
      {
        versionId: "timeline-import-v1",
        version: 1,
        createdAt: "2026-05-06T08:31:00.000Z",
        checksum: "1".repeat(64),
        changeSummary: "Initial timeline import",
        tags: ["seed"],
      },
      {
        versionId: "timeline-import-v2",
        version: 2,
        createdAt: "2026-05-06T08:32:00.000Z",
        checksum: "2".repeat(64),
        changeSummary: "Selected timeline import",
        tags: ["release"],
      },
    ],
  };
}

function createAssetRecord(input: {
  assetInput: Record<string, unknown>;
  existing?: StubWorkflowAssetRecord;
  assetId: string;
  updatedAt: string;
}): StubWorkflowAssetRecord {
  const createdAt = input.existing?.createdAt ?? input.updatedAt;
  const version = input.existing ? input.existing.version + 1 : 1;
  const scope = readAssetScopeValue(input.assetInput, "scope");
  const outputContract = readOptionalRecord(input.assetInput, "outputContract");
  const guardrail = readOptionalRecord(input.assetInput, "guardrail");
  const archivedAt = readOptionalString(input.assetInput, "archivedAt");

  return {
    id: input.assetId,
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
    ...(archivedAt ? { archivedAt } : {}),
  };
}

function readAssetUsages(
  state: StubServerState,
): ReadonlyArray<StubAssetUsageRecord> {
  return state.definitions.flatMap((definition) =>
    definition.nodes.flatMap((node) => {
      const primaryUsage = node.config.assetId
        ? [
            {
              assetId: node.config.assetId,
              workflowId: definition.id,
              nodeId: node.id,
              nodeKind: node.kind,
              role:
                node.kind === WorkflowNodeKind.AssetInstruction
                  ? ("instruction" as const)
                  : ("primary" as const),
              createdAt: definition.updatedAt,
            },
          ]
        : [];
      const guardrailUsages = node.attachedGuardrails.map((guardrail) => ({
        assetId: guardrail.assetId,
        workflowId: definition.id,
        nodeId: node.id,
        nodeKind: node.kind,
        role: "guardrail" as const,
        createdAt: definition.updatedAt,
      }));

      return [...primaryUsage, ...guardrailUsages];
    }),
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
      authToken: ValidationAuthToken,
      serverKeys: ServerStorageKey,
    },
  );
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

async function clickByExactTestId(page: Page, testId: string): Promise<void> {
  const clicked = await page.evaluate((selector: string) => {
    const element = Array.from(document.querySelectorAll("[data-testid]")).find(
      (entry) => entry.getAttribute("data-testid") === selector,
    );
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

async function doubleClickByTestId(page: Page, testId: string): Promise<void> {
  const point = await readElementCenterPoint(page, testId);
  await page.mouse.click(point.x, point.y, { clickCount: 2 });
}

async function mouseClickByTestId(page: Page, testId: string): Promise<void> {
  const point = await readElementCenterPoint(page, testId);
  await page.mouse.click(point.x, point.y);
}

async function readElementCenterPoint(
  page: Page,
  testId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((targetTestId: string) => {
    const element = document.querySelector(`[data-testid="${targetTestId}"]`);
    if (!(element instanceof HTMLElement)) {
      return null;
    }
    const dragHandle = element.querySelector("[data-drag-handle]") ?? element;
    const rect = dragHandle.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, testId);

  if (!point) {
    throw new Error(`Could not find element center point for ${testId}.`);
  }
  return point;
}

async function clickButtonByTitle(page: Page, title: string): Promise<void> {
  const clicked = await page.evaluate((buttonTitle: string) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (entry) => entry.getAttribute("title") === buttonTitle,
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  }, title);

  if (!clicked) {
    const buttonTitles = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button")).map(
        (entry) => entry.getAttribute("title") ?? "",
      ),
    );
    throw new Error(
      `Could not click button titled "${title}". Titles: ${buttonTitles.join(" | ")}`,
    );
  }
}

async function clickButtonByText(page: Page, text: string): Promise<void> {
  const clicked = await page.evaluate((buttonText: string) => {
    const button = Array.from(document.querySelectorAll("button"))
      .reverse()
      .find(
        (entry) =>
          entry instanceof HTMLButtonElement &&
          entry.textContent?.trim() === buttonText &&
          !entry.disabled &&
          entry.offsetParent !== null,
      );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  }, text);

  if (!clicked) {
    const buttonTexts = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button")).map(
        (entry) => entry.textContent?.trim() ?? "",
      ),
    );
    throw new Error(
      `Could not click button with text "${text}". Buttons: ${buttonTexts.join(" | ")}`,
    );
  }
}
async function setTextAreaValueByTestId(
  page: Page,
  testId: string,
  value: string,
): Promise<void> {
  const updated = await page.evaluate(
    (payload: { testId: string; value: string }) => {
      const element = document.querySelector(
        `[data-testid="${payload.testId}"]`,
      );
      if (!(element instanceof HTMLTextAreaElement)) {
        return false;
      }
      element.value = payload.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    },
    {
      testId,
      value,
    },
  );

  if (!updated) {
    throw new Error(`Could not set textarea ${testId}.`);
  }
}

async function setInputValueByTestId(
  page: Page,
  testId: string,
  value: string,
): Promise<void> {
  const updated = await page.evaluate(
    (payload: { testId: string; value: string }) => {
      const element = document.querySelector(
        `[data-testid="${payload.testId}"]`,
      );
      if (!(element instanceof HTMLInputElement)) {
        return false;
      }
      element.value = payload.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    {
      testId,
      value,
    },
  );

  if (!updated) {
    throw new Error(`Could not set input ${testId}.`);
  }
}

async function selectValueByTestId(
  page: Page,
  testId: string,
  value: string,
): Promise<void> {
  const updated = await page.evaluate(
    (payload: { testId: string; value: string }) => {
      const element = document.querySelector(
        `[data-testid="${payload.testId}"]`,
      );
      if (!(element instanceof HTMLSelectElement)) {
        return false;
      }

      element.value = payload.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { testId, value },
  );

  if (!updated) {
    throw new Error(`Could not set select ${testId}.`);
  }
}

async function waitForSelectOptionLabel(
  page: Page,
  testId: string,
  label: string,
): Promise<void> {
  await waitForCondition(
    async () =>
      page.evaluate(
        (payload: { testId: string; label: string }) => {
          const element = document.querySelector(
            `[data-testid="${payload.testId}"]`,
          );
          if (!(element instanceof HTMLSelectElement)) {
            return false;
          }

          return Array.from(element.options).some(
            (option) => option.textContent?.trim() === payload.label,
          );
        },
        { testId, label },
      ),
    `select option ${label}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function readNodeCardTestIdByText(
  page: Page,
  text: string,
): Promise<string> {
  const testId = await page.evaluate((label: string) => {
    const card = Array.from(
      document.querySelectorAll("[data-testid^='workflows-node-card-']"),
    ).find((element) => element.textContent?.includes(label) ?? false);
    return card?.getAttribute("data-testid") ?? null;
  }, text);

  if (!testId) {
    throw new Error(`Could not find node card with text "${text}".`);
  }

  return testId;
}
async function waitForTextAreaValue(
  page: Page,
  testId: string,
  expectedValue: string,
): Promise<void> {
  await waitForCondition(
    async () => {
      const value = await page.evaluate((selector: string) => {
        const element = document.querySelector(`[data-testid="${selector}"]`);
        if (!(element instanceof HTMLTextAreaElement)) {
          return null;
        }
        return element.value;
      }, testId);

      return value === expectedValue;
    },
    `textarea ${testId} value ${expectedValue}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForTextAreaToContain(
  page: Page,
  testId: string,
  expectedNeedle: string,
): Promise<void> {
  await waitForCondition(
    async () => {
      const value = await page.evaluate((selector: string) => {
        const element = document.querySelector(`[data-testid="${selector}"]`);
        if (!(element instanceof HTMLTextAreaElement)) {
          return null;
        }
        return element.value;
      }, testId);

      return value?.includes(expectedNeedle) ?? false;
    },
    `textarea ${testId} contains ${expectedNeedle}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForInputToContain(
  page: Page,
  testId: string,
  expectedNeedle: string,
): Promise<void> {
  await waitForCondition(
    async () => {
      const value = await page.evaluate((selector: string) => {
        const element = document.querySelector(`[data-testid="${selector}"]`);
        if (!(element instanceof HTMLInputElement)) {
          return null;
        }
        return element.value;
      }, testId);

      return value?.includes(expectedNeedle) ?? false;
    },
    `input ${testId} contains ${expectedNeedle}`,
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

async function waitForMissingPageText(page: Page, text: string): Promise<void> {
  await waitForCondition(
    async () => {
      const bodyText = await page.evaluate(() => document.body.innerText);
      return !bodyText.includes(text);
    },
    `missing page text "${text}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForPageTexts(
  page: Page,
  texts: ReadonlyArray<string>,
): Promise<void> {
  await waitForCondition(
    async () => {
      const bodyText = await page.evaluate(() => document.body.innerText);
      return texts.every((text) => bodyText.includes(text));
    },
    `page texts "${texts.join(", ")}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForUrlSearchParam(
  page: Page,
  key: string,
  expectedValue: string,
): Promise<void> {
  await waitForCondition(
    async () => new URL(page.url()).searchParams.get(key) === expectedValue,
    `url search param ${key}=${expectedValue}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForUrlSearchParamExists(
  page: Page,
  key: string,
): Promise<void> {
  await waitForCondition(
    async () => {
      const value = new URL(page.url()).searchParams.get(key);
      return value !== null && value.trim().length > 0;
    },
    `url search param ${key} exists`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForExecutionWithOutput(
  state: StubServerState,
  expectedNeedle: string,
): Promise<void> {
  await waitForCondition(
    async () =>
      state.executions.some((execution) =>
        execution.nodeRuns.some((nodeRun) =>
          JSON.stringify(nodeRun.outputSnapshot ?? {}).includes(expectedNeedle),
        ),
      ),
    `execution output ${expectedNeedle}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForPinnedDefinitionOutput(
  state: StubServerState,
  expectedNeedle: string,
): Promise<void> {
  await waitForCondition(
    async () =>
      state.definitions.some((definition) =>
        definition.nodes.some((node) =>
          JSON.stringify(node.config.pinnedTestOutput ?? {}).includes(
            expectedNeedle,
          ),
        ),
      ),
    `pinned workflow output ${expectedNeedle}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForTestId(page: Page, testId: string): Promise<void> {
  await waitForCondition(
    async () => {
      return readTestIdExists(page, testId);
    },
    `test id "${testId}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function readTestIdExists(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((selector: string) => {
    const element = document.querySelector(`[data-testid="${selector}"]`);
    return element instanceof Element;
  }, testId);
}

async function waitForExactTestId(page: Page, testId: string): Promise<void> {
  await waitForCondition(
    async () => {
      const exists = await page.evaluate((selector: string) => {
        return Array.from(document.querySelectorAll("[data-testid]")).some(
          (entry) => entry.getAttribute("data-testid") === selector,
        );
      }, testId);
      return exists;
    },
    `test id "${testId}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForMissingTestId(page: Page, testId: string): Promise<void> {
  await waitForCondition(
    async () => {
      const missing = await page.evaluate((selector: string) => {
        const element = document.querySelector(`[data-testid="${selector}"]`);
        return !(element instanceof Element);
      }, testId);
      return missing;
    },
    `missing test id ${testId}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForExecutionCardCount(
  page: Page,
  expectedCount: number,
): Promise<void> {
  await waitForCondition(
    async () => {
      const count = await page.evaluate(
        (prefix: string) =>
          Array.from(
            document.querySelectorAll(`[data-testid^="${prefix}"]`),
          ).filter((entry) => entry instanceof HTMLElement).length,
        WorkflowSelector.ExecutionCardPrefix,
      );
      return count === expectedCount;
    },
    `execution card count ${expectedCount.toString()}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}
async function waitForNodeCardText(page: Page, text: string): Promise<void> {
  await waitForCondition(
    async () => {
      const exists = await page.evaluate(
        (label: string) =>
          Array.from(
            document.querySelectorAll("[data-testid^='workflows-node-card-']"),
          ).some((element) => element.textContent?.includes(label) ?? false),
        text,
      );
      return exists;
    },
    `node card text "${text}"`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForNodeCardCount(
  page: Page,
  expectedCount: number,
): Promise<void> {
  await waitForCondition(
    async () => {
      const count = await page.evaluate(
        () =>
          document.querySelectorAll("[data-testid^='workflows-node-card-']")
            .length,
      );
      return count === expectedCount;
    },
    `node card count ${String(expectedCount)}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}

async function waitForExecutionCardSelected(
  page: Page,
  testId: string,
): Promise<void> {
  await waitForCondition(
    async () =>
      page.evaluate((targetTestId) => {
        const element = document.querySelector(
          `[data-testid="${targetTestId}"]`,
        );
        return element?.className.includes("bg-[#333333]") ?? false;
      }, testId),
    `selected execution card ${testId}`,
    {
      timeoutMs: ValidationConfig.UiPollingTimeoutMs,
      intervalMs: ValidationConfig.UiPollingIntervalMs,
    },
  );
}
function ensureHistoryNavigationEdge(
  definition: StubWorkflowDefinitionRecord,
): StubWorkflowDefinitionRecord {
  if (definition.edges.length > 0) {
    return definition;
  }

  const sourceNode = definition.nodes.find(
    (node) => node.kind === WorkflowNodeKind.TriggerManual,
  );
  const targetNode = definition.nodes.find(
    (node) =>
      node.kind === WorkflowNodeKind.TerminalResponse ||
      node.label === "Response",
  );
  const sourcePort = sourceNode?.outputPorts[0];
  const targetPort = targetNode?.inputPorts[0];

  if (!sourceNode || !targetNode || !sourcePort || !targetPort) {
    throw new Error(
      "Expected trigger and response ports for modal navigation.",
    );
  }

  return {
    ...definition,
    edges: [
      {
        id: "edge-history-trigger-response",
        sourceNodeId: sourceNode.id,
        sourcePortId: sourcePort.id,
        targetNodeId: targetNode.id,
        targetPortId: targetPort.id,
        mapping: {
          mode: "passthrough",
          entries: [],
        },
      },
    ],
  };
}

function addConnectedAgentNode(
  definition: StubWorkflowDefinitionRecord,
): StubWorkflowDefinitionRecord {
  if (definition.nodes.some((node) => node.id === "node-agent-executed-at")) {
    return definition;
  }

  const sourceNode = definition.nodes.find(
    (node) => node.kind === WorkflowNodeKind.TriggerManual,
  );
  const sourcePort = sourceNode?.outputPorts[0];

  if (!sourceNode || !sourcePort) {
    throw new Error("Expected trigger port for executedAt variable QA.");
  }

  const agentNode: StubWorkflowNodeRecord = {
    id: "node-agent-executed-at",
    kind: WorkflowNodeKind.AiAgent,
    label: "Agent step",
    position: {
      x: sourceNode.position.x + 320,
      y: sourceNode.position.y,
    },
    width: 260,
    collapsed: false,
    config: {
      role: "executor",
      prompt: "",
      provider: {
        providerId: "custom:custom",
        modelId: "gpt-5",
        reasoningLevel: "medium",
        temperature: 0.2,
        verbosity: "medium",
      },
    },
    inputPorts: [
      {
        id: "input",
        name: "Input",
        acceptsMany: true,
      },
    ],
    outputPorts: [
      {
        id: "output",
        name: "Output",
        acceptsMany: true,
      },
    ],
    attachedGuardrails: [],
  };
  const targetPort = agentNode.inputPorts[0];

  if (!targetPort) {
    throw new Error("Expected agent input port for executedAt variable QA.");
  }

  return {
    ...definition,
    nodes: [...definition.nodes, agentNode],
    edges: [
      ...definition.edges,
      {
        id: "edge-trigger-agent-executed-at",
        sourceNodeId: sourceNode.id,
        sourcePortId: sourcePort.id,
        targetNodeId: agentNode.id,
        targetPortId: targetPort.id,
        mapping: {
          mode: "passthrough",
          entries: [],
        },
      },
    ],
  };
}

function createPinnedOutputExecutionFixture(
  definition: StubWorkflowDefinitionRecord,
): StubExecutionRecord {
  const triggerNode = definition.nodes.find(
    (node) => node.kind === WorkflowNodeKind.TriggerManual,
  );
  const responseNode = definition.nodes.find(
    (node) =>
      node.kind === WorkflowNodeKind.TerminalResponse ||
      node.label === "Response",
  );

  if (!triggerNode || !responseNode) {
    throw new Error("Expected trigger and response nodes for pinned history.");
  }

  return {
    id: ValidationText.ExecutionPinnedId,
    workflowId: definition.id,
    triggerKind: "manual",
    status: "completed",
    startedAt: "2026-05-06T08:30:00.000Z",
    finishedAt: "2026-05-06T08:30:02.000Z",
    durationMs: 2000,
    warningsCount: 0,
    errorsCount: 0,
    totals: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostEur: 0,
      latencyMs: 2000,
    },
    contextSessionId: "ctx-pinned",
    nodeRuns: [
      {
        id: "node-run-trigger-pinned",
        nodeId: triggerNode.id,
        nodeKind: triggerNode.kind,
        status: "completed",
        startedAt: "2026-05-06T08:30:00.000Z",
        finishedAt: "2026-05-06T08:30:00.100Z",
        durationMs: 100,
        outputSnapshot: {
          json: {
            executedAt: "2026-05-06T08:30:00.000Z",
          },
        },
        alerts: [],
        guardrailFindings: [],
      },
      {
        id: ValidationText.ExecutionPinnedResponseRunId,
        nodeId: responseNode.id,
        nodeKind: responseNode.kind,
        status: "completed",
        startedAt: "2026-05-06T08:30:00.200Z",
        finishedAt: "2026-05-06T08:30:02.000Z",
        durationMs: 1800,
        outputSnapshot: {
          json: {
            source: "history",
            value: ValidationText.HistoryPinnedOutputNeedle,
          },
        },
        alerts: [],
        guardrailFindings: [],
      },
    ],
  };
}

function createRunningStepExecutionFixture(
  execution: StubExecutionRecord,
): StubExecutionRecord {
  const {
    finishedAt: _finishedAt,
    durationMs: _durationMs,
    ...running
  } = execution;
  return {
    ...running,
    status: "running",
    nodeRuns: execution.nodeRuns.map((run) => {
      const {
        finishedAt: _runFinishedAt,
        durationMs: _runDurationMs,
        ...runningRun
      } = run;
      return {
        ...runningRun,
        status: "running",
      };
    }),
  };
}

function createStepExecutionFixture(
  definition: StubWorkflowDefinitionRecord,
  node: StubWorkflowNodeRecord,
): StubExecutionRecord {
  return {
    id: "execution-step-response",
    workflowId: definition.id,
    triggerKind: "manual",
    status: "completed",
    startedAt: "2026-05-06T08:45:00.000Z",
    finishedAt: "2026-05-06T08:45:01.000Z",
    durationMs: 1000,
    warningsCount: 0,
    errorsCount: 0,
    totals: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostEur: 0,
      latencyMs: 1000,
    },
    contextSessionId: "ctx-step",
    nodeRuns: [
      {
        id: "node-run-step-response",
        nodeId: node.id,
        nodeKind: node.kind,
        status: "completed",
        startedAt: "2026-05-06T08:45:00.000Z",
        finishedAt: "2026-05-06T08:45:01.000Z",
        durationMs: 1000,
        outputSnapshot: {
          json: {
            source: "step",
            value: ValidationText.StepOutputNeedle,
          },
        },
        alerts: [],
        guardrailFindings: [],
      },
    ],
  };
}

function createExecutionFixtures(
  definition: StubWorkflowDefinitionRecord,
): StubExecutionRecord[] {
  const triggerNode = definition.nodes.find(
    (node) => node.kind === WorkflowNodeKind.TriggerManual,
  );
  const promptNode = definition.nodes.find(
    (node) => node.label === ValidationText.PromptNodeLabel,
  );
  const providerNode = definition.nodes.find(
    (node) => node.label === ValidationText.ProviderNodeLabel,
  );

  if (!triggerNode || !promptNode || !providerNode) {
    return [];
  }

  return [
    {
      id: ValidationText.ExecutionCleanId,
      workflowId: definition.id,
      triggerKind: "manual",
      status: "completed",
      startedAt: ValidationText.ExecutionCleanStartedAt,
      finishedAt: "2026-05-06T08:12:03.500Z",
      durationMs: 3500,
      warningsCount: 0,
      errorsCount: 0,
      totals: {
        promptTokens: 180,
        completionTokens: 100,
        totalTokens: 280,
        estimatedCostEur: 0.013,
        latencyMs: 3400,
      },
      contextSessionId: ValidationText.ExecutionCleanSessionId,
      nodeRuns: [
        {
          id: "node-run-trigger-clean",
          nodeId: triggerNode.id,
          nodeKind: triggerNode.kind,
          status: "completed",
          startedAt: ValidationText.ExecutionCleanStartedAt,
          finishedAt: "2026-05-06T08:12:00.250Z",
          durationMs: 250,
          alerts: [],
          guardrailFindings: [],
        },
        {
          id: "node-run-provider-clean",
          nodeId: providerNode.id,
          nodeKind: providerNode.kind,
          status: "completed",
          startedAt: "2026-05-06T08:12:00.300Z",
          finishedAt: "2026-05-06T08:12:03.500Z",
          durationMs: 3200,
          providerId: "codex-cli",
          modelId: "gpt-5-codex",
          usage: {
            promptTokens: 180,
            completionTokens: 100,
            totalTokens: 280,
            estimatedCostEur: 0.013,
            latencyMs: 3200,
          },
          alerts: [],
          guardrailFindings: [],
        },
      ],
    },
    {
      id: ValidationText.ExecutionPrimaryId,
      workflowId: definition.id,
      triggerKind: "manual",
      status: "completed",
      startedAt: ValidationText.ExecutionPrimaryStartedAt,
      finishedAt: "2026-05-06T08:16:07.000Z",
      durationMs: 7000,
      warningsCount: 1,
      errorsCount: 0,
      totals: {
        promptTokens: 420,
        completionTokens: 210,
        totalTokens: 630,
        estimatedCostEur: 0.0342,
        latencyMs: 6900,
      },
      contextSessionId: ValidationText.ExecutionPrimarySessionId,
      nodeRuns: [
        {
          id: "node-run-trigger-completed",
          nodeId: triggerNode.id,
          nodeKind: triggerNode.kind,
          status: "completed",
          startedAt: ValidationText.ExecutionPrimaryStartedAt,
          finishedAt: "2026-05-06T08:16:00.300Z",
          durationMs: 300,
          alerts: [],
          guardrailFindings: [],
        },
        {
          id: "node-run-provider-completed",
          nodeId: providerNode.id,
          nodeKind: providerNode.kind,
          status: "completed",
          startedAt: "2026-05-06T08:16:00.400Z",
          finishedAt: "2026-05-06T08:16:07.000Z",
          durationMs: 6600,
          providerId: "codex-cli",
          modelId: "gpt-5-codex",
          usage: {
            promptTokens: 420,
            completionTokens: 210,
            totalTokens: 630,
            estimatedCostEur: 0.0342,
            latencyMs: 6600,
          },
          alerts: [
            {
              id: "alert-completed-guardrail",
              level: "warn",
              source: "guardrail",
              message: ValidationText.ExecutionPrimaryAlert,
              createdAt: "2026-05-06T08:16:06.200Z",
            },
          ],
          guardrailFindings: [
            {
              guardrailAssetId: "asset-guardrail-warn",
              nodeId: providerNode.id,
              severity: "warn",
              message: ValidationText.ExecutionPrimaryFinding,
            },
          ],
        },
      ],
    },
    {
      id: ValidationText.ExecutionSecondaryId,
      workflowId: definition.id,
      triggerKind: "manual",
      status: "failed",
      startedAt: ValidationText.ExecutionSecondaryStartedAt,
      finishedAt: "2026-05-06T08:20:05.500Z",
      durationMs: 5500,
      warningsCount: 0,
      errorsCount: 1,
      totals: {
        promptTokens: 390,
        completionTokens: 0,
        totalTokens: 390,
        estimatedCostEur: 0.0213,
        latencyMs: 5400,
      },
      contextSessionId: ValidationText.ExecutionSecondarySessionId,
      nodeRuns: [
        {
          id: "node-run-prompt-failed",
          nodeId: promptNode.id,
          nodeKind: promptNode.kind,
          status: "completed",
          startedAt: ValidationText.ExecutionSecondaryStartedAt,
          finishedAt: "2026-05-06T08:20:00.900Z",
          durationMs: 900,
          alerts: [],
          guardrailFindings: [],
        },
        {
          id: "node-run-provider-failed",
          nodeId: providerNode.id,
          nodeKind: providerNode.kind,
          status: "failed",
          startedAt: "2026-05-06T08:20:01.000Z",
          finishedAt: "2026-05-06T08:20:05.500Z",
          durationMs: 4500,
          providerId: "codex-cli",
          modelId: "gpt-5-codex",
          usage: {
            promptTokens: 390,
            completionTokens: 0,
            totalTokens: 390,
            estimatedCostEur: 0.0213,
            latencyMs: 4500,
          },
          alerts: [
            {
              id: "alert-provider-failed",
              level: "error",
              source: "provider",
              message: ValidationText.ExecutionSecondaryAlert,
              createdAt: "2026-05-06T08:20:05.100Z",
            },
          ],
          guardrailFindings: [
            {
              guardrailAssetId: "asset-guardrail-error",
              nodeId: providerNode.id,
              severity: "error",
              message: ValidationText.ExecutionSecondaryFinding,
            },
          ],
        },
      ],
    },
  ];
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
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed;
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
  return request.headers.authorization === `Bearer ${ValidationAuthToken}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function readOptionalRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
}

function readRequiredNumber(value: unknown, key: string): number {
  if (!isRecord(value)) {
    throw new Error(`Expected number at ${key}`);
  }

  const nested = value[key];
  if (typeof nested !== "number" || !Number.isFinite(nested)) {
    throw new Error(`Expected number at ${key}`);
  }

  return nested;
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

function readOptionalString(value: unknown, key: string): string | undefined {
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
  key: string,
): ReadonlyArray<string> {
  const nested = value[key];
  if (
    !Array.isArray(nested) ||
    nested.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`Invalid ${key}`);
  }

  return nested.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error(`Invalid ${key}`);
    }
    return entry;
  });
}

function readOptionalStringSet(
  value: unknown,
  key: string,
): ReadonlySet<string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const nested = value[key];
  if (!Array.isArray(nested) || !nested.every(isStringValue)) {
    return undefined;
  }

  return new Set<string>(nested);
}

function isStringValue(value: unknown): value is string {
  return typeof value === "string";
}

function readTriggerRecord(
  value: Record<string, unknown>,
  key: string,
): StubWorkflowDefinitionRecord["trigger"] {
  const nested = readRequiredRecord(value, key);
  return {
    kind: "manual",
    enabled: readBooleanValue(nested, "enabled"),
    config: readRequiredObjectValue(nested, "config"),
  };
}

function readViewportRecord(
  value: Record<string, unknown>,
  key: string,
): StubWorkflowDefinitionRecord["viewport"] {
  const nested = readRequiredRecord(value, key);
  return {
    x: readNumberValue(nested, "x"),
    y: readNumberValue(nested, "y"),
    zoom: readNumberValue(nested, "zoom"),
  };
}

function readNodeArray(
  value: Record<string, unknown>,
  key: string,
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
      y: readNumberValue(readRequiredRecord(value, "position"), "y"),
    },
    width: readNumberValue(value, "width"),
    collapsed: readBooleanValue(value, "collapsed"),
    config: readNodeConfigRecord(readRequiredRecord(value, "config")),
    inputPorts: readPortArray(value, "inputPorts"),
    outputPorts: readPortArray(value, "outputPorts"),
    attachedGuardrails: readAttachedGuardrails(value, "attachedGuardrails"),
    ...(outputContract ? { outputContract } : {}),
  };
}

function readNodeConfigRecord(
  value: Record<string, unknown>,
): StubWorkflowNodeRecord["config"] {
  const assetId = readOptionalString(value, "assetId");
  const role = readOptionalString(value, "role");
  const prompt = readOptionalString(value, "prompt");
  const provider = readOptionalRecord(value, "provider");
  const reviewPolicyValue = readOptionalRecord(value, "reviewPolicy");
  const pinnedTestOutput = readOptionalRecord(value, "pinnedTestOutput");
  const reviewPolicy = reviewPolicyValue
    ? {
        requireHumanDecision: readBooleanValue(
          reviewPolicyValue,
          "requireHumanDecision",
        ),
      }
    : undefined;

  return {
    ...(assetId ? { assetId } : {}),
    ...(role ? { role } : {}),
    ...(prompt ? { prompt } : {}),
    ...(provider ? { provider } : {}),
    ...(reviewPolicy ? { reviewPolicy } : {}),
    ...(pinnedTestOutput ? { pinnedTestOutput } : {}),
  };
}

function readPortArray(
  value: Record<string, unknown>,
  key: string,
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
      acceptsMany: readBooleanValue(entry, "acceptsMany"),
    };
  });
}

function readAttachedGuardrails(
  value: Record<string, unknown>,
  key: string,
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
      enabled: readBooleanValue(entry, "enabled"),
    };
  });
}

function readEdgeArray(
  value: Record<string, unknown>,
  key: string,
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
        entries: readArrayValue(
          readRequiredRecord(entry, "mapping"),
          "entries",
        ),
      },
    };
  });
}

function readExecutionPolicyRecord(
  value: Record<string, unknown>,
  key: string,
): StubWorkflowDefinitionRecord["executionPolicy"] {
  const nested = readRequiredRecord(value, key);
  return {
    maxNodeRetries: readNumberValue(nested, "maxNodeRetries"),
    allowManualCheckpointResume: readBooleanValue(
      nested,
      "allowManualCheckpointResume",
    ),
  };
}

function readContextPolicyRecord(
  value: Record<string, unknown>,
  key: string,
): StubWorkflowDefinitionRecord["defaultContextPolicy"] {
  const nested = readRequiredRecord(value, key);
  return {
    language: readRequiredString(nested, "language"),
    carryMessagesLimit: readNumberValue(nested, "carryMessagesLimit"),
    carryArtifactLimit: readNumberValue(nested, "carryArtifactLimit"),
  };
}

function readArrayValue(
  value: Record<string, unknown>,
  key: string,
): ReadonlyArray<unknown> {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${key}`);
  }

  return nested;
}

function readRequiredObjectValue(
  value: Record<string, unknown>,
  key: string,
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

function readBooleanValue(
  value: Record<string, unknown>,
  key: string,
): boolean {
  const nested = value[key];
  if (typeof nested !== "boolean") {
    throw new Error(`Invalid ${key}`);
  }
  return nested;
}

function readStatusValue(
  value: Record<string, unknown>,
  key: string,
): StubWorkflowDefinitionRecord["status"] {
  const nested = readRequiredString(value, key);
  if (nested === "draft" || nested === "published" || nested === "archived") {
    return nested;
  }
  throw new Error(`Invalid ${key}`);
}

function readNodeKindValue(
  value: Record<string, unknown>,
  key: string,
): WorkflowNodeKind {
  const nested = readRequiredString(value, key);
  if (Object.values(WorkflowNodeKind).includes(nested as WorkflowNodeKind)) {
    return nested as WorkflowNodeKind;
  }
  throw new Error(`Invalid ${key}`);
}

function readAssetKindValue(
  value: Record<string, unknown>,
  key: string,
): StubWorkflowAssetRecord["kind"] {
  const nested = readRequiredString(value, key);
  if (
    nested === "prompt" ||
    nested === "instruction" ||
    nested === "guardrail"
  ) {
    return nested;
  }
  throw new Error(`Invalid ${key}`);
}

function readAssetScopeValue(
  value: Record<string, unknown>,
  key: string,
): StubWorkflowAssetRecord["scope"] {
  const nested = readRequiredString(value, key);
  if (nested === "workspace") {
    return nested;
  }
  throw new Error(`Invalid ${key}`);
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
