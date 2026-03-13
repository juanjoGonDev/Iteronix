import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createAiWorkbenchService
} from "./ai-workbench";

describe("ai workbench service", () => {
  it("runs the example skill end to end", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "iteronix-service-"));
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
          tags: ["server"]
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
        promptTemplate: "Answer from repo docs and cite sources.",
        evaluationRubric: ["Requires citations."],
        options: {
          useRag: true
        }
      }),
      "utf8"
    );

    mkdirSync(join(workspace, "docs"), { recursive: true });
    writeFileSync(
      join(workspace, "docs", "overview.md"),
      "Iteronix includes memory, RAG, skills, orchestration and observability.",
      "utf8"
    );

    const service = await createAiWorkbenchService({
      workspaceRoot: workspace,
      skillsDir,
      memoryDir: join(workspace, ".iteronix", "memory"),
      evidenceDir: join(workspace, ".iteronix", "evidence")
    });

    const result = await service.runSkill({
      skillName: "example-skill",
      sessionId: "session-server-1",
      input: {
        question: "What does Iteronix include?"
      }
    });

    expect(result.output.answer).toContain("Iteronix");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.evidenceReport.traceId.length).toBeGreaterThan(0);
  });

  it("runs the eval suite from a workspace-relative dataset path", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "iteronix-eval-"));
    const skillsDir = join(workspace, "skills");
    const skillDir = join(skillsDir, "example-skill");
    const datasetDir = join(workspace, "packages", "eval", "fixtures");
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(datasetDir, { recursive: true });
    writeFileSync(
      join(skillDir, "skill.json"),
      JSON.stringify({
        metadata: {
          name: "example-skill",
          version: "1.0.0",
          description: "Answers with citations",
          tags: ["server"]
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
        promptTemplate: "Answer from repo docs and cite sources.",
        evaluationRubric: ["Requires citations."],
        options: {
          useRag: true
        }
      }),
      "utf8"
    );

    mkdirSync(join(workspace, "docs"), { recursive: true });
    writeFileSync(
      join(workspace, "docs", "overview.md"),
      "Iteronix includes memory, RAG, skills, orchestration and observability.",
      "utf8"
    );
    writeFileSync(
      join(datasetDir, "minimal-suite.jsonl"),
      JSON.stringify({
        id: "architecture",
        mode: "skill",
        skillName: "example-skill",
        input: {
          question: "What does Iteronix include?"
        },
        expectedAnswerIncludes: ["Iteronix"],
        minimumCitations: 1
      }),
      "utf8"
    );

    const service = await createAiWorkbenchService({
      workspaceRoot: workspace,
      skillsDir,
      memoryDir: join(workspace, ".iteronix", "memory"),
      evidenceDir: join(workspace, ".iteronix", "evidence")
    });

    const result = await service.runEvaluation({
      datasetPath: "packages/eval/fixtures/minimal-suite.jsonl"
    });

    expect(result.summary.total).toBe(1);
    expect(result.summary.failed).toBe(0);
  });
});
