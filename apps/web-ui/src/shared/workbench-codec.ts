import type {
  Citation,
  ConfidenceScore,
  EvaluationRunResponse,
  EvidenceReport,
  MemorySearchResult,
  SkillRunResponse,
  UsageRecord,
  WorkflowRunResponse,
  WorkflowStep,
  WorkbenchEvalHistoryRecord,
  WorkbenchHistoryState,
  WorkbenchSkillHistoryRecord,
  WorkbenchRunHistoryRecord,
  WorkbenchWorkflowHistoryRecord,
  WorkflowReview
} from "./workbench-types.js";

export const parseSkillRunResponse = (value: unknown): SkillRunResponse => ({
  skill: parseSkillDescriptor(readRequiredRecord(value, "skillRun", "skill")),
  output: parseOutput(readRequiredRecord(value, "skillRun", "output")),
  citations: parseCitations(readRequiredArray(value, "skillRun", "citations")),
  confidence: parseConfidenceScore(readRequiredRecord(value, "skillRun", "confidence")),
  evidenceReport: parseEvidenceReport(readRequiredRecord(value, "skillRun", "evidenceReport")),
  traceId: readRequiredString(value, "skillRun", "traceId"),
  usage: parseUsageRecord(readRequiredRecord(value, "skillRun", "usage"))
});

export const parseWorkflowRunResponse = (value: unknown): WorkflowRunResponse => {
  const record = ensureRecord(value, "workflowRun");
  const status = readEnum(record, "workflowRun", "status", [
    "completed",
    "awaiting_approval"
  ]);
  const checkpointValue = readOptionalRecord(record, "checkpoint");
  const checkpoint =
    checkpointValue === undefined
      ? undefined
      : {
          stage: readEnum(checkpointValue, "workflowCheckpoint", "stage", ["reviewer"]),
          summary: readRequiredString(checkpointValue, "workflowCheckpoint", "summary")
        };

  return checkpoint === undefined
    ? {
        status,
        steps: parseWorkflowSteps(readRequiredArray(record, "workflowRun", "steps")),
        final: parseSkillRunResponse(readRequiredRecord(record, "workflowRun", "final"))
      }
    : {
        status,
        steps: parseWorkflowSteps(readRequiredArray(record, "workflowRun", "steps")),
        checkpoint,
        final: parseSkillRunResponse(readRequiredRecord(record, "workflowRun", "final"))
      };
};

export const parseEvaluationRunResponse = (value: unknown): EvaluationRunResponse => {
  const summary = readRequiredRecord(value, "evaluationRun", "summary");
  const results = readRequiredArray(value, "evaluationRun", "results");

  return {
    summary: {
      total: readRequiredNumber(summary, "evaluationSummary", "total"),
      passed: readRequiredNumber(summary, "evaluationSummary", "passed"),
      failed: readRequiredNumber(summary, "evaluationSummary", "failed")
    },
    results: results.map((item) => {
      const record = ensureRecord(item, "evaluationResult");
      return {
        caseId: readRequiredString(record, "evaluationResult", "caseId"),
        passed: readRequiredBoolean(record, "evaluationResult", "passed"),
        traceId: readRequiredString(record, "evaluationResult", "traceId"),
        reasons: parseStringArray(readRequiredArray(record, "evaluationResult", "reasons"), "evaluationReasons")
      };
    })
  };
};

export const parseMemorySearchResults = (value: unknown): ReadonlyArray<MemorySearchResult> => {
  const record = ensureRecord(value, "memoryResponse");
  const items = readRequiredArray(record, "memoryResponse", "items");
  return items.map((item) => parseMemorySearchResult(ensureRecord(item, "memoryItem")));
};

export const parseWorkbenchHistoryState = (value: unknown): WorkbenchHistoryState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      runs: [],
      evals: []
    };
  }

  const record = value as Record<string, unknown>;
  const runsValue = record["runs"];
  const evalsValue = record["evals"];

  return {
    runs: Array.isArray(runsValue) ? runsValue.map((item) => parseRunHistoryRecord(item)) : [],
    evals: Array.isArray(evalsValue) ? evalsValue.map((item) => parseEvalHistoryRecord(item)) : []
  };
};

