import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createGuardrailsEngine, createSecurityPolicy } from "../../guardrails/src/index";
import { createInMemoryMemoryStore, createMemoryManager } from "../../memory/src/index";
import { createInMemoryVectorStore, createRagService } from "../../rag/src/index";
import type { RagService } from "../../rag/src/index";
import {
  createSkillRegistry,
  createSkillRunner
} from "./index";

const CurrentTime = "2026-03-12T10:00:00.000Z";

describe("skill runner", () => {
  it("loads a skill from disk and runs it with rag, memory and evidence", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "iteronix-skill-"));
    const skillsDir = join(workspace, "skills");
    const skillDir = join(skillsDir, "example-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "skill.json"),
      JSON.stringify({
        metadata: {
          name: "example-skill",
          version: "1.0.0",
          description: "Answers repo questions with citations",
          tags: ["rag", "memory"]
        },
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              minLength: 3
            }
          },
          required: ["question"]
        },
        outputSchema: {
          type: "object",
          properties: {
            answer: {
              type: "string"
            },
            confidence: {
              type: "number"
            }
          },
          required: ["answer", "confidence"]
        },
        toolAllowlist: ["retrieve_context", "session_memory"],
        promptTemplate:
          "Use retrieved context to answer the question with citations.",
        evaluationRubric: ["Cite at least one source when retrieval is used."],
        options: {
          useRag: true
        }
      }),
      "utf8"
    );

    const memoryManager = createMemoryManager({
      store: createInMemoryMemoryStore(),
      now: () => new Date(CurrentTime)
    });
    const ragService = createRagService({
      vectorStore: createInMemoryVectorStore(),
      now: () => new Date(CurrentTime)
    });
    await ragService.ingestDocuments([
      {
        id: "doc-1",
        uri: "/docs/overview.md",
        sourceType: "repo_doc",
        updatedAt: CurrentTime,
        content:
          "Iteronix orchestrates coding agents, guardrails, memory and RAG workflows."
      }
    ]);

    const registry = await createSkillRegistry({
      skillsDir
    });
    const runner = createSkillRunner({
      registry,
      memoryManager,
      ragService,
      guardrails: createGuardrailsEngine({
        policy: createSecurityPolicy({
          toolAllowlistBySkill: {
            "example-skill": ["retrieve_context", "session_memory"]
          }
        })
      }),
      now: () => new Date(CurrentTime)
    });

    const result = await runner.run({
      skillName: "example-skill",
      sessionId: "session-1",
      projectRoot: workspace,
      input: {
        question: "What does Iteronix orchestrate?"
      }
    });

    expect(result.output.answer).toContain("Iteronix");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.evidenceReport.traceId.length).toBeGreaterThan(0);

    const memories = await memoryManager.search({
      sessionId: "session-1",
      query: "retrieved context",
      limit: 5
    });
    expect(memories.length).toBeGreaterThan(0);
  });

  it("rejects a skill that tries to use a tool outside its allowlist", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "iteronix-skill-block-"));
    const skillsDir = join(workspace, "skills");
    const skillDir = join(skillsDir, "blocked-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "skill.json"),
      JSON.stringify({
        metadata: {
          name: "blocked-skill",
          version: "1.0.0",
          description: "Should fail when retrieval is not allowed",
          tags: ["rag"]
        },
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              minLength: 3
            }
          },
          required: ["question"]
        },
        outputSchema: {
          type: "object",
          properties: {
            answer: {
              type: "string"
            },
            confidence: {
              type: "number"
            }
          },
          required: ["answer", "confidence"]
        },
        toolAllowlist: ["session_memory"],
        promptTemplate: "Attempt retrieval even though it is not allowed.",
        evaluationRubric: ["No unsafe tools."],
        options: {
          useRag: true
        }
      }),
      "utf8"
    );

    const runner = createSkillRunner({
      registry: await createSkillRegistry({
        skillsDir
      }),
      memoryManager: createMemoryManager({
        store: createInMemoryMemoryStore(),
        now: () => new Date(CurrentTime)
      }),
      ragService: createRagService({
        vectorStore: createInMemoryVectorStore(),
        now: () => new Date(CurrentTime)
      }),
      guardrails: createGuardrailsEngine({
        policy: createSecurityPolicy({
          toolAllowlistBySkill: {
            "blocked-skill": ["session_memory"]
          }
        })
      }),
      now: () => new Date(CurrentTime)
    });

    await expect(
      runner.run({
        skillName: "blocked-skill",
        sessionId: "session-2",
        projectRoot: workspace,
        input: {
          question: "What is Iteronix?"
        }
      })
    ).rejects.toThrow("Tool retrieve_context is not allowed");
  });

  it("deduplicates response citations by source while preserving evidence provenance", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "iteronix-skill-dedupe-"));
    const skillsDir = join(workspace, "skills");
    const skillDir = join(skillsDir, "example-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "skill.json"),
      JSON.stringify({
        metadata: {
          name: "example-skill",
          version: "1.0.0",
          description: "Answers repo questions with citations",
          tags: ["rag", "memory"]
        },
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              minLength: 3
            }
          },
          required: ["question"]
        },
        outputSchema: {
          type: "object",
          properties: {
            answer: {
              type: "string"
            },
            confidence: {
              type: "number"
            }
          },
          required: ["answer", "confidence"]
        },
        toolAllowlist: ["retrieve_context", "session_memory"],
        promptTemplate:
          "Use retrieved context to answer the question with citations.",
        evaluationRubric: ["Cite at least one source when retrieval is used."],
        options: {
          useRag: true
        }
      }),
      "utf8"
    );

    const registry = await createSkillRegistry({
      skillsDir
    });
    const runner = createSkillRunner({
      registry,
      memoryManager: createMemoryManager({
        store: createInMemoryMemoryStore(),
        now: () => new Date(CurrentTime)
      }),
      ragService: createDuplicateCitationRagService(),
      guardrails: createGuardrailsEngine({
        policy: createSecurityPolicy({
          toolAllowlistBySkill: {
            "example-skill": ["retrieve_context", "session_memory"]
          }
        })
      }),
      now: () => new Date(CurrentTime)
    });

    const result = await runner.run({
      skillName: "example-skill",
      sessionId: "session-dedupe",
      projectRoot: workspace,
      input: {
        question: "What does Iteronix include?"
      }
    });

    expect(result.citations.map((citation) => citation.sourceId)).toEqual([
      "README.md",
      "docs/AI_WORKBENCH.md"
    ]);
    expect(result.evidenceReport.retrievedSources.map((citation) => citation.chunkId)).toEqual([
      "README.md#0",
      "README.md#1",
      "docs/AI_WORKBENCH.md#0"
    ]);
  });
});

