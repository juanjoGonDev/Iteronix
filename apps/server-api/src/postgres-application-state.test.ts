import { describe, expect, it } from "vitest";
import {
  createDefaultApplicationState,
  parseApplicationState,
} from "./application-state";
import { createPostgresApplicationStateStore } from "./postgres-application-state";
import { resolveProviderApiKey } from "./workflow-runtime";
import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";

type QueryCall = {
  text: string;
  values?: ReadonlyArray<unknown>;
};

const StateKey = "application";
const LegacyStateKey = "workspace";

describe("PostgreSQL application state store", () => {
  it("loads the empty workflow baseline without issuing runtime schema DDL", async () => {
    const client = createClient([]);
    const store = createPostgresApplicationStateStore(client);

    await store.initialize();
    const state = await store.load();

    expect(state.workflows.definitions).toEqual([]);
    expect(state.settings.providerProfiles).toEqual([]);
    expect(client.calls[0]).toEqual({
      text: "SELECT value, revision FROM app_state WHERE key = $1",
      values: [StateKey],
    });
  });

  it("parses PostgreSQL BIGINT revisions returned as strings", async () => {
    const client = createClient([
      {
        value: createDefaultApplicationState(),
        revision: "9007199254740991",
      },
    ]);
    const store = createPostgresApplicationStateStore(client);

    await expect(store.load()).resolves.toMatchObject({
      revision: 9007199254740991,
    });
  });

  it("reloads editable asset records from PostgreSQL JSONB and defaults missing catalogs safely", async () => {
    const state = createDefaultApplicationState();
    const asset = createEditableAsset();
    const store = createPostgresApplicationStateStore(
      createClient([
        {
          value: { ...state, editableAssets: { records: [asset] } },
          revision: 4,
        },
      ]),
    );

    await expect(store.load()).resolves.toMatchObject({
      revision: 4,
      editableAssets: {
        records: [
          expect.objectContaining({ id: asset.id, kind: AssetKind.Agent }),
        ],
      },
    });
    expect(
      parseApplicationState({ ...state, editableAssets: undefined })
        .editableAssets.records,
    ).toEqual([]);
  });

  it("reads the legacy PostgreSQL key until the application state is next saved", async () => {
    const legacyState = createDefaultApplicationState();
    const calls: QueryCall[] = [];
    const client = {
      calls,
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        calls.push({ text, ...(values ? { values } : {}) });
        return values?.[0] === LegacyStateKey
          ? { rows: [{ value: legacyState, revision: 4 }] }
          : { rows: [] };
      },
    };
    const store = createPostgresApplicationStateStore(client);

    await expect(store.load()).resolves.toMatchObject({ revision: 4 });
    expect(client.calls[0]?.values).toEqual([StateKey]);
    expect(client.calls[1]?.values).toEqual([LegacyStateKey]);
  });

  it("migrates legacy workspace asset scopes while loading PostgreSQL state", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      workflows: {
        ...state.workflows,
        assets: [
          {
            id: "asset-1",
            kind: "prompt",
            scope: "workspace",
            name: "Legacy prompt",
            slug: "legacy-prompt",
            description: "",
            body: "Prompt",
            language: "en",
            version: 1,
            tags: [],
            createdAt: "2026-07-15T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
        ],
      },
    });

    expect(parsed.workflows.assets[0]?.scope).toBe("global");
  });

  it("upserts normalized state into PostgreSQL instead of a local file", async () => {
    const client = createClient([]);
    const store = createPostgresApplicationStateStore(client);
    const state = createDefaultApplicationState();

    const saved = await store.save(state);
    const saveCall = client.calls.find((call) =>
      call.text.includes("INSERT INTO app_state"),
    );

    expect(saved).toEqual({ ...state, revision: 1 });
    expect(saveCall?.values?.[0]).toBe(StateKey);
    expect(saveCall?.values?.[2]).toBe(1);
    expect(saveCall?.values?.[3]).toBe(0);
    expect(String(saveCall?.values?.[1])).not.toContain("dev-token");
  });

  it("serializes saves, advances revisions, and does not persist credentials", async () => {
    const client = createRevisionedClient();
    const store = createPostgresApplicationStateStore(client);
    const state = createDefaultApplicationState();

    const legacyConnectionState = parseApplicationState({
      ...state,
      settings: {
        ...state.settings,
        serverConnection: {
          serverUrl: "http://localhost:4000",
          authToken: "private-token",
        },
      },
    });

    const [first, second] = await Promise.all([
      store.save(legacyConnectionState),
      store.save(state),
    ]);

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(client.maxConcurrentWrites).toBe(1);
    expect(JSON.stringify(client.savedValues)).not.toContain("private-token");
  });

  it("retains provider environment references across persistence while removing raw keys", async () => {
    const client = createClient([]);
    const store = createPostgresApplicationStateStore(client);
    const state = createDefaultApplicationState();

    await store.save({
      ...state,
      settings: {
        ...state.settings,
        providerProfiles: [
          {
            id: "openai",
            providerKind: "openai",
            apiKey: "raw-provider-key",
            apiKeyEnvVar: "WORKFLOW_PROVIDER_KEY",
          },
        ],
      },
    });

    const saveCall = client.calls.find((call) =>
      call.text.includes("INSERT INTO app_state"),
    );
    const persisted = parseApplicationState(
      JSON.parse(String(saveCall?.values?.[1])),
    );
    const reference = persisted.settings.providerProfiles[0]?.["apiKeyEnvVar"];

    expect(String(saveCall?.values?.[1])).not.toContain("raw-provider-key");
    expect(reference).toBe("WORKFLOW_PROVIDER_KEY");
    expect(
      resolveProviderApiKey(
        {
          apiKeyEnvVar: typeof reference === "string" ? reference : "",
        },
        { WORKFLOW_PROVIDER_KEY: "restarted-provider-key" },
      ),
    ).toBe("restarted-provider-key");
  });

  it("rejects a stale PostgreSQL state revision instead of overwriting it", async () => {
    const client = createRevisionedClient({ rejectWrites: true });
    const store = createPostgresApplicationStateStore(client);

    await expect(store.save(createDefaultApplicationState())).rejects.toThrow(
      "Application state revision conflict",
    );
  });
});