const parseRunHistoryRecord = (value: unknown): WorkbenchRunHistoryRecord => {
  const record = ensureRecord(value, "workbenchRunRecord");
  const kind = readEnum(record, "workbenchRunRecord", "kind", ["skill", "workflow"]);
  const reviewValue = readOptionalRecord(record, "review");
  const resultValue = readRequiredRecord(record, "workbenchRunRecord", "result");
  const base = {
    id: readRequiredString(record, "workbenchRunRecord", "id"),
    skillName: readRequiredString(record, "workbenchRunRecord", "skillName"),
    sessionId: readRequiredString(record, "workbenchRunRecord", "sessionId"),
    question: readRequiredString(record, "workbenchRunRecord", "question"),
    createdAt: readRequiredString(record, "workbenchRunRecord", "createdAt"),
    updatedAt: readRequiredString(record, "workbenchRunRecord", "updatedAt"),
    status: readEnum(record, "workbenchRunRecord", "status", [
      "completed",
      "awaiting_approval",
      "approved",
      "denied"
    ]),
    memory: parseMemoryArray(readRequiredArray(record, "workbenchRunRecord", "memory"))
  };

  if (kind === "skill") {
    const parsed: WorkbenchSkillHistoryRecord = {
      ...base,
      kind,
      result: parseSkillRunResponse(resultValue)
    };
    return parsed;
  }

  const review = reviewValue === undefined ? undefined : parseWorkflowReview(reviewValue);
  const parsed: WorkbenchWorkflowHistoryRecord =
    review === undefined
      ? {
          ...base,
          kind,
          result: parseWorkflowRunResponse(resultValue)
        }
      : {
          ...base,
          kind,
          result: parseWorkflowRunResponse(resultValue),
          review
        };
  return parsed;
};

const parseEvalHistoryRecord = (value: unknown): WorkbenchEvalHistoryRecord => {
  const record = ensureRecord(value, "workbenchEvalRecord");
  return {
    id: readRequiredString(record, "workbenchEvalRecord", "id"),
    datasetPath: readRequiredString(record, "workbenchEvalRecord", "datasetPath"),
    createdAt: readRequiredString(record, "workbenchEvalRecord", "createdAt"),
    updatedAt: readRequiredString(record, "workbenchEvalRecord", "updatedAt"),
    result: parseEvaluationRunResponse(readRequiredRecord(record, "workbenchEvalRecord", "result"))
  };
};

const parseSkillDescriptor = (value: Record<string, unknown>): SkillRunResponse["skill"] => {
  const metadata = readRequiredRecord(value, "skillDescriptor", "metadata");
  return {
    metadata: {
      name: readRequiredString(metadata, "skillMetadata", "name"),
      version: readRequiredString(metadata, "skillMetadata", "version"),
      description: readRequiredString(metadata, "skillMetadata", "description"),
      tags: parseStringArray(readRequiredArray(metadata, "skillMetadata", "tags"), "skillTags")
    }
  };
};

const parseOutput = (value: Record<string, unknown>): SkillRunResponse["output"] => ({
  answer: readRequiredString(value, "skillOutput", "answer"),
  confidence: readRequiredNumber(value, "skillOutput", "confidence")
});

const parseEvidenceReport = (value: Record<string, unknown>): EvidenceReport => ({
  traceId: readRequiredString(value, "evidenceReport", "traceId"),
  sessionId: readRequiredString(value, "evidenceReport", "sessionId"),
  decisions: parseStringArray(readRequiredArray(value, "evidenceReport", "decisions"), "evidenceDecisions"),
  guardrailsTriggered: parseStringArray(
    readRequiredArray(value, "evidenceReport", "guardrailsTriggered"),
    "guardrails"
  ),
  retrievedSources: parseCitations(readRequiredArray(value, "evidenceReport", "retrievedSources")),
  confidence: parseConfidenceScore(readRequiredRecord(value, "evidenceReport", "confidence")),
  usage: parseUsageRecord(readRequiredRecord(value, "evidenceReport", "usage"))
});

const parseConfidenceScore = (value: Record<string, unknown>): ConfidenceScore => ({
  score: readRequiredNumber(value, "confidenceScore", "score"),
  label: readEnum(value, "confidenceScore", "label", ["low", "medium", "high"]),
  signals: parseStringArray(readRequiredArray(value, "confidenceScore", "signals"), "confidenceSignals")
});

const parseUsageRecord = (value: Record<string, unknown>): UsageRecord => ({
  promptTokens: readRequiredNumber(value, "usageRecord", "promptTokens"),
  completionTokens: readRequiredNumber(value, "usageRecord", "completionTokens"),
  totalTokens: readRequiredNumber(value, "usageRecord", "totalTokens"),
  estimatedCostUsd: readRequiredNumber(value, "usageRecord", "estimatedCostUsd"),
  latencyMs: readRequiredNumber(value, "usageRecord", "latencyMs")
});

