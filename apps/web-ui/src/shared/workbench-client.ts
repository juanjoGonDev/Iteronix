import { requestJson } from "./server-api-client.js";
import {
  parseEvaluationRunResponse,
  parseMemorySearchResults,
  parseSkillRunResponse,
  parseWorkflowRunResponse
} from "./workbench-codec.js";
import type {
  EvaluationRunResponse,
  MemorySearchResult,
  SkillRunResponse,
  WorkflowRunResponse
} from "./workbench-types.js";

const EndpointPath = {
  SkillRun: "/ai/skills/run",
  WorkflowRun: "/ai/workflows/run",
  EvalRun: "/ai/evals/run",
  MemoryQuery: "/ai/memory/query"
} as const;

export type WorkbenchClient = {
  runSkill: (input: {
    skillName: string;
    sessionId: string;
    question: string;
  }) => Promise<SkillRunResponse>;
  runWorkflow: (input: {
    skillName: string;
    sessionId: string;
    question: string;
    autoApprove: boolean;
  }) => Promise<WorkflowRunResponse>;
  runEvaluation: (input: {
    datasetPath: string;
  }) => Promise<EvaluationRunResponse>;
  queryMemory: (input: {
    sessionId: string;
    query: string;
    limit: number;
  }) => Promise<ReadonlyArray<MemorySearchResult>>;
};

export const createWorkbenchClient = (): WorkbenchClient => ({
  runSkill: (input) =>
    requestJson({
      path: EndpointPath.SkillRun,
      body: {
        skillName: input.skillName,
        sessionId: input.sessionId,
        input: {
          question: input.question
        }
      },
      parse: parseSkillRunResponse
    }),
  runWorkflow: (input) =>
    requestJson({
      path: EndpointPath.WorkflowRun,
      body: {
        skillName: input.skillName,
        sessionId: input.sessionId,
        question: input.question,
        autoApprove: input.autoApprove
      },
      parse: parseWorkflowRunResponse
    }),
  runEvaluation: (input) =>
    requestJson({
      path: EndpointPath.EvalRun,
      body: {
        datasetPath: input.datasetPath
      },
      parse: parseEvaluationRunResponse
    }),
  queryMemory: (input) =>
    requestJson({
      path: EndpointPath.MemoryQuery,
      body: {
        sessionId: input.sessionId,
        query: input.query,
        limit: input.limit
      },
      parse: parseMemorySearchResults
    })
});
