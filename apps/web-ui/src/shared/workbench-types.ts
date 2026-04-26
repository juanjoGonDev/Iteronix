export const WorkbenchSkillName = "example-skill";
export const MinimalEvalDatasetPath = "packages/eval/fixtures/minimal-suite.jsonl";
export const DefaultMemoryQueryLimit = 4;

export const QualityGateEventName = {
  Progress: "quality-gates-progress"
} as const;

export const QualityGateId = {
  Lint: "lint",
  Typecheck: "typecheck",
  Test: "test",
  Build: "build"
} as const;

export type QualityGateId = typeof QualityGateId[keyof typeof QualityGateId];

export type QualityGateRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type ProjectRecord = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export const GitDiffScope = {
  Staged: "staged",
  Unstaged: "unstaged"
} as const;

export type GitDiffScope = typeof GitDiffScope[keyof typeof GitDiffScope];

export type GitStatusEntryRecord = {
  path: string;
  originalPath?: string;
  indexStatus: string;
  workingTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
};

export type GitRepositoryRecord = {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  clean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  entries: ReadonlyArray<GitStatusEntryRecord>;
};

export type GitDiffRecord = {
  staged: boolean;
  diff: string;
};

export type GitCommitRecord = {
  hash: string;
  message: string;
};

export type GitPathOperationRecord = {
  paths: ReadonlyArray<string>;
};

export type GitBranchRecord = {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
};

export type GitBranchListRecord = {
  local: ReadonlyArray<GitBranchRecord>;
  remote: ReadonlyArray<GitBranchRecord>;
};

export type GitBranchOperationRecord = {
  name: string;
};

export type QualityGateRunRecord = {
  id: string;
  projectId: string;
  status: QualityGateRunStatus;
  createdAt: string;
  updatedAt: string;
  gates: ReadonlyArray<QualityGateId>;
  passedCount: number;
  currentGate?: QualityGateId;
  failedGate?: QualityGateId;
};

export type QualityGateEventRecord = {
  id: string;
  runId: string;
  type: "delta" | "message" | "usage" | "error" | "done" | "status";
  timestamp: string;
  data: Record<string, unknown>;
};

export type ServerSentEventMessage = {
  id?: string;
  event: string;
  data: unknown;
};

export const ReviewerDecision = {
  Approved: "approved",
  Denied: "denied"
} as const;

export type ReviewerDecision =
  typeof ReviewerDecision[keyof typeof ReviewerDecision];

export const WorkbenchRunRecordKind = {
  Skill: "skill",
  Workflow: "workflow"
} as const;

export type WorkbenchRunRecordKind =
  typeof WorkbenchRunRecordKind[keyof typeof WorkbenchRunRecordKind];

export const WorkbenchRecordStatus = {
  Completed: "completed",
  AwaitingApproval: "awaiting_approval",
  Approved: "approved",
  Denied: "denied"
} as const;

export type WorkbenchRecordStatus =
  typeof WorkbenchRecordStatus[keyof typeof WorkbenchRecordStatus];

export type Citation = {
  chunkId: string;
  sourceId: string;
  uri: string;
  snippet: string;
  retrievedAt: string;
  updatedAt: string;
  score: number;
  sourceType: string;
};

export type ConfidenceScore = {
  score: number;
  label: "low" | "medium" | "high";
  signals: ReadonlyArray<string>;
};

export type UsageRecord = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
};

export type EvidenceReport = {
  traceId: string;
  sessionId: string;
  decisions: ReadonlyArray<string>;
  guardrailsTriggered: ReadonlyArray<string>;
  retrievedSources: ReadonlyArray<Citation>;
  confidence: ConfidenceScore;
  usage: UsageRecord;
};

export type SkillRunResponse = {
  skill: {
    metadata: {
      name: string;
      version: string;
      description: string;
      tags: ReadonlyArray<string>;
    };
  };
  output: {
    answer: string;
    confidence: number;
  };
  citations: ReadonlyArray<Citation>;
  confidence: ConfidenceScore;
  evidenceReport: EvidenceReport;
  traceId: string;
  usage: UsageRecord;
};

export type WorkflowStep = {
  stage: "planner" | "retriever" | "executor" | "reviewer";
  status: "completed" | "awaiting_approval";
  summary: string;
  timestamp: string;
};

export type WorkflowRunResponse = {
  status: "completed" | "awaiting_approval";
  steps: ReadonlyArray<WorkflowStep>;
  checkpoint?: {
    stage: "reviewer";
    summary: string;
  };
  final: SkillRunResponse;
};

export type EvaluationRunResponse = {
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  results: ReadonlyArray<{
    caseId: string;
    passed: boolean;
    traceId: string;
    reasons: ReadonlyArray<string>;
  }>;
};

export type MemorySearchResult = {
  id: string;
  kind: string;
  sessionId?: string | undefined;
  runId?: string | undefined;
  content: string;
  createdAt: string;
  expiresAt?: string | undefined;
  pii: boolean;
  tags: ReadonlyArray<string>;
  score: number;
  metadata: {
    redacted: boolean;
  };
};

export type WorkflowReview = {
  decision: ReviewerDecision;
  reason: string;
  decidedAt: string;
};

type WorkbenchRunHistoryRecordBase = {
  id: string;
  skillName: string;
  sessionId: string;
  question: string;
  createdAt: string;
  updatedAt: string;
  status: WorkbenchRecordStatus;
  memory: ReadonlyArray<MemorySearchResult>;
};

export type WorkbenchSkillHistoryRecord = WorkbenchRunHistoryRecordBase & {
  kind: typeof WorkbenchRunRecordKind.Skill;
  result: SkillRunResponse;
};

export type WorkbenchWorkflowHistoryRecord = WorkbenchRunHistoryRecordBase & {
  kind: typeof WorkbenchRunRecordKind.Workflow;
  result: WorkflowRunResponse;
  review?: WorkflowReview;
};

export type WorkbenchRunHistoryRecord =
  | WorkbenchSkillHistoryRecord
  | WorkbenchWorkflowHistoryRecord;

export type WorkbenchEvalHistoryRecord = {
  id: string;
  datasetPath: string;
  createdAt: string;
  updatedAt: string;
  result: EvaluationRunResponse;
};

export type WorkbenchHistoryState = {
  runs: ReadonlyArray<WorkbenchRunHistoryRecord>;
  evals: ReadonlyArray<WorkbenchEvalHistoryRecord>;
};
