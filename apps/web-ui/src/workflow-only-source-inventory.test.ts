import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WebSourceRoot = join(process.cwd(), "apps", "web-ui", "src");
const WebUiRoot = join(process.cwd(), "apps", "web-ui");

const RemovedSourcePaths = [
  "components/KanbanPrimitives.test.ts",
  "components/KanbanPrimitives.ts",
  "components/OverviewPrimitives.test.ts",
  "components/OverviewPrimitives.ts",
  "screens/Dashboard.ts",
  "screens/Explorer.ts",
  "screens/History.ts",
  "screens/Kanban.ts",
  "screens/Projects.ts",
  "screens/explorer-state.test.ts",
  "screens/explorer-state.ts",
  "screens/explorer-url-state.test.ts",
  "screens/explorer-url-state.ts",
  "screens/history-url-state.test.ts",
  "screens/history-url-state.ts",
  "screens/kanban-state.test.ts",
  "screens/kanban-state.ts",
  "screens/kanban-url-state.test.ts",
  "screens/kanban-url-state.ts",
  "screens/projects-state.test.ts",
  "screens/projects-state.ts",
  "screens/projects-url-state.test.ts",
  "screens/projects-url-state.ts",
  "shared/explorer-client.test.ts",
  "shared/explorer-client.ts",
  "shared/explorer-workspace-session.test.ts",
  "shared/explorer-workspace-session.ts",
  "shared/git-client.test.ts",
  "shared/git-client.ts",
  "shared/kanban-client.test.ts",
  "shared/kanban-client.ts",
  "shared/logger-core.test.ts",
  "shared/logger-core.ts",
  "shared/logger-impl.ts",
  "shared/project-session.test.ts",
  "shared/project-session.ts",
  "shared/quality-gates-client.test.ts",
  "shared/quality-gates-client.ts",
  "shared/workbench-client.ts",
  "shared/workbench-codec.ts",
  "shared/workbench-history.test.ts",
  "shared/workbench-history.ts",
  "shared/workbench-types.ts",
  "shared/workspace-state-client.ts",
  "shared/types.ts",
] as const;

const RemovedScriptPaths = [
  "scripts/quality-gates-validation-fixture.ts",
  "scripts/quality-gates-validation-fixture.test.ts",
  "scripts/validate-explorer.ts",
  "scripts/validate-history.ts",
  "scripts/validate-kanban.ts",
  "scripts/validate-projects-git-workspace.ts",
  "scripts/validate-quality-gates-projects.ts",
  "scripts/validate-server-persistence.ts",
  "scripts/validate-workbench-source-linking.ts",
] as const;

describe("workflow-only web source inventory", () => {
  it("removes every obsolete project-centric web module", () => {
    expect(
      RemovedSourcePaths.filter((path) =>
        existsSync(join(WebSourceRoot, path)),
      ),
    ).toEqual([]);
  });

  it("removes obsolete project-centric browser validators", () => {
    expect(
      RemovedScriptPaths.filter((path) => existsSync(join(WebUiRoot, path))),
    ).toEqual([]);
  });

  it("registers only workflow and settings navigation routes", () => {
    const constants = readFileSync(
      join(WebSourceRoot, "shared", "constants.ts"),
      "utf8",
    );
    expect(constants).toContain('WORKFLOWS: "/workflows"');
    expect(constants).toContain('SETTINGS: "/settings"');
    expect(constants).not.toMatch(/OVERVIEW|PROJECTS|EXPLORER|KANBAN|HISTORY/);
  });

  it("does not retain workspace-state browser requests", () => {
    const source = readFileSync(
      join(WebSourceRoot, "screens", "Workflows.ts"),
      "utf8",
    );
    expect(source).not.toContain("/workspace/state/get");
    expect(source).not.toContain("workspace-state-client");
  });

  it("keeps workflow creation and selection in the catalog, not the editor", () => {
    const catalogSource = readFileSync(
      join(WebSourceRoot, "screens", "WorkflowsCatalog.ts"),
      "utf8",
    );
    const editorSource = readFileSync(
      join(WebSourceRoot, "screens", "Workflows.ts"),
      "utf8",
    );

    expect(catalogSource).toContain("workflows-catalog-create");
    expect(editorSource).not.toContain("workflows-select");
    expect(editorSource).not.toContain("handleCreateWorkflow");
  });

  it("does not retain removed workspace-state artifacts in the emitted browser output", () => {
    const emittedPaths = readEmittedPaths(join(WebUiRoot, "dist"));
    const emittedSource = emittedPaths
      .filter((path) => path.endsWith(".js"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(emittedPaths).not.toContain(
      join(WebUiRoot, "dist", "shared", "workspace-state-client.js"),
    );
    expect(emittedSource).not.toContain("/workspace/state/get");
    expect(emittedSource).not.toContain("workspace-state-client");
  });
});

const readEmittedPaths = (directory: string): ReadonlyArray<string> => {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? readEmittedPaths(path) : [path];
  });
};
