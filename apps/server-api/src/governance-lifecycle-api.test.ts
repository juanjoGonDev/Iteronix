import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  GovernanceTransitionKind,
  recordGovernanceAgentExecution,
  type GovernanceLifecycle,
} from "../../../packages/domain/src/governance-lifecycle";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";
import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";
import { indexMemoryDocument } from "./memory-rag";
import {
  createLocalMcpConnectionPort,
  type ServerMcpConnectionPort,
} from "./mcp-connection-port";
import {
  McpToolResultStatus,
  PluginRuntimeKind,
  type ArtifactProvenance,
  type McpToolResult,
  type RagPort,
} from "../../../packages/domain/src/agent-tool-contracts";
import type { JsonValue } from "../../../packages/domain/src/governance-validation";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../../packages/shared/src/workflows";
import {
  createDefaultApplicationState,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";
import { createGovernanceLifecycleService } from "./governance-lifecycle-service";
import { createGovernedAgentToolService } from "./governed-agent-tool-service";
import { createProviderStore } from "./providers";
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowRuntimeService } from "./workflow-runtime";

const AuthToken = "governance-lifecycle-api-token";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("governance lifecycle API", () => {
  it("allows an authenticated IDE session to control lifecycle only from a trusted origin and returns a redacted response", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const lifecycle = await createAwaitingLifecycleWithSecret(
      testServer.persistence,
      "session-controlled",
    );
    await requestWithHeaders(
      url,
      "/auth/bootstrap-admin",
      {
        email: "admin@example.com",
        password: "CorrectHorseBatteryStaple1",
      },
      { authorization: `Bearer ${AuthToken}` },
    );
    await requestWithHeaders(url, "/auth/register", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const login = await requestWithHeaders(url, "/auth/login", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const memberId = testServer.persistence
      .read()
      .ideAuth.users.find((user) => user.email === "member@example.com")?.id;
    expect(memberId).toBeDefined();
    const approved = await requestWithHeaders(
      url,
      "/governance/lifecycles/approve",
      { lifecycleId: lifecycle.id, reason: "Approved from IDE." },
      { cookie: login.cookie, origin: "http://127.0.0.1:4000" },
    );
    expect(approved.status).toBe(200);
    expect(JSON.stringify(approved.body)).not.toContain("raw-browser-secret");
    expect(JSON.stringify(approved.body)).toContain("[redacted]");
    const persisted = testServer.persistence
      .read()
      .governanceLifecycles.find((entry) => entry.id === lifecycle.id);
    expect(persisted?.transitions.at(-1)?.actor.id).toBe(memberId);
    const forged = await requestWithHeaders(
      url,
      "/governance/lifecycles/approve",
      { lifecycleId: lifecycle.id, reason: "Forged origin." },
      { cookie: login.cookie, origin: "https://forged.example" },
    );
    expect(forged.status).toBe(401);
  });

  it("executes an IDE governed AiAgent with the persisted memory scope and redacted retrieval provenance", async () => {
    const testServer = createTestServer(createMemoryMcpConnectionPort());
    await testServer.persistence.updateEditableAssets({
      records: [createMemorySource(), createMemoryMcpTool()],
    });
    await testServer.persistence.updateMemoryDocuments(
      indexMemoryDocument(
        testServer.persistence.read().memoryDocuments,
        createMemoryDocument(),
      ),
    );
    testServer.workflowCatalog.upsertWorkflow(createMemoryWorkflow());
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const run = await request(url, "/workflows/executions/run", {
      workflowId: "workflow-memory",
    });

    expect(run.status).toBe(200);
    expect(readExecutionStatus(run.body)).toBe("completed");
    const lifecycleId = readExecutionLifecycleId(run.body);
    expect(lifecycleId).toBeDefined();
    if (!lifecycleId) throw new Error("Expected lifecycle ID.");
    const lifecycle = await request(url, "/governance/lifecycles/get", {
      lifecycleId,
    });
    const serialized = JSON.stringify(lifecycle.body.lifecycle);

    expect(lifecycle.status).toBe(200);
    expect(lifecycle.body.lifecycle["retrievalExecutions"]).toEqual([
      expect.objectContaining({
        assetId: "memory-source",
        scope: "tenant-memory:workflow-memory",
        workflowId: "workflow-memory",
        documentCount: 1,
        redacted: true,
      }),
    ]);
    expect(serialized).not.toContain("private retained memory");
  });

  it("rejects an enabled non-opt-in MemorySource before retrieval", async () => {
    const testServer = createTestServer(createMemoryMcpConnectionPort());
    await testServer.persistence.updateEditableAssets({
      records: [createNonOptInMemorySource(), createMemoryMcpTool()],
    });
    await testServer.persistence.updateMemoryDocuments(
      indexMemoryDocument(
        testServer.persistence.read().memoryDocuments,
        createMemoryDocument(),
      ),
    );
    testServer.workflowCatalog.upsertWorkflow(createMemoryWorkflow());
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const run = await request(url, "/workflows/executions/run", {
      workflowId: "workflow-memory",
    });

    expect(run.status).toBe(200);
    expect(readExecutionStatus(run.body)).toBe("failed");
    expect(JSON.stringify(run.body)).toContain("Memory source is unavailable.");
    const lifecycleId = readExecutionLifecycleId(run.body);
    expect(lifecycleId).toBeDefined();
    if (!lifecycleId) throw new Error("Expected lifecycle ID.");
    const lifecycle = await request(url, "/governance/lifecycles/get", {
      lifecycleId,
    });
    const serialized = JSON.stringify(lifecycle.body.lifecycle);

    expect(lifecycle.status).toBe(200);
    expect(lifecycle.body.lifecycle["retrievalExecutions"]).toEqual([]);
    expect(serialized).not.toContain("private retained memory");
  });

  it("links an IDE workflow run to its persisted governed prompt trace", async () => {
    const testServer = createTestServer();
    testServer.workflowCatalog.upsertWorkflow(createWorkflow());
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const run = await request(url, "/workflows/executions/run", {
      workflowId: "workflow-governed-run",
    });

    expect(run.status).toBe(200);
    const execution = run.body.execution as Record<string, unknown>;
    expect(typeof execution["lifecycleId"]).toBe("string");
    const lifecycle = testServer.persistence
      .read()
      .governanceLifecycles.find(
        (entry) => entry.id === execution["lifecycleId"],
      );
    expect(lifecycle?.state).toBe("awaiting-user-approval");
  });

  it("reads and records approve, continue, and reject controls with persisted audit data", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const awaiting = await createAwaitingLifecycle(
      testServer.persistence,
      "awaiting",
    );

    const read = await request(url, "/governance/lifecycles/get", {
      lifecycleId: awaiting.id,
    });
    expect(read.status).toBe(200);
    expect(read.body.lifecycle).toEqual(
      expect.objectContaining({
        id: awaiting.id,
        state: "awaiting-user-approval",
        fingerprints: {
          scope: "scope-awaiting",
          evidence: "evidence-awaiting",
        },
        budgets: { execution: 1, repair: 0, review: 1 },
      }),
    );
    expect(read.body.lifecycle.transitions).toHaveLength(5);

    const approved = await request(url, "/governance/lifecycles/approve", {
      lifecycleId: awaiting.id,
      actorId: "user-1",
      reason: "Approved evidence.",
    });
    expect(approved.status).toBe(200);
    expect(approved.body.lifecycle.transitions.at(-1)).toEqual(
      expect.objectContaining({
        kind: "approve",
        actor: { kind: "user", id: "authenticated-bearer-client" },
      }),
    );

    const continuing = await createAwaitingLifecycle(
      testServer.persistence,
      "continuing",
    );
    const continued = await request(url, "/governance/lifecycles/continue", {
      lifecycleId: continuing.id,
      actorId: "user-1",
      reason: "Run one more bounded pass.",
    });
    expect(continued.status).toBe(200);
    expect(continued.body.lifecycle).toEqual(
      expect.objectContaining({ state: "planning", userAuthorizedPasses: 1 }),
    );

    const rejecting = await createAwaitingLifecycle(
      testServer.persistence,
      "rejecting",
    );
    const rejected = await request(url, "/governance/lifecycles/reject", {
      lifecycleId: rejecting.id,
      actorId: "user-1",
      feedback: "Use the source citations.",
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.lifecycle.transitions.at(-1)).toEqual(
      expect.objectContaining({
        kind: "reject-with-feedback",
        reason: "Use the source citations.",
      }),
    );
  });

  it("redacts sensitive prompt binding keys and values from the browser lifecycle response", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const lifecycle = await createAwaitingLifecycleWithSecret(
      testServer.persistence,
      "redacted",
    );

    const response = await request(url, "/governance/lifecycles/get", {
      lifecycleId: lifecycle.id,
    });
    const promptExecutions = response.body.lifecycle["promptExecutions"];

    expect(response.status).toBe(200);
    expect(JSON.stringify(promptExecutions)).not.toContain("apiKey");
    expect(JSON.stringify(promptExecutions)).not.toContain("api_key");
    expect(JSON.stringify(promptExecutions)).not.toContain("nestedToken");
    expect(JSON.stringify(promptExecutions)).not.toContain(
      "raw-browser-secret",
    );
    expect(JSON.stringify(promptExecutions)).not.toContain(
      "nested-browser-secret",
    );
    expect(JSON.stringify(promptExecutions)).toContain("[redacted]");
    expect(
      testServer.persistence
        .read()
        .governanceLifecycles.find((entry) => entry.id === lifecycle.id)
        ?.promptExecutions[0]?.bindings,
    ).toEqual({
      apiKey: "raw-browser-secret",
      api_key: "underscore-browser-secret",
      context: { nestedToken: "nested-browser-secret" },
      subject: "Visible",
    });
  });

  it("rejects a rerun request for an approved unchanged fingerprint", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const awaiting = await createAwaitingLifecycle(
      testServer.persistence,
      "approved",
    );
    await request(url, "/governance/lifecycles/approve", {
      lifecycleId: awaiting.id,
      actorId: "user-1",
      reason: "Approved.",
    });

    const rerun = await request(url, "/governance/lifecycles/begin", {
      lifecycleId: "rerun",
      workflowId: "workflow-1",
      fingerprints: { scope: "scope-approved", evidence: "evidence-approved" },
      limits: { execution: 1, repair: 1, review: 1 },
    });

    expect(rerun.status).toBe(400);
    expect(readErrorMessage(rerun.body.error)).toContain(
      "Approved fingerprints require a changed scope or evidence",
    );
  });

  it("rejects an Origin and Host forgery without the bearer token", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const response = await fetch(`${url}/governance/lifecycles/get`, {
      method: "POST",
      headers: {
        origin: url,
        host: url.replace("http://", ""),
        "content-type": "application/json",
      },
      body: JSON.stringify({ lifecycleId: "forged" }),
    });

    expect(response.status).toBe(401);
  });

  it("proves agent tool/plugin/retrieval provenance is visible through the lifecycle API and secrets are never exposed", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const service = createGovernanceLifecycleService(testServer.persistence);

    const draft = await service.begin({
      id: "provenance-secrets",
      workflowId: "workflow-1",
      fingerprints: {
        scope: "scope-provenance",
        evidence: "evidence-provenance",
      },
      limits: { execution: 1, repair: 1, review: 1 },
      now: readNow(0),
    });
    const planning = await transition(
      service,
      draft.id,
      GovernanceTransitionKind.StartPlanning,
      1,
    );
    const executing = await transition(
      service,
      planning.id,
      GovernanceTransitionKind.StartExecuting,
      2,
    );

    // Record two agent executions with full provenance via persistence
    // (simulating what governed-agent-tool-service does during a workflow run)
    await testServer.persistence.mutateGovernanceLifecycles((lifecycles) => {
      const current = lifecycles.find((l) => l.id === executing.id);
      if (!current) {
        return lifecycles;
      }
      const withPlugin = recordGovernanceAgentExecution(current, {
        id: "agent-exec-plugin",
        lifecycleId: executing.id,
        agentId: "plugin-agent",
        pluginId: "reference-knowledge",
        skillId: "rag.query",
        skillVersion: 2,
        toolId: "knowledge.search",
        inputFingerprint: "sha256-input-fp",
        outputFingerprint: "sha256-output-fp",
        artifactFingerprint: "sha256-artifact-fp",
        responseFingerprint: "mcp-response-fingerprint",
        timestamp: readNow(3),
      });
      const withTool = recordGovernanceAgentExecution(withPlugin, {
        id: "agent-exec-tool",
        lifecycleId: executing.id,
        agentId: "tool-agent",
        pluginId: "code-runner",
        skillId: "code.execute",
        skillVersion: 1,
        toolId: "code.run",
        inputFingerprint: "sha256-input-fp-2",
        outputFingerprint: "sha256-output-fp-2",
        artifactFingerprint: "sha256-artifact-fp-2",
        responseFingerprint: "mcp-response-fp-2",
        timestamp: readNow(4),
      });
      return lifecycles.map((l) => (l.id === executing.id ? withTool : l));
    });

    // Record a prompt execution with secret-like bindings
    await service.recordPromptExecution({
      id: `${executing.id}:prompt:1:0`,
      lifecycleId: executing.id,
      assetId: "prompt-sensitive",
      version: 1,
      bindings: {
        apiKey: "raw-api-key-value",
        api_key: "underscore-key-value",
        context: { nestedToken: "nested-token-secret" },
        subject: "Visible binding",
      },
      renderedFingerprint: "rendered-fingerprint",
      validation: "passed",
      timestamp: readNow(5),
    });

    // Read lifecycle via the API
    const response = await request(url, "/governance/lifecycles/get", {
      lifecycleId: executing.id,
    });

    expect(response.status).toBe(200);
    const lifecycle = response.body.lifecycle;

    // === ASSERTION 1: Agent execution provenance is visible ===
    const agentExecutions = lifecycle["agentExecutions"] as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(agentExecutions).toHaveLength(2);

    expect(agentExecutions[0]).toMatchObject({
      agentId: "plugin-agent",
      pluginId: "reference-knowledge",
      skillId: "rag.query",
      skillVersion: 2,
      toolId: "knowledge.search",
      inputFingerprint: "sha256-input-fp",
      outputFingerprint: "sha256-output-fp",
      artifactFingerprint: "sha256-artifact-fp",
      responseFingerprint: "mcp-response-fingerprint",
    });

    expect(agentExecutions[1]).toMatchObject({
      agentId: "tool-agent",
      pluginId: "code-runner",
      skillId: "code.execute",
      skillVersion: 1,
      toolId: "code.run",
      responseFingerprint: "mcp-response-fp-2",
    });

    // === ASSERTION 2: Secrets are never exposed in the API response ===
    const serialized = JSON.stringify(lifecycle);

    // Secret plaintext values must NOT appear
    expect(serialized).not.toContain("raw-api-key-value");
    expect(serialized).not.toContain("underscore-key-value");
    expect(serialized).not.toContain("nested-token-secret");

    // Sensitive binding keys must NOT appear
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("nestedToken");

    // The redacted marker must be present
    expect(serialized).toContain("[redacted]");

    // Non-sensitive values must still be visible
    expect(serialized).toContain("Visible binding");
    expect(serialized).toContain("plugin-agent");
    expect(serialized).toContain("reference-knowledge");
    expect(serialized).toContain("mcp-response-fingerprint");

    // === ASSERTION 3: Persisted state retains raw values ===
    const persisted = testServer.persistence
      .read()
      .governanceLifecycles.find((entry) => entry.id === executing.id);
    expect(persisted?.promptExecutions[0]?.bindings).toEqual({
      apiKey: "raw-api-key-value",
      api_key: "underscore-key-value",
      context: { nestedToken: "nested-token-secret" },
      subject: "Visible binding",
    });
    expect(persisted?.agentExecutions).toHaveLength(2);
  });
});

