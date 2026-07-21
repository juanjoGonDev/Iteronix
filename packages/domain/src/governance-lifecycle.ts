import {
  parseRepairProposals,
  type RepairProposal,
} from "./governance-validation";

export const GovernanceLifecycleState = {
  Approved: "approved",
  AwaitingUserApproval: "awaiting-user-approval",
  Cancelled: "cancelled",
  Draft: "draft",
  Executing: "executing",
  Failed: "failed",
  Planning: "planning",
  Rejected: "rejected",
  Reviewing: "reviewing",
  Verifying: "verifying",
} as const;

export type GovernanceLifecycleState =
  (typeof GovernanceLifecycleState)[keyof typeof GovernanceLifecycleState];

export const GovernanceTransitionKind = {
  Approve: "approve",
  AutoRepair: "auto-repair",
  AwaitUserApproval: "await-user-approval",
  Cancel: "cancel",
  Continue: "continue",
  Fail: "fail",
  RejectWithFeedback: "reject-with-feedback",
  StartExecuting: "start-executing",
  StartPlanning: "start-planning",
  StartReviewing: "start-reviewing",
  StartVerifying: "start-verifying",
} as const;

export type GovernanceTransitionKind =
  (typeof GovernanceTransitionKind)[keyof typeof GovernanceTransitionKind];

export const GovernanceActorKind = {
  System: "system",
  User: "user",
} as const;

export type GovernanceActorKind =
  (typeof GovernanceActorKind)[keyof typeof GovernanceActorKind];

export type GovernanceFingerprints = {
  scope: string;
  evidence: string;
};

export type GovernanceBudgetLimits = {
  execution: number;
  repair: number;
  review: number;
};

export type GovernanceBudgetUsage = GovernanceBudgetLimits;

export type GovernanceActor = {
  kind: GovernanceActorKind;
  id: string;
};

export type GovernanceFailureEvidence = {
  classification: "retryable" | "non-retryable";
  before: string;
  after: string;
};

export type GovernanceTransition = {
  id: string;
  kind: GovernanceTransitionKind;
  from: GovernanceLifecycleState;
  to: GovernanceLifecycleState;
  actor: GovernanceActor;
  reason: string;
  timestamp: string;
  fingerprints: GovernanceFingerprints;
  budgets: GovernanceBudgetUsage;
  failure?: GovernanceFailureEvidence;
};

export type GovernanceAgentExecutionRecord = {
  id: string;
  lifecycleId: string;
  agentId: string;
  pluginId: string;
  skillId: string;
  skillVersion: number;
  toolId: string;
  inputFingerprint: string;
  outputFingerprint: string;
  artifactFingerprint: string;
  responseFingerprint: string;
  mcpAssetId?: string;
  mcpServerId?: string;
  mcpToolVersion?: string;
  pluginAssetId?: string;
  pluginVersion?: string;
  pluginFingerprint?: string;
  pluginIsolation?: "process";
  pluginAuditAction?: string;
  timestamp: string;
};

export type GovernanceRetrievalExecutionRecord = {
  assetId: string;
  scope: string;
  workflowId?: string;
  documentCount: number;
  provenanceFingerprint: string;
  redacted: boolean;
  timestamp: string;
};

export type GovernancePromptExecutionRecord = {
  id: string;
  lifecycleId: string;
  assetId: string;
  version: number;
  bindings: Readonly<Record<string, unknown>>;
  renderedFingerprint: string;
  validation: "passed";
  timestamp: string;
};

export type GovernanceLifecycle = {
  id: string;
  workflowId: string;
  state: GovernanceLifecycleState;
  fingerprints: GovernanceFingerprints;
  limits: GovernanceBudgetLimits;
  budgets: GovernanceBudgetUsage;
  transitions: ReadonlyArray<GovernanceTransition>;
  repairProposals: ReadonlyArray<RepairProposal>;
  agentExecutions: ReadonlyArray<GovernanceAgentExecutionRecord>;
  retrievalExecutions: ReadonlyArray<GovernanceRetrievalExecutionRecord>;
  promptExecutions: ReadonlyArray<GovernancePromptExecutionRecord>;
  userAuthorizedPasses: number;
};