const createClient = (
  rows: ReadonlyArray<{ value: unknown; revision?: unknown }>,
) => {
  const calls: QueryCall[] = [];
  return {
    calls,
    query: async (text: string, values?: ReadonlyArray<unknown>) => {
      calls.push({ text, ...(values ? { values } : {}) });
      return text.includes("INSERT INTO app_state")
        ? { rows: [{ revision: 1 }] }
        : { rows };
    },
  };
};

const createEditableAsset = (): EditableAssetRecord => ({
  id: "postgres-agent",
  kind: AssetKind.Agent,
  name: "PostgreSQL agent",
  status: AssetStatus.Enabled,
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  inputSchema: {
    id: "postgres-agent.input",
    version: 1,
    schema: { type: "object", additionalProperties: false },
  },
  outputSchema: {
    id: "postgres-agent.output",
    version: 1,
    schema: { type: "object", additionalProperties: false },
  },
  limits: { executions: 1, timeoutMs: 1000 },
  provenance: {
    source: "test",
    artifactFingerprint: "postgres-agent-fingerprint",
    registeredAt: "2026-07-18T00:00:00.000Z",
  },
  agent: {
    providerId: "test",
    model: "test-model",
    toolPermissions: ["tool.invoke"],
  },
});

const createRevisionedClient = (options: { rejectWrites?: boolean } = {}) => {
  let revision = 0;
  let activeWrites = 0;
  const savedValues: unknown[] = [];
  const client = {
    maxConcurrentWrites: 0,
    savedValues,
    query: async (text: string, values?: ReadonlyArray<unknown>) => {
      if (!text.includes("INSERT INTO app_state")) {
        return { rows: [] };
      }

      activeWrites += 1;
      client.maxConcurrentWrites = Math.max(
        client.maxConcurrentWrites,
        activeWrites,
      );
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeWrites -= 1;
      savedValues.push(values?.[1]);
      if (options.rejectWrites) {
        return { rows: [] };
      }

      revision += 1;
      return { rows: [{ revision }] };
    },
  };

  return client;
};