describe("governed skill auditable error paths", () => {
  const inputSchema = {
    id: "test.query.input",
    version: 1,
    schema: {
      type: "object" as const,
      properties: { query: { type: "string" as const, minLength: 1 } },
      required: ["query"],
      additionalProperties: false,
    },
  };
  const outputSchema = {
    id: "test.query.output",
    version: 1,
    schema: {
      type: "object" as const,
      properties: {
        answers: {
          type: "array" as const,
          items: { type: "string" as const },
        },
      },
      required: ["answers"],
      additionalProperties: false,
    },
  };
  const pluginManifest = {
    id: "test-plugin",
    version: "1.0.0",
    runtime: PluginRuntimeKind.Server,
    isolation: "process" as const,
    permissions: ["rag.query", "tool.invoke"] as const,
    tools: [{ id: "test.skill", inputSchema, outputSchema }],
    audit: {
      manifestFingerprint: "plugin-fp",
      publishedAt: "2026-07-18T00:00:00.000Z",
    },
  };
  const skillDefinition = {
    id: "test.skill",
    version: 1,
    description: "Test skill.",
    inputSchema,
    outputSchema,
    requiredPermissions: ["rag.query", "tool.invoke"] as const,
    provenance: {
      source: "plugin:test-plugin",
      artifactFingerprint: "skill-fp",
      registeredAt: "2026-07-18T00:00:00.000Z",
    },
  };
  const scope = {
    tenantId: "tenant-1",
    workflowId: "workflow-1",
    enabled: true,
    retentionDays: 7,
  };

  const createLifecycleAndServices = () => {
    let governanceLifecycles: ReadonlyArray<GovernanceLifecycle> = [];
    const persistence: GovernanceLifecyclePersistencePort = {
      read: () => ({ governanceLifecycles }),
      mutateGovernanceLifecycles: async (updater) => {
        governanceLifecycles = updater(governanceLifecycles);
      },
    };
    const lifecycleService = createGovernanceLifecycleService(persistence);
    const ragPort: RagPort = {
      retrieve: async () => [],
    };
    const governedService = createGovernedAgentToolService(
      persistence,
      ragPort,
    );
    return { persistence, lifecycleService, governedService };
  };

  const beginPlanningLifecycle = async (
    lifecycleService: ReturnType<typeof createGovernanceLifecycleService>,
    id: string,
  ) => {
    const draft = await lifecycleService.begin({
      id,
      workflowId: "workflow-1",
      fingerprints: { scope: `scope-${id}`, evidence: `evidence-${id}` },
      limits: { execution: 1, repair: 0, review: 1 },
      now: readNow(0),
    });
    return lifecycleService.transition({
      lifecycleId: draft.id,
      kind: GovernanceTransitionKind.StartPlanning,
      actorId: "runtime",
      reason: "Start planning.",
      now: readNow(1),
    });
  };

  const registerPluginAndSkill = (
    governedService: ReturnType<typeof createGovernedAgentToolService>,
    invoke: (input: {
      toolId: string;
      input: JsonValue;
      provenance: ArtifactProvenance;
    }) => Promise<McpToolResult>,
  ) => {
    governedService.registerPlugin({
      manifest: pluginManifest,
      agentId: "test-agent",
      invoke,
    });
    governedService.registerSkill(skillDefinition);
  };

  it("records permission-denial as a deterministic lifecycle failure transition", async () => {
    const { lifecycleService, governedService, persistence } =
      createLifecycleAndServices();
    const lifecycle = await beginPlanningLifecycle(
      lifecycleService,
      "perm-denial",
    );
    registerPluginAndSkill(
      governedService,
      async (_input: {
        toolId: string;
        input: JsonValue;
        provenance: ArtifactProvenance;
      }) => ({
        toolId: "test.skill",
        status: McpToolResultStatus.Success,
        output: { answers: ["data"] },
        provenance: {
          serverId: "test-plugin",
          toolVersion: "1.0.0",
          responseFingerprint: "fp",
        },
      }),
    );

    await lifecycleService.executeBoundedPass({
      lifecycleId: lifecycle.id,
      execute: async () => {
        await governedService.invoke({
          lifecycleId: lifecycle.id,
          skillId: "test.skill",
          input: { query: "test" },
          grantedPermissions: [],
          memoryScope: scope,
          now: readNow(5),
        });
      },
      now: (_step: number) => readNow(6),
    });

    const updated = persistence
      .read()
      .governanceLifecycles.find((l) => l.id === lifecycle.id);
    expect(updated?.state).toBe("failed");
    const lastTransition = updated?.transitions.at(-1);
    expect(lastTransition?.kind).toBe("fail");
    expect(lastTransition?.reason).toBe("Skill permissions were not granted.");
  });

  it("records plugin runtime failure as a deterministic lifecycle failure transition", async () => {
    const { lifecycleService, governedService, persistence } =
      createLifecycleAndServices();
    const lifecycle = await beginPlanningLifecycle(
      lifecycleService,
      "plugin-fail",
    );
    registerPluginAndSkill(
      governedService,
      async (_input: {
        toolId: string;
        input: JsonValue;
        provenance: ArtifactProvenance;
      }) => {
        throw new Error("Plugin provider connection refused.");
      },
    );

    await lifecycleService.executeBoundedPass({
      lifecycleId: lifecycle.id,
      execute: async () => {
        await governedService.invoke({
          lifecycleId: lifecycle.id,
          skillId: "test.skill",
          input: { query: "test" },
          grantedPermissions: ["rag.query", "tool.invoke"],
          memoryScope: scope,
          now: readNow(5),
        });
      },
      now: (_step: number) => readNow(6),
    });

    const updated = persistence
      .read()
      .governanceLifecycles.find((l) => l.id === lifecycle.id);
    expect(updated?.state).toBe("failed");
    const lastTransition = updated?.transitions.at(-1);
    expect(lastTransition?.kind).toBe("fail");
    expect(lastTransition?.reason).toBe("Plugin provider connection refused.");
  });

  it("records malformed MCP response as a deterministic lifecycle failure transition", async () => {
    const { lifecycleService, governedService, persistence } =
      createLifecycleAndServices();
    const lifecycle = await beginPlanningLifecycle(
      lifecycleService,
      "mcp-malformed",
    );
    registerPluginAndSkill(
      governedService,
      async (_input: {
        toolId: string;
        input: JsonValue;
        provenance: ArtifactProvenance;
      }) => ({
        toolId: "test.skill",
        status: McpToolResultStatus.Success,
        output: { answers: [1] },
        provenance: {
          serverId: "test-plugin",
          toolVersion: "1.0.0",
          responseFingerprint: "fp",
        },
      }),
    );

    await lifecycleService.executeBoundedPass({
      lifecycleId: lifecycle.id,
      execute: async () => {
        await governedService.invoke({
          lifecycleId: lifecycle.id,
          skillId: "test.skill",
          input: { query: "test" },
          grantedPermissions: ["rag.query", "tool.invoke"],
          memoryScope: scope,
          now: readNow(5),
        });
      },
      now: (_step: number) => readNow(6),
    });

    const updated = persistence
      .read()
      .governanceLifecycles.find((l) => l.id === lifecycle.id);
    expect(updated?.state).toBe("failed");
    const lastTransition = updated?.transitions.at(-1);
    expect(lastTransition?.kind).toBe("fail");
    expect(lastTransition?.reason).toBe("MCP output failed schema validation.");
  });
});