export const createGovernanceLifecycle = (input: {
  id: string;
  workflowId: string;
  fingerprints: GovernanceFingerprints;
  limits: GovernanceBudgetLimits;
  now: string;
  priorLifecycles?: ReadonlyArray<GovernanceLifecycle>;
}): GovernanceLifecycle => {
  assertNonEmpty(input.id, "Lifecycle id is required");
  assertNonEmpty(input.workflowId, "Workflow id is required");
  assertFingerprints(input.fingerprints);
  assertBudgetLimits(input.limits);
  if (input.priorLifecycles?.some((lifecycle) => lifecycle.id === input.id)) {
    throw new Error("Governance lifecycle id already exists.");
  }
  if (
    input.priorLifecycles?.some(
      (lifecycle) =>
        lifecycle.workflowId === input.workflowId &&
        lifecycle.state === GovernanceLifecycleState.Approved &&
        hasSameFingerprints(lifecycle.fingerprints, input.fingerprints),
    )
  ) {
    throw new Error(
      "Approved fingerprints require a changed scope or evidence.",
    );
  }
  return {
    id: input.id,
    workflowId: input.workflowId,
    state: GovernanceLifecycleState.Draft,
    fingerprints: copyFingerprints(input.fingerprints),
    limits: copyBudgets(input.limits),
    budgets: createEmptyBudgets(),
    transitions: [],
    repairProposals: [],
    agentExecutions: [],
    retrievalExecutions: [],
    promptExecutions: [],
    userAuthorizedPasses: 0,
  };
};

export const recordGovernancePromptExecution = (
  lifecycle: GovernanceLifecycle,
  input: GovernancePromptExecutionRecord,
): GovernanceLifecycle => {
  if (lifecycle.state !== GovernanceLifecycleState.Executing) {
    throw new Error("Prompt executions require an executing lifecycle.");
  }
  if (
    !input.id.trim() ||
    input.lifecycleId !== lifecycle.id ||
    !input.assetId.trim() ||
    !Number.isInteger(input.version) ||
    input.version < 1 ||
    !input.renderedFingerprint.trim() ||
    input.validation !== "passed" ||
    !input.timestamp.trim()
  ) {
    throw new Error("Prompt execution provenance is invalid.");
  }
  if (lifecycle.promptExecutions.some((record) => record.id === input.id)) {
    throw new Error("Governance prompt execution id already exists.");
  }
  return {
    ...lifecycle,
    promptExecutions: [
      ...lifecycle.promptExecutions,
      { ...input, bindings: { ...input.bindings } },
    ],
  };
};

export const recordGovernanceAgentExecution = (
  lifecycle: GovernanceLifecycle,
  input: GovernanceAgentExecutionRecord,
): GovernanceLifecycle => {
  if (lifecycle.state !== GovernanceLifecycleState.Executing) {
    throw new Error("Agent executions require an executing lifecycle.");
  }
  assertAgentExecutionRecord(input, lifecycle.id);
  if (lifecycle.agentExecutions.some((record) => record.id === input.id)) {
    throw new Error("Governance agent execution id already exists.");
  }
  return {
    ...lifecycle,
    agentExecutions: [...lifecycle.agentExecutions, { ...input }],
  };
};

export const recordGovernanceRetrievalExecution = (
  lifecycle: GovernanceLifecycle,
  input: GovernanceRetrievalExecutionRecord,
): GovernanceLifecycle => {
  if (lifecycle.state !== GovernanceLifecycleState.Executing) {
    throw new Error("Retrieval executions require an executing lifecycle.");
  }
  assertRetrievalExecutionRecord(input);
  return {
    ...lifecycle,
    retrievalExecutions: [...lifecycle.retrievalExecutions, { ...input }],
  };
};

export const transitionGovernanceLifecycle = (
  lifecycle: GovernanceLifecycle,
  input: {
    kind: GovernanceTransitionKind;
    actor: GovernanceActor;
    reason: string;
    now: string;
    failure?: GovernanceFailureEvidence;
  },
): GovernanceLifecycle => {
  assertNonEmpty(input.actor.id, "Governance actor id is required");
  assertNonEmpty(input.reason, "Governance transition reason is required");
  const transition = readTransition(lifecycle.state, input.kind);
  assertActor(input.actor, input.kind);
  assertFailureEvidence(input);
  const budgets = readNextBudgets(lifecycle, input.kind);
  const record: GovernanceTransition = {
    id: `${lifecycle.id}:${(lifecycle.transitions.length + 1).toString()}`,
    kind: input.kind,
    from: lifecycle.state,
    to: transition.to,
    actor: { ...input.actor },
    reason: input.reason,
    timestamp: input.now,
    fingerprints: copyFingerprints(lifecycle.fingerprints),
    budgets,
    ...(input.failure ? { failure: { ...input.failure } } : {}),
  };
  return {
    ...lifecycle,
    state: transition.to,
    budgets,
    transitions: [...lifecycle.transitions, record],
    userAuthorizedPasses:
      lifecycle.userAuthorizedPasses +
      (input.kind === GovernanceTransitionKind.Continue ? 1 : 0),
  };
};

