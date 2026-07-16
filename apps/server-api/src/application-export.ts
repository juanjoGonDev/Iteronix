import { createHash } from "node:crypto";
import {
  parseApplicationState,
  redactApplicationState,
  type ApplicationState,
} from "./application-state";
import { err, ok, type Result } from "./result";
import {
  WorkflowAssetKind,
  WorkflowAssetUsageRole,
  WorkflowExecutionStatus,
  WorkflowGuardrailOperator,
  WorkflowGuardrailSeverity,
  WorkflowNodeKind,
  WorkflowNodeRole,
  WorkflowRecordStatus,
  WorkflowReasoningLevel,
  WorkflowTriggerKind,
  WorkflowVerbosity,
} from "../../../packages/shared/src/workflows";

const ApplicationExportSchemaVersion = 1;
const ChecksumEncoding = "hex";
const ChecksumAlgorithm = "sha256";
const ChecksumPattern = /^[a-f0-9]{64}$/u;

export const ApplicationImportErrorCode = {
  UnknownSchema: "unknown_schema",
  ChecksumMismatch: "checksum_mismatch",
  MalformedPayload: "malformed_payload",
} as const;

export type ApplicationImportError = {
  code: (typeof ApplicationImportErrorCode)[keyof typeof ApplicationImportErrorCode];
};

export type ApplicationStateExport = {
  schemaVersion: typeof ApplicationExportSchemaVersion;
  exportedAt: string;
  checksum: string;
  application: ApplicationState;
};

export const exportApplicationState = (input: {
  application: unknown;
  exportedAt: string;
}): ApplicationStateExport => {
  const application = redactApplicationState(
    parseApplicationState(input.application),
  );
  const checksum = createChecksum({
    schemaVersion: ApplicationExportSchemaVersion,
    exportedAt: input.exportedAt,
    application,
  });

  return {
    schemaVersion: ApplicationExportSchemaVersion,
    exportedAt: input.exportedAt,
    checksum,
    application,
  };
};

export const importApplicationState = (
  value: unknown,
): Result<ApplicationState, ApplicationImportError> => {
  const legacyApplication = readLegacyApplicationPayload(value);
  if (legacyApplication) {
    return isApplicationStatePayload(legacyApplication)
      ? ok(parseApplicationState(legacyApplication))
      : malformedPayload();
  }

  if (!isRecord(value) || !isRecord(value["application"])) {
    return malformedPayload();
  }

  if (value["schemaVersion"] !== ApplicationExportSchemaVersion) {
    return err({ code: ApplicationImportErrorCode.UnknownSchema });
  }

  const exportedAt = value["exportedAt"];
  const checksum = value["checksum"];
  if (
    typeof exportedAt !== "string" ||
    exportedAt.length === 0 ||
    typeof checksum !== "string" ||
    !isImportApplicationPayload(value["application"])
  ) {
    return malformedPayload();
  }

  const expectedChecksum = createChecksum({
    schemaVersion: ApplicationExportSchemaVersion,
    exportedAt,
    application: value["application"],
  });
  if (!ChecksumPattern.test(checksum) || checksum !== expectedChecksum) {
    return err({ code: ApplicationImportErrorCode.ChecksumMismatch });
  }

  return ok(parseApplicationState(value["application"]));
};

const malformedPayload = (): Result<never, ApplicationImportError> =>
  err({ code: ApplicationImportErrorCode.MalformedPayload });

const createChecksum = (value: unknown): string =>
  createHash(ChecksumAlgorithm)
    .update(createCanonicalJson(value))
    .digest(ChecksumEncoding);

const createCanonicalJson = (value: unknown): string => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(createCanonicalJson).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${createCanonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return "null";
};

const readLegacyApplicationPayload = (
  value: unknown,
): Record<string, unknown> | undefined =>
  isRecord(value) && isRecord(value["workspace"])
    ? value["workspace"]
    : undefined;

