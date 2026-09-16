import { describe, expect, it } from "vitest";
import {
  createApplicationStateFromStores,
  createDefaultApplicationState,
  cutOverLegacyExternalApiKeys,
  parseApplicationState,
  redactApplicationState,
} from "./application-state";

const Now = "2026-07-28T12:00:00.000Z";

describe("application state parsing", () => {
  it("falls back to defaults for non-record payloads and empty envelopes", () => {
    const defaults = createDefaultApplicationState();
    const parsed = parseApplicationState("not-a-state");

    expect(parsed.externalApiKeys).toEqual([]);
    expect({
      ...parsed,
      createdAt: defaults.createdAt,
      updatedAt: defaults.updatedAt,
    }).toEqual({
      ...defaults,
      version: defaults.version,
    });
  });

  it("reads legacy application and workspace envelopes", () => {
    const state = createDefaultApplicationState();

    expect(parseApplicationState({ application: state }).revision).toBe(0);
    expect(parseApplicationState({ workspace: state }).revision).toBe(0);
  });

  it("drops non-array and malformed external credential entries", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      externalApiKeys: "not-an-array",
    });
    expect(parsed.externalApiKeys).toEqual([]);

    const invalidEntries = [
      "not-a-record",
      {
        name: "x",
        secretHash: "h",
        createdAt: Now,
        scope: { kind: "all_workflows" },
      },
      {
        id: "x",
        secretHash: "h",
        createdAt: Now,
        scope: { kind: "all_workflows" },
      },
      { id: "x", name: "x", secretHash: "h", scope: { kind: "all_workflows" } },
      { id: "x", name: "x", secretHash: "h", createdAt: Now },
      { id: "x", name: "x", secretHash: "h", createdAt: Now, scope: "bad" },
      {
        id: "x",
        name: "x",
        secretHash: "h",
        createdAt: Now,
        scope: { kind: "tenant" },
      },
      {
        id: "x",
        name: "x",
        secretHash: "h",
        createdAt: Now,
        scope: { kind: "selected_workflows", workflowIds: "bad" },
      },
    ];
    expect(
      parseApplicationState({ ...state, externalApiKeys: invalidEntries })
        .externalApiKeys,
    ).toEqual([]);
  });

  it("keeps strictly validated credential policy metadata and drops loose values", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      externalApiKeys: [
        {
          id: "full",
          name: " Full ",
          secretHash: "h",
          createdAt: Now,
          scope: {
            kind: "selected_workflows",
            workflowIds: ["workflow-1", 42, ""],
          },
          operations: ["workflow.read", "bogus.operation"],
          expiresAt: "2027-01-01T00:00:00.000Z",
          rateLimitPerMinute: 300,
          generation: 2,
          lastUsedAt: "2026-07-28T11:00:00.000Z",
          revokedAt: "2026-07-28T11:30:00.000Z",
        },
        {
          id: "loose",
          name: "Loose",
          secretHash: "h",
          createdAt: Now,
          scope: { kind: "all_workflows" },
          operations: ["bogus.operation"],
          rateLimitPerMinute: 700,
          generation: -1,
        },
        {
          id: "empty-operations",
          name: "Empty operations",
          secretHash: "h",
          createdAt: Now,
          scope: { kind: "all_workflows" },
          operations: [],
          rateLimitPerMinute: 1.5,
        },
      ],
    });

    expect(parsed.externalApiKeys).toEqual([
      {
        id: "full",
        name: "Full",
        secretHash: "h",
        createdAt: Now,
        scope: {
          kind: "selected_workflows",
          workflowIds: ["workflow-1"],
        },
        operations: ["workflow.read"],
        expiresAt: "2027-01-01T00:00:00.000Z",
        rateLimitPerMinute: 300,
        generation: 2,
        lastUsedAt: "2026-07-28T11:00:00.000Z",
        revokedAt: "2026-07-28T11:30:00.000Z",
      },
      {
        id: "loose",
        name: "Loose",
        secretHash: "h",
        createdAt: Now,
        scope: { kind: "all_workflows" },
      },
      {
        id: "empty-operations",
        name: "Empty operations",
        secretHash: "h",
        createdAt: Now,
        scope: { kind: "all_workflows" },
      },
    ]);
  });

  it("keeps non-array operations and non-integer rate limits out of credential metadata", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      externalApiKeys: [
        {
          id: "loose",
          name: "Loose",
          secretHash: "h",
          createdAt: Now,
          scope: { kind: "all_workflows" },
          operations: "workflow.read",
          rateLimitPerMinute: "60",
          generation: 1.5,
        },
      ],
    });

    expect(parsed.externalApiKeys[0]).not.toHaveProperty("operations");
    expect(parsed.externalApiKeys[0]).not.toHaveProperty("rateLimitPerMinute");
    expect(parsed.externalApiKeys[0]).not.toHaveProperty("generation");
  });

  it("falls back to defaults for malformed nested settings, providers, and catalogs", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      settings: "bad",
      providerSelections: [{ profileId: "p" }],
      providerSettings: [{ profileId: "p" }],
      workflows: "bad",
    });

    expect(parsed.settings).toEqual(createDefaultApplicationState().settings);
    expect(parsed.providerSelections).toEqual([]);
    expect(parsed.providerSettings).toEqual([]);
    expect(parsed.workflows.definitions).toEqual([]);
  });

  it("redacts malformed workflow limits and notifications conservatively", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      settings: {
        profileId: "custom",
        providerProfiles: "bad",
        workflowLimits: "bad",
        notifications: "bad",
      },
    });

    expect(parsed.settings.profileId).toBe("custom");
    expect(parsed.settings.workflowLimits).toEqual({
      infiniteLoops: false,
      maxLoops: 50,
      externalCalls: true,
    });
    expect(parsed.settings.notifications).toEqual({
      soundEnabled: true,
      webhookUrl: "",
    });
    expect(parsed.settings.providerProfiles).toEqual(
      createDefaultApplicationState().settings.providerProfiles,
    );
  });

  it("ignores non-boolean limits and invalid loop counts", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      settings: {
        profileId: "custom",
        providerProfiles: [],
        workflowLimits: {
          infiniteLoops: "yes",
          maxLoops: "plenty",
          externalCalls: "no",
        },
        notifications: {
          soundEnabled: "off",
          webhookUrl: 42,
        },
      },
    });

    expect(parsed.settings.workflowLimits).toEqual({
      infiniteLoops: false,
      maxLoops: 50,
      externalCalls: true,
    });
    expect(parsed.settings.notifications).toEqual({
      soundEnabled: true,
      webhookUrl: "",
    });
  });

  it("migrates legacy workspace-scoped workflow assets and keeps other assets", () => {
    const state = createDefaultApplicationState();
    const assets = [
      { id: "legacy", scope: "workspace" },
      { id: "modern", scope: "shared" },
      "not-a-record",
    ];
    const withAssets = parseApplicationState({
      ...state,
      workflows: { ...state.workflows, assets },
    });

    expect(withAssets.workflows.assets).toEqual([
      { id: "legacy", scope: "global" },
      { id: "modern", scope: "shared" },
    ]);
  });

  it("applies defaults for every missing top-level field on an empty record", () => {
    const parsed = parseApplicationState({});
    const defaults = createDefaultApplicationState();

    expect(parsed.revision).toBe(0);
    expect(typeof parsed.createdAt).toBe("string");
    expect(parsed.updatedAt).toBe(parsed.createdAt);
    expect(parsed.settings).toEqual(defaults.settings);
    expect(parsed.externalApiKeys).toEqual([]);
  });

  it("applies defaults for malformed settings and keeps valid provider ledger entries", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      settings: {
        workflowLimits: "broken",
        notifications: [],
      },
      providerSelections: [
        { profileId: "profile-1", providerId: "openai", updatedAt: Now },
        { profileId: "profile-2" },
      ],
      providerSettings: [
        {
          profileId: "profile-1",
          providerId: "openai",
          updatedAt: Now,
          config: { apiKey: "scrub-me", region: "eu" },
        },
        { providerId: "anthropic" },
      ],
    });

    expect(parsed.settings.profileId).toBe("default");
    expect(parsed.settings.providerProfiles).toEqual([]);
    expect(parsed.settings.workflowLimits).toEqual(
      state.settings.workflowLimits,
    );
    expect(parsed.settings.notifications).toEqual(state.settings.notifications);
    expect(parsed.providerSelections).toEqual([
      { profileId: "profile-1", providerId: "openai", updatedAt: Now },
    ]);
    expect(parsed.providerSettings).toEqual([
      {
        profileId: "profile-1",
        providerId: "openai",
        updatedAt: Now,
        config: { region: "eu" },
      },
    ]);
  });

  it("sanitizes provider profile secrets and non-JSON values during parsing", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      settings: {
        ...state.settings,
        providerProfiles: [
          {
            id: "p1",
            apiKey: "secret-token",
            orphan: undefined,
            keepNull: null,
            nested: [
              "keep",
              { apiKey: "wipe", ok: true },
              { flag: [1, NaN, Infinity] },
            ],
            numbers: [1, NaN, Infinity, "text"],
            deep: { clientSecret: "drop-me", values: [true, false] },
          },
        ],
      },
    });

    expect(parsed.settings.providerProfiles).toEqual([
      {
        id: "p1",
        keepNull: null,
        nested: ["keep", { ok: true }, { flag: [1] }],
        numbers: [1, "text"],
        deep: { values: [true, false] },
      },
    ]);
  });

  it("keeps non-array workflow asset payloads as-is while parsing wrappers", () => {
    const state = createDefaultApplicationState();
    const parsed = parseApplicationState({
      ...state,
      workflows: {
        ...state.workflows,
        assets: "tampered-payload",
      },
    });

    expect(parsed.workflows.assets).toEqual(state.workflows.assets);
  });

  it("redacts nested arrays and coerces non-finite numbers out of JSON values", () => {
    const state = createDefaultApplicationState();
    const redacted = redactApplicationState({
      ...state,
      settings: {
        ...state.settings,
        providerProfiles: [
          {
            id: "p1",
            nested: ["keep", ["apiKey", { apiKey: "hide-me" }]],
            numbers: [Number.NaN, 3],
          },
        ],
      },
    });
    const profile = redacted.settings.providerProfiles[0];

    expect(profile).toBeDefined();
    if (!profile) throw new Error("Expected provider profile.");
    const nested = profile["nested"];
    expect(Array.isArray(nested)).toBe(true);
    expect(JSON.stringify(profile)).not.toContain("hide-me");
    expect(JSON.stringify(profile)).not.toContain("NaN");
    expect(JSON.stringify(profile)).toContain("apiKey");
  });
});

