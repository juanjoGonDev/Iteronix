import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LegacyProductModulePaths = [
  "apps/server-api/src/ai-workbench.ts",
  "apps/server-api/src/ai-workbench.test.ts",
  "apps/server-api/src/files.ts",
  "apps/server-api/src/files.test.ts",
  "apps/server-api/src/git.ts",
  "apps/server-api/src/git.test.ts",
  "apps/server-api/src/history.ts",
  "apps/server-api/src/history.test.ts",
  "apps/server-api/src/kanban.ts",
  "apps/server-api/src/kanban.test.ts",
  "apps/server-api/src/logs.ts",
  "apps/server-api/src/logs.test.ts",
  "apps/server-api/src/projects.ts",
  "apps/server-api/src/projects.test.ts",
  "apps/server-api/src/quality-gates.ts",
  "apps/server-api/src/quality-gates.test.ts",
  "apps/server-api/src/sandbox.ts",
  "apps/server-api/src/sandbox.test.ts",
  "apps/server-api/src/server-logs-store.ts",
  "apps/server-api/src/server-logs-store.test.ts",
  "apps/server-api/src/sessions.ts",
  "apps/server-api/src/sessions.test.ts",
] as const;

describe("workflow-only source inventory", () => {
  it("does not retain project-centric product modules", () => {
    for (const path of LegacyProductModulePaths) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    }
  });
});
