export type LLMModel = {
  id: string;
  displayName: string;
  maxContextTokens?: number;
};

export type LLMModelList = ReadonlyArray<LLMModel>;