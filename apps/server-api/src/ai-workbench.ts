import { isAbsolute, join } from "node:path";
import { createWorkflowOrchestrator, type WorkflowOrchestrator } from "../../../packages/agents/src/index";
import { parseWorkbenchEnvironment } from "../../../packages/ai-core/src/index";
import { createGuardrailsEngine, createSecurityPolicy } from "../../../packages/guardrails/src/index";
import { createEvaluationRunner, type EvaluationRunner } from "../../../packages/eval/src/index";
import { createFileMemoryStore, createMemoryManager, type MemoryManager } from "../../../packages/memory/src/index";
import { createObservabilityRuntime } from "../../../packages/observability/src/index";
import {
  createFileVectorStore,
  createRagService,
  loadWorkspaceDocuments
} from "../../../packages/rag/src/index";
import {
  createSkillRegistry,
  createSkillRunner,
  type SkillManifest,
  type SkillRunner
} from "../../../packages/skills/src/index";

export type AiWorkbenchService = {
  runSkill: (input: {
    skillName: string;
    sessionId: string;
    input: unknown;
  }) => Promise<Awaited<ReturnType<SkillRunner["run"]>>>;
  runWorkflow: (input: {
    skillName: string;
    sessionId: string;
    question: string;
    autoApprove: boolean;
  }) => Promise<Awaited<ReturnType<WorkflowOrchestrator["run"]>>>;
  runEvaluation: (input: {
    datasetPath: string;
  }) => Promise<Awaited<ReturnType<EvaluationRunner["runDataset"]>>>;
  searchMemory: (input: {
    sessionId: string;
    query: string;
    limit: number;
  }) => Promise<Awaited<ReturnType<MemoryManager["search"]>>>;
  shutdown: () => Promise<void>;
};

export const createAiWorkbenchService = async (input: {
  workspaceRoot: string;
  skillsDir?: string;
  memoryDir?: string;
  evidenceDir?: string;
  vectorDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<AiWorkbenchService> => {
  const envConfig = parseWorkbenchEnvironment(input.env ?? process.env, input.workspaceRoot);
  const skillsDir = input.skillsDir ?? envConfig.skillsDir;
  const memoryDir = input.memoryDir ?? envConfig.memoryDir;
  const evidenceDir = input.evidenceDir ?? envConfig.evidenceDir;
  const vectorDir = input.vectorDir ?? envConfig.vectorDir;
  const memoryStore = await createFileMemoryStore(memoryDir);
  const vectorStore = await createFileVectorStore(vectorDir);
  const registry = await createSkillRegistry({
    skillsDir
  });
  const observability = await createObservabilityRuntime(
    envConfig.otlpEndpoint === undefined
      ? {
          serviceName: "iteronix-server-api",
          evidenceDir
        }
      : {
          serviceName: "iteronix-server-api",
          evidenceDir,
          otlpEndpoint: envConfig.otlpEndpoint
        }
  );
  const memoryManager = createMemoryManager({
    store: memoryStore
  });
  const ragService = createRagService({
    vectorStore,
    cacheTtlSeconds: envConfig.retrievalCacheTtlSeconds
  });
  const documents = await loadWorkspaceDocuments(input.workspaceRoot, envConfig.maxIndexedFiles);
  await ragService.ingestDocuments(documents);

  const toolAllowlistBySkill = buildToolAllowlist(registry.list());
  const skillRunner = createSkillRunner({
    registry,
    memoryManager,
    ragService,
    guardrails: createGuardrailsEngine({
      policy: createSecurityPolicy({
        toolAllowlistBySkill
      })
    })
  });
  const workflowOrchestrator = createWorkflowOrchestrator({
    skillRunner,
    ragService
  });
  const evaluationRunner = createEvaluationRunner({
    skillRunner,
    workflowOrchestrator
  });

  const runSkill = async (request: {
    skillName: string;
    sessionId: string;
    input: unknown;
  }): Promise<Awaited<ReturnType<SkillRunner["run"]>>> =>
    observability.withSpan({
      name: "ai.skill.run",
      attributes: {
        skill: request.skillName,
        session: request.sessionId
      },
      run: async () => {
        const result = await skillRunner.run({
          skillName: request.skillName,
          sessionId: request.sessionId,
          projectRoot: input.workspaceRoot,
          input: request.input
        });
        await observability.evidenceStore.write(result.evidenceReport);
        return result;
      }
    });

  const runWorkflow = async (request: {
    skillName: string;
    sessionId: string;
    question: string;
    autoApprove: boolean;
  }): Promise<Awaited<ReturnType<WorkflowOrchestrator["run"]>>> =>
    observability.withSpan({
      name: "ai.workflow.run",
      attributes: {
        skill: request.skillName,
        session: request.sessionId
      },
      run: async () => {
        const result = await workflowOrchestrator.run({
          skillName: request.skillName,
          sessionId: request.sessionId,
          projectRoot: input.workspaceRoot,
          question: request.question,
          autoApprove: request.autoApprove
        });
        await observability.evidenceStore.write(result.final.evidenceReport);
        return result;
      }
    });

  const runEvaluation = async (request: {
    datasetPath: string;
  }): Promise<Awaited<ReturnType<EvaluationRunner["runDataset"]>>> =>
    observability.withSpan({
      name: "ai.eval.run",
      attributes: {
        dataset: request.datasetPath
      },
      run: () => evaluationRunner.runDataset({
        datasetPath: resolveDatasetPath(input.workspaceRoot, request.datasetPath)
      })
    });

  const searchMemory = (request: {
    sessionId: string;
    query: string;
    limit: number;
  }): Promise<Awaited<ReturnType<MemoryManager["search"]>>> =>
    memoryManager.search({
      sessionId: request.sessionId,
      query: request.query,
      limit: request.limit,
      piiMode: "redact"
    });

  const shutdown = (): Promise<void> => observability.shutdown();

  return {
    runSkill,
    runWorkflow,
    runEvaluation,
    searchMemory,
    shutdown
  };
};

const resolveDatasetPath = (
  workspaceRoot: string,
  datasetPath: string
): string => (isAbsolute(datasetPath) ? datasetPath : join(workspaceRoot, datasetPath));

const buildToolAllowlist = (
  skills: ReadonlyArray<SkillManifest>
): Readonly<Record<string, ReadonlyArray<string>>> => {
  const allowlist: Record<string, ReadonlyArray<string>> = {};

  for (const skill of skills) {
    allowlist[skill.metadata.name] = skill.toolAllowlist;
  }

  return allowlist;
};