export const parseGovernanceLifecycles = (
  value: unknown,
): ReadonlyArray<GovernanceLifecycle> =>
  Array.isArray(value)
    ? value.flatMap((candidate) => {
        const parsed = parseGovernanceLifecycle(candidate);
        return parsed ? [parsed] : [];
      })
    : [];

const parseGovernanceLifecycle = (
  value: unknown,
): GovernanceLifecycle | undefined => {
  if (!isRecord(value) || !isLifecycleState(value["state"])) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  const workflowId = readNonEmptyString(value["workflowId"]);
  const fingerprints = parseFingerprints(value["fingerprints"]);
  const limits = parseBudgets(value["limits"]);
  const budgets = parseBudgets(value["budgets"]);
  const transitions = parseTransitions(value["transitions"]);
  const repairProposals =
    value["repairProposals"] === undefined
      ? []
      : parseRepairProposals(value["repairProposals"]);
  const agentExecutions =
    value["agentExecutions"] === undefined
      ? []
      : parseAgentExecutions(value["agentExecutions"]);
  const retrievalExecutions =
    value["retrievalExecutions"] === undefined
      ? []
      : parseRetrievalExecutions(value["retrievalExecutions"]);
  const promptExecutions =
    value["promptExecutions"] === undefined
      ? []
      : parsePromptExecutions(value["promptExecutions"]);
  const userAuthorizedPasses = value["userAuthorizedPasses"];
  if (
    !id ||
    !workflowId ||
    !fingerprints ||
    !limits ||
    !budgets ||
    !transitions ||
    !repairProposals ||
    !agentExecutions ||
    !retrievalExecutions ||
    !promptExecutions ||
    !isNonNegativeInteger(userAuthorizedPasses)
  ) {
    return undefined;
  }
  const lifecycle = {
    id,
    workflowId,
    state: value["state"],
    fingerprints,
    limits,
    budgets,
    transitions,
    repairProposals,
    agentExecutions,
    retrievalExecutions,
    promptExecutions,
    userAuthorizedPasses,
  };
  return hasValidTransitionHistory(lifecycle) &&
    hasValidPromptExecutionHistory(lifecycle)
    ? lifecycle
    : undefined;
};

const hasValidPromptExecutionHistory = (
  lifecycle: GovernanceLifecycle,
): boolean => {
  const ids = new Set<string>();
  const executionTransitions = lifecycle.transitions.filter(
    (transition) => transition.kind === GovernanceTransitionKind.StartExecuting,
  );
  return lifecycle.promptExecutions.every((record) => {
    if (ids.has(record.id) || record.lifecycleId !== lifecycle.id) {
      return false;
    }
    ids.add(record.id);
    const attempt = readPromptExecutionAttempt(record.id, lifecycle.id);
    if (
      attempt === undefined ||
      attempt < 1 ||
      attempt > executionTransitions.length
    ) {
      return false;
    }
    const start = executionTransitions[attempt - 1];
    if (!start || record.timestamp < start.timestamp) {
      return false;
    }
    const next = executionTransitions[attempt];
    return !next || record.timestamp < next.timestamp;
  });
};

const readPromptExecutionAttempt = (
  id: string,
  lifecycleId: string,
): number | undefined => {
  const prefix = `${lifecycleId}:prompt:`;
  if (!id.startsWith(prefix)) {
    return undefined;
  }
  const [attempt, index] = id.slice(prefix.length).split(":");
  return attempt !== undefined &&
    index !== undefined &&
    /^\d+$/u.test(attempt) &&
    /^\d+$/u.test(index) &&
    Number.isSafeInteger(Number(attempt)) &&
    Number.isSafeInteger(Number(index))
    ? Number(attempt)
    : undefined;
};

