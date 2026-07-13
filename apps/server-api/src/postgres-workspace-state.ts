import { Pool, type PoolConfig } from "pg";
import {
  parseWorkspaceState,
  redactWorkspaceState,
  type WorkspaceState,
  type WorkspaceStateStore,
} from "./workspace-state";

const WorkspaceStateKey = "workspace";
const CreateStateTableSql = `
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
const LoadStateSql = "SELECT value, revision FROM app_state WHERE key = $1";
const SaveStateSql = `
  INSERT INTO app_state (key, value, revision)
  VALUES ($1, $2::jsonb, $3)
  ON CONFLICT (key)
  DO UPDATE SET
    value = EXCLUDED.value,
    revision = EXCLUDED.revision,
    updated_at = NOW()
  WHERE app_state.revision = $4
  RETURNING revision
`;

type QueryResult = {
  rows: ReadonlyArray<{ value?: unknown; revision?: unknown }>;
};

export type PostgresWorkspaceStateClient = {
  query: (
    text: string,
    values?: ReadonlyArray<unknown>,
  ) => Promise<QueryResult>;
};

export type PostgresWorkspaceStateStore = WorkspaceStateStore & {
  initialize: () => Promise<void>;
};

export const createPostgresWorkspaceStateStore = (
  client: PostgresWorkspaceStateClient,
): PostgresWorkspaceStateStore => {
  let saveQueue: Promise<unknown> = Promise.resolve();
  let knownRevision = 0;
  const initialize = async (): Promise<void> => {
    await client.query(CreateStateTableSql);
  };

  const load = async (): Promise<WorkspaceState> => {
    const result = await client.query(LoadStateSql, [WorkspaceStateKey]);
    const state = parseWorkspaceState(result.rows[0]?.value);
    const revision = result.rows[0]?.revision;
    const loaded = {
      ...state,
      revision: readRevision(revision) ?? state.revision,
    };
    knownRevision = loaded.revision;
    return loaded;
  };

  const save = (state: WorkspaceState): Promise<WorkspaceState> => {
    const pendingSave = saveQueue
      .catch(() => undefined)
      .then(() => saveState(state));
    saveQueue = pendingSave;
    return pendingSave;
  };

  const update = async (
    updater: (state: WorkspaceState) => WorkspaceState,
  ): Promise<WorkspaceState> => save(updater(await load()));

  return {
    initialize,
    load,
    save,
    update,
  };

  async function saveState(state: WorkspaceState): Promise<WorkspaceState> {
    const normalized = parseWorkspaceState(state);
    const expectedRevision = Math.max(normalized.revision, knownRevision);
    const nextRevision = expectedRevision + 1;
    const persisted = redactWorkspaceState({
      ...normalized,
      revision: nextRevision,
    });
    const result = await client.query(SaveStateSql, [
      WorkspaceStateKey,
      JSON.stringify(persisted),
      nextRevision,
      expectedRevision,
    ]);
    const returnedRevision = result.rows[0]?.revision;
    const revision = readRevision(returnedRevision);
    if (revision === undefined) {
      throw new Error("Workspace state revision conflict");
    }

    knownRevision = revision;
    return { ...normalized, revision };
  }
};

export const createPostgresPool = (connectionString: string): Pool =>
  new Pool(readPoolConfig(connectionString));

const readPoolConfig = (connectionString: string): PoolConfig => ({
  connectionString,
});

const readRevision = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }

  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};
