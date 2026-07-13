import { describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleProvider } from "../../../packages/adapters/src/openai-compatible/provider";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  type WorkflowDefinitionRecord,
  type WorkflowNodeRecord,
} from "../../../packages/shared/src/workflows";
import { createDefaultWorkspaceState } from "./workspace-state";
import {
  createWorkflowRuntimeService,
  resolveProviderApiKey,
} from "./workflow-runtime";

describe("workflow runtime provider adapters", () => {
  it("resolves a persisted environment secret reference after restart without retaining the key", () => {
    const environment = {
      WORKFLOW_PROVIDER_KEY: "secret-token",
    };

    expect(
      resolveProviderApiKey(
        {
          apiKeyEnvVar: "WORKFLOW_PROVIDER_KEY",
        },
        environment,
      ),
    ).toBe("secret-token");
  });

  it("rejects the legacy Codex profile before attempting a CLI invocation in fresh state", async () => {
    const node = createProviderNode();
    const runtime = createWorkflowRuntimeService({
      readWorkspaceState: createDefaultWorkspaceState,
    });

    const result = await runtime.testProviderNode({
      workflow: createWorkflowDefinition(node),
      node,
      assets: [],
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe(
      "Workflow provider profile codex-cli-default not found.",
    );
  });

  it("runs openai-compatible providers with bearer auth and maps usage", async () => {
    let invocationCount = 0;
    const calls: Array<{
      url: string;
      init: RequestInit | undefined;
    }> = [];
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "http://127.0.0.1:3001",
      apiKey: "secret-token",
      fetchImplementation: async (url, init) => {
        invocationCount += 1;
        calls.push({
          url: String(url),
          init,
        });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Local provider reply",
                },
              },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 7,
              total_tokens: 18,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
      models: [
        {
          id: "gpt-4.1",
          displayName: "gpt-4.1",
        },
      ],
    });

    const result = await provider.run({
      modelId: "gpt-4.1",
      input: "Say hello",
      temperature: 0.2,
    });

    expect(invocationCount).toBe(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:3001/v1/chat/completions");
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
    });
    expect(result).toEqual({
      message: "Local provider reply",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
      },
    });
  });

  it("fails openai-compatible requests when the provider stops responding", async () => {
    vi.useFakeTimers();
    try {
      const requestTimeoutMs = 25;
      const provider = createOpenAiCompatibleProvider({
        baseUrl: "http://127.0.0.1:3001",
        apiKey: "secret-token",
        requestTimeoutMs,
        fetchImplementation: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              },
              { once: true },
            );
          }),
      });

      const runPromise = expect(
        provider.run({
          modelId: "gpt-4.1",
          input: "Say hello",
          temperature: 0.2,
        }),
      ).rejects.toThrow(
        "OpenAI-compatible provider request timed out after 25ms.",
      );
      await vi.advanceTimersByTimeAsync(requestTimeoutMs);

      await runPromise;
    } finally {
      vi.useRealTimers();
    }
  });
});

const createProviderNode = (): WorkflowNodeRecord => ({
  id: "provider-node",
  kind: WorkflowNodeKind.AiProviderRun,
  label: "Provider",
  position: { x: 0, y: 0 },
  width: 320,
  collapsed: false,
  config: {
    provider: {
      providerId: "codex-cli-default",
      modelId: "",
      reasoningLevel: "medium",
      temperature: 0.2,
      verbosity: "medium",
    },
  },
  inputPorts: [],
  outputPorts: [],
  attachedGuardrails: [],
});

const createWorkflowDefinition = (
  node: WorkflowNodeRecord,
): WorkflowDefinitionRecord => ({
  id: "workflow",
  name: "Workflow",
  description: "Workflow runtime test",
  status: WorkflowRecordStatus.Draft,
  version: 1,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [node],
  edges: [],
  executionPolicy: {
    maxNodeRetries: 0,
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 1,
    carryArtifactLimit: 1,
  },
  tags: [],
});