const isImportApplicationPayload = (value: Record<string, unknown>): boolean =>
  isApplicationStatePayload(value) ||
  (isRecord(value["workspace"]) &&
    isApplicationStatePayload(value["workspace"]));

const isApplicationStatePayload = (value: Record<string, unknown>): boolean =>
  typeof value["version"] === "number" &&
  typeof value["revision"] === "number" &&
  typeof value["createdAt"] === "string" &&
  typeof value["updatedAt"] === "string" &&
  isSettingsPayload(value["settings"]) &&
  isProviderSelectionsPayload(value["providerSelections"]) &&
  isProviderSettingsPayload(value["providerSettings"]) &&
  isExternalApiKeysPayload(value["externalApiKeys"]) &&
  isWorkflowCatalogPayload(value["workflows"]);

const isSettingsPayload = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["profileId"] === "string" &&
  isRecordArray(value["providerProfiles"]) &&
  isWorkflowLimitsPayload(value["workflowLimits"]) &&
  isNotificationsPayload(value["notifications"]);

const isWorkflowLimitsPayload = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["infiniteLoops"] === "boolean" &&
  typeof value["maxLoops"] === "number" &&
  typeof value["externalCalls"] === "boolean";

const isNotificationsPayload = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["soundEnabled"] === "boolean" &&
  typeof value["webhookUrl"] === "string";

const isProviderSelectionsPayload = (value: unknown): boolean =>
  isRecordArray(value) &&
  value.every(
    (selection) =>
      typeof selection["profileId"] === "string" &&
      typeof selection["providerId"] === "string" &&
      typeof selection["updatedAt"] === "string",
  );

const isProviderSettingsPayload = (value: unknown): boolean =>
  isRecordArray(value) &&
  value.every(
    (settings) =>
      typeof settings["profileId"] === "string" &&
      typeof settings["providerId"] === "string" &&
      typeof settings["updatedAt"] === "string" &&
      isRecord(settings["config"]),
  );

const isExternalApiKeysPayload = (value: unknown): boolean =>
  isRecordArray(value) &&
  value.every(
    (key) =>
      typeof key["id"] === "string" &&
      typeof key["name"] === "string" &&
      typeof key["secretHash"] === "string" &&
      typeof key["createdAt"] === "string" &&
      isExternalApiKeyScopePayload(key["scope"]),
  );

const isExternalApiKeyScopePayload = (value: unknown): boolean =>
  isRecord(value) &&
  (value["kind"] === "all_workflows" ||
    (value["kind"] === "selected_workflows" &&
      isStringArray(value["workflowIds"])));

const isWorkflowCatalogPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isEntityArray(value["definitions"], isWorkflowDefinitionPayload) &&
  isEntityArray(value["definitionVersions"], isWorkflowVersionPayload) &&
  isEntityArray(value["assets"], isWorkflowAssetPayload) &&
  isEntityArray(value["assetUsages"], isWorkflowAssetUsagePayload) &&
  isEntityArray(value["executions"], isWorkflowExecutionPayload);

const isWorkflowDefinitionPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isNonEmptyString(value["name"]) &&
  isString(value["description"]) &&
  isEnumValue(value["status"], WorkflowRecordStatus) &&
  isNonNegativeNumber(value["version"]) &&
  isNonEmptyString(value["createdAt"]) &&
  isNonEmptyString(value["updatedAt"]) &&
  isWorkflowTriggerPayload(value["trigger"]) &&
  isWorkflowViewportPayload(value["viewport"]) &&
  isEntityArray(value["nodes"], isWorkflowNodePayload) &&
  isEntityArray(value["edges"], isWorkflowEdgePayload) &&
  isWorkflowExecutionPolicyPayload(value["executionPolicy"]) &&
  isWorkflowContextPolicyPayload(value["defaultContextPolicy"]) &&
  isStringArray(value["tags"]) &&
  isOptionalRuntimeSettingsOverride(value["runtimeSettingsOverride"]);

const isWorkflowVersionPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isNonEmptyString(value["workflowId"]) &&
  isNonNegativeNumber(value["version"]) &&
  isNonEmptyString(value["createdAt"]) &&
  isRecord(value["snapshot"]) &&
  isWorkflowDefinitionPayload(value["snapshot"]) &&
  isOptionalString(value["checksum"]) &&
  isOptionalString(value["author"]) &&
  isOptionalString(value["note"]) &&
  isOptionalStringArray(value["tags"]) &&
  isOptionalOneOf(value["changeType"], WorkflowVersionChangeTypes) &&
  isOptionalString(value["changeSummary"]);

const isWorkflowAssetPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isEnumValue(value["kind"], WorkflowAssetKind) &&
  isWorkflowAssetScopePayload(value["scope"]) &&
  isNonEmptyString(value["name"]) &&
  isNonEmptyString(value["slug"]) &&
  isString(value["description"]) &&
  isString(value["body"]) &&
  isNonEmptyString(value["language"]) &&
  isNonNegativeNumber(value["version"]) &&
  isStringArray(value["tags"]) &&
  isOptionalWorkflowAssetExecutionPolicy(value["executionPolicy"]) &&
  isOptionalJsonOutputContract(value["outputContract"]) &&
  isOptionalGuardrailDefinition(value["guardrail"]) &&
  isNonEmptyString(value["createdAt"]) &&
  isNonEmptyString(value["updatedAt"]) &&
  isOptionalString(value["archivedAt"]);

const isWorkflowAssetUsagePayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["assetId"]) &&
  isNonEmptyString(value["workflowId"]) &&
  isNonEmptyString(value["nodeId"]) &&
  isEnumValue(value["nodeKind"], WorkflowNodeKind) &&
  isEnumValue(value["role"], WorkflowAssetUsageRole) &&
  isNonEmptyString(value["createdAt"]);

const isWorkflowExecutionPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isNonEmptyString(value["workflowId"]) &&
  isEnumValue(value["triggerKind"], WorkflowTriggerKind) &&
  isEnumValue(value["status"], WorkflowExecutionStatus) &&
  isNonEmptyString(value["startedAt"]) &&
  isOptionalString(value["finishedAt"]) &&
  isOptionalNonNegativeNumber(value["durationMs"]) &&
  isNonNegativeNumber(value["warningsCount"]) &&
  isNonNegativeNumber(value["errorsCount"]) &&
  isWorkflowUsageTotalsPayload(value["totals"]) &&
  isNonEmptyString(value["contextSessionId"]) &&
  isEntityArray(value["nodeRuns"], isWorkflowNodeExecutionPayload);

const isWorkflowTriggerPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isEnumValue(value["kind"], WorkflowTriggerKind) &&
  typeof value["enabled"] === "boolean" &&
  isRecord(value["config"]);

const isWorkflowViewportPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isFiniteNumber(value["x"]) &&
  isFiniteNumber(value["y"]) &&
  isFiniteNumber(value["zoom"]);

const isWorkflowExecutionPolicyPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isNonNegativeNumber(value["maxNodeRetries"]) &&
  typeof value["allowManualCheckpointResume"] === "boolean";

const isWorkflowContextPolicyPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value["language"]) &&
  isNonNegativeNumber(value["carryMessagesLimit"]) &&
  isNonNegativeNumber(value["carryArtifactLimit"]);

const isWorkflowNodePayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isEnumValue(value["kind"], WorkflowNodeKind) &&
  isNonEmptyString(value["label"]) &&
  isWorkflowNodePositionPayload(value["position"]) &&
  isFiniteNumber(value["width"]) &&
  typeof value["collapsed"] === "boolean" &&
  isWorkflowNodeConfigPayload(value["config"]) &&
  isEntityArray(value["inputPorts"], isWorkflowPortPayload) &&
  isEntityArray(value["outputPorts"], isWorkflowPortPayload) &&
  isEntityArray(value["attachedGuardrails"], isAttachedGuardrailPayload) &&
  isOptionalJsonOutputContract(value["outputContract"]);

const isWorkflowNodeConfigPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isOptionalString(value["assetId"]) &&
  isOptionalEnumValue(value["role"], WorkflowNodeRole) &&
  isOptionalWorkflowProviderSelection(value["provider"]) &&
  isOptionalString(value["prompt"]) &&
  isOptionalPinnedTestOutput(value["pinnedTestOutput"]) &&
  isOptionalEntityArray(
    value["pinnedTestOutputs"],
    isPinnedTestOutputPayload,
  ) &&
  isOptionalString(value["defaultPinnedTestOutputId"]) &&
  isOptionalReviewPolicy(value["reviewPolicy"]);

const isWorkflowProviderSelectionPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value["providerId"]) &&
  isNonEmptyString(value["modelId"]) &&
  isEnumValue(value["reasoningLevel"], WorkflowReasoningLevel) &&
  isFiniteNumber(value["temperature"]) &&
  isEnumValue(value["verbosity"], WorkflowVerbosity) &&
  isOptionalOneOf(value["testStatus"], WorkflowProviderTestStatuses) &&
  isOptionalString(value["testedAt"]);

const isPinnedTestOutputPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isOptionalString(value["name"]) &&
  hasOwn(value, "outputSnapshot") &&
  isNonEmptyString(value["updatedAt"]);

const isOptionalPinnedTestOutput = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) &&
    hasOwn(value, "outputSnapshot") &&
    isNonEmptyString(value["updatedAt"]));

const isOptionalReviewPolicy = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) && typeof value["requireHumanDecision"] === "boolean");

const isWorkflowNodePositionPayload = (value: unknown): boolean =>
  isRecord(value) && isFiniteNumber(value["x"]) && isFiniteNumber(value["y"]);

const isWorkflowPortPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isNonEmptyString(value["name"]) &&
  typeof value["acceptsMany"] === "boolean";

const isAttachedGuardrailPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["assetId"]) &&
  isNonNegativeNumber(value["order"]) &&
  typeof value["enabled"] === "boolean";

const isWorkflowEdgePayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isNonEmptyString(value["sourceNodeId"]) &&
  isNonEmptyString(value["sourcePortId"]) &&
  isNonEmptyString(value["targetNodeId"]) &&
  isNonEmptyString(value["targetPortId"]) &&
  isWorkflowEdgeMappingPayload(value["mapping"]);

const isWorkflowEdgeMappingPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isOneOf(value["mode"], WorkflowEdgeMappingModes) &&
  isEntityArray(value["entries"], isWorkflowEdgeMappingEntryPayload);

const isWorkflowEdgeMappingEntryPayload = (
  value: Record<string, unknown>,
): boolean =>
  isNonEmptyString(value["targetPath"]) &&
  isWorkflowEdgeMappingSourcePayload(value["source"]);

const isWorkflowEdgeMappingSourcePayload = (value: unknown): boolean =>
  isRecord(value) &&
  isOneOf(value["kind"], WorkflowEdgeMappingSourceKinds) &&
  isOptionalString(value["nodeId"]) &&
  isOptionalString(value["path"]) &&
  isOptionalJsonPrimitive(value["value"]);

const isWorkflowUsageTotalsPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isNonNegativeNumber(value["promptTokens"]) &&
  isNonNegativeNumber(value["completionTokens"]) &&
  isNonNegativeNumber(value["totalTokens"]) &&
  isFiniteNumber(value["estimatedCostEur"]) &&
  isOptionalOneOf(value["estimatedCostSourceCurrency"], SourceCurrencies) &&
  isOptionalFiniteNumber(value["estimatedCostSourceValue"]) &&
  isOptionalFiniteNumber(value["exchangeRateEur"]) &&
  isNonNegativeNumber(value["latencyMs"]);

