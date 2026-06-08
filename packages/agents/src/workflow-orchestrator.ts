import type { SkillRunner } from "../../skills/src/index";
import type { RagService } from "../../rag/src/index";

export type WorkflowStep = {
  stage: "planner" | "retriever" | "executor" | "reviewer";
  status: "completed" | "awaiting_approval";
  summary: string;
  timestamp: string;
};

export type WorkflowResult = {
  status: "completed" | "awaiting_approval";
  steps: ReadonlyArray<WorkflowStep>;
  checkpoint?: {
    stage: "reviewer";
    summary: string;
  };
  final: Awaited<ReturnType<SkillRunner["run"]>>;
};

export type WorkflowOrchestrator = {
  run: (input: {
    skillName: string;
    sessionId: string;
    projectRoot: string;
    question: string;
    autoApprove: boolean;
  }) => Promise<WorkflowResult>;
};

export const createWorkflowOrchestrator = (input: {
  skillRunner: SkillRunner;
  ragService: RagService;
  now?: () => Date;
}): WorkflowOrchestrator => {
  const now = input.now ?? (() => new Date());

  const run = async (request: {
    skillName: string;
    sessionId: string;
    projectRoot: string;
    question: string;
    autoApprove: boolean;
  }): Promise<WorkflowResult> => {
    const steps: WorkflowStep[] = [];

    steps.push({
      stage: "planner",
      status: "completed",
      summary: `Plan generated for ${request.question}`,
      timestamp: now().toISOString()
    });

    const retrieval = await input.ragService.query({
      query: request.question,
      sessionId: request.sessionId,
      topK: 3
    });
    steps.push({
      stage: "retriever",
      status: "completed",
      summary: retrieval.decision.reason,
      timestamp: now().toISOString()
    });

    const execution = await input.skillRunner.run({
      skillName: request.skillName,
      sessionId: request.sessionId,
      projectRoot: request.projectRoot,
      input: {
        question: request.question
      }
    });
    steps.push({
      stage: "executor",
      status: "completed",
      summary: execution.output.answer,
      timestamp: now().toISOString()
    });

    const reviewerSummary = createReviewerSummary(execution);
    if (!request.autoApprove) {
      steps.push({
        stage: "reviewer",
        status: "awaiting_approval",
        summary: reviewerSummary,
        timestamp: now().toISOString()
      });
      return {
        status: "awaiting_approval",
        steps,
        checkpoint: {
          stage: "reviewer",
          summary: reviewerSummary
        },
        final: execution
      };
    }

    steps.push({
      stage: "reviewer",
      status: "completed",
      summary: reviewerSummary,
      timestamp: now().toISOString()
    });

    return {
      status: "completed",
      steps,
      final: execution
    };
  };

  return {
    run
  };
};

const createReviewerSummary = (
  result: Awaited<ReturnType<SkillRunner["run"]>>
): string =>
  result.citations.length > 0
    ? `Reviewer accepted grounded answer with ${result.citations.length} citations`
    : "Reviewer flagged missing citations";
