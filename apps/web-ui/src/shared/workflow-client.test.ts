import { describe, expect, it } from "vitest";
import {
  decodeServerSentEvents,
  parseWorkflowAssetListResponse,
  parseWorkflowDefinitionListResponse,
  parseWorkflowDefinitionVersionListResponse,
  parseWorkflowExecutionListResponse,
  parseWorkflowNodeProviderTestResponse,
  parseWorkflowRunStreamEvent,
  WorkflowRunStreamEventType,
} from "./workflow-client.js";

describe("workflow client parsers", () => {
  it("parses workflow definition list responses", () => {
    const definitions = parseWorkflowDefinitionListResponse({
      definitions: [
        {
          id: "workflow-1",
          workspaceId: "workspace-1",
          projectId: "project-1",
          name: "Workflow",
          description: "",
          status: "draft",
          version: 2,
          createdAt: "2026-05-06T18:00:00.000Z",
          updatedAt: "2026-05-06T18:10:00.000Z",
          trigger: {
            kind: "manual",
            enabled: true,
            config: {},
          },
          viewport: {
            x: 12,
            y: 18,
            zoom: 1,
          },
          nodes: [],
          edges: [],
          executionPolicy: {
            maxNodeRetries: 1,
            allowManualCheckpointResume: true,
          },
          defaultContextPolicy: {
            language: "en",
            carryMessagesLimit: 8,
            carryArtifactLimit: 8,
          },
          tags: ["mvp"],
        },
      ],
    });

    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.workspaceId).toBe("workspace-1");
    expect(definitions[0]?.tags).toEqual(["mvp"]);
  });

  it("parses workflow definition version list responses", () => {
    const versions = parseWorkflowDefinitionVersionListResponse({
      versions: [
        {
          id: "version-1",
          workflowId: "workflow-1",
          projectId: "project-1",
          version: 2,
          createdAt: "2026-05-06T18:10:00.000Z",
          snapshot: {
            id: "workflow-1",
            workspaceId: "workspace-1",
            projectId: "project-1",
            name: "Workflow v2",
            description: "",
            status: "draft",
            version: 2,
            createdAt: "2026-05-06T18:00:00.000Z",
            updatedAt: "2026-05-06T18:10:00.000Z",
            trigger: {
              kind: "manual",
              enabled: true,
              config: {},
            },
            viewport: {
              x: 12,
              y: 18,
              zoom: 1,
            },
            nodes: [],
            edges: [],
            executionPolicy: {
              maxNodeRetries: 1,
              allowManualCheckpointResume: true,
            },
            defaultContextPolicy: {
              language: "en",
              carryMessagesLimit: 8,
              carryArtifactLimit: 8,
            },
            tags: ["mvp"],
          },
        },
      ],
    });

    expect(versions).toHaveLength(1);
    expect(versions[0]?.snapshot.name).toBe("Workflow v2");
  });

  it("parses workflow asset lists with optional contracts and guardrails", () => {
    const assets = parseWorkflowAssetListResponse({
      assets: [
        {
          id: "asset-1",
          workspaceId: "workspace-1",
          projectId: "project-1",
          kind: "prompt",
          scope: "project",
          name: "Prompt asset",
          slug: "prompt-asset",
          description: "",
          body: "Prompt body",
          language: "en",
          version: 1,
          tags: [],
          outputContract: {
            id: "contract-1",
            name: "Prompt output",
            schemaVersion: 1,
            rootType: "object",
            schema: {
              type: "object",
              properties: {
                result: {
                  type: "string",
                },
              },
            },
          },
          createdAt: "2026-05-06T18:00:00.000Z",
          updatedAt: "2026-05-06T18:10:00.000Z",
        },
        {
          id: "asset-2",
          workspaceId: "workspace-1",
          projectId: "project-1",
          kind: "guardrail",
          scope: "project",
          name: "Guardrail",
          slug: "guardrail",
          description: "",
          body: "",
          language: "en",
          version: 1,
          tags: [],
          guardrail: {
            id: "guardrail-1",
            severity: "error",
            operator: "all",
            validations: [
              {
                id: "validation-1",
                kind: "field_exists",
                target: "output",
                message: "Need output",
              },
            ],
          },
          createdAt: "2026-05-06T18:00:00.000Z",
          updatedAt: "2026-05-06T18:10:00.000Z",
        },
      ],
    });

    expect(assets).toHaveLength(2);
    expect(assets[0]?.outputContract?.name).toBe("Prompt output");
    expect(assets[1]?.guardrail?.validations).toHaveLength(1);
  });

  it("parses workflow execution lists", () => {
    const executions = parseWorkflowExecutionListResponse({
      executions: [
        {
          id: "execution-1",
          workflowId: "workflow-1",
          projectId: "project-1",
          triggerKind: "manual",
          status: "completed",
          startedAt: "2026-05-06T18:00:00.000Z",
          finishedAt: "2026-05-06T18:01:00.000Z",
          durationMs: 60000,
          warningsCount: 1,
          errorsCount: 0,
          totals: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
            estimatedCostEur: 0.12,
            latencyMs: 1200,
          },
          contextSessionId: "ctx-1",
          nodeRuns: [
            {
              id: "node-run-1",
              nodeId: "node-1",
              nodeKind: "ai.provider-run",
              status: "completed",
              startedAt: "2026-05-06T18:00:00.000Z",
              finishedAt: "2026-05-06T18:01:00.000Z",
              alerts: [],
              guardrailFindings: [
                {
                  guardrailAssetId: "asset-guardrail-1",
                  nodeId: "node-1",
                  severity: "warn",
                  message: "Summary present.",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(executions).toHaveLength(1);
    expect(executions[0]?.totals.totalTokens).toBe(30);
    expect(executions[0]?.warningsCount).toBe(1);
    expect(executions[0]?.nodeRuns[0]?.guardrailFindings[0]?.message).toBe(
      "Summary present.",
    );
  });

  it("parses provider test results with updated workflow metadata", () => {
    const result = parseWorkflowNodeProviderTestResponse({
      definition: {
        id: "workflow-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        name: "Workflow",
        description: "",
        status: "draft",
        version: 2,
        createdAt: "2026-05-06T18:00:00.000Z",
        updatedAt: "2026-05-06T18:10:00.000Z",
        trigger: {
          kind: "manual",
          enabled: true,
          config: {},
        },
        viewport: {
          x: 0,
          y: 0,
          zoom: 1,
        },
        nodes: [],
        edges: [],
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
      },
      nodeId: "node-1",
      status: "passed",
      testedAt: "2026-05-06T18:11:00.000Z",
      message: "Provider runtime responded to the workflow smoke test.",
    });

    expect(result.nodeId).toBe("node-1");
    expect(result.status).toBe("passed");
    expect(result.definition.id).toBe("workflow-1");
  });

  it("decodes workflow stream SSE blocks", () => {
    const decoded = decodeServerSentEvents(
      'event: node_delta\ndata: {"type":"node_delta","workflowId":"workflow-1","workflowRunId":"run-1","nodeId":"node-1","delta":"hello","emittedAt":"2026-05-06T18:00:00.000Z"}\n\n',
    );

    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.event).toBe("node_delta");
  });

  it("parses workflow stream completion events", () => {
    const event = parseWorkflowRunStreamEvent(
      WorkflowRunStreamEventType.WorkflowCompleted,
      {
        type: "workflow_completed",
        workflowId: "workflow-1",
        workflowRunId: "run-1",
        finishedAt: "2026-05-06T18:01:00.000Z",
        execution: {
          id: "execution-1",
          workflowId: "workflow-1",
          projectId: "project-1",
          triggerKind: "manual",
          status: "completed",
          startedAt: "2026-05-06T18:00:00.000Z",
          finishedAt: "2026-05-06T18:01:00.000Z",
          durationMs: 60000,
          warningsCount: 0,
          errorsCount: 0,
          totals: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
            estimatedCostEur: 0.12,
            latencyMs: 1200,
          },
          contextSessionId: "ctx-1",
          nodeRuns: [],
        },
      },
    );

    expect(event.type).toBe("workflow_completed");
    if (event.type === "workflow_completed") {
      expect(event.execution.id).toBe("execution-1");
    }
  });
});