const hasValidTransitionHistory = (lifecycle: GovernanceLifecycle): boolean => {
  let replayed = createGovernanceLifecycle({
    id: lifecycle.id,
    workflowId: lifecycle.workflowId,
    fingerprints: lifecycle.fingerprints,
    limits: lifecycle.limits,
    now: "replay",
  });
  for (const transition of lifecycle.transitions) {
    try {
      replayed = transitionGovernanceLifecycle(replayed, {
        kind: transition.kind,
        actor: transition.actor,
        reason: transition.reason,
        now: transition.timestamp,
        ...(transition.failure ? { failure: transition.failure } : {}),
      });
    } catch {
      return false;
    }
    if (!hasSameTransition(replayed.transitions.at(-1), transition)) {
      return false;
    }
  }
  return (
    replayed.state === lifecycle.state &&
    hasSameFingerprints(replayed.fingerprints, lifecycle.fingerprints) &&
    hasSameBudgets(replayed.budgets, lifecycle.budgets) &&
    replayed.userAuthorizedPasses === lifecycle.userAuthorizedPasses &&
    hasValidRepairProposals(lifecycle) &&
    hasValidAgentExecutions(lifecycle) &&
    hasValidRetrievalExecutions(lifecycle)
  );
};

const hasValidAgentExecutions = (lifecycle: GovernanceLifecycle): boolean =>
  lifecycle.agentExecutions.every((record) => {
    try {
      assertAgentExecutionRecord(record, lifecycle.id);
      return lifecycle.transitions.some(
        (transition) =>
          transition.kind === GovernanceTransitionKind.StartExecuting &&
          transition.to === GovernanceLifecycleState.Executing,
      );
    } catch {
      return false;
    }
  }) &&
  new Set(lifecycle.agentExecutions.map((record) => record.id)).size ===
    lifecycle.agentExecutions.length;

const hasValidRepairProposals = (lifecycle: GovernanceLifecycle): boolean =>
  lifecycle.repairProposals.every((proposal) =>
    lifecycle.transitions.some(
      (transition) =>
        transition.kind === GovernanceTransitionKind.AutoRepair &&
        transition.failure?.classification === "retryable" &&
        transition.failure.before === proposal.failureEvidence &&
        transition.failure.after === proposal.outputFingerprint &&
        proposal.lifecycleId === lifecycle.id,
    ),
  );

const hasSameTransition = (
  left: GovernanceTransition | undefined,
  right: GovernanceTransition,
): boolean =>
  left !== undefined &&
  left.id === right.id &&
  left.kind === right.kind &&
  left.from === right.from &&
  left.to === right.to &&
  left.actor.kind === right.actor.kind &&
  left.actor.id === right.actor.id &&
  left.reason === right.reason &&
  left.timestamp === right.timestamp &&
  hasSameFingerprints(left.fingerprints, right.fingerprints) &&
  hasSameBudgets(left.budgets, right.budgets) &&
  hasSameFailure(left.failure, right.failure);

const hasSameFailure = (
  left: GovernanceFailureEvidence | undefined,
  right: GovernanceFailureEvidence | undefined,
): boolean =>
  left === undefined && right === undefined
    ? true
    : left !== undefined &&
      right !== undefined &&
      left.classification === right.classification &&
      left.before === right.before &&
      left.after === right.after;

const parseTransitions = (
  value: unknown,
): ReadonlyArray<GovernanceTransition> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = value.map(parseTransition);
  return parsed.every(
    (transition): transition is GovernanceTransition =>
      transition !== undefined,
  )
    ? parsed
    : undefined;
};

const parseAgentExecutions = (
  value: unknown,
): ReadonlyArray<GovernanceAgentExecutionRecord> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const records = value.map(parseAgentExecution);
  return records.every(
    (record): record is GovernanceAgentExecutionRecord => record !== undefined,
  )
    ? records
    : undefined;
};

