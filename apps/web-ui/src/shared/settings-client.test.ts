import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSettingsClient,
  parseExternalApiKey,
  parseExternalWorkflowCredentialAudit,
  parseExternalWorkflowCredentialCreationResponse,
  parseSettingsResponse,
  parseProviderListResponse,
  parseProviderSettingsResponse,
} from "./settings-client.js";
import { createDefaultSettingsSnapshot } from "./settings-storage.js";
import { requestJson } from "./server-api-client.js";

vi.mock("./server-api-client.js", () => ({
  requestJson: vi.fn(),
}));

type RequestCall = {
  path: string;
  method?: "GET" | "POST";
  body?: Readonly<Record<string, unknown>>;
  parse: (value: unknown) => unknown;
};

const mockedRequestJson = vi.mocked(requestJson);

const interceptRequest = (payload: unknown): (() => RequestCall) => {
  let captured: RequestCall | undefined;
  mockedRequestJson.mockImplementation(async (input) => {
    captured = input as RequestCall;
    return (input as RequestCall).parse(payload) as never;
  });
  return () => {
    if (!captured) throw new Error("Expected a captured request.");
    return captured;
  };
};

beforeEach(() => {
  mockedRequestJson.mockReset();
});

describe("settings client transport", () => {
  it("loads and updates settings through the settings endpoints", async () => {
    const snapshot = createDefaultSettingsSnapshot();
    const client = createSettingsClient();

    const readLoad = interceptRequest({ settings: snapshot });
    const loaded = await client.load();
    expect(loaded).toEqual(snapshot);
    expect(readLoad().path).toBe("/settings/get");

    const readUpdate = interceptRequest({ settings: snapshot });
    const updated = await client.update(snapshot);
    expect(updated).toEqual(snapshot);
    expect(readUpdate().path).toBe("/settings/update");
    expect(readUpdate().body).toEqual(
      snapshot as unknown as Record<string, unknown>,
    );
  });

  it("lists providers with and without an explicit profile", async () => {
    const client = createSettingsClient();
    const payload = {
      providers: [
        {
          id: "codex-cli",
          displayName: "Codex CLI",
          type: "cli",
          auth: { type: "none" },
          settingsSchema: { type: "object" },
        },
      ],
    };

    const readAll = interceptRequest(payload);
    const all = await client.listProviders();
    expect(all.selection).toBeUndefined();
    expect(readAll().path).toBe("/providers/list");
    expect(readAll().body).toEqual({});

    const readScoped = interceptRequest(payload);
    await client.listProviders({ profileId: "coding" });
    expect(readScoped().body).toEqual({ profileId: "coding" });
  });

  it("updates provider settings through the providers endpoint", async () => {
    const client = createSettingsClient();
    const readUpdate = interceptRequest({
      settings: {
        profileId: "coding",
        providerId: "codex-cli",
        config: { command: "codex" },
        updatedAt: "2026-04-28T11:00:00.000Z",
      },
    });

    const updated = await client.updateProviderSettings({
      profileId: "coding",
      providerId: "codex-cli",
      config: { command: "codex" },
    });

    expect(updated.providerId).toBe("codex-cli");
    expect(readUpdate().path).toBe("/providers/settings");
    expect(readUpdate().body).toEqual({
      profileId: "coding",
      providerId: "codex-cli",
      config: { command: "codex" },
    });
  });

  it("manages external workflow credentials through redacted lifecycle endpoints", async () => {
    const client = createSettingsClient();
    const credential = {
      id: "credential-1",
      name: "Deploy",
      scope: { kind: "selected_workflows", workflowIds: ["workflow-1"] },
      operations: ["workflow.invoke"],
      rateLimitPerMinute: 25,
      createdAt: "2026-07-28T00:00:00.000Z",
    };

    const readList = interceptRequest({ credentials: [credential] });
    const listed = await client.listExternalWorkflowCredentials();
    expect(listed).toEqual([credential]);
    expect(readList().path).toBe("/settings/credentials/list");

    const createInput = {
      name: "Deploy",
      scope: { kind: "selected_workflows", workflowIds: ["workflow-1"] },
      operations: ["workflow.invoke"],
      rateLimitPerMinute: 25,
    } as const;
    const readCreate = interceptRequest({
      credential,
      plaintextCredential: "itx_wf_once_only",
    });
    const created = await client.createExternalWorkflowCredential(createInput);
    expect(created.plaintextCredential).toBe("itx_wf_once_only");
    expect(readCreate().path).toBe("/settings/credentials/create");
    expect(readCreate().body).toEqual(createInput);

    const readRotate = interceptRequest({
      plaintextCredential: "itx_wf_rotated",
    });
    const rotated = await client.rotateExternalWorkflowCredential({
      credentialId: "credential-1",
    });
    expect(rotated).toEqual({ plaintextCredential: "itx_wf_rotated" });
    expect(readRotate().path).toBe("/settings/credentials/rotate");
    expect(readRotate().body).toEqual({ credentialId: "credential-1" });

    const readRevoke = interceptRequest({ credentialId: "credential-1" });
    const revoked = await client.revokeExternalWorkflowCredential({
      credentialId: "credential-1",
    });
    expect(revoked).toEqual({ credentialId: "credential-1" });
    expect(readRevoke().path).toBe("/settings/credentials/revoke");

    const auditPayload = {
      audits: [
        {
          credentialId: "credential-1",
          eventKind: "rotate",
          actorKind: "administrator",
          actorId: "admin-1",
          operation: "workflow.invoke",
          workflowId: "workflow-1",
          result: "authorized",
          occurredAt: "2026-07-28T12:00:00.000Z",
        },
      ],
    };
    const readAudits = interceptRequest(auditPayload);
    const audits = await client.listExternalWorkflowCredentialAudits();
    expect(audits).toEqual(auditPayload.audits);
    expect(readAudits().path).toBe("/settings/credentials/audits");
    expect(readAudits().body).toEqual({});

    const readFiltered = interceptRequest({ audits: [] });
    await client.listExternalWorkflowCredentialAudits({
      credentialId: "credential-1",
    });
    expect(readFiltered().body).toEqual({ credentialId: "credential-1" });
  });
});

