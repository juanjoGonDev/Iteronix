import { readServerConnection } from "./server-config.js";
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

const HeaderName = {
  Authorization: "Authorization",
  ContentType: "Content-Type"
} as const;

const HeaderValue = {
  Json: "application/json",
  BearerPrefix: "Bearer "
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
    postJson(EndpointPath.SkillRun, {
      skillName: input.skillName,
      sessionId: input.sessionId,
      input: {
        question: input.question
      }
    }, parseSkillRunResponse),
  runWorkflow: (input) =>
    postJson(EndpointPath.WorkflowRun, {
      skillName: input.skillName,
      sessionId: input.sessionId,
      question: input.question,
      autoApprove: input.autoApprove
    }, parseWorkflowRunResponse),
  runEvaluation: (input) =>
    postJson(EndpointPath.EvalRun, {
      datasetPath: input.datasetPath
    }, parseEvaluationRunResponse),
  queryMemory: (input) =>
    postJson(EndpointPath.MemoryQuery, {
      sessionId: input.sessionId,
      query: input.query,
      limit: input.limit
    }, parseMemorySearchResults)
});

const postJson = async <TResult>(
  path: string,
  body: Readonly<Record<string, unknown>>,
  parse: (value: unknown) => TResult
): Promise<TResult> => {
  const connection = readServerConnection();
  const response = await fetch(`${connection.serverUrl}${path}`, {
    method: "POST",
    headers: {
      [HeaderName.ContentType]: HeaderValue.Json,
      [HeaderName.Authorization]: `${HeaderValue.BearerPrefix}${connection.authToken}`
    },
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, response.status));
  }

  return parse(payload);
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const readErrorMessage = (value: unknown, status: number): string => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = (value as Record<string, unknown>)["message"];
    if (typeof message === "string") {
      return message;
    }
  }

  return `Request failed with status ${status}`;
};