const parseAgentExecution = (
  value: unknown,
): GovernanceAgentExecutionRecord | undefined => {
  if (!isRecord(value) || !isPositiveInteger(value["skillVersion"])) {
    return undefined;
  }
  const fields = [
    "id",
    "lifecycleId",
    "agentId",
    "pluginId",
    "skillId",
    "toolId",
    "inputFingerprint",
    "outputFingerprint",
    "artifactFingerprint",
    "responseFingerprint",
    "timestamp",
  ] as const;
  const parsed = Object.fromEntries(
    fields.map((field) => [field, readNonEmptyString(value[field])]),
  );
  if (fields.some((field) => !parsed[field])) {
    return undefined;
  }
  const mcpProvenance = readMcpProvenance(value);
  if (hasMcpProvenanceFields(value) && !mcpProvenance) {
    return undefined;
  }
  const pluginProvenance = readPluginProvenance(value);
  if (hasPluginProvenanceFields(value) && !pluginProvenance) {
    return undefined;
  }
  return {
    id: parsed["id"]!,
    lifecycleId: parsed["lifecycleId"]!,
    agentId: parsed["agentId"]!,
    pluginId: parsed["pluginId"]!,
    skillId: parsed["skillId"]!,
    skillVersion: value["skillVersion"],
    toolId: parsed["toolId"]!,
    inputFingerprint: parsed["inputFingerprint"]!,
    outputFingerprint: parsed["outputFingerprint"]!,
    artifactFingerprint: parsed["artifactFingerprint"]!,
    responseFingerprint: parsed["responseFingerprint"]!,
    ...(mcpProvenance ?? {}),
    ...(pluginProvenance ?? {}),
    timestamp: parsed["timestamp"]!,
  };
};

const hasPluginProvenanceFields = (value: Record<string, unknown>): boolean =>
  value["pluginAssetId"] !== undefined ||
  value["pluginVersion"] !== undefined ||
  value["pluginFingerprint"] !== undefined ||
  value["pluginIsolation"] !== undefined ||
  value["pluginAuditAction"] !== undefined;

const readPluginProvenance = (
  value: Record<string, unknown>,
):
  | {
      pluginAssetId: string;
      pluginVersion: string;
      pluginFingerprint: string;
      pluginIsolation: "process";
      pluginAuditAction: string;
    }
  | undefined => {
  const pluginAssetId = readNonEmptyString(value["pluginAssetId"]);
  const pluginVersion = readNonEmptyString(value["pluginVersion"]);
  const pluginFingerprint = readNonEmptyString(value["pluginFingerprint"]);
  const pluginAuditAction = readNonEmptyString(value["pluginAuditAction"]);
  return pluginAssetId &&
    pluginVersion &&
    pluginFingerprint &&
    pluginAuditAction &&
    value["pluginIsolation"] === "process"
    ? {
        pluginAssetId,
        pluginVersion,
        pluginFingerprint,
        pluginIsolation: "process",
        pluginAuditAction,
      }
    : undefined;
};

const hasMcpProvenanceFields = (value: Record<string, unknown>): boolean =>
  value["mcpAssetId"] !== undefined ||
  value["mcpServerId"] !== undefined ||
  value["mcpToolVersion"] !== undefined;

const readMcpProvenance = (
  value: Record<string, unknown>,
):
  | {
      mcpAssetId: string;
      mcpServerId: string;
      mcpToolVersion: string;
    }
  | undefined => {
  const rawAssetId = value["mcpAssetId"];
  const rawServerId = value["mcpServerId"];
  const rawToolVersion = value["mcpToolVersion"];
  if (
    rawAssetId === undefined &&
    rawServerId === undefined &&
    rawToolVersion === undefined
  )
    return undefined;
  const assetId = readNonEmptyString(rawAssetId);
  const serverId = readNonEmptyString(rawServerId);
  const toolVersion = readNonEmptyString(rawToolVersion);
  if (!assetId || !serverId || !toolVersion) return undefined;
  return {
    mcpAssetId: assetId,
    mcpServerId: serverId,
    mcpToolVersion: toolVersion,
  };
};

const parseRetrievalExecutions = (
  value: unknown,
): ReadonlyArray<GovernanceRetrievalExecutionRecord> | undefined => {
  if (!Array.isArray(value)) return undefined;
  const fields = [
    "assetId",
    "scope",
    "provenanceFingerprint",
    "timestamp",
  ] as const;
  const retrievals = value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const parsed = Object.fromEntries(
      fields.map((field) => [field, readNonEmptyString(candidate[field])]),
    );
    const workflowId = readNonEmptyString(candidate["workflowId"]);
    return fields.every((field) => parsed[field]) &&
      isNonNegativeInteger(candidate["documentCount"]) &&
      typeof candidate["redacted"] === "boolean"
      ? [
          {
            assetId: parsed["assetId"]!,
            scope: parsed["scope"]!,
            ...(workflowId ? { workflowId } : {}),
            documentCount: candidate["documentCount"],
            provenanceFingerprint: parsed["provenanceFingerprint"]!,
            redacted: candidate["redacted"],
            timestamp: parsed["timestamp"]!,
          },
        ]
      : [];
  });
  return retrievals.length === value.length ? retrievals : undefined;
};

