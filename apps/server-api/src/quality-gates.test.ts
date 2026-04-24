import { mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ResultType,
  ok
} from "./result";
import { createHistoryStore, HistoryEventType, HistoryRunStatus } from "./history";
import { createProjectStore } from "./projects";
import { createCommandPolicy, createWorkspacePolicy } from "./sandbox";
import { ErrorMessage, HttpStatus } from "./constants";
import {
  QualityGateId,
  createQualityGateEventHub,
  listQualityGateEvents,
  listQualityGateRuns,
  parseQualityGateRunRequest,
  startQualityGateRun,
  type QualityGateCatalog
} from "./quality-gates";
import {
  CommandOutputSource,
  type CommandRunner,
  type CommandRunResult
} from "../../../packages/adapters/src/command-runner/command-runner";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (path) => {
      await rm(path, {
        recursive: true,
        force: true
      });
    })
  );
});

describe("quality gates api", () => {
  it("defaults to all quality gates when no explicit list is provided", () => {
    const parsed = parseQualityGateRunRequest({
      projectId: "project-1"
    });

    expect(parsed.type).toBe(ResultType.Ok);
    if (parsed.type !== ResultType.Ok) {
      return;
    }

    expect(parsed.value.gates).toEqual([
      QualityGateId.Lint,
      QualityGateId.Typecheck,
      QualityGateId.Test,
      QualityGateId.Build
    ]);
  });

  it("starts a run, streams progress, and persists run history for polling", async () => {
    const projectRoot = await createTempProjectRoot();
    const store = createProjectStore();
    const opened = store.open({
      rootPath: projectRoot
    });
    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    const historyStore = createHistoryStore();
    const workspacePolicy = createWorkspacePolicy([projectRoot]);
    const commandPolicy = createCommandPolicy(
      [basename(process.execPath)],
      workspacePolicy
    );
    const eventHub = createQualityGateEventHub();
    const streamedEvents: Array<{ type: string; text?: string }> = [];
    const commandRunner = createFakeCommandRunner();
    const catalog = createTestQualityGateCatalog();

    const started = await startQualityGateRun(
      {
        projectId: opened.value.id,
        gates: [
          QualityGateId.Lint,
          QualityGateId.Typecheck,
          QualityGateId.Test,
          QualityGateId.Build
        ]
      },
      {
        projectStore: store,
        historyStore,
        workspacePolicy,
        commandPolicy,
        commandRunner,
        eventHub,
        catalog
      }
    );

    expect(started.type).toBe(ResultType.Ok);
    if (started.type !== ResultType.Ok) {
      return;
    }

    const unsubscribe = eventHub.subscribe(started.value.id, (event) => {
      const text =
        typeof event.data["text"] === "string" ? event.data["text"] : undefined;
      streamedEvents.push({
        type: event.type,
        ...(text ? { text } : {})
      });
    });

    await waitFor(async () => {
      const listed = listQualityGateRuns(
        {
          projectId: opened.value.id
        },
        {
          historyStore
        }
      );
      if (listed.type !== ResultType.Ok) {
        return false;
      }

      const current = listed.value[0];
      return current?.status === HistoryRunStatus.Completed;
    });

    unsubscribe();

    const listed = listQualityGateRuns(
      {
        projectId: opened.value.id
      },
      {
        historyStore
      }
    );

    expect(listed.type).toBe(ResultType.Ok);
    if (listed.type !== ResultType.Ok) {
      return;
    }

    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.status).toBe(HistoryRunStatus.Completed);

    const events = listQualityGateEvents(
      {
        runId: started.value.id
      },
      {
        historyStore
      }
    );

    expect(events.type).toBe(ResultType.Ok);
    if (events.type !== ResultType.Ok) {
      return;
    }

    expect(
      events.value.some(
        (event) =>
          event.type === HistoryEventType.Message &&
          event.data["text"] === "Running lint"
      )
    ).toBe(true);
    expect(
      events.value.some(
        (event) =>
          event.type === HistoryEventType.Done &&
          event.data["status"] === HistoryRunStatus.Completed
      )
    ).toBe(true);
    expect(
      streamedEvents.some(
        (event) =>
          event.type === HistoryEventType.Message && event.text === "Running lint"
      )
    ).toBe(true);
  });

  it("rejects runs outside the configured workspace root", async () => {
    const projectRoot = await createTempProjectRoot();
    const store = createProjectStore();
    const opened = store.open({
      rootPath: projectRoot
    });
    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    const historyStore = createHistoryStore();
    const workspacePolicy = createWorkspacePolicy([join(projectRoot, "blocked")]);
    const commandPolicy = createCommandPolicy(
      [basename(process.execPath)],
      workspacePolicy
    );

    const started = await startQualityGateRun(
      {
        projectId: opened.value.id,
        gates: [QualityGateId.Lint]
      },
      {
        projectStore: store,
        historyStore,
        workspacePolicy,
        commandPolicy,
        commandRunner: createFakeCommandRunner(),
        eventHub: createQualityGateEventHub(),
        catalog: createTestQualityGateCatalog()
      }
    );

    expect(started.type).toBe(ResultType.Err);
    if (started.type === ResultType.Err) {
      expect(started.error.status).toBe(HttpStatus.Forbidden);
      expect(started.error.message).toBe(ErrorMessage.WorkspaceNotAllowed);
    }
  });

  it("rejects runs when the command is not allowlisted", async () => {
    const projectRoot = await createTempProjectRoot();
    const store = createProjectStore();
    const opened = store.open({
      rootPath: projectRoot
    });
    if (opened.type !== ResultType.Ok) {
      throw new Error("Expected opened project");
    }

    const historyStore = createHistoryStore();
    const workspacePolicy = createWorkspacePolicy([projectRoot]);
    const commandPolicy = createCommandPolicy([], workspacePolicy);

    const started = await startQualityGateRun(
      {
        projectId: opened.value.id,
        gates: [QualityGateId.Lint]
      },
      {
        projectStore: store,
        historyStore,
        workspacePolicy,
        commandPolicy,
        commandRunner: createFakeCommandRunner(),
        eventHub: createQualityGateEventHub(),
        catalog: createTestQualityGateCatalog()
      }
    );

    expect(started.type).toBe(ResultType.Err);
    if (started.type === ResultType.Err) {
      expect(started.error.status).toBe(HttpStatus.Forbidden);
      expect(started.error.message).toBe(ErrorMessage.CommandNotAllowed);
    }
  });
});

const createTempProjectRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "iteronix-quality-gates-"));
  tempRoots.push(root);
  return root;
};

const createTestQualityGateCatalog = (): QualityGateCatalog => ({
  [QualityGateId.Lint]: createNodeGateCommand(QualityGateId.Lint),
  [QualityGateId.Typecheck]: createNodeGateCommand(QualityGateId.Typecheck),
  [QualityGateId.Test]: createNodeGateCommand(QualityGateId.Test),
  [QualityGateId.Build]: createNodeGateCommand(QualityGateId.Build)
});

const createNodeGateCommand = (gate: QualityGateId) => ({
  id: gate,
  command: process.execPath,
  args: [
    "-e",
    `process.stdout.write(${JSON.stringify(`gate:${gate}\\n`)});`
  ]
});

const createFakeCommandRunner = (): CommandRunner => ({
  run: async (input) => {
    await delay(5);
    const gate = input.args[1]?.includes("typecheck")
      ? "typecheck"
      : input.args[1]?.includes("build")
        ? "build"
        : input.args[1]?.includes("test")
          ? "test"
          : "lint";
    const text = `gate:${gate}\n`;
    input.onOutput?.({
      source: CommandOutputSource.Stdout,
      text,
      timestamp: new Date().toISOString()
    });
    const result: CommandRunResult = {
      command: basename(input.command),
      args: [...input.args],
      cwd: input.cwd,
      exitCode: 0,
      stdout: text,
      stderr: "",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    };
    return ok(result);
  }
});

const waitFor = async (
  predicate: () => Promise<boolean>,
  maxAttempts = 50
): Promise<void> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await predicate()) {
      return;
    }

    await delay(10);
  }

  throw new Error("Timed out waiting for quality gate run");
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
