import {
  createWorkflowRuntime,
  WorkflowRuntimeEvent,
  type WorkflowProviderRunRequest,
  type WorkflowProviderRunResult,
} from "../../../packages/agents/src/workflow-runtime";
import { createCodexCliProvider } from "../../../packages/adapters/src/codex-cli/provider";
import { createOpenAiCompatibleProvider } from "../../../packages/adapters/src/openai-compatible/provider";
import {
  LLMEventType,
  type LLMEvent,
} from "../../../packages/domain/src/llm/events";
import type {
  LLMProviderPort,
  LLMRunResult,
} from "../../../packages/domain/src/llm/provider";
import type {
  WorkflowAssetRecord,
  WorkflowDefinitionRecord,
  WorkflowExecutionRecord,
  WorkflowNodeExecutionInputSourceRecord,
} from "../../../packages/shared/src/workflows";
import type { WorkspaceState } from "./workspace-state";

const SmokeTestPrompt = "Reply with OK.";

type ProviderProfile = {
  id: string;
  providerKind: string;
  modelId: string;
  command: string;
  endpointUrl: string;
  promptMode: "stdin" | "arg";
  apiKeyEnvVar: string;
};

export type WorkflowRuntimeService = {
  runWorkflow: (input: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }) => Promise<WorkflowExecutionRecord>;
  runNode: (input: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    nodeId: string;
    inputSource: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }) => Promise<WorkflowExecutionRecord>;
  testProviderNode: (input: {
    workflow: WorkflowDefinitionRecord;
    node: WorkflowDefinitionRecord["nodes"][number];
    assets: ReadonlyArray<WorkflowAssetRecord>;
  }) => Promise<{
    status: "passed" | "failed";
    testedAt: string;
    message: string;
  }>;
};

export const createWorkflowRuntimeService = (input: {
  readWorkspaceState: () => WorkspaceState;
  now?: () => Date;
}): WorkflowRuntimeService => {
  const now = input.now ?? (() => new Date());
  const runtime = createWorkflowRuntime({
    now,
    runProviderNode: async (request) =>
      executeProviderNode(
        request,
        resolveProviderProfile(
          input.readWorkspaceState(),
          request.node.config.provider?.providerId,
        ),
      ),
  });

  const runWorkflow = async (request: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }): Promise<WorkflowExecutionRecord> =>
    runtime.runDefinition({
      definition: request.definition,
      assets: request.assets,
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onEvent ? { onEvent: request.onEvent } : {}),
    });

  const runNode = async (request: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    nodeId: string;
    inputSource: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowRuntimeEvent) => void;
  }): Promise<WorkflowExecutionRecord> =>
    runtime.runNode({
      definition: request.definition,
      assets: request.assets,
      nodeId: request.nodeId,
      inputSource: request.inputSource,
      ...(request.seedNodeOutputs
        ? { seedNodeOutputs: request.seedNodeOutputs }
        : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onEvent ? { onEvent: request.onEvent } : {}),
    });

  const testProviderNode = async (request: {
    workflow: WorkflowDefinitionRecord;
    node: WorkflowDefinitionRecord["nodes"][number];
    assets: ReadonlyArray<WorkflowAssetRecord>;
  }): Promise<{
    status: "passed" | "failed";
    testedAt: string;
    message: string;
  }> => {
    const testedAt = now().toISOString();
    try {
      const profile = resolveProviderProfile(
        input.readWorkspaceState(),
        request.node.config.provider?.providerId,
      );
      await executeProviderNode(
        {
          workflowId: request.workflow.id,
          workflowRunId: `provider-test-${request.node.id}`,
          node: request.node,
          provider: request.node.config.provider ?? {
            providerId: profile.id,
            modelId: profile.modelId,
            reasoningLevel: "medium",
            temperature: 0.2,
            verbosity: "medium",
          },
          envelope: {
            sessionId: `provider-test-${request.node.id}`,
            workflowRunId: `provider-test-${request.node.id}`,
            workflowId: request.workflow.id,
            language: request.workflow.defaultContextPolicy.language,
            summary: request.workflow.description,
            objectives: request.workflow.tags,
            variables: {},
            artifacts: [],
            citations: [],
            guardrailFindings: [],
            messages: [],
          },
          prompt: request.node.config.prompt?.trim().length
            ? request.node.config.prompt
            : SmokeTestPrompt,
        },
        profile,
      );
      return {
        status: "passed",
        testedAt,
        message: "Provider runtime responded to the workflow smoke test.",
      };
    } catch (error) {
      return {
        status: "failed",
        testedAt,
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Provider runtime test failed.",
      };
    }
  };

  return {
    runWorkflow,
    runNode,
    testProviderNode,
  };
};

