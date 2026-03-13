import { describe, expect, it } from "vitest";
import { createWorkbenchHistoryStore } from "./workbench-history.js";
import type {
  EvaluationRunResponse,
  SkillRunResponse,
  WorkflowRunResponse
} from "./workbench-types.js";

describe("workbench history store", () => {
  it("persists runs and review decisions", () => {
    const storage = createMemoryStorage();
    const store = createWorkbenchHistoryStore(storage, () => "2026-03-12T20:00:00.000Z");

    const workflow = store.saveWorkflowRun({
      skillName: "example-skill",
      sessionId: "session-1",
      question: "What is Iteronix?",
      result: createWorkflowResponse("awaiting_approval")
    });

    const updated = store.applyWorkflowReviewDecision({
      runId: workflow.id,
      decision: "approved",
      reason: "Grounded answer",
      replacementResult: createWorkflowResponse("completed")
    });

    expect(updated.status).toBe("approved");
    expect(updated.review?.reason).toBe("Grounded answer");
    expect(store.load().runs).toHaveLength(1);
    expect(updated.result.status).toBe("completed");
  });

  it("stores eval runs separately from skill runs", () => {
    const storage = createMemoryStorage();
    const store = createWorkbenchHistoryStore(storage, () => "2026-03-12T20:00:00.000Z");

    store.saveSkillRun({
      skillName: "example-skill",
      sessionId: "session-2",
      question: "What ships with Iteronix?",
      result: createSkillResponse()
    });
    store.saveEvalRun({
      datasetPath: "packages/eval/fixtures/minimal-suite.jsonl",
      result: createEvalResponse()
    });

    const state = store.load();
    expect(state.runs).toHaveLength(1);
    expect(state.evals).toHaveLength(1);
    expect(state.evals[0]?.result.summary.passed).toBe(5);
  });
});

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
};

const createSkillResponse = (): SkillRunResponse => ({
  skill: {
    metadata: {
      name: "example-skill",
      version: "1.0.0",
      description: "Example",
      tags: ["rag"]
    }
  },
  output: {
    answer: "Iteronix ships with memory and RAG.",
    confidence: 0.86
  },
  citations: [
    {
      chunkId: "chunk-1",
      sourceId: "source-1",
      uri: "docs/overview.md",
      snippet: "Iteronix ships with memory and RAG.",
      retrievedAt: "2026-03-12T20:00:00.000Z",
      updatedAt: "2026-03-12T20:00:00.000Z",
      score: 0.91,
      sourceType: "file"
    }
  ],
  confidence: {
    score: 0.86,
    label: "high",
    signals: ["agreement"]
  },
  evidenceReport: {
    traceId: "trace-1",
    sessionId: "session-2",
    decisions: ["retrieved context"],
    guardrailsTriggered: [],
    retrievedSources: [
      {
        chunkId: "chunk-1",
        sourceId: "source-1",
        uri: "docs/overview.md",
        snippet: "Iteronix ships with memory and RAG.",
        retrievedAt: "2026-03-12T20:00:00.000Z",
        updatedAt: "2026-03-12T20:00:00.000Z",
        score: 0.91,
        sourceType: "file"
      }
    ],
    confidence: {
      score: 0.86,
      label: "high",
      signals: ["agreement"]
    },
    usage: {
      promptTokens: 12,
      completionTokens: 16,
      totalTokens: 28,
      estimatedCostUsd: 0,
      latencyMs: 22
    }
  },
  traceId: "trace-1",
  usage: {
    promptTokens: 12,
    completionTokens: 16,
    totalTokens: 28,
    estimatedCostUsd: 0,
    latencyMs: 22
  }
});

const createWorkflowResponse = (
  status: WorkflowRunResponse["status"]
): WorkflowRunResponse =>
  status === "awaiting_approval"
    ? {
        status,
        steps: [
          {
            stage: "planner",
            status: "completed",
            summary: "Plan generated",
            timestamp: "2026-03-12T20:00:00.000Z"
          },
          {
            stage: "reviewer",
            status: "awaiting_approval",
            summary: "Reviewer summary",
            timestamp: "2026-03-12T20:00:00.000Z"
          }
        ],
        checkpoint: {
          stage: "reviewer",
          summary: "Reviewer summary"
        },
        final: createSkillResponse()
      }
    : {
        status,
        steps: [
          {
            stage: "planner",
            status: "completed",
            summary: "Plan generated",
            timestamp: "2026-03-12T20:00:00.000Z"
          },
          {
            stage: "reviewer",
            status: "completed",
            summary: "Reviewer summary",
            timestamp: "2026-03-12T20:00:00.000Z"
          }
        ],
        final: createSkillResponse()
      };

const createEvalResponse = (): EvaluationRunResponse => ({
  summary: {
    total: 5,
    passed: 5,
    failed: 0
  },
  results: [
    {
      caseId: "architecture",
      passed: true,
      traceId: "trace-architecture",
      reasons: []
    }
  ]
});