const parsePromptExecutions = (
  value: unknown,
): ReadonlyArray<GovernancePromptExecutionRecord> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const records = value.map(parsePromptExecution);
  return records.every(
    (record): record is GovernancePromptExecutionRecord => record !== undefined,
  )
    ? records
    : undefined;
};

const parsePromptExecution = (
  value: unknown,
): GovernancePromptExecutionRecord | undefined => {
  if (!isRecord(value) || !isPositiveInteger(value["version"])) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  const lifecycleId = readNonEmptyString(value["lifecycleId"]);
  const assetId = readNonEmptyString(value["assetId"]);
  const renderedFingerprint = readNonEmptyString(value["renderedFingerprint"]);
  const timestamp = readNonEmptyString(value["timestamp"]);
  const bindings = value["bindings"];
  if (
    !id ||
    !lifecycleId ||
    !assetId ||
    !renderedFingerprint ||
    !timestamp ||
    !isRecord(bindings) ||
    value["validation"] !== "passed"
  ) {
    return undefined;
  }
  return {
    id,
    lifecycleId,
    assetId,
    version: value["version"],
    bindings: { ...bindings },
    renderedFingerprint,
    validation: "passed",
    timestamp,
  };
};

const parseTransition = (value: unknown): GovernanceTransition | undefined => {
  if (
    !isRecord(value) ||
    !isTransitionKind(value["kind"]) ||
    !isLifecycleState(value["from"]) ||
    !isLifecycleState(value["to"])
  ) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  const reason = readNonEmptyString(value["reason"]);
  const timestamp = readNonEmptyString(value["timestamp"]);
  const actor = parseActor(value["actor"]);
  const fingerprints = parseFingerprints(value["fingerprints"]);
  const budgets = parseBudgets(value["budgets"]);
  const failure = parseFailure(value["failure"]);
  if (
    !id ||
    !reason ||
    !timestamp ||
    !actor ||
    !fingerprints ||
    !budgets ||
    (value["failure"] !== undefined && !failure)
  ) {
    return undefined;
  }
  return {
    id,
    kind: value["kind"],
    from: value["from"],
    to: value["to"],
    actor,
    reason,
    timestamp,
    fingerprints,
    budgets,
    ...(failure ? { failure } : {}),
  };
};

const parseActor = (value: unknown): GovernanceActor | undefined => {
  if (!isRecord(value) || !isActorKind(value["kind"])) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  return id ? { kind: value["kind"], id } : undefined;
};

const parseFingerprints = (
  value: unknown,
): GovernanceFingerprints | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const scope = readNonEmptyString(value["scope"]);
  const evidence = readNonEmptyString(value["evidence"]);
  return scope && evidence ? { scope, evidence } : undefined;
};

const parseBudgets = (value: unknown): GovernanceBudgetUsage | undefined => {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value["execution"]) ||
    !isNonNegativeInteger(value["repair"]) ||
    !isNonNegativeInteger(value["review"])
  ) {
    return undefined;
  }
  return {
    execution: value["execution"],
    repair: value["repair"],
    review: value["review"],
  };
};

const parseFailure = (
  value: unknown,
): GovernanceFailureEvidence | undefined => {
  if (
    !isRecord(value) ||
    (value["classification"] !== "retryable" &&
      value["classification"] !== "non-retryable")
  ) {
    return undefined;
  }
  const before = readNonEmptyString(value["before"]);
  const after = readNonEmptyString(value["after"]);
  return before && after
    ? { classification: value["classification"], before, after }
    : undefined;
};

