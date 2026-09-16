import { request, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  ExternalApiKeyScopeKind,
  ExternalWorkflowOperation,
  isExternalWorkflowCredentialAuthorized,
  isExternalWorkflowCredentialValid,
  toExternalApiKeyView,
  type ExternalApiKeyRecord,
} from "../../../packages/domain/src/external-api-keys";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../../packages/shared/src/workflows";
import {
  createExternalApiKey,
  findVerifiedExternalApiKey,
  hashExternalApiKey,
  readExternalApiKeyCredentialId,
  verifyExternalApiKey,
  verifyExternalApiKeyAsync,
} from "./external-api-keys";
import type {
  ExternalWorkflowCredentialAudit,
  ExternalWorkflowCredentialAuditActor,
  ExternalWorkflowCredentialSecretStore,
  PostgresExternalWorkflowCredentialRepository,
} from "./postgres-external-workflow-credentials";
import { createProviderStore } from "./providers";
import { createConfiguredMcpConnectionPort } from "./mcp-connection-port";
import { createMemoryDocumentCatalog, indexMemoryDocument } from "./memory-rag";
import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowRuntimeService } from "./workflow-runtime";
import {
  createDefaultApplicationState,
  parseApplicationState,
  redactApplicationState,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";

const AuthToken = "internal-test-token";
const TrustedIdeOrigin = "http://localhost:4000";
const ForgedIdeOrigin = "http://attacker.example:4000";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("external workflow API keys", () => {
  it("returns a credential secret once, redacts later views, and rejects throttled external reads", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const created = await fetch(`${url}/settings/credentials/create`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Secret-backed",
        scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
        operations: ["workflow.read"],
        rateLimitPerMinute: 1,
      }),
    });
    expect(created.status).toBe(200);
    const createdBody: unknown = (await created.json()) as unknown;
    const plaintext = readPlaintextCredential(createdBody);
    expect(plaintext.startsWith("itx_wf_")).toBe(true);

    const listed = await fetch(`${url}/settings/credentials/list`, {
      method: "POST",
      headers: { authorization: `Bearer ${AuthToken}` },
    });
    expect(listed.status).toBe(200);
    expect(JSON.stringify(await listed.json())).not.toContain(plaintext);

    await expectExternalStatus(url, plaintext, "workflow-allowed", 200);
    await expectExternalStatus(url, plaintext, "workflow-allowed", 429);
  });

  it("uses a trusted HttpOnly session for credential management without accepting a forged origin", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    expect(new URL(url).origin).not.toBe(TrustedIdeOrigin);
    await postJson(
      url,
      "/auth/bootstrap-admin",
      { email: "admin@example.com", password: "CorrectHorseBatteryStaple1" },
      { authorization: `Bearer ${AuthToken}` },
    );
    await postJson(url, "/auth/register", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const adminLogin = await postJson(url, "/auth/login", {
      email: "admin@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const memberLogin = await postJson(url, "/auth/login", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });

    const forged = await postJson(
      url,
      "/settings/credentials/list",
      {},
      { cookie: adminLogin.cookie, origin: ForgedIdeOrigin },
    );
    expect(forged.status).toBe(401);

    const administrator = await postJson(
      url,
      "/settings/credentials/list",
      {},
      { cookie: adminLogin.cookie, origin: TrustedIdeOrigin },
    );
    expect(administrator.status).toBe(200);

    const member = await postJson(
      url,
      "/settings/credentials/list",
      {},
      { cookie: memberLogin.cookie, origin: TrustedIdeOrigin },
    );
    expect(member.status).toBe(403);

    const created = await postFullJson(
      url,
      "/settings/credentials/create",
      {
        name: "Session created",
        scope: { kind: "all_workflows" },
        operations: ["workflow.read", "workflow.invoke"],
        rateLimitPerMinute: 60,
      },
      { cookie: adminLogin.cookie, origin: TrustedIdeOrigin },
    );
    expect(created.status, JSON.stringify(created.body)).toBe(200);

    const audits = await postJson(
      url,
      "/settings/credentials/audits",
      {},
      { cookie: adminLogin.cookie, origin: TrustedIdeOrigin },
    );
    expect(audits.status, String(adminLogin.cookie)).toBe(200);
    const auditsWithCreate = testServer
      .readCredentialAudits()
      .filter((audit) => audit.eventKind === "create");
    const sessionActorId = auditsWithCreate.at(-1)?.actorId;
    expect(sessionActorId).toMatch(/^user-/);
    expect(sessionActorId).not.toBe("static-bearer-administrator");
  });

  it("rejects a forged Host and Origin pair on a non-strict route", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const status = await postJsonWithHeaders(
      url,
      "/settings/get",
      {},
      { host: "attacker.example:4000", origin: ForgedIdeOrigin },
    );

    expect(status).toBe(401);
  });

  it("revokes a scoped durable credential when its workflow is deleted", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const scoped = createExternalApiKey({
      name: "Deleted workflow",
      scope: {
        kind: ExternalApiKeyScopeKind.SelectedWorkflows,
        workflowIds: ["workflow-allowed"],
      },
      operations: [ExternalWorkflowOperation.WorkflowRead],
      now: new Date(),
    });
    const definition =
      testServer.workflowCatalog.getWorkflow("workflow-allowed");
    if (!definition) throw new Error("Expected workflow fixture.");
    await testServer.registerCredential(scoped.key);

    await expectExternalStatus(url, scoped.plaintext, "workflow-allowed", 200);
    const deleted = await postJson(
      url,
      "/workflows/definitions/delete",
      { workflowId: "workflow-allowed" },
      { authorization: `Bearer ${AuthToken}` },
    );
    expect(deleted.status).toBe(200);
    testServer.workflowCatalog.upsertWorkflow(definition);

    await expectExternalStatus(url, scoped.plaintext, "workflow-allowed", 401);
  });

  it("rotates and revokes injected credentials with redacted durable audit evidence", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const created = await fetch(`${url}/settings/credentials/create`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Rotatable",
        scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
        operations: ["workflow.read"],
        rateLimitPerMinute: 2,
      }),
    });
    const createdBody: unknown = await created.json();
    const credentialId = readCredentialId(createdBody);
    const initialPlaintext = readPlaintextCredential(createdBody);

    const rotated = await fetch(`${url}/settings/credentials/rotate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ credentialId }),
    });
    expect(rotated.status).toBe(200);
    const replacementPlaintext = readPlaintextCredential(await rotated.json());
    await expectExternalStatus(url, initialPlaintext, "workflow-allowed", 401);
    await expectExternalStatus(
      url,
      replacementPlaintext,
      "workflow-allowed",
      200,
    );

    const revoked = await fetch(`${url}/settings/credentials/revoke`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ credentialId }),
    });
    expect(revoked.status).toBe(200);
    await expectExternalStatus(
      url,
      replacementPlaintext,
      "workflow-allowed",
      401,
    );

    const audits = await fetch(`${url}/settings/credentials/audits`, {
      method: "GET",
      headers: { authorization: `Bearer ${AuthToken}` },
    });
    expect(audits.status).toBe(200);
    const auditBody: unknown = await audits.json();
    expect(JSON.stringify(auditBody)).toContain("rotate");
    expect(JSON.stringify(auditBody)).toContain("revoke");
    expect(JSON.stringify(auditBody)).toContain("administrator");
    expect(JSON.stringify(auditBody)).toContain("static-bearer-administrator");
    expect(JSON.stringify(auditBody)).not.toContain(replacementPlaintext);
  });

  it("rejects duplicate credential names through the injected credential repository", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const request = {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Repository name",
        scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
        operations: ["workflow.read"],
        rateLimitPerMinute: 60,
      }),
    };

    expect(
      (await fetch(`${url}/settings/credentials/create`, request)).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${url}/settings/credentials/create`, {
          ...request,
          body: JSON.stringify({
            name: "repository NAME",
            scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
            operations: ["workflow.read"],
            rateLimitPerMinute: 60,
          }),
        })
      ).status,
    ).toBe(400);
  });

  it("resumes one persisted retryable external lifecycle pass and preserves its audit query", async () => {
    const testServer = createTestServer({
      failureCount: 1,
      maxNodeRetries: 1,
      failureMessage: "Provider timeout.",
    });
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Retryable invoke",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(apiKey.key);

    const failed = await invokeExternalWorkflow(url, apiKey.plaintext);
    expect(failed.status).toBe(500);
    const paused = testServer.persistence.read().governanceLifecycles.at(-1);
    expect(paused).toMatchObject({
      state: "planning",
      budgets: { execution: 1, repair: 1, review: 0 },
    });
    expect(paused?.transitions.at(-1)).toMatchObject({
      kind: "auto-repair",
      failure: { classification: "retryable" },
    });
    expect(
      parseApplicationState(
        JSON.parse(JSON.stringify(testServer.persistence.read())),
      ).governanceLifecycles.at(-1),
    ).toEqual(paused);

    const resumed = await requestGovernanceLifecycle(url, "resume", paused?.id);
    expect(resumed.status).toBe(200);
    const resumedLifecycle = readLifecycle(resumed.body);
    expect(resumedLifecycle).toMatchObject({
      id: paused?.id,
      state: "awaiting-user-approval",
      budgets: { execution: 2, repair: 1, review: 1 },
    });
    expect(testServer.readRunCalls()).toBe(2);
    expect(
      testServer.workflowCatalog.listExecutions({
        workflowId: "workflow-allowed",
      }),
    ).toHaveLength(1);

    const audited = await requestGovernanceLifecycle(url, "get", paused?.id);
    expect(audited.status).toBe(200);
    expect(readLifecycle(audited.body)).toEqual(resumedLifecycle);

    const duplicate = await requestGovernanceLifecycle(
      url,
      "resume",
      paused?.id,
    );
    expect(duplicate.status).toBe(400);
    expect(testServer.readRunCalls()).toBe(2);
  });

  it("rejects retry resumption when the persisted workflow scope changes", async () => {
    const testServer = createTestServer({
      failureCount: 1,
      maxNodeRetries: 1,
      failureMessage: "Provider timeout.",
    });
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Scope-bound retry",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(apiKey.key);
    await invokeExternalWorkflow(url, apiKey.plaintext);
    const paused = testServer.persistence.read().governanceLifecycles.at(-1);
    const current = testServer.workflowCatalog.getWorkflow("workflow-allowed");
    if (!current) {
      throw new Error("Expected workflow fixture.");
    }
    testServer.workflowCatalog.upsertWorkflow({
      ...current,
      name: "Changed workflow",
    });

    const rejected = await requestGovernanceLifecycle(
      url,
      "resume",
      paused?.id,
    );
    expect(rejected.status).toBe(400);
    expect(testServer.readRunCalls()).toBe(1);
    expect(testServer.persistence.read().governanceLifecycles.at(-1)).toEqual(
      paused,
    );
  });

  it("rejects non-retryable external lifecycle resumption", async () => {
    const testServer = createTestServer({
      failureCount: 1,
      maxNodeRetries: 1,
      failureMessage: "Schema mismatch.",
    });
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Terminal invoke",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(apiKey.key);
    await invokeExternalWorkflow(url, apiKey.plaintext);
    const failed = testServer.persistence.read().governanceLifecycles.at(-1);

    expect(failed?.state).toBe("failed");
    const rejected = await requestGovernanceLifecycle(
      url,
      "resume",
      failed?.id,
    );
    expect(rejected.status).toBe(400);
    expect(testServer.readRunCalls()).toBe(1);
  });

  it("persists and reloads the external invocation lifecycle audit checkpoint", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Invoke",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(apiKey.key);

    const response = await fetch(`${url}/external/workflows/invoke`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ workflowId: "workflow-allowed" }),
    });
    expect(response.status).toBe(200);
    const lifecycle = testServer.persistence.read().governanceLifecycles.at(-1);
    expect(lifecycle).toMatchObject({
      workflowId: "workflow-allowed",
      state: "awaiting-user-approval",
    });
    expect(lifecycle?.transitions.map((transition) => transition.kind)).toEqual(
      [
        "start-planning",
        "start-executing",
        "start-verifying",
        "start-reviewing",
        "await-user-approval",
      ],
    );
    expect(
      parseApplicationState(
        JSON.parse(JSON.stringify(testServer.persistence.read())),
      ).governanceLifecycles.at(-1),
    ).toEqual(lifecycle);
    const audited = await fetch(`${url}/governance/lifecycles/get`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ lifecycleId: lifecycle?.id }),
    });
    expect(audited.status).toBe(200);
    const auditedBody: unknown = await audited.json();
    const auditedTransitions =
      isRecord(auditedBody) && isRecord(auditedBody["lifecycle"])
        ? auditedBody["lifecycle"]["transitions"]
        : undefined;
    expect(auditedTransitions).toEqual(lifecycle?.transitions);
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        fetch(`${url}/external/workflows/invoke`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey.plaintext}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ workflowId: "workflow-allowed" }),
        }),
      ),
    );
    expect(concurrent.map((item) => item.status)).toEqual([200, 200]);
    expect(
      new Set(
        testServer.persistence
          .read()
          .governanceLifecycles.map((item) => item.id),
      ).size,
    ).toBe(3);
  });

  it("hashes generated keys and never stores their plaintext", () => {
    const created = createExternalApiKey({
      name: "Automation",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date("2026-07-15T10:00:00.000Z"),
    });

    expect(created.key.secretHash).not.toBe(created.plaintext);
    expect(created.key.secretHash).not.toContain(created.plaintext);
    expect(
      verifyExternalApiKey(created.plaintext, created.key.secretHash),
    ).toBe(true);
    const persisted = JSON.stringify(
      redactApplicationState({
        ...createDefaultApplicationState(),
        externalApiKeys: [created.key],
      }),
    );
    expect(persisted).not.toContain(created.plaintext);
    expect(persisted).toContain(created.key.secretHash);
  });

  it("rejects missing, invalid, revoked, and out-of-scope external keys", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const scoped = createExternalApiKey({
      name: "Scoped",
      scope: {
        kind: ExternalApiKeyScopeKind.SelectedWorkflows,
        workflowIds: ["workflow-allowed"],
      },
      now: new Date(),
    });
    const revoked = createExternalApiKey({
      name: "Revoked",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await Promise.all([
      testServer.registerCredential(scoped.key),
      testServer.registerCredential({
        ...revoked.key,
        revokedAt: new Date().toISOString(),
      }),
    ]);

    await expectExternalStatus(url, undefined, "workflow-allowed", 401);
    await expectExternalStatus(url, "invalid", "workflow-allowed", 401);
    await expectExternalStatus(url, scoped.plaintext, "workflow-other", 403);
    await expectExternalStatus(url, revoked.plaintext, "workflow-allowed", 401);
  });

  it("rejects expired credentials before executing an external workflow", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const expired = createExternalApiKey({
      name: "Expired",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential({
      ...expired.key,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    await expectExternalStatus(url, expired.plaintext, "workflow-allowed", 401);
  });

  it("allows scoped reads, records last use, and keeps hashes out of management responses", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const created = createExternalApiKey({
      name: "Automation",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(created.key);

    const external = await fetch(`${url}/external/workflows/read`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ workflowId: "workflow-allowed" }),
    });
    expect(external.status).toBe(200);
    expect(JSON.stringify(await external.json())).toContain("workflow-allowed");
    expect(testServer.readCredential(created.key.id)?.lastUsedAt).toBeDefined();

    const internal = await fetch(`${url}/settings/credentials/list`, {
      method: "POST",
      headers: { authorization: `Bearer ${AuthToken}` },
    });
    const payload = (await internal.json()) as {
      credentials: ReadonlyArray<Record<string, unknown>>;
    };
    expect(internal.status).toBe(200);
    expect(payload.credentials[0]).not.toHaveProperty("secretHash");
    expect(JSON.stringify(payload)).not.toContain(created.plaintext);
  });

  it("redacts a fully populated credential through its complete lifecycle", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const expiresAt = "2030-01-01T00:00:00.000Z";
    const externalOperations = ["workflow.read", "workflow.invoke"];

    const created = await postFullJson(
      url,
      "/settings/credentials/create",
      {
        name: "Full lifecycle",
        scope: {
          kind: "selected_workflows",
          workflowIds: ["workflow-allowed"],
        },
        operations: externalOperations,
        expiresAt,
        rateLimitPerMinute: 17,
      },
      { authorization: `Bearer ${AuthToken}` },
    );
    expect(created.status).toBe(200);
    const plaintext = readPlaintextCredential(created.body);
    const credentialId = readCredentialId(created.body);

    const invoked = await postFullJson(
      url,
      "/external/workflows/invoke",
      { workflowId: "workflow-allowed" },
      { authorization: `Bearer ${plaintext}` },
    );
    expect(invoked.status).toBe(200);

    const rotated = await postFullJson(
      url,
      "/settings/credentials/rotate",
      { credentialId },
      { authorization: `Bearer ${AuthToken}` },
    );
    expect(rotated.status).toBe(200);
    expect(readPlaintextCredential(rotated.body)).not.toBe(plaintext);

    const listed = await postFullJson(
      url,
      "/settings/credentials/list",
      {},
      { authorization: `Bearer ${AuthToken}` },
    );
    const complete = readListedCredential(listed.body, credentialId);
    expect(complete).toMatchObject({
      id: credentialId,
      name: "Full lifecycle",
      scope: {
        kind: "selected_workflows",
        workflowIds: ["workflow-allowed"],
      },
      operations: externalOperations,
      expiresAt,
      rateLimitPerMinute: 17,
      generation: 2,
    });
    expect(typeof complete["lastUsedAt"]).toBe("string");
    expect("revokedAt" in complete).toBe(false);
    expect("secret" in complete).toBe(false);

    const revoked = await postFullJson(
      url,
      "/settings/credentials/revoke",
      { credentialId },
      { authorization: `Bearer ${AuthToken}` },
    );
    expect(revoked.status).toBe(200);
    const relisted = await postFullJson(
      url,
      "/settings/credentials/list",
      {},
      { authorization: `Bearer ${AuthToken}` },
    );
    expect(
      typeof readListedCredential(relisted.body, credentialId)["revokedAt"],
    ).toBe("string");
  });

  it("treats a non-Error workflow failure as a non-retryable unknown failure", async () => {
    const testServer = createTestServer({
      failureCount: 1,
      failurePayload: "workflow exploded without an Error instance",
    });
    const created = await createExternalApiKey({
      name: "External token",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      operations: ["workflow.read", "workflow.invoke"],
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    await testServer.registerCredential(created.key);
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const response = await postFullJson(
      url,
      "/external/workflows/invoke",
      { workflowId: "workflow-allowed" },
      { authorization: `Bearer ${created.plaintext}` },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(500);
    expect(readErrorMessage(response.body)).toBe("Internal server error");
  });

  it("resolves persisted memory and MCP bindings during an externally governed invoke", async () => {
    const memoryWorkflow = createExternalMemoryWorkflow();
    const testServer = createTestServer({
      mcpConnectionPort: createMemoryMcpConnectionPort(),
    });
    testServer.workflowCatalog.upsertWorkflow(memoryWorkflow);
    await testServer.persistence.updateEditableAssets({
      records: [createMemorySourceAsset(), createMemoryMcpToolAsset()],
    });
    await testServer.persistence.updateMemoryDocuments(
      indexMemoryDocument(createMemoryDocumentCatalog(), {
        id: "memory-document",
        sourceId: "memory-source",
        tenantId: "tenant-memory",
        workflowId: memoryWorkflow.id,
        content: "private retained memory",
        createdAt: "2026-07-25T00:00:00.000Z",
        provenance: {
          source: "memory-upload",
          artifactFingerprint: "memory-document-fingerprint",
          registeredAt: "2026-07-25T00:00:00.000Z",
        },
      }),
    );
    const created = await createExternalApiKey({
      name: "Governed external token",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      operations: ["workflow.read", "workflow.invoke"],
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    await testServer.registerCredential(created.key);
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const response = await postFullJson(
      url,
      "/external/workflows/invoke",
      { workflowId: memoryWorkflow.id, payload: { query: "retained memory" } },
      { authorization: `Bearer ${created.plaintext}` },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
  });

  it("serves the bundled web UI for extensionless routes without external workflow auth", async () => {
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const webUiRoot = await mkdtemp(join(tmpdir(), "iteronix-web-ui-"));
    await writeFile(
      join(webUiRoot, "index.html"),
      "<html><body>Iteronix UI</body></html>",
    );
    const testServer = createTestServer({ webUiRoot });
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const routed = await fetch(`${url}/settings`);
    expect(routed.status).toBe(200);
    expect(await routed.text()).toContain("Iteronix UI");
  });

  it("rejects retired writable legacy API-key routes without restoring hashes to application state", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const editable = createExternalApiKey({
      name: "Deployments",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    const existing = createExternalApiKey({
      name: "Reports",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([
      editable.key,
      existing.key,
    ]);

    const updated = await fetch(`${url}/settings/api-keys/update`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        keyId: editable.key.id,
        name: "Deployment automation",
        scope: {
          kind: ExternalApiKeyScopeKind.SelectedWorkflows,
          workflowIds: ["workflow-allowed"],
        },
      }),
    });

    expect(updated.status).toBe(410);
    expect(testServer.persistence.read().externalApiKeys[0]).toEqual(
      expect.objectContaining({
        id: editable.key.id,
        name: editable.key.name,
        secretHash: editable.key.secretHash,
      }),
    );

    const duplicate = await fetch(`${url}/settings/api-keys/update`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        keyId: editable.key.id,
        name: "reports",
        scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      }),
    });

    expect(duplicate.status).toBe(410);
    expect(testServer.persistence.read().externalApiKeys[0]?.name).toBe(
      editable.key.name,
    );
  });

  it("applies credential policy defaults when optional fields are omitted", () => {
    const created = createExternalApiKey({
      name: " Minimal ",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date("2026-07-15T10:00:00.000Z"),
    });

    expect(created.key).toEqual({
      id: created.key.id,
      name: "Minimal",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      secretHash: created.key.secretHash,
      createdAt: "2026-07-15T10:00:00.000Z",
    });
    expect(created.plaintext.startsWith(`itx_wf_v1_${created.key.id}_`)).toBe(
      true,
    );
  });

  it("rejects malformed, mismatched, and unsafe verifier inputs", async () => {
    const created = createExternalApiKey({
      name: "Verifier",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    const validHash = created.key.secretHash;

    expect(verifyExternalApiKey(created.plaintext, validHash)).toBe(true);
    expect(verifyExternalApiKey("itx_wf_other", validHash)).toBe(false);
    expect(verifyExternalApiKey(created.plaintext, "not-a-hash")).toBe(false);
    expect(verifyExternalApiKey(created.plaintext, "pbkdf2$AAAA$BBBB")).toBe(
      false,
    );
    expect(verifyExternalApiKey(created.plaintext, "scrypt$AAAA$BBBB")).toBe(
      false,
    );
    expect(verifyExternalApiKey(created.plaintext, "")).toBe(false);

    const unsafePlaintext = readMissingPlaintext();
    expect(verifyExternalApiKey(unsafePlaintext, validHash)).toBe(false);
    await expect(
      verifyExternalApiKeyAsync(unsafePlaintext, validHash),
    ).resolves.toBe(false);
  });

  it("rejects malformed asynchronous verifier hashes before derivation", async () => {
    const plaintext = "itx_wf_secret";

    await expect(
      verifyExternalApiKeyAsync(plaintext, "not-a-hash"),
    ).resolves.toBe(false);
    await expect(
      verifyExternalApiKeyAsync(plaintext, "scrypt$AAAA$BBBB"),
    ).resolves.toBe(false);
  });

  it("reads credential identifiers only from well-formed versioned secrets", () => {
    expect(
      readExternalApiKeyCredentialId("itx_wf_v1_credential-1_secret"),
    ).toBe("credential-1");
    expect(readExternalApiKeyCredentialId("itx_wf_v1_credential-1_")).toBe(
      undefined,
    );
    expect(readExternalApiKeyCredentialId("itx_wf_v1_credential-1")).toBe(
      undefined,
    );
    expect(readExternalApiKeyCredentialId("itx_wf_v1__secret")).toBe(undefined);
    expect(readExternalApiKeyCredentialId("itx_wf_v2_credential-1_s")).toBe(
      undefined,
    );
    expect(readExternalApiKeyCredentialId("legacy-secret")).toBe(undefined);
  });

  it("audits invalid external bearer failures without retaining bearer material", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const invalidBearer = "itx_wf_invalid_bearer";

    await expectExternalStatus(url, invalidBearer, "workflow-allowed", 401);

    const audit = testServer
      .readCredentialAudits()
      .find((entry) => entry.credentialId === "unknown");
    expect(audit).toEqual(
      expect.objectContaining({
        eventKind: "authenticate",
        result: "unauthorized",
        operation: "workflow.read",
        workflowId: "workflow-allowed",
      }),
    );
    expect(JSON.stringify(audit)).not.toContain(invalidBearer);
  });

  it("answers 404 when an authorized external read targets an unknown workflow", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const created = createExternalApiKey({
      name: "Everything",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(created.key);

    await expectExternalStatus(url, created.plaintext, "workflow-unknown", 404);
  });

  it("rejects malformed bearer schemes and empty bearer secrets", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    for (const authorization of ["Token abc", "Bearer   "]) {
      const response = await fetch(`${url}/external/workflows/read`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ workflowId: "workflow-allowed" }),
      });
      expect(response.status).toBe(401);
    }
  });
});