const isWorkflowNodeExecutionPayload = (
  value: Record<string, unknown>,
): boolean =>
  isNonEmptyString(value["id"]) &&
  isNonEmptyString(value["nodeId"]) &&
  isEnumValue(value["nodeKind"], WorkflowNodeKind) &&
  isOneOf(value["status"], WorkflowNodeExecutionStatuses) &&
  isNonEmptyString(value["startedAt"]) &&
  isOptionalString(value["finishedAt"]) &&
  isOptionalNonNegativeNumber(value["durationMs"]) &&
  isOptionalString(value["providerId"]) &&
  isOptionalString(value["modelId"]) &&
  isOptionalEnumValue(value["reasoningLevel"], WorkflowReasoningLevel) &&
  isOptionalFiniteNumber(value["temperature"]) &&
  isOptionalEnumValue(value["verbosity"], WorkflowVerbosity) &&
  isOptionalWorkflowUsageTotals(value["usage"]) &&
  isEntityArray(value["alerts"], isWorkflowAlertPayload) &&
  isEntityArray(value["guardrailFindings"], isWorkflowGuardrailFindingPayload);

const isWorkflowAlertPayload = (value: Record<string, unknown>): boolean =>
  isNonEmptyString(value["id"]) &&
  isOneOf(value["level"], WorkflowAlertLevels) &&
  isOneOf(value["source"], WorkflowAlertSources) &&
  isNonEmptyString(value["message"]) &&
  isNonEmptyString(value["createdAt"]);

const isWorkflowGuardrailFindingPayload = (
  value: Record<string, unknown>,
): boolean =>
  isNonEmptyString(value["guardrailAssetId"]) &&
  isNonEmptyString(value["nodeId"]) &&
  isEnumValue(value["severity"], WorkflowGuardrailSeverity) &&
  isNonEmptyString(value["message"]);

const isOptionalRuntimeSettingsOverride = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) &&
    isOptionalBoolean(value["infiniteLoops"]) &&
    isOptionalNonNegativeNumber(value["maxLoops"]) &&
    isOptionalBoolean(value["externalCalls"]) &&
    isOptionalBoolean(value["soundEnabled"]) &&
    isOptionalString(value["webhookUrl"]));

const isOptionalWorkflowAssetExecutionPolicy = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) &&
    isNonNegativeNumber(value["maxRetries"]) &&
    isNonNegativeNumber(value["timeoutMs"]));

const isOptionalJsonOutputContract = (value: unknown): boolean =>
  value === undefined || isJsonOutputContractPayload(value);

const isJsonOutputContractPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value["id"]) &&
  isNonEmptyString(value["name"]) &&
  value["schemaVersion"] === 1 &&
  value["rootType"] === "object" &&
  isJsonSchemaNodePayload(value["schema"]) &&
  isOptionalString(value["sampleOutput"]);

const isJsonSchemaNodePayload = (value: unknown): boolean =>
  isRecord(value) &&
  isOneOf(value["type"], JsonSchemaNodeTypes) &&
  isOptionalString(value["title"]) &&
  isOptionalString(value["description"]) &&
  isOptionalStringArray(value["required"]) &&
  isOptionalJsonSchemaProperties(value["properties"]) &&
  isOptionalJsonSchemaNode(value["items"]) &&
  isOptionalStringArray(value["enum"]) &&
  isOptionalBoolean(value["nullable"]);

const isOptionalJsonSchemaProperties = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) && Object.values(value).every(isJsonSchemaNodePayload));

const isOptionalJsonSchemaNode = (value: unknown): boolean =>
  value === undefined || isJsonSchemaNodePayload(value);

const isOptionalGuardrailDefinition = (value: unknown): boolean =>
  value === undefined || isGuardrailDefinitionPayload(value);

const isGuardrailDefinitionPayload = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value["id"]) &&
  isEnumValue(value["severity"], WorkflowGuardrailSeverity) &&
  isEnumValue(value["operator"], WorkflowGuardrailOperator) &&
  isEntityArray(value["validations"], isGuardrailValidationPayload);

const isGuardrailValidationPayload = (
  value: Record<string, unknown>,
): boolean =>
  isNonEmptyString(value["id"]) &&
  isOneOf(value["kind"], GuardrailValidationKinds) &&
  isOneOf(value["target"], GuardrailValidationTargets) &&
  isOptionalString(value["path"]) &&
  isOptionalJsonPrimitive(value["value"]) &&
  isNonEmptyString(value["message"]);