const createTestServer = (
  mcpConnectionPort?: ServerMcpConnectionPort,
): {
  server: Server;
  persistence: ReturnType<typeof createApplicationPersistence>;
  workflowCatalog: ReturnType<typeof createWorkflowCatalogStore>;
} => {
  const initialState = createDefaultApplicationState();
  const providerStore = createProviderStore();
  const workflowCatalog = createWorkflowCatalogStore();
  const persistence = createApplicationPersistence({
    stateStore: createMemoryStore(initialState),
    initialState,
    providerStore,
    workflowCatalog,
  });
  return {
    persistence,
    workflowCatalog,
    server: createApiServer({
      config: {
        port: 0,
        host: "127.0.0.1",
        authToken: AuthToken,
        databaseUrl: "postgresql://test",
      },
      providerStore,
      workflowRuntime: createWorkflowRuntimeService({
        readApplicationState: persistence.read,
      }),
      applicationPersistence: persistence,
      workflowCatalog,
      ...(mcpConnectionPort ? { mcpConnectionPort } : {}),
    }),
  };
};

const createMemoryMcpConnectionPort = (): ServerMcpConnectionPort =>
  createLocalMcpConnectionPort({
    invoke: async (input) => ({
      toolId: input.toolId,
      status: "success",
      output: { answers: ["memory query completed"] },
      provenance: {
        serverId: "memory-query",
        toolVersion: "1",
        responseFingerprint: "memory-query-response",
      },
    }),
  });

