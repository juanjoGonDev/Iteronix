export type AiSkillPort = {
  runSkill: (input: {
    skillName: string;
    sessionId: string;
    input: Record<string, unknown>;
  }) => Promise<{
    traceId: string;
    citations: ReadonlyArray<{
      chunkId: string;
      sourceId: string;
      uri: string;
      score: number;
    }>;
  }>;
};

export type AiWorkflowPort = {
  runWorkflow: (input: {
    skillName: string;
    sessionId: string;
    question: string;
    autoApprove: boolean;
  }) => Promise<{
    status: "completed" | "awaiting_approval";
    traceId: string;
  }>;
};

export type AiMemoryPort = {
  searchMemory: (input: {
    sessionId: string;
    query: string;
    limit: number;
  }) => Promise<ReadonlyArray<{
    id: string;
    content: string;
    score: number;
  }>>;
};

export type AiEvaluationPort = {
  runEvaluation: (input: {
    datasetPath: string;
  }) => Promise<{
    total: number;
    passed: number;
    failed: number;
  }>;
};