const isWorkflowAssetScopePayload = (value: unknown): boolean =>
  value === "global" || value === "workspace";

const WorkflowVersionChangeTypes = [
  "manual",
  "autosave",
  "restore",
  "clone",
  "import",
] as const;
const WorkflowProviderTestStatuses = ["unknown", "passed", "failed"] as const;
const WorkflowEdgeMappingModes = ["passthrough", "object", "template"] as const;
const WorkflowEdgeMappingSourceKinds = [
  "node_output",
  "last_node_output",
  "accumulated_outputs",
  "context_value",
  "literal",
] as const;
const SourceCurrencies = ["USD", "EUR"] as const;
const WorkflowNodeExecutionStatuses = [
  "running",
  "completed",
  "failed",
  "skipped",
  "awaiting_review",
] as const;
const WorkflowAlertLevels = ["info", "success", "warn", "error"] as const;
const WorkflowAlertSources = [
  "system",
  "guardrail",
  "provider",
  "checkpoint",
] as const;
const JsonSchemaNodeTypes = [
  "object",
  "string",
  "number",
  "integer",
  "boolean",
  "array",
] as const;
const GuardrailValidationKinds = [
  "json_schema",
  "regex",
  "contains",
  "not_contains",
  "field_exists",
  "field_equals",
  "number_gte",
  "number_lte",
] as const;
const GuardrailValidationTargets = [
  "input",
  "output",
  "context",
  "metadata",
] as const;

const isEntityArray = (
  value: unknown,
  isEntity: (value: Record<string, unknown>) => boolean,
): boolean => isRecordArray(value) && value.every(isEntity);

const isNonEmptyString = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

const isString = (value: unknown): boolean => typeof value === "string";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNonNegativeNumber = (value: unknown): boolean =>
  isFiniteNumber(value) && value >= 0;

const isEnumValue = <TValues extends Record<string, string>>(
  value: unknown,
  values: TValues,
): boolean =>
  typeof value === "string" &&
  Object.values(values).some((item) => item === value);

const isRecordArray = (
  value: unknown,
): value is ReadonlyArray<Record<string, unknown>> =>
  Array.isArray(value) && value.every(isRecord);

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isOptionalString = (value: unknown): boolean =>
  value === undefined || isString(value);

const isOptionalStringArray = (value: unknown): boolean =>
  value === undefined || isStringArray(value);

const isOptionalBoolean = (value: unknown): boolean =>
  value === undefined || typeof value === "boolean";

const isOptionalFiniteNumber = (value: unknown): boolean =>
  value === undefined || isFiniteNumber(value);

const isOptionalNonNegativeNumber = (value: unknown): boolean =>
  value === undefined || isNonNegativeNumber(value);

const isOptionalJsonPrimitive = (value: unknown): boolean =>
  value === undefined || isJsonPrimitive(value);

const isJsonPrimitive = (value: unknown): boolean =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  isFiniteNumber(value);

const isOptionalEnumValue = <TValues extends Record<string, string>>(
  value: unknown,
  values: TValues,
): boolean => value === undefined || isEnumValue(value, values);

const isOptionalOneOf = (
  value: unknown,
  values: ReadonlyArray<string>,
): boolean => value === undefined || isOneOf(value, values);

const isOneOf = (value: unknown, values: ReadonlyArray<string>): boolean =>
  typeof value === "string" && values.includes(value);

const isOptionalWorkflowProviderSelection = (value: unknown): boolean =>
  value === undefined || isWorkflowProviderSelectionPayload(value);

const isOptionalWorkflowUsageTotals = (value: unknown): boolean =>
  value === undefined || isWorkflowUsageTotalsPayload(value);

const isOptionalEntityArray = (
  value: unknown,
  isEntity: (value: Record<string, unknown>) => boolean,
): boolean => value === undefined || isEntityArray(value, isEntity);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(value, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