const createMemoryDocument = () => ({
  id: "memory-document",
  sourceId: "memory-source",
  tenantId: "tenant-memory",
  workflowId: "workflow-memory",
  content: "private retained memory",
  createdAt: "2026-07-25T00:00:00.000Z",
  provenance: {
    source: "memory-upload",
    artifactFingerprint: "memory-document-fingerprint",
    registeredAt: "2026-07-25T00:00:00.000Z",
  },
});

const createNonOptInMemorySource = (): EditableAssetRecord => ({
  ...createMemorySource(),
  memory: {
    tenantId: "tenant-memory",
    workflowId: "workflow-memory",
    optInIndexing: false,
    retentionDays: 7,
    redactRetrievals: true,
  },
});

const createMemorySource = (): EditableAssetRecord => ({
  id: "memory-source",
  kind: AssetKind.MemorySource,
  name: "Memory Source",
  status: AssetStatus.Enabled,
  capabilities: ["rag"],
  permissions: ["memory.read", "rag.query"],
  inputSchema: schema("memory-source-input"),
  outputSchema: schema("memory-source-output"),
  limits: { executions: 1, timeoutMs: 1_000 },
  provenance: {
    source: "memory-test",
    artifactFingerprint: "memory-source-fingerprint",
    registeredAt: "2026-07-25T00:00:00.000Z",
  },
  memory: {
    tenantId: "tenant-memory",
    workflowId: "workflow-memory",
    optInIndexing: true,
    retentionDays: 7,
    redactRetrievals: true,
  },
});

