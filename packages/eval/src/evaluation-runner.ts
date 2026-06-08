import { readFile } from "node:fs/promises";
import type { WorkflowOrchestrator } from "../../agents/src/index";
import type { SkillRunner } from "../../skills/src/index";

export type EvaluationCase = {
  id: string;
  mode: "skill" | "workflow";
  skillName: string;
  input: {
    question: string;
  };
  expectedAnswerIncludes: ReadonlyArray<string>;
  minimumCitations: number;
};

export type EvaluationResult = {
  caseId: string;
  passed: boolean;
  traceId: string;
  reasons: ReadonlyArray<string>;
};

export type EvaluationSummary = {
  total: number;
  passed: number;
  failed: number;
};

export type EvaluationRun = {
  summary: EvaluationSummary;
  results: ReadonlyArray<EvaluationResult>;
};

export type EvaluationRunner = {
  runDataset: (input: { datasetPath: string }) => Promise<EvaluationRun>;
};

export const createEvaluationRunner = (input: {
  skillRunner: SkillRunner;
  workflowOrchestrator: WorkflowOrchestrator;
}): EvaluationRunner => {
  const runDataset = async (request: {
    datasetPath: string;
  }): Promise<EvaluationRun> => {
    const cases = await readDataset(request.datasetPath);
    const results: EvaluationResult[] = [];

    for (const evaluationCase of cases) {
      const execution =
        evaluationCase.mode === "skill"
          ? await input.skillRunner.run({
              skillName: evaluationCase.skillName,
              sessionId: `eval-${evaluationCase.id}`,
              projectRoot: request.datasetPath,
              input: evaluationCase.input
            })
          : (
              await input.workflowOrchestrator.run({
                skillName: evaluationCase.skillName,
                sessionId: `eval-${evaluationCase.id}`,
                projectRoot: request.datasetPath,
                question: evaluationCase.input.question,
                autoApprove: true
              })
            ).final;

      const reasons = scoreExecution(execution, evaluationCase);
      results.push({
        caseId: evaluationCase.id,
        passed: reasons.length === 0,
        traceId: execution.traceId,
        reasons
      });
    }

    return {
      summary: {
        total: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length
      },
      results
    };
  };

  return {
    runDataset
  };
};

const readDataset = async (datasetPath: string): Promise<ReadonlyArray<EvaluationCase>> => {
  const content = await readFile(datasetPath, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EvaluationCase);
};

const scoreExecution = (
  execution: Awaited<ReturnType<SkillRunner["run"]>>,
  evaluationCase: EvaluationCase
): ReadonlyArray<string> => {
  const reasons: string[] = [];

  for (const expected of evaluationCase.expectedAnswerIncludes) {
    if (!execution.output.answer.includes(expected)) {
      reasons.push(`Missing expected text: ${expected}`);
    }
  }

  if (execution.citations.length < evaluationCase.minimumCitations) {
    reasons.push(`Expected at least ${evaluationCase.minimumCitations} citations`);
  }

  return reasons;
};