const createDuplicateCitationRagService = (): RagService => ({
  ingestDocuments: async () => Promise.resolve(),
  query: async () => ({
    decision: {
      shouldRetrieve: true,
      reason: "Query matched indexed context",
      confidence: 0.9
    },
    cache: {
      hit: false
    },
    chunks: [
      {
        id: "README.md#0",
        sourceId: "README.md",
        uri: "/README.md",
        sourceType: "repo_doc",
        updatedAt: CurrentTime,
        content: "Iteronix includes a headless server API and reusable web UI."
      },
      {
        id: "README.md#1",
        sourceId: "README.md",
        uri: "/README.md",
        sourceType: "repo_doc",
        updatedAt: CurrentTime,
        content: "Iteronix includes memory, skills and evaluation."
      },
      {
        id: "docs/AI_WORKBENCH.md#0",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        sourceType: "repo_doc",
        updatedAt: CurrentTime,
        content: "The AI workbench architecture uses planner, retriever, executor and reviewer."
      }
    ],
    citations: [
      {
        chunkId: "README.md#0",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "Iteronix includes a headless server API and reusable web UI.",
        retrievedAt: CurrentTime,
        updatedAt: "2026-04-23T10:00:00.000Z",
        score: 0.93,
        sourceType: "repo_doc"
      },
      {
        chunkId: "README.md#1",
        sourceId: "README.md",
        uri: "/README.md",
        snippet: "Iteronix includes memory, skills and evaluation.",
        retrievedAt: CurrentTime,
        updatedAt: CurrentTime,
        score: 0.93,
        sourceType: "repo_doc"
      },
      {
        chunkId: "docs/AI_WORKBENCH.md#0",
        sourceId: "docs/AI_WORKBENCH.md",
        uri: "/docs/AI_WORKBENCH.md",
        snippet: "The AI workbench architecture uses planner, retriever, executor and reviewer.",
        retrievedAt: CurrentTime,
        updatedAt: CurrentTime,
        score: 0.89,
        sourceType: "repo_doc"
      }
    ],
    confidence: {
      score: 0.9,
      label: "high",
      signals: ["test-double"]
    },
    context: [
      "Iteronix includes a headless server API and reusable web UI.",
      "Iteronix includes memory, skills and evaluation.",
      "The AI workbench architecture uses planner, retriever, executor and reviewer."
    ].join("\n"),
    credibilityChain: [
      {
        chunkId: "README.md#0",
        score: 0.93,
        reason: "repo_doc:0.02"
      },
      {
        chunkId: "README.md#1",
        score: 0.93,
        reason: "repo_doc:0.00"
      },
      {
        chunkId: "docs/AI_WORKBENCH.md#0",
        score: 0.89,
        reason: "repo_doc:0.04"
      }
    ]
  })
});
