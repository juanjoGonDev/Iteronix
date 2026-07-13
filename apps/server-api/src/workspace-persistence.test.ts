import { describe, expect, it } from "vitest";
import {
  createWorkflowCatalogStore,
  type WorkflowDefinitionUpsertInput,
} from "../../../packages/agents/src/workflow-catalog";
import {
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../../packages/shared/src/workflows";
import { createProviderStore } from "./providers";
import { createWorkspacePersistence } from "./server";
import {
  createDefaultWorkspaceState,
  type WorkspaceState,
  type WorkspaceStateStore,
} from "./workspace-state";

describe("workspace persistence mutations", () => {
  it("rolls back a rejected workflow definition before a later save", async () => {
    const fixture = createPersistenceFixture();

    fixture.catalog.upsertWorkflow(createWorkflowDefinitionInput());

    await expect(fixture.persistence.saveCurrent()).rejects.toThrow(
      "Workspace state revision conflict",
    );
    expect(fixture.catalog.listWorkflows()).toEqual([]);

    await fixture.persistence.saveCurrent();

    expect(fixture.savedStates).toHaveLength(1);
    expect(fixture.savedStates[0]?.workflows.definitions).toEqual([]);
  });

  it("rolls back a rejected provider selection before a later save", async () => {
    const fixture = createPersistenceFixture();

    const selected = fixture.providerStore.selectProvider({
      profileId: "default",
      providerId: "codex-cli",
    });
    expect(selected.type).toBe("ok");

    await expect(fixture.persistence.saveCurrent()).rejects.toThrow(
      "Workspace state revision conflict",
    );
    expect(fixture.providerStore.snapshot().selections).toEqual([]);

    await fixture.persistence.saveCurrent();

    expect(fixture.savedStates).toHaveLength(1);
    expect(fixture.savedStates[0]?.providerSelections).toEqual([]);
  });

  it("does not persist an overlapping candidate after an earlier save is rejected", async () => {
    const fixture = createOverlappingPersistenceFixture();

    fixture.catalog.upsertWorkflow(createWorkflowDefinitionInput());
    const rejectedSave = fixture.persistence.saveCurrent();
    await fixture.firstSaveStarted;

    fixture.catalog.upsertWorkflow(
      createWorkflowDefinitionInput({ name: "Later workflow" }),
    );
    const laterSave = fixture.persistence.saveCurrent();

    fixture.rejectFirstSave();

    await expect(rejectedSave).rejects.toThrow(
      "Workspace state revision conflict",
    );
    await laterSave;

    expect(fixture.savedStates).toHaveLength(1);
    expect(fixture.savedStates[0]?.workflows.definitions).toEqual([]);
  });
});

const createPersistenceFixture = () => {
  const initialState = createDefaultWorkspaceState();
  const catalog = createWorkflowCatalogStore({
    now: () => new Date("2026-07-13T00:00:00.000Z"),
  });
  const providerStore = createProviderStore();
  const savedStates: WorkspaceState[] = [];
  let rejectNextSave = true;
  const stateStore: WorkspaceStateStore = {
    load: async () => initialState,
    save: async (state) => {
      if (rejectNextSave) {
        rejectNextSave = false;
        throw new Error("Workspace state revision conflict");
      }

      const saved = { ...state, revision: state.revision + 1 };
      savedStates.push(saved);
      return saved;
    },
    update: async (updater) => updater(initialState),
  };
  const persistence = createWorkspacePersistence({
    stateStore,
    initialState,
    providerStore,
    workflowCatalog: catalog,
  });

  return { catalog, persistence, providerStore, savedStates };
};

const createOverlappingPersistenceFixture = () => {
  const initialState = createDefaultWorkspaceState();
  const catalog = createWorkflowCatalogStore({
    now: () => new Date("2026-07-13T00:00:00.000Z"),
  });
  const providerStore = createProviderStore();
  const savedStates: WorkspaceState[] = [];
  const firstSave = createDeferred<void>();
  const rejectFirstSave = createDeferred<void>();
  let isFirstSave = true;
  let saveQueue: Promise<void> = Promise.resolve();
  const stateStore: WorkspaceStateStore = {
    load: async () => initialState,
    save: async (state) => {
      const queuedSave = saveQueue.then(async () => {
        if (isFirstSave) {
          isFirstSave = false;
          firstSave.resolve(undefined);
          await rejectFirstSave.promise;
          throw new Error("Workspace state revision conflict");
        }

        const saved = { ...state, revision: state.revision + 1 };
        savedStates.push(saved);
        return saved;
      });
      saveQueue = queuedSave.then(
        () => undefined,
        () => undefined,
      );
      return queuedSave;
    },
    update: async (updater) => updater(initialState),
  };
  const persistence = createWorkspacePersistence({
    stateStore,
    initialState,
    providerStore,
    workflowCatalog: catalog,
  });

  return {
    catalog,
    firstSaveStarted: firstSave.promise,
    persistence,
    rejectFirstSave: () => rejectFirstSave.resolve(undefined),
    savedStates,
  };
};

const createDeferred = <TValue>() => {
  let resolve: (value: TValue | PromiseLike<TValue>) => void = () => undefined;
  const promise = new Promise<TValue>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

const createWorkflowDefinitionInput = (
  input: { name?: string } = {},
): WorkflowDefinitionUpsertInput => ({
  name: input.name ?? "Rejected workflow",
  description: "Must not survive a failed PostgreSQL write.",
  status: WorkflowRecordStatus.Draft,
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  executionPolicy: {
    maxNodeRetries: 1,
    allowManualCheckpointResume: true,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 8,
    carryArtifactLimit: 8,
  },
  tags: [],
  nodes: [],
  edges: [],
});
