import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createGuardrailsEngine, createSecurityPolicy } from "../../guardrails/src/index";
import { createInMemoryMemoryStore, createMemoryManager } from "../../memory/src/index";
import { createInMemoryVectorStore, createRagService } from "../../rag/src/index";
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
});
