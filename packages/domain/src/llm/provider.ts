import type { LLMProviderCapabilities } from "./capabilities";
import type { LLMEvent, LLMUsage } from "./events";
import type { LLMModel } from "./models";
import type { LLMRunRequest, LLMRunResponse } from "./run";

export type LLMRunResult = AsyncIterable<LLMEvent> | LLMRunResponse;

export type LLMProviderPort = {
  capabilities: LLMProviderCapabilities;
  listModels: () => Promise<ReadonlyArray<LLMModel>>;
  run: (request: LLMRunRequest) => Promise<LLMRunResult>;
  estimateUsage?: (request: LLMRunRequest) => Promise<LLMUsage>;
};
