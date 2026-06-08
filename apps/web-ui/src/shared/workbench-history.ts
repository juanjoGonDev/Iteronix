import type { StorageLike } from "./server-config.js";
import {
  parseEvaluationRunResponse,
  parseSkillRunResponse,
  parseWorkbenchHistoryState,
  parseWorkflowRunResponse
} from "./workbench-codec.js";
import {
  ReviewerDecision,
  WorkbenchRecordStatus,
  WorkbenchRunRecordKind,
  type EvaluationRunResponse,
  type MemorySearchResult,
  type SkillRunResponse,
  type WorkbenchEvalHistoryRecord,
  type WorkbenchHistoryState,
  type WorkflowRunResponse
} from "./workbench-types.js";

const HistoryLimit = 24;
const WorkbenchHistoryStorageKey = "iteronix_workbench_history";
let workbenchHistoryCache: WorkbenchHistoryState = {
  runs: [],
  evals: []
};

export type WorkbenchHistoryStore = {
  load: () => WorkbenchHistoryState;
  saveSkillRun: (input: {
    skillName: string;
    sessionId: string;
    question: string;
    result: SkillRunResponse;
    memory?: ReadonlyArray<MemorySearchResult>;
  }) => import("./workbench-types.js").WorkbenchSkillHistoryRecord;
  saveWorkflowRun: (input: {
    skillName: string;
    sessionId: string;
    question: string;
    result: WorkflowRunResponse;
    memory?: ReadonlyArray<MemorySearchResult>;
  }) => import("./workbench-types.js").WorkbenchWorkflowHistoryRecord;
  saveEvalRun: (input: {
    datasetPath: string;
    result: EvaluationRunResponse;
  }) => WorkbenchEvalHistoryRecord;
  applyWorkflowReviewDecision: (input: {
    runId: string;
    decision: typeof ReviewerDecision.Approved | typeof ReviewerDecision.Denied;
    reason: string;
    replacementResult?: WorkflowRunResponse;
  }) => import("./workbench-types.js").WorkbenchWorkflowHistoryRecord;
};

export const createWorkbenchHistoryStore = (
  storage?: StorageLike,
  now: () => string = () => new Date().toISOString()
): WorkbenchHistoryStore => {
  const load = (): WorkbenchHistoryState => {
    if (storage) {
      const raw = storage.getItem(WorkbenchHistoryStorageKey);
      if (!raw) {
        return {
          runs: [],
          evals: []
        };
      }

      try {
        return parseWorkbenchHistoryState(JSON.parse(raw));
      } catch {
        return {
          runs: [],
          evals: []
        };
      }
    }

    return workbenchHistoryCache;
  };

  const saveSkillRun = (input: {
    skillName: string;
    sessionId: string;
    question: string;
    result: SkillRunResponse;
    memory?: ReadonlyArray<MemorySearchResult>;
  }): import("./workbench-types.js").WorkbenchSkillHistoryRecord => {
    const state = load();
    const createdAt = now();
    const record: import("./workbench-types.js").WorkbenchSkillHistoryRecord = {
      id: createId(),
      kind: WorkbenchRunRecordKind.Skill,
      skillName: input.skillName,
      sessionId: input.sessionId,
      question: input.question,
      createdAt,
      updatedAt: createdAt,
      status: WorkbenchRecordStatus.Completed,
      result: parseSkillRunResponse(input.result),
      memory: input.memory ?? []
    };

    persist(storage, {
      runs: [record, ...state.runs].slice(0, HistoryLimit),
      evals: state.evals
    });

    return record;
  };

  const saveWorkflowRun = (input: {
    skillName: string;
    sessionId: string;
    question: string;
    result: WorkflowRunResponse;
    memory?: ReadonlyArray<MemorySearchResult>;
  }): import("./workbench-types.js").WorkbenchWorkflowHistoryRecord => {
    const state = load();
    const createdAt = now();
    const parsedResult = parseWorkflowRunResponse(input.result);
    const record: import("./workbench-types.js").WorkbenchWorkflowHistoryRecord = {
      id: createId(),
      kind: WorkbenchRunRecordKind.Workflow,
      skillName: input.skillName,
      sessionId: input.sessionId,
      question: input.question,
      createdAt,
      updatedAt: createdAt,
      status:
        parsedResult.status === "awaiting_approval"
          ? WorkbenchRecordStatus.AwaitingApproval
          : WorkbenchRecordStatus.Completed,
      result: parsedResult,
      memory: input.memory ?? []
    };

    persist(storage, {
      runs: [record, ...state.runs].slice(0, HistoryLimit),
      evals: state.evals
    });

    return record;
  };

  const saveEvalRun = (input: {
    datasetPath: string;
    result: EvaluationRunResponse;
  }): WorkbenchEvalHistoryRecord => {
    const state = load();
    const createdAt = now();
    const record: WorkbenchEvalHistoryRecord = {
      id: createId(),
      datasetPath: input.datasetPath,
      createdAt,
      updatedAt: createdAt,
      result: parseEvaluationRunResponse(input.result)
    };

    persist(storage, {
      runs: state.runs,
      evals: [record, ...state.evals].slice(0, HistoryLimit)
    });

    return record;
  };

  const applyWorkflowReviewDecision = (input: {
    runId: string;
    decision: typeof ReviewerDecision.Approved | typeof ReviewerDecision.Denied;
    reason: string;
    replacementResult?: WorkflowRunResponse;
  }): import("./workbench-types.js").WorkbenchWorkflowHistoryRecord => {
    const state = load();
    const decidedAt = now();
    const updatedRuns = state.runs.map((record) => {
      if (record.id !== input.runId || record.kind !== WorkbenchRunRecordKind.Workflow) {
        return record;
      }

      const updatedResult =
        input.replacementResult === undefined
          ? record.result
          : parseWorkflowRunResponse(input.replacementResult);

      return {
        ...record,
        updatedAt: decidedAt,
        status:
          input.decision === ReviewerDecision.Approved
            ? WorkbenchRecordStatus.Approved
            : WorkbenchRecordStatus.Denied,
        result: updatedResult,
        review: {
          decision: input.decision,
          reason: input.reason,
          decidedAt
        }
      };
    });

    const updatedRecord = updatedRuns.find(
      (record): record is import("./workbench-types.js").WorkbenchWorkflowHistoryRecord =>
        record.id === input.runId && record.kind === WorkbenchRunRecordKind.Workflow
    );
    if (!updatedRecord) {
      throw new Error(`Workflow run ${input.runId} not found`);
    }

    persist(storage, {
      runs: updatedRuns,
      evals: state.evals
    });

    return updatedRecord;
  };

  return {
    load,
    saveSkillRun,
    saveWorkflowRun,
    saveEvalRun,
    applyWorkflowReviewDecision
  };
};

export const hydrateWorkbenchHistory = (
  state: WorkbenchHistoryState
): WorkbenchHistoryState => {
  workbenchHistoryCache = parseWorkbenchHistoryState(state);
  return workbenchHistoryCache;
};

const persist = (
  storage: StorageLike | undefined,
  state: WorkbenchHistoryState
): void => {
  const normalized = parseWorkbenchHistoryState(state);
  if (storage) {
    storage.setItem(WorkbenchHistoryStorageKey, JSON.stringify(normalized));
  } else {
    workbenchHistoryCache = normalized;
  }
};

const createId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