describe("application state stores merge", () => {
  it("builds the merged state with fresh defaults when no previous state exists", () => {
    const merged = createApplicationStateFromStores({
      settings: {
        ...createDefaultApplicationState().settings,
        profileId: "custom-profile",
      },
      providerSnapshot: { selections: [], settings: [] },
      workflowSnapshot: createDefaultApplicationState().workflows,
    });

    expect(merged.settings.profileId).toBe("custom-profile");
    expect(merged.externalApiKeys).toEqual([]);
    expect(merged.governanceLifecycles).toEqual([]);
    expect(merged.revision).toBe(0);
    const defaults = createDefaultApplicationState();
    expect(merged.editableAssets).toEqual(defaults.editableAssets);
    expect(merged.memoryDocuments).toEqual(defaults.memoryDocuments);
    expect(merged.ideAuth).toEqual(defaults.ideAuth);
  });

  it("inherits persisted slices from the previous state when merge payloads are missing", () => {
    const previous = createDefaultApplicationState();
    const previousState = {
      ...previous,
      revision: 7,
      createdAt: "2026-01-01T00:00:00.000Z",
      externalApiKeys: [
        {
          id: "legacy-1",
          name: "Legacy",
          scope: { kind: "all_workflows" as const },
          secretHash: "scrypt$salt$hash",
          createdAt: Now,
        },
      ],
      governanceLifecycles: [],
      editableAssets: {
        ...previous.editableAssets,
        records: [],
      },
    };

    const merged = createApplicationStateFromStores({
      settings: previousState.settings,
      providerSnapshot: { selections: [], settings: [] },
      workflowSnapshot: previousState.workflows,
      previousState,
    });

    expect(merged.revision).toBe(7);
    expect(merged.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(merged.externalApiKeys).toEqual(previousState.externalApiKeys);
    expect(merged.editableAssets).toEqual(previousState.editableAssets);
    expect(merged.ideAuth).toEqual(previousState.ideAuth);

    const overridden = createApplicationStateFromStores({
      settings: previousState.settings,
      providerSnapshot: { selections: [], settings: [] },
      workflowSnapshot: previousState.workflows,
      previousState,
      externalApiKeys: [],
      governanceLifecycles: [],
      editableAssets: previous.editableAssets,
      memoryDocuments: previous.memoryDocuments,
      ideAuth: previous.ideAuth,
    });
    expect(overridden.externalApiKeys).toEqual([]);
    expect(overridden.editableAssets).toEqual(previous.editableAssets);
    expect(overridden.revision).toBe(7);
  });
});

describe("legacy credential cutover resilience", () => {
  it("bootstraps defaults when the locked state row is missing", async () => {
    const queries: string[] = [];
    const transaction = {
      query: async (text: string) => {
        queries.push(text);
        return { rows: [] };
      },
      release: () => undefined,
    };
    const client = {
      query: transaction.query,
      connect: async () => transaction,
    };

    const migrated = await cutOverLegacyExternalApiKeys({ client, now: Now });

    expect(migrated.externalApiKeys).toEqual([]);
    expect(queries).toContain("COMMIT");
    expect(queries).not.toContain("ROLLBACK");
  });

  it("propagates transaction client failures through the cutover", async () => {
    const client = {
      connect: () => Promise.reject<never>(new Error("connection refused")),
      query: (): Promise<never> =>
        Promise.reject(new Error("direct query must not be used")),
    };

    await expect(
      cutOverLegacyExternalApiKeys({ client, now: Now }),
    ).rejects.toThrow("connection refused");
  });

  it("migrates selected-workflow legacy keys through a connected client and releases it", async () => {
    const state = {
      ...createDefaultApplicationState(),
      externalApiKeys: [
        {
          id: "legacy-scoped",
          name: "Scoped legacy",
          scope: {
            kind: "selected_workflows" as const,
            workflowIds: ["workflow-a", "workflow-b"],
          },
          secretHash: "scrypt$salt$hash",
          createdAt: Now,
        },
      ],
    };
    const queries: string[] = [];
    let released = false;
    const innerClient = {
      query: async (text: string) => {
        queries.push(text);
        return {
          rows: text.includes("FROM app_state") ? [{ value: state }] : [],
        };
      },
      release: () => {
        released = true;
      },
    };
    const client = {
      query: innerClient.query,
      connect: async () => innerClient,
    };

    const migrated = await cutOverLegacyExternalApiKeys({ client, now: Now });

    expect(queries.at(-1)).toBe("COMMIT");
    expect(released).toBe(true);
    const importQuery = queries.find((text) =>
      text.includes("external_workflow_credentials"),
    );
    expect(importQuery).toBeDefined();
    expect(migrated.externalApiKeys).toEqual([]);
    expect(migrated.revision).toBe(state.revision + 1);
    expect(migrated.updatedAt).toBe(Now);
  });

  it("commits without migrating when no legacy credentials remain", async () => {
    const state = createDefaultApplicationState();
    const queries: string[] = [];
    const innerClient = {
      query: async (text: string) => {
        queries.push(text);
        return {
          rows: text.includes("FROM app_state") ? [{ value: state }] : [],
        };
      },
      release: () => undefined,
    };
    const client = {
      query: innerClient.query,
      connect: async () => innerClient,
    };

    const migrated = await cutOverLegacyExternalApiKeys({ client, now: Now });

    expect(migrated.externalApiKeys).toEqual([]);
    expect(queries).toContain("COMMIT");
    expect(queries).not.toContain("ROLLBACK");
  });

  it("rolls the migration back without touching state when an import fails", async () => {
    const state = {
      ...createDefaultApplicationState(),
      externalApiKeys: [
        {
          id: "legacy-1",
          name: "Legacy",
          scope: { kind: "all_workflows" as const },
          secretHash: "scrypt$salt$hash",
          createdAt: Now,
        },
      ],
    };
    const queries: string[] = [];
    let released = false;
    const innerClient = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes("FROM app_state")) {
          return { rows: [{ value: state }] };
        }
        if (text.includes("INSERT INTO external_workflow_credentials")) {
          throw new Error("durable write failed");
        }
        return { rows: [] };
      },
      release: () => {
        released = true;
      },
    };
    const client = {
      query: innerClient.query,
      connect: async () => innerClient,
    };

    await expect(
      cutOverLegacyExternalApiKeys({ client, now: Now }),
    ).rejects.toThrow("durable write failed");
    expect(queries).toContain("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
    expect(released).toBe(true);
  });
});
