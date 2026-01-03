export const LLMErrorCode = {
  ProviderError: "provider_error",
  RateLimited: "rate_limited",
  InvalidRequest: "invalid_request",
  Unknown: "unknown"
} as const;

export type LLMErrorCode =
  typeof LLMErrorCode[keyof typeof LLMErrorCode];

export type LLMError = {
  code: LLMErrorCode;
  message: string;
  retryable: boolean;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export const LLMEventType = {
  Delta: "delta",
  Message: "message",
  Usage: "usage",
  Error: "error",
  Done: "done"
} as const;

export type LLMEventType =
  typeof LLMEventType[keyof typeof LLMEventType];

export type LLMDeltaEvent = {
  type: typeof LLMEventType.Delta;
  delta: string;
};

export type LLMMessageEvent = {
  type: typeof LLMEventType.Message;
  message: string;
};

export type LLMUsageEvent = {
  type: typeof LLMEventType.Usage;
  usage: LLMUsage;
};

export type LLMErrorEvent = {
  type: typeof LLMEventType.Error;
  error: LLMError;
};

export type LLMDoneEvent = {
  type: typeof LLMEventType.Done;
};

export type LLMEvent =
  | LLMDeltaEvent
  | LLMMessageEvent
  | LLMUsageEvent
  | LLMErrorEvent
  | LLMDoneEvent;