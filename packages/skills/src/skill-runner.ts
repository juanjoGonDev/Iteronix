import {
  compileSerializableSchema,
  createRunContext,
  createUsageRecord,
  type EvidenceReport
} from "../../ai-core/src/index";
import type { GuardrailsEngine } from "../../guardrails/src/index";
import type { MemoryManager } from "../../memory/src/index";
import type { RagService } from "../../rag/src/index";
import type { SkillManifest, SkillRegistry } from "./skill-registry";

export type SkillRunResult = {
  skill: SkillManifest;
  output: {
    answer: string;
    confidence: number;
  };
  citations: ReadonlyArray<import("../../ai-core/src/index").Citation>;
  confidence: import("../../ai-core/src/index").ConfidenceScore;
  evidenceReport: EvidenceReport;
  traceId: string;
  usage: import("../../ai-core/src/index").UsageRecord;
};

export type SkillRunner = {
  run: (input: {
    skillName: string;
    sessionId: string;
    projectRoot: string;
    input: unknown;
  }) => Promise<SkillRunResult>;
};

export const createSkillRunner = (input: {
  registry: SkillRegistry;
  memoryManager: MemoryManager;
  ragService: RagService;
  guardrails: GuardrailsEngine;
  now?: () => Date;
}): SkillRunner => {
  const now = input.now ?? (() => new Date());

  const run = async (request: {
    skillName: string;
    sessionId: string;
    projectRoot: string;
    input: unknown;
  }): Promise<SkillRunResult> => {
    const skill = input.registry.get(request.skillName);
    if (!skill) {
      throw new Error(`Skill ${request.skillName} not found`);
    }

    const context = createRunContext({
      sessionId: request.sessionId,
      createdAt: now().toISOString()
    });
    const startedAt = Date.now();
    const parsedInput = compileSerializableSchema(skill.inputSchema).parse(request.input);
    const question = readQuestionValue(parsedInput);

    const inputGuard = await input.guardrails.checkInput({
      skillName: skill.metadata.name,
      text: question
    });
    if (!inputGuard.allowed) {
      throw new Error(inputGuard.violations.map((violation) => violation.message).join("; "));
    }

    await input.memoryManager.rememberWorking({
      sessionId: request.sessionId,
      runId: context.runId,
      content: question,
      createdAt: context.createdAt,
      ttlSeconds: 3600,
      tags: [skill.metadata.name, "working"]
    });

    const memoryContext = await loadSessionMemory(input.memoryManager, request.sessionId, question);
    const ragResult = await maybeRetrieveContext(input.guardrails, input.ragService, skill, request.sessionId, question);
    const outputCandidate = createOutputCandidate(question, ragResult.context, ragResult.citations.length > 0, memoryContext, skill.promptTemplate, ragResult.confidence.score);
    const parsedOutput = compileSerializableSchema(skill.outputSchema).parse(outputCandidate);
    const output = readOutputValue(parsedOutput);

    const outputGuard = await input.guardrails.checkOutput({
      skillName: skill.metadata.name,
      citationsCount: ragResult.citations.length,
      requiresGrounding: Boolean(skill.options?.useRag && ragResult.decision.shouldRetrieve)
    });
    if (!outputGuard.allowed) {
      throw new Error(outputGuard.violations.map((violation) => violation.message).join("; "));
    }

    await input.memoryManager.rememberEpisodic({
      sessionId: request.sessionId,
      runId: context.runId,
      content: `Skill ${skill.metadata.name} retrieved context with ${ragResult.citations.length} citations`,
      createdAt: now().toISOString(),
      tags: [skill.metadata.name, "episodic"]
    });

    const usage = createUsageRecord({
      promptText: question,
      completionText: output.answer,
      latencyMs: Date.now() - startedAt,
      estimatedCostUsd: 0
    });
    const evidenceReport: EvidenceReport = {
      traceId: context.traceId,
      sessionId: request.sessionId,
      decisions: [skill.promptTemplate, ragResult.decision.reason],
      guardrailsTriggered: [
        ...inputGuard.violations.map((violation) => violation.message),
        ...outputGuard.violations.map((violation) => violation.message)
      ],
      retrievedSources: ragResult.citations,
      confidence: ragResult.confidence,
      usage
    };

    return {
      skill,
      output,
      citations: ragResult.citations,
      confidence: ragResult.confidence,
      evidenceReport,
      traceId: context.traceId,
      usage
    };
  };

  return {
    run
  };
};

const loadSessionMemory = async (
  memoryManager: MemoryManager,
  sessionId: string,
  query: string
): Promise<ReadonlyArray<string>> => {
  const results = await memoryManager.search({
    sessionId,
    query,
    limit: 2,
    piiMode: "redact"
  });

  return results.map((result) => result.content);
};

const maybeRetrieveContext = async (
  guardrails: GuardrailsEngine,
  ragService: RagService,
  skill: SkillManifest,
  sessionId: string,
  question: string
): Promise<Awaited<ReturnType<RagService["query"]>>> => {
  if (!skill.options?.useRag) {
    return {
      decision: {
        shouldRetrieve: false,
        reason: "Skill does not require retrieval",
        confidence: 0.3
      },
      cache: {
        hit: false
      },
      chunks: [],
      citations: [],
      confidence: {
        score: 0.3,
        label: "low",
        signals: ["no-retrieval"]
      },
      context: "",
      credibilityChain: []
    };
  }

  const toolGuard = await guardrails.checkToolCall({
    skillName: skill.metadata.name,
    toolId: "retrieve_context",
    sideEffect: "none",
    args: {
      query: question
    }
  });
  if (!toolGuard.allowed) {
    throw new Error(`Tool retrieve_context is not allowed`);
  }

  return ragService.query({
    query: question,
    sessionId,
    topK: skill.options.topK ?? 3
  });
};

const createOutputCandidate = (
  question: string,
  ragContext: string,
  hasCitations: boolean,
  memoryContext: ReadonlyArray<string>,
  promptTemplate: string,
  confidence: number
): {
  answer: string;
  confidence: number;
} => ({
  answer: composeAnswer(question, ragContext, hasCitations, memoryContext, promptTemplate),
  confidence
});

const composeAnswer = (
  question: string,
  ragContext: string,
  hasCitations: boolean,
  memoryContext: ReadonlyArray<string>,
  promptTemplate: string
): string => {
  const lead = hasCitations ? ragContext : `No retrieval required for: ${question}`;
  const memoryLead = memoryContext[0] ? ` Memory: ${memoryContext[0]}` : "";
  const promptLead = promptTemplate.replace(/\s+/g, " ").trim();
  return `${promptLead} ${lead}${memoryLead}`.trim();
};

const readQuestionValue = (value: unknown): string => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Skill input must be an object");
  }

  const record = value as Record<string, unknown>;
  if (typeof record["question"] !== "string") {
    throw new Error("Skill input is missing question");
  }

  return record["question"];
};

const readOutputValue = (value: unknown): {
  answer: string;
  confidence: number;
} => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Skill output must be an object");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record["answer"] !== "string" ||
    typeof record["confidence"] !== "number"
  ) {
    throw new Error("Skill output is invalid");
  }

  return {
    answer: record["answer"],
    confidence: record["confidence"]
  };
};