const createMemoryMcpTool = (): EditableAssetRecord => ({
  id: "memory-query",
  kind: AssetKind.McpTool,
  name: "Memory Query",
  status: AssetStatus.Enabled,
  capabilities: ["mcp"],
  permissions: ["memory.read", "rag.query", "mcp.invoke"],
  inputSchema: schema("memory-query-input"),
  outputSchema: schema("memory-query-output"),
  limits: { executions: 1, timeoutMs: 1_000 },
  provenance: {
    source: "memory-test",
    artifactFingerprint: "memory-query-fingerprint",
    registeredAt: "2026-07-25T00:00:00.000Z",
  },
  mcp: { serverId: "memory-query", toolVersion: "1", auditEvents: [] },
});

const createMemoryWorkflow = () => ({
  ...createWorkflow(),
  id: "workflow-memory",
  name: "Memory governed run",
  status: WorkflowRecordStatus.Published,
  version: 1,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
  nodes: [
    createWorkflowNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
    {
      ...createWorkflowNode(
        "memory-agent",
        WorkflowNodeKind.AiAgent,
        ["in"],
        ["out"],
      ),
      config: {
        memorySourceId: "memory-source",
        mcpConnection: {
          assetId: "memory-query",
          serverId: "memory-query",
          toolVersion: "1",
        },
        grantedPermissions: ["memory.read", "rag.query", "mcp.invoke"],
      },
    },
    createWorkflowNode(
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

const createWorkflowNode = (
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

const schema = (id: string) => ({
  id,
  version: 1,
  schema: { type: "object" as const },
});

const readExecutionStatus = (value: unknown): string | undefined =>
  isRecord(value) &&
  isRecord(value["execution"]) &&
  typeof value["execution"]["status"] === "string"
    ? value["execution"]["status"]
    : undefined;

const readExecutionLifecycleId = (value: unknown): string | undefined =>
  isRecord(value) &&
  isRecord(value["execution"]) &&
  typeof value["execution"]["lifecycleId"] === "string"
    ? value["execution"]["lifecycleId"]
    : undefined;

const createWorkflow = () => ({
  id: "workflow-governed-run",
  name: "Governed IDE run",
  description: "Persists lifecycle provenance for an IDE run.",
  status: WorkflowRecordStatus.Draft,
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
    {
      id: "review",
      kind: WorkflowNodeKind.HumanReview,
      label: "Review",
      position: { x: 0, y: 0 },
      width: 320,
      collapsed: false,
      config: {},
      inputPorts: [],
      outputPorts: [],
      attachedGuardrails: [],
    },
  ],
  edges: [],
});

const createAwaitingLifecycle = async (
  persistence: ReturnType<typeof createApplicationPersistence>,
  id: string,
) => {
  const service = createGovernanceLifecycleService(persistence);
  const draft = await service.begin({
    id,
    workflowId: "workflow-1",
    fingerprints: { scope: `scope-${id}`, evidence: `evidence-${id}` },
    limits: { execution: 1, repair: 1, review: 1 },
    now: readNow(0),
  });
  const planning = await transition(
    service,
    draft.id,
    GovernanceTransitionKind.StartPlanning,
    1,
  );
  const executing = await transition(
    service,
    planning.id,
    GovernanceTransitionKind.StartExecuting,
    2,
  );
  const verifying = await transition(
    service,
    executing.id,
    GovernanceTransitionKind.StartVerifying,
    3,
  );
  const reviewing = await transition(
    service,
    verifying.id,
    GovernanceTransitionKind.StartReviewing,
    4,
  );
  return transition(
    service,
    reviewing.id,
    GovernanceTransitionKind.AwaitUserApproval,
    5,
  );
};

const createAwaitingLifecycleWithSecret = async (
  persistence: ReturnType<typeof createApplicationPersistence>,
  id: string,
) => {
  const service = createGovernanceLifecycleService(persistence);
  const draft = await service.begin({
    id,
    workflowId: "workflow-1",
    fingerprints: { scope: `scope-${id}`, evidence: `evidence-${id}` },
    limits: { execution: 1, repair: 1, review: 1 },
    now: readNow(0),
  });
  const planning = await transition(
    service,
    draft.id,
    GovernanceTransitionKind.StartPlanning,
    1,
  );
  const executing = await transition(
    service,
    planning.id,
    GovernanceTransitionKind.StartExecuting,
    2,
  );
  await service.recordPromptExecution({
    id: `${id}:prompt:1:0`,
    lifecycleId: executing.id,
    assetId: "prompt-secret",
    version: 1,
    bindings: {
      apiKey: "raw-browser-secret",
      api_key: "underscore-browser-secret",
      context: { nestedToken: "nested-browser-secret" },
      subject: "Visible",
    },
    renderedFingerprint: "fingerprint",
    validation: "passed",
    timestamp: readNow(3),
  });
  const verifying = await transition(
    service,
    executing.id,
    GovernanceTransitionKind.StartVerifying,
    4,
  );
  const reviewing = await transition(
    service,
    verifying.id,
    GovernanceTransitionKind.StartReviewing,
    5,
  );
  return transition(
    service,
    reviewing.id,
    GovernanceTransitionKind.AwaitUserApproval,
    6,
  );
};

const transition = (
  service: ReturnType<typeof createGovernanceLifecycleService>,
  lifecycleId: string,
  kind: GovernanceTransitionKind,
  step: number,
) =>
  service.transition({
    lifecycleId,
    kind,
    actorId: "runtime",
    reason: "Lifecycle transition.",
    now: readNow(step),
  });

const request = async (
  url: string,
  path: string,
  body: unknown,
): Promise<{
  status: number;
  body: {
    lifecycle: { transitions: ReadonlyArray<unknown> } & Record<
      string,
      unknown
    >;
    execution?: unknown;
    error?: unknown;
  };
}> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      lifecycle: { transitions: ReadonlyArray<unknown> } & Record<
        string,
        unknown
      >;
      execution?: unknown;
      error?: unknown;
    },
  };
};

const requestWithHeaders = async (
  url: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  body: Record<string, unknown>;
  cookie: string;
}> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    cookie: response.headers.get("set-cookie") ?? "",
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

const readNow = (step: number): string =>
  `2026-07-17T00:00:0${step.toString()}.000Z`;

const readErrorMessage = (value: unknown): string =>
  isRecord(value) && typeof value["message"] === "string"
    ? value["message"]
    : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
