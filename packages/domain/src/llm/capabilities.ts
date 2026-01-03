export const LLMProviderType = {
  Cli: "cli",
  Api: "api",
  Local: "local"
} as const;

export type LLMProviderType =
  typeof LLMProviderType[keyof typeof LLMProviderType];

export type LLMProviderCapabilities = {
  streaming: boolean;
  jsonSchemaEnforcement: boolean;
  maxContextTokens?: number;
  tokenUsage: boolean;
  toolCalls: boolean;
};