const isLifecycleState = (value: unknown): value is GovernanceLifecycleState =>
  value === GovernanceLifecycleState.Approved ||
  value === GovernanceLifecycleState.AwaitingUserApproval ||
  value === GovernanceLifecycleState.Cancelled ||
  value === GovernanceLifecycleState.Draft ||
  value === GovernanceLifecycleState.Executing ||
  value === GovernanceLifecycleState.Failed ||
  value === GovernanceLifecycleState.Planning ||
  value === GovernanceLifecycleState.Rejected ||
  value === GovernanceLifecycleState.Reviewing ||
  value === GovernanceLifecycleState.Verifying;

const isTransitionKind = (value: unknown): value is GovernanceTransitionKind =>
  typeof value === "string" &&
  Object.values(GovernanceTransitionKind).some((kind) => kind === value);

const isActorKind = (value: unknown): value is GovernanceActorKind =>
  typeof value === "string" &&
  Object.values(GovernanceActorKind).some((kind) => kind === value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const readTransition = (
  from: GovernanceLifecycleState,
  kind: GovernanceTransitionKind,
): { to: GovernanceLifecycleState } => {
  const to = TransitionTargets[`${from}:${kind}`];
  if (!to) {
    throw new Error(`Illegal governance transition: ${from} -> ${kind}.`);
  }
  return { to };
};

const readNextBudgets = (
  lifecycle: GovernanceLifecycle,
  kind: GovernanceTransitionKind,
): GovernanceBudgetUsage => {
  const budgets = copyBudgets(lifecycle.budgets);
  if (kind === GovernanceTransitionKind.StartExecuting) {
    assertRemainingBudget(
      budgets.execution,
      lifecycle.limits.execution,
      "Execution",
    );
    budgets.execution += 1;
  }
  if (kind === GovernanceTransitionKind.AutoRepair) {
    assertRemainingBudget(budgets.repair, lifecycle.limits.repair, "Repair");
    budgets.repair += 1;
  }
  if (kind === GovernanceTransitionKind.StartReviewing) {
    assertRemainingBudget(budgets.review, lifecycle.limits.review, "Review");
    budgets.review += 1;
  }
  return budgets;
};

const assertActor = (
  actor: GovernanceActor,
  kind: GovernanceTransitionKind,
): void => {
  const requiresUser =
    kind === GovernanceTransitionKind.Approve ||
    kind === GovernanceTransitionKind.Continue ||
    kind === GovernanceTransitionKind.RejectWithFeedback;
  if (requiresUser && actor.kind !== GovernanceActorKind.User) {
    throw new Error(
      "User authorization is required for this governance control.",
    );
  }
  if (!requiresUser && actor.kind !== GovernanceActorKind.System) {
    throw new Error(
      "System actor is required for autonomous governance activity.",
    );
  }
};

const assertFailureEvidence = (input: {
  kind: GovernanceTransitionKind;
  failure?: GovernanceFailureEvidence;
}): void => {
  if (input.kind !== GovernanceTransitionKind.AutoRepair) {
    return;
  }
  if (
    input.failure?.classification !== "retryable" ||
    input.failure.before.trim().length === 0 ||
    input.failure.after.trim().length === 0
  ) {
    throw new Error(
      "Automatic repair requires a retryable failure with before/after evidence.",
    );
  }
};

const assertRemainingBudget = (
  consumed: number,
  limit: number,
  name: string,
): void => {
  if (consumed >= limit) {
    throw new Error(`${name} budget is exhausted.`);
  }
};

const assertBudgetLimits = (limits: GovernanceBudgetLimits): void => {
  for (const value of Object.values(limits)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        "Governance budget limits must be non-negative integers.",
      );
    }
  }
};

const assertFingerprints = (fingerprints: GovernanceFingerprints): void => {
  assertNonEmpty(fingerprints.scope, "Scope fingerprint is required");
  assertNonEmpty(fingerprints.evidence, "Evidence fingerprint is required");
};

const assertNonEmpty = (value: string, message: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`${message}.`);
  }
};