describe("credential management route guards", () => {
  it("requires POST on every credential lifecycle route", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const headers = { authorization: `Bearer ${AuthToken}` };

    for (const path of [
      "/settings/credentials/list",
      "/settings/credentials/create",
      "/settings/credentials/rotate",
      "/settings/credentials/revoke",
    ]) {
      const response = await fetch(`${url}${path}`, {
        method: "GET",
        headers,
      });
      expect(response.status).toBe(405);
    }
    const audits = await fetch(`${url}/settings/credentials/audits`, {
      method: "DELETE",
      headers,
    });
    expect(audits.status).toBe(405);

    const external = await fetch(`${url}/external/workflows/read`, {
      method: "GET",
      headers,
    });
    expect(external.status).toBe(405);
  });

  it("declines credential lifecycle routes when durable storage is unavailable", async () => {
    const testServer = createTestServer({ omitCredentialServices: true });
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const headers = {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    };

    const listed = await fetch(`${url}/settings/credentials/list`, {
      method: "POST",
      headers,
    });
    expect(listed.status).toBe(500);

    const created = await fetch(`${url}/settings/credentials/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "No storage",
        scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
        operations: ["workflow.read"],
        rateLimitPerMinute: 60,
      }),
    });
    expect(created.status).toBe(500);

    const rotated = await fetch(`${url}/settings/credentials/rotate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ credentialId: "credential-1" }),
    });
    expect(rotated.status).toBe(500);

    const revoked = await fetch(`${url}/settings/credentials/revoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ credentialId: "credential-1" }),
    });
    expect(revoked.status).toBe(500);

    const audits = await fetch(`${url}/settings/credentials/audits`, {
      method: "GET",
      headers,
    });
    expect(audits.status).toBe(500);

    const external = await fetch(`${url}/external/workflows/read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ workflowId: "workflow-allowed" }),
    });
    expect(external.status).toBe(500);
  });

  it("rejects unreadable JSON bodies across credential routes", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    for (const path of [
      "/settings/credentials/create",
      "/settings/credentials/rotate",
      "/settings/credentials/revoke",
      "/settings/credentials/audits",
    ]) {
      const status = await postRawBody(url, path, "{ broken");
      expect(status).toBe(400);
    }

    const created = createExternalApiKey({
      name: "Broken body",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(created.key);
    const external = await fetch(`${url}/external/workflows/read`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.plaintext}`,
        "content-type": "application/json",
      },
      body: "{ broken",
    });
    expect(external.status).toBe(400);
  });

  it("rejects invalid credential create payloads before touching storage", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const invalidBodies: ReadonlyArray<unknown> = [
      42,
      {},
      { name: " ", scope: { kind: "all_workflows" } },
      { name: "Valid", scope: "broken" },
      { name: "Valid", scope: { kind: "tenant" } },
      {
        name: "Valid",
        scope: { kind: "selected_workflows", workflowIds: "broken" },
      },
      {
        name: "Valid",
        scope: { kind: "selected_workflows", workflowIds: [42] },
      },
      {
        name: "Valid",
        scope: { kind: "selected_workflows", workflowIds: [] },
      },
      ...[undefined, ["bogus.operation"], "workflow.read", []].map(
        (operations) => ({
          name: "Valid",
          scope: { kind: "all_workflows" },
          ...(operations === undefined ? {} : { operations }),
          rateLimitPerMinute: 60,
        }),
      ),
      ...[0, 601, 1.5, "60", undefined].map((rateLimitPerMinute) => ({
        name: "Valid",
        scope: { kind: "all_workflows" },
        operations: ["workflow.read"],
        ...(rateLimitPerMinute === undefined ? {} : { rateLimitPerMinute }),
      })),
      ...["not-a-date", 42, true].map((expiresAt) => ({
        name: "Valid",
        scope: { kind: "all_workflows" },
        operations: ["workflow.read"],
        rateLimitPerMinute: 60,
        expiresAt,
      })),
    ];

    for (const body of invalidBodies) {
      const response = await fetch(`${url}/settings/credentials/create`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${AuthToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      expect({
        body,
        status: response.status,
      }).toEqual({ body, status: 400 });
    }
    expect(testServer.readCredentialAudits()).toHaveLength(0);
  });

  it("answers 404 when a create request scopes an unknown workflow", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const response = await fetch(`${url}/settings/credentials/create`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Unknown workflow",
        scope: {
          kind: ExternalApiKeyScopeKind.SelectedWorkflows,
          workflowIds: ["workflow-unknown"],
        },
        operations: ["workflow.read"],
        rateLimitPerMinute: 60,
      }),
    });

    expect(response.status).toBe(404);
  });

  it("answers 400 when a raced durable insert reports a duplicate name", async () => {
    const racedRepository: PostgresExternalWorkflowCredentialRepository = {
      ...createTestCredentialServices().repository,
      create: async () => "duplicate",
    };
    const testServer = createTestServer({
      credentialRepository: racedRepository,
    });
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const response = await fetch(`${url}/settings/credentials/create`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Raced duplicate",
        scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
        operations: ["workflow.read"],
        rateLimitPerMinute: 60,
      }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects malformed rotate and revoke payloads and unknown identifiers", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const headers = {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    };

    for (const path of [
      "/settings/credentials/rotate",
      "/settings/credentials/revoke",
    ]) {
      for (const body of [
        {},
        { credentialId: 42 },
        { credentialId: " " },
        42,
        ["credential-1"],
      ]) {
        const response = await fetch(`${url}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(400);
      }
      for (const body of [
        { credentialId: "credential-unknown" },
        { keyId: "legacy-unknown" },
      ]) {
        const response = await fetch(`${url}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(404);
      }
    }
  });

  it("validates optional credential filters on the audit route", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const headers = {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    };

    const invalid = await fetch(`${url}/settings/credentials/audits`, {
      method: "POST",
      headers,
      body: JSON.stringify({ credentialId: 42 }),
    });
    expect(invalid.status).toBe(400);

    const unfiltered = await fetch(`${url}/settings/credentials/audits`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(unfiltered.status).toBe(200);

    const filtered = await fetch(`${url}/settings/credentials/audits`, {
      method: "POST",
      headers,
      body: JSON.stringify({ credentialId: "credential-1" }),
    });
    expect(filtered.status).toBe(200);
  });

  it("rejects external requests without a workflow identifier", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const created = createExternalApiKey({
      name: "Missing workflow",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.registerCredential(created.key);

    for (const body of [{}, { workflowId: " " }]) {
      const response = await fetch(`${url}/external/workflows/read`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${created.plaintext}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
  });
});

const createTestServer = (
  input: {
    failureCount?: number;
    failureMessage?: string;
    failurePayload?: unknown;
    maxNodeRetries?: number;
    omitCredentialServices?: boolean;
    credentialRepository?: PostgresExternalWorkflowCredentialRepository;
    webUiRoot?: string;
    mcpConnectionPort?: ReturnType<typeof createConfiguredMcpConnectionPort>;
  } = {},
): {
  server: Server;
  persistence: ReturnType<typeof createApplicationPersistence>;
  workflowCatalog: ReturnType<typeof createWorkflowCatalogStore>;
  readRunCalls: () => number;
  credentialServices: ReturnType<typeof createTestCredentialServices>;
  registerCredential: (credential: ExternalApiKeyRecord) => Promise<void>;
  readCredential: (credentialId: string) => ExternalApiKeyRecord | undefined;
  readCredentialAudits: () => ReadonlyArray<ExternalWorkflowCredentialAudit>;
} => {
  const initialState = createDefaultApplicationState();
  const workflowCatalog = createWorkflowCatalogStore();
  workflowCatalog.upsertWorkflow({
    id: "workflow-allowed",
    name: "Allowed workflow",
    description: "Test workflow",
    status: WorkflowRecordStatus.Draft,
    trigger: { kind: WorkflowTriggerKind.Manual, enabled: true, config: {} },
    viewport: { x: 0, y: 0, zoom: 1 },
    executionPolicy: {
      maxNodeRetries: input.maxNodeRetries ?? 0,
      allowManualCheckpointResume: false,
    },
    defaultContextPolicy: {
      language: "en",
      carryMessagesLimit: 1,
      carryArtifactLimit: 1,
    },
    tags: [],
    nodes: [],
    edges: [],
  });
  const providerStore = createProviderStore();
  const credentials = createTestCredentialServices();
  const persistence = createApplicationPersistence({
    stateStore: createMemoryStore(initialState),
    initialState,
    providerStore,
    workflowCatalog,
  });
  const baseWorkflowRuntime = createWorkflowRuntimeService({
    readApplicationState: persistence.read,
  });
  let runCalls = 0;
  const workflowRuntime = {
    ...baseWorkflowRuntime,
    runWorkflow: async (
      request: Parameters<typeof baseWorkflowRuntime.runWorkflow>[0],
    ) => {
      runCalls += 1;
      if (runCalls <= (input.failureCount ?? 0)) {
        if (input.failurePayload !== undefined) {
          throw input.failurePayload;
        }
        throw new Error(input.failureMessage ?? "Provider timeout.");
      }
      return baseWorkflowRuntime.runWorkflow(request);
    },
  };
  return {
    persistence,
    workflowCatalog,
    readRunCalls: () => runCalls,
    credentialServices: credentials,
    registerCredential: credentials.registerCredential,
    readCredential: credentials.readCredential,
    readCredentialAudits: credentials.readCredentialAudits,
    server: createApiServer({
      config: {
        port: 0,
        host: "127.0.0.1",
        authToken: AuthToken,
        databaseUrl: "postgresql://test",
      },
      providerStore,
      workflowRuntime,
      applicationPersistence: persistence,
      workflowCatalog,
      ...(input.omitCredentialServices
        ? {}
        : {
            credentialRepository:
              input.credentialRepository ?? credentials.repository,
            credentialSecretStore: credentials.secretStore,
          }),
      ...(input.webUiRoot ? { webUiRoot: input.webUiRoot } : {}),
      ...(input.mcpConnectionPort
        ? { mcpConnectionPort: input.mcpConnectionPort }
        : {}),
    }),
  };
};

const createMemoryStore = (
  initial: ApplicationState,
): ApplicationStateStore => {
  let state = initial;
  return {
    load: async () => state,
    save: async (next) => {
      state = next;
      return state;
    },
    update: async (updater) => {
      state = updater(state);
      return state;
    },
  };
};

const expectExternalStatus = async (
  url: string,
  apiKey: string | undefined,
  workflowId: string,
  status: number,
): Promise<void> => {
  const response = await fetch(`${url}/external/workflows/read`, {
    method: "POST",
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({ workflowId }),
  });
  expect(response.status).toBe(status);
};

const createTestCredentialServices = (): {
  repository: PostgresExternalWorkflowCredentialRepository;
  secretStore: ExternalWorkflowCredentialSecretStore;
  registerCredential: (credential: ExternalApiKeyRecord) => Promise<void>;
  readCredential: (credentialId: string) => ExternalApiKeyRecord | undefined;
  readCredentialAudits: () => ReadonlyArray<ExternalWorkflowCredentialAudit>;
} => {
  const credentials = new Map<string, ExternalApiKeyRecord>();
  const audits: ExternalWorkflowCredentialAudit[] = [];
  const windows = new Map<string, number>();
  const recordAudit = (
    credentialId: string,
    eventKind: string,
    result: string,
    now: string,
    operation?: ExternalWorkflowOperation,
    workflowId?: string,
    actor?: ExternalWorkflowCredentialAuditActor,
  ): void => {
    audits.push({
      credentialId,
      eventKind,
      result,
      occurredAt: now,
      actorKind: actor?.kind ?? "system",
      actorId: actor?.id ?? "server-runtime",
      ...(operation ? { operation } : {}),
      ...(workflowId ? { workflowId } : {}),
    });
  };
  const secretStore: ExternalWorkflowCredentialSecretStore = {
    put: async ({ credentialId, plaintext }) => {
      const credential = credentials.get(credentialId);
      if (!credential) throw new Error("Credential does not exist.");
      credentials.set(credentialId, {
        ...credential,
        secretHash: hashExternalApiKey(plaintext),
      });
    },
    replace: async ({ credentialId, plaintext }) => {
      await secretStore.put({ credentialId, plaintext });
    },
    verify: async (plaintext) => {
      const credential = findVerifiedExternalApiKey(
        [...credentials.values()],
        plaintext,
      );
      return credential ? { credentialId: credential.id } : undefined;
    },
    importLegacyVerifier: async ({ credentialId, scryptHash }) => {
      const credential = credentials.get(credentialId);
      if (!credential) throw new Error("Credential does not exist.");
      credentials.set(credentialId, { ...credential, secretHash: scryptHash });
    },
  };
  const repository: PostgresExternalWorkflowCredentialRepository = {
    create: async ({ credential, plaintext, actor }) => {
      credentials.set(credential.id, {
        ...credential,
        secretHash: hashExternalApiKey(plaintext),
      });
      recordAudit(
        credential.id,
        "create",
        "authorized",
        credential.createdAt,
        undefined,
        undefined,
        actor,
      );
      return "created";
    },
    isNameAvailable: async ({ name }) =>
      ![...credentials.values()].some(
        (credential) =>
          credential.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      ),
    list: async () => [...credentials.values()].map(toExternalApiKeyView),
    listAudits: async ({ credentialId }) =>
      audits.filter(
        (audit) => !credentialId || audit.credentialId === credentialId,
      ),
    consumeAuthorized: async ({ credentialId, operation, workflowId, now }) => {
      const credential = credentials.get(credentialId);
      if (!credential || !isExternalWorkflowCredentialValid(credential, now)) {
        recordAudit(
          credentialId,
          "authenticate",
          "unauthorized",
          now,
          operation,
          workflowId,
          { kind: "credential", id: credentialId },
        );
        return "unauthorized";
      }
      if (
        !isExternalWorkflowCredentialAuthorized(
          credential,
          operation,
          workflowId,
          now,
        )
      ) {
        recordAudit(
          credentialId,
          "authorize",
          "forbidden",
          now,
          operation,
          workflowId,
          { kind: "credential", id: credentialId },
        );
        return "forbidden";
      }
      const key = `${credentialId}:${now.slice(0, 16)}`;
      const used = windows.get(key) ?? 0;
      const limit = credential.rateLimitPerMinute ?? 60;
      if (used >= limit) {
        recordAudit(
          credentialId,
          "rate_limit",
          "throttled",
          now,
          operation,
          workflowId,
          { kind: "credential", id: credentialId },
        );
        return "throttled";
      }
      windows.set(key, used + 1);
      credentials.set(credentialId, { ...credential, lastUsedAt: now });
      recordAudit(
        credentialId,
        "authenticate",
        "authorized",
        now,
        operation,
        workflowId,
        { kind: "credential", id: credentialId },
      );
      return "authorized";
    },
    rotate: async ({ credentialId, plaintext, now, actor }) => {
      const credential = credentials.get(credentialId);
      if (!credential || credential.revokedAt) return false;
      credentials.set(credentialId, {
        ...credential,
        generation: (credential.generation ?? 1) + 1,
        secretHash: hashExternalApiKey(plaintext),
      });
      recordAudit(
        credentialId,
        "rotate",
        "authorized",
        now,
        undefined,
        undefined,
        actor,
      );
      return true;
    },
    revoke: async ({ credentialId, now, actor }) => {
      const credential = credentials.get(credentialId);
      if (!credential || credential.revokedAt) return false;
      credentials.set(credentialId, { ...credential, revokedAt: now });
      recordAudit(
        credentialId,
        "revoke",
        "authorized",
        now,
        undefined,
        undefined,
        actor,
      );
      return true;
    },
    revokeForWorkflow: async ({ workflowId, now }) => {
      const scopedCredentials = [...credentials.values()].filter(
        (credential) =>
          credential.scope.kind === ExternalApiKeyScopeKind.SelectedWorkflows &&
          credential.scope.workflowIds.includes(workflowId) &&
          !credential.revokedAt,
      );
      for (const credential of scopedCredentials) {
        credentials.set(credential.id, { ...credential, revokedAt: now });
        recordAudit(
          credential.id,
          "revoke",
          "authorized",
          now,
          undefined,
          workflowId,
        );
      }
      return scopedCredentials.length;
    },
    importLegacyVerifier: async ({
      credentialId,
      name,
      secretHash,
      workflowIds,
      now,
    }) => {
      credentials.set(credentialId, {
        id: credentialId,
        name,
        secretHash,
        createdAt: now,
        scope:
          workflowIds.length === 0
            ? { kind: ExternalApiKeyScopeKind.AllWorkflows }
            : { kind: ExternalApiKeyScopeKind.SelectedWorkflows, workflowIds },
      });
    },
    purgeAudits: async ({ now }) => {
      const cutoff = new Date(now).getTime() - 365 * 24 * 60 * 60 * 1000;
      const retained = audits.filter(
        (audit) => new Date(audit.occurredAt).getTime() >= cutoff,
      );
      audits.splice(0, audits.length, ...retained);
    },
    recordAuthenticationFailure: async ({ operation, workflowId, now }) => {
      recordAudit(
        "unknown",
        "authenticate",
        "unauthorized",
        now,
        operation,
        workflowId,
        { kind: "anonymous", id: "unknown" },
      );
    },
  };
  return {
    repository,
    secretStore,
    registerCredential: async (credential) => {
      credentials.set(credential.id, credential);
    },
    readCredential: (credentialId) => credentials.get(credentialId),
    readCredentialAudits: () => audits,
  };
};

const readPlaintextCredential = (value: unknown): string => {
  if (
    !isRecord(value) ||
    typeof value["plaintextCredential"] !== "string" ||
    value["plaintextCredential"].length === 0
  ) {
    throw new Error("Expected one-time plaintext credential.");
  }
  return value["plaintextCredential"];
};

const readCredentialId = (value: unknown): string => {
  if (
    !isRecord(value) ||
    !isRecord(value["credential"]) ||
    typeof value["credential"]["id"] !== "string"
  ) {
    throw new Error("Expected credential id.");
  }
  return value["credential"]["id"];
};

const postJson = async (
  url: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; cookie: string }> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    cookie: response.headers.get("set-cookie") ?? "",
  };
};

const postRawBody = async (
  url: string,
  path: string,
  rawBody: string,
): Promise<number> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    },
    body: rawBody,
  });
  return response.status;
};

const postFullJson = async (
  url: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
};

const readListedCredential = (
  value: unknown,
  credentialId: string,
): Record<string, unknown> => {
  if (!isRecord(value) || !Array.isArray(value["credentials"])) {
    throw new Error("Expected credential list response.");
  }
  const credential = value["credentials"].find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && entry["id"] === credentialId,
  );
  if (!credential) {
    throw new Error("Expected credential in list response.");
  }
  return credential;
};

const readErrorMessage = (value: unknown): string => {
  if (
    !isRecord(value) ||
    !isRecord(value["error"]) ||
    typeof value["error"]["message"] !== "string"
  ) {
    throw new Error("Expected error response.");
  }
  return value["error"]["message"];
};

const postJsonWithHeaders = async (
  url: string,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<number> =>
  new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(body);
    const clientRequest = request(`${url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(requestBody).toString(),
        ...headers,
      },
    });
    clientRequest.once("error", reject);
    clientRequest.once("response", (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    clientRequest.end(requestBody);
  });

const invokeExternalWorkflow = async (
  url: string,
  apiKey: string,
): Promise<Response> =>
  fetch(`${url}/external/workflows/invoke`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ workflowId: "workflow-allowed" }),
  });

