import { describe, expect, it } from "vitest";
import {
  parseExternalApiKey,
  parseExternalWorkflowCredentialAudit,
  parseExternalWorkflowCredentialCreationResponse,
  parseSettingsResponse,
  parseProviderListResponse,
  parseProviderSettingsResponse,
} from "./settings-client.js";
import { createDefaultSettingsSnapshot } from "./settings-storage.js";

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
});
