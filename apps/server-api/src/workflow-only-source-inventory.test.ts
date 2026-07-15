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

const LegacyWorkflowOnlyPaths = [
  "apps/desktop-main",
  "docs/AI_WORKBENCH.md",
  "docs/UI_CHECKLIST.md",
  "docs/UI_FUNCTIONALITY_CHECKLIST.md",
  "packages/adapters/src/file-logs-store",
  "packages/adapters/src/git",
  "packages/agents/src/workflow-orchestrator.test.ts",
  "packages/agents/src/workflow-orchestrator.ts",
  "packages/ai-core",
  "packages/domain/src/ports",
  "packages/eval",
  "packages/guardrails",
  "packages/mcp",
  "packages/memory",
  "packages/observability",
  "packages/rag",
  "packages/shared/src/logger",
  "packages/skills",
  "skills/example-skill",
  "ui-spec/screens/dashboard",
  "ui-spec/screens/explorer",
  "ui-spec/screens/kanban",
  "ui-spec/screens/runs",
] as const;

const LegacyWorkflowDocumentationPaths = [
  "docs/DEPLOYMENT.md",
  "docs/RUNNING.md",
  "docs/server-api.md",
  "docs/url-addressable-ui-state.md",
  "docs/WORKFLOWS_EDITOR_MVP.md",
] as const;

describe("workflow-only source inventory", () => {
  it("does not retain project-centric product modules", () => {
    for (const path of LegacyProductModulePaths) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    }
  });

  it("does not retain unreachable legacy workspace subsystems", () => {
    for (const path of LegacyWorkflowOnlyPaths) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    }
  });

  it("replaces legacy product documentation with workflow-only guidance", () => {
    for (const path of LegacyWorkflowDocumentationPaths) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    }
  });
});
