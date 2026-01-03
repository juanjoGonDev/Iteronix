import type { LLMUsage } from "./events";

export const LLMRunStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Canceled: "canceled"
} as const;

export type LLMRunStatus =
  typeof LLMRunStatus[keyof typeof LLMRunStatus];

export type LLMRunRequest = {
  modelId: string;
  input: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: unknown;
};

export type LLMRunResponse = {
  message: string;
  usage?: LLMUsage;
};

export type LLMRunSession = {
  id: string;
  providerId: string;
  modelId: string;
  status: LLMRunStatus;
  createdAt: string;
  updatedAt: string;
};
