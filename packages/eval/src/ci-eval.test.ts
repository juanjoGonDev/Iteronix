import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAiWorkbenchService } from "../../../apps/server-api/src/ai-workbench";

describe("minimal evaluation suite", () => {
  it("passes the repository-backed dataset", async () => {
    const workspaceRoot = process.cwd();
    const runtimeRoot = await mkdtemp(join(tmpdir(), "iteronix-ci-eval-"));
    const service = await createAiWorkbenchService({
      workspaceRoot,
      skillsDir: join(workspaceRoot, "skills"),
      memoryDir: join(runtimeRoot, "memory"),
      evidenceDir: join(runtimeRoot, "evidence"),
      vectorDir: join(runtimeRoot, "vector")
    });

    try {
      const result = await service.runEvaluation({
        datasetPath: join(workspaceRoot, "packages", "eval", "fixtures", "minimal-suite.jsonl")
      });

      expect(result.summary.total).toBeGreaterThanOrEqual(5);
      expect(result.summary.failed).toBe(0);
    } finally {
      await service.shutdown();
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  }, 15000);
});