describe("settings client codecs", () => {
  it("parses the settings-only response without an application wrapper", () => {
    const settings = createDefaultSettingsSnapshot();

    expect(parseSettingsResponse({ settings })).toEqual(settings);
  });

  it("ignores an API connection sent by an older settings response", () => {
    const settings = createDefaultSettingsSnapshot();

    expect(
      parseSettingsResponse({
        settings: {
          ...settings,
          serverConnection: {
            serverUrl: "https://server.example.com",
            authToken: "server-secret",
          },
        },
      }),
    ).not.toHaveProperty("serverConnection");
  });

  it("rejects malformed settings and provider payloads", () => {
    expect(() => parseSettingsResponse({})).toThrow(
      "Invalid settingsResponse.settings",
    );
    expect(() => parseSettingsResponse([])).toThrow("Invalid settingsResponse");
    expect(() => parseProviderListResponse({ providers: {} })).toThrow(
      "Invalid providerListResponse.providers",
    );
    expect(() =>
      parseProviderListResponse({ providers: ["not-a-record"] }),
    ).toThrow("Invalid runtimeProviderRecord");
    expect(() =>
      parseProviderListResponse({
        providers: [
          {
            id: "codex-cli",
            displayName: "Codex CLI",
            type: "cli",
            auth: "broken",
            settingsSchema: {},
          },
        ],
      }),
    ).toThrow("Invalid runtimeProviderRecord.auth");
    expect(() =>
      parseProviderListResponse({
        providers: [],
        selection: { profileId: "coding", providerId: "codex-cli" },
      }),
    ).toThrow("Invalid runtimeProviderSelectionRecord.updatedAt");
    expect(() =>
      parseProviderListResponse({ providers: [], selection: 42 }),
    ).toThrow("Invalid runtimeProviderSelectionRecord");
    expect(() => parseProviderSettingsResponse({ settings: 42 })).toThrow(
      "Invalid providerSettingsResponse.settings",
    );
    expect(() =>
      parseProviderSettingsResponse({
        settings: {
          profileId: "coding",
          providerId: "codex-cli",
          config: "broken",
          updatedAt: "2026-04-28T11:00:00.000Z",
        },
      }),
    ).toThrow("Invalid runtimeProviderSettingsRecord.config");
  });

  it("parses runtime providers and optional workflow scope selection metadata", () => {
    const parsed = parseProviderListResponse({
      providers: [
        {
          id: "codex-cli",
          displayName: "Codex CLI",
          type: "cli",
          auth: {
            type: "none",
          },
          settingsSchema: {
            type: "object",
          },
        },
      ],
      selection: {
        profileId: "coding",
        providerId: "codex-cli",
        updatedAt: "2026-04-28T10:00:00.000Z",
      },
    });

    expect(parsed.providers[0]?.id).toBe("codex-cli");
    expect(parsed.selection?.profileId).toBe("coding");
  });

  it("parses provider settings update responses", () => {
    const parsed = parseProviderSettingsResponse({
      settings: {
        profileId: "coding",
        providerId: "codex-cli",
        config: {
          command: "codex",
        },
        updatedAt: "2026-04-28T11:00:00.000Z",
      },
    });

    expect(parsed.providerId).toBe("codex-cli");
    expect(parsed.config["command"]).toBe("codex");
  });

  it("parses redacted credential scope, operations, expiry, and rate limit", () => {
    expect(
      parseExternalApiKey({
        id: "credential-1",
        name: "Deploy",
        scope: { kind: "all_workflows" },
        createdAt: "2026-07-28T00:00:00.000Z",
        operations: ["workflow.read", "workflow.invoke"],
        expiresAt: "2026-08-28T00:00:00.000Z",
        rateLimitPerMinute: 60,
      }),
    ).toMatchObject({
      operations: ["workflow.read", "workflow.invoke"],
      rateLimitPerMinute: 60,
    });
  });

  it("keeps credential lifecycle timestamps when the API reports them", () => {
    const parsed = parseExternalApiKey({
      id: "credential-1",
      name: "Deploy",
      scope: { kind: "selected_workflows", workflowIds: ["workflow-1"] },
      createdAt: "2026-07-28T00:00:00.000Z",
      expiresAt: "2026-08-28T00:00:00.000Z",
      lastUsedAt: "2026-08-01T00:00:00.000Z",
      revokedAt: "2026-08-02T00:00:00.000Z",
    });

    expect(parsed).toMatchObject({
      expiresAt: "2026-08-28T00:00:00.000Z",
      lastUsedAt: "2026-08-01T00:00:00.000Z",
      revokedAt: "2026-08-02T00:00:00.000Z",
    });
  });

  it("falls back to default operations and rate limit for loose credential rows", () => {
    const base = {
      id: "credential-1",
      name: "Deploy",
      scope: { kind: "all_workflows" },
      createdAt: "2026-07-28T00:00:00.000Z",
    };

    for (const operations of [
      undefined,
      "workflow.read",
      [],
      ["bogus.operation"],
    ]) {
      const parsed = parseExternalApiKey({ ...base, operations });
      expect(parsed.operations).toEqual(["workflow.read", "workflow.invoke"]);
    }
    expect(
      parseExternalApiKey({ ...base, operations: ["workflow.read", 42] })
        .operations,
    ).toEqual(["workflow.read"]);
    for (const rateLimitPerMinute of [0, 601, 1.5, "60"]) {
      expect(
        parseExternalApiKey({ ...base, rateLimitPerMinute }).rateLimitPerMinute,
      ).toBe(60);
    }
    expect(
      parseExternalApiKey({ ...base, rateLimitPerMinute: 42 })
        .rateLimitPerMinute,
    ).toBe(42);
  });

  it("rejects credential scopes without a readable workflow list", () => {
    const base = {
      id: "credential-1",
      name: "Deploy",
      createdAt: "2026-07-28T00:00:00.000Z",
    };

    expect(() =>
      parseExternalApiKey({
        ...base,
        scope: { kind: "selected_workflows", workflowIds: "broken" },
      }),
    ).toThrow("Invalid externalApiKey.scope.workflowIds");
    expect(() =>
      parseExternalApiKey({
        ...base,
        scope: { kind: "selected_workflows", workflowIds: [42] },
      }),
    ).toThrow("Invalid externalApiKey.scope.workflowIds");
  });

  it("parses the one-time creation response separately from redacted credential metadata", () => {
    const created = parseExternalWorkflowCredentialCreationResponse({
      credential: {
        id: "credential-1",
        name: "Deploy",
        scope: { kind: "selected_workflows", workflowIds: ["workflow-1"] },
        operations: ["workflow.invoke"],
        rateLimitPerMinute: 25,
        createdAt: "2026-07-28T00:00:00.000Z",
      },
      plaintextCredential: "itx_wf_once_only",
    });

    expect(created.credential).not.toHaveProperty("plaintextCredential");
    expect(created.credential).not.toHaveProperty("secretHash");
    expect(created.plaintextCredential).toBe("itx_wf_once_only");
  });

  it("rejects creation responses without redacted metadata or the one-time secret", () => {
    expect(() =>
      parseExternalWorkflowCredentialCreationResponse({
        credential: "broken",
      }),
    ).toThrow("Invalid externalWorkflowCredentialCreationResponse.credential");
    expect(() =>
      parseExternalWorkflowCredentialCreationResponse({
        credential: {
          id: "credential-1",
          name: "Deploy",
          scope: { kind: "all_workflows" },
          createdAt: "2026-07-28T00:00:00.000Z",
        },
      }),
    ).toThrow(
      "Invalid externalWorkflowCredentialCreationResponse.plaintextCredential",
    );
  });

  it("rejects rotation and revocation responses without their required fields", async () => {
    const client = createSettingsClient();

    const readRotation = interceptRequest({});
    await expect(
      client.rotateExternalWorkflowCredential({ credentialId: "c1" }),
    ).rejects.toThrow(
      "Invalid externalWorkflowCredentialRotationResponse.plaintextCredential",
    );
    expect(readRotation().path).toBe("/settings/credentials/rotate");

    const readRevocation = interceptRequest({ credentialId: 42 });
    await expect(
      client.revokeExternalWorkflowCredential({ credentialId: "c1" }),
    ).rejects.toThrow(
      "Invalid externalWorkflowCredentialRevocationResponse.credentialId",
    );
    expect(readRevocation().path).toBe("/settings/credentials/revoke");

    const readList = interceptRequest({ credentials: "broken" });
    await expect(client.listExternalWorkflowCredentials()).rejects.toThrow(
      "Invalid externalApiKeysResponse.credentials",
    );
    expect(readList().path).toBe("/settings/credentials/list");

    const readAudits = interceptRequest("broken");
    await expect(client.listExternalWorkflowCredentialAudits()).rejects.toThrow(
      "Invalid externalWorkflowCredentialAuditsResponse",
    );
    expect(readAudits().path).toBe("/settings/credentials/audits");

    const readAuditEntries = interceptRequest({ audits: ["broken"] });
    await expect(client.listExternalWorkflowCredentialAudits()).rejects.toThrow(
      "Invalid externalWorkflowCredentialAudit",
    );
    expect(readAuditEntries().path).toBe("/settings/credentials/audits");
  });

  it("parses redacted credential audits without accepting plaintext or verifier fields", () => {
    const audit = parseExternalWorkflowCredentialAudit({
      credentialId: "credential-1",
      eventKind: "revoke",
      actorKind: "administrator",
      actorId: "admin-1",
      operation: "workflow.invoke",
      workflowId: "workflow-1",
      result: "authorized",
      occurredAt: "2026-07-28T00:00:00.000Z",
      plaintextCredential: "must-not-be-read",
      verifier: "must-not-be-read",
    });

    expect(audit).toEqual({
      credentialId: "credential-1",
      eventKind: "revoke",
      actorKind: "administrator",
      actorId: "admin-1",
      operation: "workflow.invoke",
      workflowId: "workflow-1",
      result: "authorized",
      occurredAt: "2026-07-28T00:00:00.000Z",
    });
  });

  it("preserves an audit with no operation as redacted metadata", () => {
    const audit = parseExternalWorkflowCredentialAudit({
      credentialId: "credential-1",
      eventKind: "revoke",
      actorKind: "system",
      actorId: "legacy-cutover",
      result: "authorized",
      occurredAt: "2026-07-28T00:00:00.000Z",
    });

    expect(audit).not.toHaveProperty("operation");
    expect(audit).not.toHaveProperty("workflowId");
  });

  it("drops unknown audit operations and workflow identifiers", () => {
    const audit = parseExternalWorkflowCredentialAudit({
      credentialId: "credential-1",
      eventKind: "authenticate",
      actorKind: "credential",
      actorId: "credential-1",
      operation: "future.operation",
      workflowId: 42,
      result: "unauthorized",
      occurredAt: "2026-07-28T00:00:00.000Z",
    });

    expect(audit).not.toHaveProperty("operation");
    expect(audit).not.toHaveProperty("workflowId");
  });

  it("rejects audits with an unknown actor kind", () => {
    expect(() =>
      parseExternalWorkflowCredentialAudit({
        credentialId: "credential-1",
        eventKind: "revoke",
        actorKind: "intruder",
        actorId: "intruder",
        result: "authorized",
        occurredAt: "2026-07-28T00:00:00.000Z",
      }),
    ).toThrow("externalWorkflowCredentialAudit.actorKind must be valid.");
  });
});