const parseWorkflowSteps = (value: ReadonlyArray<unknown>): ReadonlyArray<WorkflowStep> =>
  value.map((item) => {
    const record = ensureRecord(item, "workflowStep");
    return {
      stage: readEnum(record, "workflowStep", "stage", [
        "planner",
        "retriever",
        "executor",
        "reviewer"
      ]),
      status: readEnum(record, "workflowStep", "status", ["completed", "awaiting_approval"]),
      summary: readRequiredString(record, "workflowStep", "summary"),
      timestamp: readRequiredString(record, "workflowStep", "timestamp")
    };
  });

const parseCitations = (value: ReadonlyArray<unknown>): ReadonlyArray<Citation> =>
  value.map((item) => {
    const record = ensureRecord(item, "citation");
    return {
      chunkId: readRequiredString(record, "citation", "chunkId"),
      sourceId: readRequiredString(record, "citation", "sourceId"),
      uri: readRequiredString(record, "citation", "uri"),
      snippet: readRequiredString(record, "citation", "snippet"),
      retrievedAt: readRequiredString(record, "citation", "retrievedAt"),
      updatedAt: readRequiredString(record, "citation", "updatedAt"),
      score: readRequiredNumber(record, "citation", "score"),
      sourceType: readRequiredString(record, "citation", "sourceType")
    };
  });

const parseMemoryArray = (value: ReadonlyArray<unknown>): ReadonlyArray<MemorySearchResult> =>
  value.map((item) => parseMemorySearchResult(ensureRecord(item, "memorySearchResult")));

const parseMemorySearchResult = (value: Record<string, unknown>): MemorySearchResult => {
  const metadata = readRequiredRecord(value, "memorySearchResult", "metadata");

  return {
    id: readRequiredString(value, "memorySearchResult", "id"),
    kind: readRequiredString(value, "memorySearchResult", "kind"),
    sessionId: readOptionalString(value, "sessionId"),
    runId: readOptionalString(value, "runId"),
    content: readRequiredString(value, "memorySearchResult", "content"),
    createdAt: readRequiredString(value, "memorySearchResult", "createdAt"),
    expiresAt: readOptionalString(value, "expiresAt"),
    pii: readRequiredBoolean(value, "memorySearchResult", "pii"),
    tags: parseStringArray(readRequiredArray(value, "memorySearchResult", "tags"), "memoryTags"),
    score: readRequiredNumber(value, "memorySearchResult", "score"),
    metadata: {
      redacted: readRequiredBoolean(metadata, "memoryMetadata", "redacted")
    }
  };
};

const parseWorkflowReview = (value: Record<string, unknown>): WorkflowReview => ({
  decision: readEnum(value, "workflowReview", "decision", ["approved", "denied"]),
  reason: readRequiredString(value, "workflowReview", "reason"),
  decidedAt: readRequiredString(value, "workflowReview", "decidedAt")
});

const parseStringArray = (
  value: ReadonlyArray<unknown>,
  label: string
): ReadonlyArray<string> =>
  value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`Invalid ${label}`);
    }
    return item;
  });

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: unknown,
  label: string,
  key: string
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  return ensureRecord(nested, `${label}.${key}`);
};

const readOptionalRecord = (
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined => {
  const nested = value[key];
  if (nested === undefined) {
    return undefined;
  }

  return ensureRecord(nested, key);
};

const readRequiredArray = (
  value: unknown,
  label: string,
  key: string
): ReadonlyArray<unknown> => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredString = (
  value: unknown,
  label: string,
  key: string
): string => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readOptionalString = (
  value: Record<string, unknown>,
  key: string
): string | undefined => {
  const nested = value[key];
  return typeof nested === "string" ? nested : undefined;
};

const readRequiredNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string
): number => {
  const nested = value[key];
  if (typeof nested !== "number" || Number.isNaN(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredBoolean = (
  value: Record<string, unknown>,
  label: string,
  key: string
): boolean => {
  const nested = value[key];
  if (typeof nested !== "boolean") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readEnum = <TValue extends string>(
  value: Record<string, unknown>,
  label: string,
  key: string,
  allowed: ReadonlyArray<TValue>
): TValue => {
  const nested = value[key];
  if (typeof nested !== "string" || !allowed.includes(nested as TValue)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested as TValue;
};