const assertAgentExecutionRecord = (
  input: GovernanceAgentExecutionRecord,
  lifecycleId: string,
): void => {
  if (input.lifecycleId !== lifecycleId) {
    throw new Error("Governance agent execution lifecycle does not match.");
  }
  if (!isPositiveInteger(input.skillVersion)) {
    throw new Error("Governance agent execution skill version is invalid.");
  }
  for (const value of [
    input.id,
    input.agentId,
    input.pluginId,
    input.skillId,
    input.toolId,
    input.inputFingerprint,
    input.outputFingerprint,
    input.artifactFingerprint,
    input.responseFingerprint,
    input.timestamp,
  ]) {
    assertNonEmpty(value, "Governance agent execution field is required");
  }
  const hasMcpProvenance =
    input.mcpAssetId !== undefined ||
    input.mcpServerId !== undefined ||
    input.mcpToolVersion !== undefined;
  if (
    hasMcpProvenance &&
    (!input.mcpAssetId || !input.mcpServerId || !input.mcpToolVersion)
  ) {
    throw new Error("Governance MCP provenance is incomplete.");
  }
  const hasPluginProvenance =
    input.pluginAssetId !== undefined ||
    input.pluginVersion !== undefined ||
    input.pluginFingerprint !== undefined ||
    input.pluginIsolation !== undefined ||
    input.pluginAuditAction !== undefined;
  if (
    hasPluginProvenance &&
    (!input.pluginAssetId ||
      !input.pluginVersion ||
      !input.pluginFingerprint ||
      input.pluginIsolation !== "process" ||
      !input.pluginAuditAction)
  ) {
    throw new Error("Governance plugin provenance is incomplete.");
  }
};

const hasValidRetrievalExecutions = (lifecycle: GovernanceLifecycle): boolean =>
  lifecycle.retrievalExecutions.every((record) => {
    try {
      assertRetrievalExecutionRecord(record);
      return lifecycle.transitions.some(
        (transition) =>
          transition.kind === GovernanceTransitionKind.StartExecuting &&
          transition.to === GovernanceLifecycleState.Executing,
      );
    } catch {
      return false;
    }
  });

const assertRetrievalExecutionRecord = (
  input: GovernanceRetrievalExecutionRecord,
): void => {
  for (const value of [
    input.assetId,
    input.scope,
    input.provenanceFingerprint,
    input.timestamp,
  ]) {
    assertNonEmpty(value, "Governance retrieval provenance is required");
  }
  if (input.workflowId)
    assertNonEmpty(
      input.workflowId,
      "Governance retrieval workflow is invalid",
    );
  if (!isNonNegativeInteger(input.documentCount)) {
    throw new Error("Governance retrieval document count is invalid.");
  }
};

const copyFingerprints = (
  fingerprints: GovernanceFingerprints,
): GovernanceFingerprints => ({ ...fingerprints });

const copyBudgets = (
  budgets: GovernanceBudgetUsage,
): GovernanceBudgetUsage => ({
  execution: budgets.execution,
  repair: budgets.repair,
  review: budgets.review,
});

const createEmptyBudgets = (): GovernanceBudgetUsage => ({
  execution: 0,
  repair: 0,
  review: 0,
});

const hasSameFingerprints = (
  left: GovernanceFingerprints,
  right: GovernanceFingerprints,
): boolean => left.scope === right.scope && left.evidence === right.evidence;

const hasSameBudgets = (
  left: GovernanceBudgetUsage,
  right: GovernanceBudgetUsage,
): boolean =>
  left.execution === right.execution &&
  left.repair === right.repair &&
  left.review === right.review;

const TransitionTargets: Readonly<Record<string, GovernanceLifecycleState>> = {
  [`${GovernanceLifecycleState.Draft}:${GovernanceTransitionKind.StartPlanning}`]:
    GovernanceLifecycleState.Planning,
  [`${GovernanceLifecycleState.Planning}:${GovernanceTransitionKind.StartExecuting}`]:
    GovernanceLifecycleState.Executing,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.StartVerifying}`]:
    GovernanceLifecycleState.Verifying,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.AutoRepair}`]:
    GovernanceLifecycleState.Planning,
  [`${GovernanceLifecycleState.Verifying}:${GovernanceTransitionKind.StartReviewing}`]:
    GovernanceLifecycleState.Reviewing,
  [`${GovernanceLifecycleState.Reviewing}:${GovernanceTransitionKind.AwaitUserApproval}`]:
    GovernanceLifecycleState.AwaitingUserApproval,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.Approve}`]:
    GovernanceLifecycleState.Approved,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.Continue}`]:
    GovernanceLifecycleState.Planning,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.RejectWithFeedback}`]:
    GovernanceLifecycleState.Rejected,
  [`${GovernanceLifecycleState.Draft}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Planning}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Verifying}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Reviewing}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Draft}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Planning}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Verifying}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Reviewing}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
};