const executeProviderNode = async (
  request: WorkflowProviderRunRequest,
  profile: ProviderProfile,
): Promise<WorkflowProviderRunResult> => {
  const provider = createProvider(profile);
  const result = await provider.run({
    modelId: request.provider.modelId || profile.modelId,
    input: request.prompt,
    temperature: request.provider.temperature,
    ...(request.signal ? { signal: request.signal } : {}),
  });
  return collectProviderResult(result);
};

const createProvider = (profile: ProviderProfile): LLMProviderPort => {
  if (profile.providerKind === "codex-cli") {
    if (profile.command.length === 0) {
      throw new Error(
        `Workflow provider profile ${profile.id} is missing a CLI command.`,
      );
    }
    return createCodexCliProvider({
      command: profile.command,
      promptMode: profile.promptMode,
      models: profile.modelId
        ? [
            {
              id: profile.modelId,
              displayName: profile.modelId,
            },
          ]
        : [],
    });
  }

  if (
    profile.providerKind === "openai" ||
    profile.providerKind === "ollama" ||
    profile.providerKind === "custom"
  ) {
    if (profile.endpointUrl.length === 0) {
      throw new Error(
        `Workflow provider profile ${profile.id} is missing an endpoint URL.`,
      );
    }
    if (
      (profile.providerKind === "openai" ||
        profile.providerKind === "custom") &&
      resolveProviderApiKey(profile).length === 0
    ) {
      throw new Error(
        `Workflow provider profile ${profile.id} is missing a bearer API key.`,
      );
    }

    return createOpenAiCompatibleProvider({
      baseUrl: profile.endpointUrl,
      apiKey: resolveProviderApiKey(profile),
      models: profile.modelId
        ? [
            {
              id: profile.modelId,
              displayName: profile.modelId,
            },
          ]
        : [],
    });
  }

  throw new Error(
    `Workflow provider kind ${profile.providerKind} is not supported by the runtime yet.`,
  );
};

const collectProviderResult = async (
  result: LLMRunResult,
): Promise<WorkflowProviderRunResult> => {
  if (Symbol.asyncIterator in result) {
    return collectProviderEvents(result as AsyncIterable<LLMEvent>);
  }

  const usage = result.usage
    ? {
        promptTokens: result.usage.inputTokens,
        completionTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCostEur: 0,
        latencyMs: 0,
      }
    : undefined;
  return {
    outputText: result.message,
    ...(usage ? { usage } : {}),
  };
};

const collectProviderEvents = async (
  events: AsyncIterable<LLMEvent>,
): Promise<WorkflowProviderRunResult> => {
  let outputText = "";
  let usage: WorkflowProviderRunResult["usage"];

  for await (const event of events) {
    if (event.type === LLMEventType.Delta) {
      outputText += event.delta;
      continue;
    }

    if (event.type === LLMEventType.Message) {
      outputText += event.message;
      continue;
    }

    if (event.type === LLMEventType.Usage) {
      usage = {
        promptTokens: event.usage.inputTokens,
        completionTokens: event.usage.outputTokens,
        totalTokens: event.usage.totalTokens,
        estimatedCostEur: 0,
        latencyMs: 0,
      };
      continue;
    }

    if (event.type === LLMEventType.Error) {
      throw new Error(event.error.message);
    }
  }

  return {
    outputText: outputText.trim() ? outputText : "OK",
    ...(usage ? { usage } : {}),
  };
};

const resolveProviderProfile = (
  workspaceState: WorkspaceState,
  profileId: string | undefined,
): ProviderProfile => {
  const profiles = workspaceState.settings.providerProfiles
    .map(readProviderProfile)
    .filter((profile): profile is ProviderProfile => profile !== null);
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(
      `Workflow provider profile ${profileId ?? "unknown"} not found.`,
    );
  }

  return profile;
};

const readProviderProfile = (value: unknown): ProviderProfile | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value["id"]);
  const providerKind = readString(value["providerKind"]);
  if (id.length === 0 || providerKind.length === 0) {
    return null;
  }

  const promptMode =
    readString(value["promptMode"]) === "arg" ? "arg" : "stdin";
  return {
    id,
    providerKind,
    modelId: readString(value["modelId"]),
    command: readString(value["command"]),
    endpointUrl: readString(value["endpointUrl"]),
    promptMode,
    apiKeyEnvVar: readString(value["apiKeyEnvVar"]),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const resolveProviderApiKey = (
  value: { apiKeyEnvVar: string },
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const envKey = value.apiKeyEnvVar;
  if (envKey.length > 0) {
    return readString(environment[envKey]);
  }

  return readString(environment["OPENAI_API_KEY"]);
};