const requestGovernanceLifecycle = async (
  url: string,
  action: "get" | "resume",
  lifecycleId: string | undefined,
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(`${url}/governance/lifecycles/${action}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ lifecycleId }),
  });
  return { status: response.status, body: await response.json() };
};

const readLifecycle = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) && isRecord(value["lifecycle"])
    ? value["lifecycle"]
    : undefined;

const listen = async (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected TCP address."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const memoryAssetSchema = (id: string) => ({
  id,
  version: 1,
  schema: { type: "object" as const },
});

const createMemorySourceAsset = (): EditableAssetRecord => ({
  id: "memory-source",
  kind: AssetKind.MemorySource,
  name: "Memory Source",
  status: AssetStatus.Enabled,
  capabilities: ["rag"],
  permissions: ["memory.read", "rag.query"],
  inputSchema: memoryAssetSchema("memory-source-input"),
  outputSchema: memoryAssetSchema("memory-source-output"),
  limits: { executions: 1, timeoutMs: 1_000 },
  provenance: {
    source: "memory-test",
    artifactFingerprint: "memory-source-fingerprint",
    registeredAt: "2026-07-25T00:00:00.000Z",
  },
  memory: {
    tenantId: "tenant-memory",
    workflowId: "workflow-memory-external",
    optInIndexing: true,
    retentionDays: 7,
    redactRetrievals: true,
  },
});

const createMemoryMcpToolAsset = (): EditableAssetRecord => ({
  id: "memory-query",
  kind: AssetKind.McpTool,
  name: "Memory Query",
  status: AssetStatus.Enabled,
  capabilities: ["mcp"],
  permissions: ["memory.read", "rag.query", "mcp.invoke"],
  inputSchema: memoryAssetSchema("memory-query-input"),
  outputSchema: memoryAssetSchema("memory-query-output"),
  limits: { executions: 1, timeoutMs: 1_000 },
  provenance: {
    source: "memory-test",
    artifactFingerprint: "memory-query-fingerprint",
    registeredAt: "2026-07-25T00:00:00.000Z",
  },
  mcp: { serverId: "memory-query", toolVersion: "1", auditEvents: [] },
});

const createMemoryMcpConnectionPort = () =>
  createConfiguredMcpConnectionPort({
    servers: [
      {
        serverId: "memory-query",
        endpoint: "https://mcp.example.test/memory-query",
        token: "server-only-memory-token",
        allowedToolIds: ["memory-query"],
      },
    ],
    transport: {
      post: async () => ({
        toolId: "memory-query",
        status: "success",
        output: { answers: ["memory query completed"] },
        provenance: {
          serverId: "memory-query",
          toolVersion: "1",
          responseFingerprint: "memory-query-response",
        },
      }),
    },
  });

const createExternalMemoryWorkflow = () => ({
  id: "workflow-memory-external",
  name: "External governed memory run",
  description: "External invoke exercising persisted memory and MCP bindings.",
  status: WorkflowRecordStatus.Published,
  version: 1,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
  trigger: { kind: WorkflowTriggerKind.Manual, enabled: true, config: {} },
  viewport: { x: 0, y: 0, zoom: 1 },
  executionPolicy: { maxNodeRetries: 0, allowManualCheckpointResume: false },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 1,
    carryArtifactLimit: 1,
  },
  tags: [],
  nodes: [
    createWorkflowTestNode(
      "trigger",
      WorkflowNodeKind.TriggerManual,
      [],
      ["out"],
    ),
    {
      ...createWorkflowTestNode(
        "memory-agent",
        WorkflowNodeKind.AiAgent,
        ["in"],
        ["out"],
      ),
      config: {
        memorySourceId: "memory-source",
        skillId: "memory-query",
        grantedPermissions: ["memory.read", "rag.query", "mcp.invoke"],
      },
    },
    createWorkflowTestNode(
      "terminal",
      WorkflowNodeKind.TerminalResponse,
      ["in"],
      [],
    ),
  ],
  edges: [
    {
      id: "trigger-memory-agent",
      sourceNodeId: "trigger",
      sourcePortId: "out",
      targetNodeId: "memory-agent",
      targetPortId: "in",
      mapping: {
        mode: "object" as const,
        entries: [
          {
            targetPath: "query",
            source: { kind: "literal" as const, value: "retained memory" },
          },
        ],
      },
    },
    {
      id: "memory-agent-terminal",
      sourceNodeId: "memory-agent",
      sourcePortId: "out",
      targetNodeId: "terminal",
      targetPortId: "in",
      mapping: { mode: "passthrough" as const, entries: [] },
    },
  ],
});

const createWorkflowTestNode = (
  id: string,
  kind: WorkflowNodeKind,
  inputPortIds: ReadonlyArray<string>,
  outputPortIds: ReadonlyArray<string>,
) => ({
  id,
  kind,
  label: id,
  position: { x: 0, y: 0 },
  width: 320,
  collapsed: false,
  config: {},
  inputPorts: inputPortIds.map((portId) => ({
    id: portId,
    name: portId,
    acceptsMany: true,
  })),
  outputPorts: outputPortIds.map((portId) => ({
    id: portId,
    name: portId,
    acceptsMany: true,
  })),
  attachedGuardrails: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Emulates an untrusted non-string payload reaching the verifier boundary.
const readMissingPlaintext = (): string => null as unknown as string;

describe("server perimeter hardening", () => {
  it("answers CORS preflight requests for trusted IDE origins", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const preflight = await fetch(`${url}/settings/credentials/list`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:4000",
        "access-control-request-method": "POST",
      },
    });

    expect(preflight.status).toBe(200);
    expect(await preflight.text()).toBe("");
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:4000",
    );
  });

  it("rejects empty JSON bodies once per shared read path", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const response = await fetch(`${url}/workflows/assets/list`, {
      method: "POST",
      headers: { authorization: `Bearer ${AuthToken}` },
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Empty request body");
  });

  it("requires POST on remaining governance lifecycle control routes", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    for (const path of [
      "/governance/lifecycles/continue",
      "/governance/lifecycles/reject",
      "/governance/lifecycles/resume",
    ]) {
      const response = await fetch(`${url}${path}`, {
        method: "GET",
        headers: { authorization: `Bearer ${AuthToken}` },
      });
      expect(response.status).toBe(405);
    }
  });

  it("rejects an external invoke whose persisted memory source belongs to another workflow", async () => {
    const memoryWorkflow = createExternalMemoryWorkflow();
    const testServer = createTestServer({
      mcpConnectionPort: createMemoryMcpConnectionPort(),
    });
    testServer.workflowCatalog.upsertWorkflow(memoryWorkflow);
    await testServer.persistence.updateEditableAssets({
      records: [
        createForeignWorkflowMemorySourceAsset(),
        createMemoryMcpToolAsset(),
      ],
    });
    const created = await createExternalApiKey({
      name: "Governed external token",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      operations: ["workflow.read", "workflow.invoke"],
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    await testServer.registerCredential(created.key);
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const response = await postFullJson(
      url,
      "/external/workflows/invoke",
      { workflowId: memoryWorkflow.id, payload: { query: "retained memory" } },
      { authorization: `Bearer ${created.plaintext}` },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(JSON.stringify(response.body)).toContain(
      "Memory source workflow does not match the workflow.",
    );
  });

  it("resolves persisted MCP bindings passed through node configuration on external invoke", async () => {
    const mcpWorkflow = createExternalMcpBoundWorkflow();
    const testServer = createTestServer({
      mcpConnectionPort: createMemoryMcpConnectionPort(),
    });
    testServer.workflowCatalog.upsertWorkflow(mcpWorkflow);
    await testServer.persistence.updateEditableAssets({
      records: [createMemoryMcpToolAsset()],
    });
    const created = await createExternalApiKey({
      name: "Governed external token",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      operations: ["workflow.read", "workflow.invoke"],
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    await testServer.registerCredential(created.key);
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const response = await postFullJson(
      url,
      "/external/workflows/invoke",
      { workflowId: mcpWorkflow.id, payload: { query: "retained memory" } },
      { authorization: `Bearer ${created.plaintext}` },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
  });
});

const createForeignWorkflowMemorySourceAsset = (): EditableAssetRecord => ({
  ...createMemorySourceAsset(),
  memory: {
    tenantId: "tenant-memory",
    workflowId: "workflow-elsewhere",
    optInIndexing: true,
    retentionDays: 7,
    redactRetrievals: true,
  },
});

const createExternalMcpBoundWorkflow = () => ({
  ...createExternalMemoryWorkflow(),
  id: "workflow-mcp-external",
  name: "External governed MCP run",
  nodes: [
    createWorkflowTestNode(
      "trigger",
      WorkflowNodeKind.TriggerManual,
      [],
      ["out"],
    ),
    {
      ...createWorkflowTestNode(
        "mcp-agent",
        WorkflowNodeKind.AiAgent,
        ["in"],
        ["out"],
      ),
      config: {
        skillId: "memory-query",
        mcpConnection: {
          assetId: "memory-query",
          serverId: "memory-query",
          toolVersion: "1",
        },
        grantedPermissions: ["memory.read", "rag.query", "mcp.invoke"],
      },
    },
    createWorkflowTestNode(
      "terminal",
      WorkflowNodeKind.TerminalResponse,
      ["in"],
      [],
    ),
  ],
  edges: [
    {
      id: "trigger-mcp-agent",
      sourceNodeId: "trigger",
      sourcePortId: "out",
      targetNodeId: "mcp-agent",
      targetPortId: "in",
      mapping: { mode: "object" as const, entries: [] },
    },
    {
      id: "mcp-agent-terminal",
      sourceNodeId: "mcp-agent",
      sourcePortId: "out",
      targetNodeId: "terminal",
      targetPortId: "in",
      mapping: { mode: "object" as const, entries: [] },
    },
  ],
});
