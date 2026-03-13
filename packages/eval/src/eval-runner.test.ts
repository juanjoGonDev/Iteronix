import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createWorkflowOrchestrator } from "../../agents/src/index";
import { createGuardrailsEngine, createSecurityPolicy } from "../../guardrails/src/index";
import { createInMemoryMemoryStore, createMemoryManager } from "../../memory/src/index";
import { createInMemoryVectorStore, createRagService } from "../../rag/src/index";
import { createSkillRegistry, createSkillRunner } from "../../skills/src/index";
import { createEvaluationRunner } from "./index";

const CurrentTime = "2026-03-12T10:00:00.000Z";

describe("evaluation runner", () => {
  it("executes a jsonl dataset and records pass and trace metadata", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "iteronix-eval-"));
    const skillsDir = join(workspace, "skills");
    const skillDir = join(skillsDir, "example-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "skill.json"),
      JSON.stringify({
        metadata: {
          name: "example-skill",
          version: "1.0.0",
          description: "Answers with citations",
          tags: ["eval"]
        },
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string"
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
        promptTemplate: "Answer with citations.",
        evaluationRubric: ["Grounded answer with citations."],
        options: {
          useRag: true
        }
      }),
      "utf8"
    );

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
          "Iteronix ships a server-first AI Engineering Workbench with guardrails and evidence."
      }
    ]);

    const skillRunner = createSkillRunner({
      registry: await createSkillRegistry({
        skillsDir
      }),
      memoryManager: createMemoryManager({
        store: createInMemoryMemoryStore(),
        now: () => new Date(CurrentTime)
      }),
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
    const orchestrator = createWorkflowOrchestrator({
      skillRunner,
      ragService,
      now: () => new Date(CurrentTime)
    });

    const datasetPath = join(workspace, "eval.jsonl");
    writeFileSync(
      datasetPath,
      [
        JSON.stringify({
          id: "case-1",
          mode: "skill",
          skillName: "example-skill",
          input: {
            question: "What does Iteronix ship?"
          },
          expectedAnswerIncludes: ["Iteronix"],
          minimumCitations: 1
        }),
        JSON.stringify({
          id: "case-2",
          mode: "workflow",
          skillName: "example-skill",
          input: {
            question: "What does Iteronix ship?"
          },
          expectedAnswerIncludes: ["Iteronix"],
          minimumCitations: 1
        })
      ].join("\n"),
      "utf8"
    );

    const runner = createEvaluationRunner({
      skillRunner,
      workflowOrchestrator: orchestrator
    });
    const result = await runner.runDataset({
      datasetPath
    });

    expect(result.summary.total).toBe(2);
    expect(result.summary.passed).toBe(2);
    expect(result.results[0]?.traceId.length).toBeGreaterThan(0);
  });
});
