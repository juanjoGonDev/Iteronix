import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAiWorkbenchService } from "../../../apps/server-api/src/ai-workbench";

describe("minimal evaluation suite", () => {
  it("passes the repository-backed dataset", async () => {
    const workspaceRoot = process.cwd();
    const service = await createAiWorkbenchService({
      workspaceRoot,
      skillsDir: join(workspaceRoot, "skills"),
      memoryDir: join(workspaceRoot, ".iteronix", "ci-memory"),
      evidenceDir: join(workspaceRoot, ".iteronix", "ci-evidence"),
      vectorDir: join(workspaceRoot, ".iteronix", "ci-vector")
    });

    try {
      const result = await service.runEvaluation({
        datasetPath: join(workspaceRoot, "packages", "eval", "fixtures", "minimal-suite.jsonl")
      });

      expect(result.summary.total).toBeGreaterThanOrEqual(5);
      expect(result.summary.failed).toBe(0);
    } finally {
      await service.shutdown();
    }
  });
});
