import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createGuardrailsEngine, createSecurityPolicy } from "../../guardrails/src/index";
import { createInMemoryMemoryStore, createMemoryManager } from "../../memory/src/index";
import { createInMemoryVectorStore, createRagService } from "../../rag/src/index";
import { createSkillRegistry, createSkillRunner } from "../../skills/src/index";
import { createWorkflowOrchestrator } from "./index";

const CurrentTime = "2026-03-12T10:00:00.000Z";

const prepareRunner = async () => {
  const workspace = mkdtempSync(join(tmpdir(), "iteronix-agent-"));
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
        tags: ["workflow"]
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
      promptTemplate: "Answer using retrieved evidence.",
      evaluationRubric: ["Reviewer requires citations."],
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
        "Iteronix coordinates planners, retrievers, executors and reviewers with shared evidence."
    }
  ]);

  const runner = createSkillRunner({
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

  return {
    workspace,
    ragService,
    runner
  };
};

describe("workflow orchestrator", () => {
  it("runs planner, retriever, executor and reviewer to completion", async () => {
    const fixture = await prepareRunner();
    const orchestrator = createWorkflowOrchestrator({
      skillRunner: fixture.runner,
      ragService: fixture.ragService,
      now: () => new Date(CurrentTime)
    });

    const result = await orchestrator.run({
      skillName: "example-skill",
      sessionId: "session-1",
      projectRoot: fixture.workspace,
      question: "How does Iteronix coordinate agents?",
      autoApprove: true
    });

    expect(result.status).toBe("completed");
    expect(result.steps.map((step) => step.stage)).toEqual([
      "planner",
      "retriever",
      "executor",
      "reviewer"
    ]);
    expect(result.final.citations.length).toBeGreaterThan(0);
  });

  it("returns a human checkpoint when approval is required", async () => {
    const fixture = await prepareRunner();
    const orchestrator = createWorkflowOrchestrator({
      skillRunner: fixture.runner,
      ragService: fixture.ragService,
      now: () => new Date(CurrentTime)
    });

    const result = await orchestrator.run({
      skillName: "example-skill",
      sessionId: "session-2",
      projectRoot: fixture.workspace,
      question: "How does Iteronix coordinate agents?",
      autoApprove: false
    });

    expect(result.status).toBe("awaiting_approval");
    expect(result.checkpoint?.stage).toBe("reviewer");
  });
});
