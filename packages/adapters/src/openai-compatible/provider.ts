import type { LLMProviderCapabilities } from "../../../domain/src/llm/capabilities";
import { LLMProviderType } from "../../../domain/src/llm/capabilities";
import type { LLMModel } from "../../../domain/src/llm/models";
import type {
  LLMProviderPort,
  LLMRunResult,
} from "../../../domain/src/llm/provider";
import type { LLMRunRequest } from "../../../domain/src/llm/run";
import type { ProviderDescriptor } from "../../../domain/src/providers/registry";
import { ProviderAuthType } from "../../../domain/src/providers/registry";
import { JsonSchemaType } from "../../../domain/src/providers/schema";

export type OpenAiCompatibleProviderConfig = {
  baseUrl: string;
  apiKey: string;
  fetchImplementation?: typeof fetch;
  requestTimeoutMs?: number;
  models?: ReadonlyArray<LLMModel>;
};

type OpenAiCompatibleResponse = {
  choices?: ReadonlyArray<{
    message?: {
      content?:
        | string
        | ReadonlyArray<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const DefaultChatCompletionsPath = "/v1/chat/completions";
const MillisecondsPerSecond = 1_000;
const SecondsPerMinute = 60;
const DefaultRequestTimeoutMinutes = 5;
const DefaultRequestTimeoutMs =
  DefaultRequestTimeoutMinutes * SecondsPerMinute * MillisecondsPerSecond;

export const openAiCompatibleCapabilities: LLMProviderCapabilities = {
  streaming: false,
  jsonSchemaEnforcement: false,
  tokenUsage: true,
  toolCalls: false,
};

export const openAiCompatibleProviderDescriptor: ProviderDescriptor = {
  id: "openai",
  displayName: "OpenAI-compatible",
  type: LLMProviderType.Api,
  capabilities: openAiCompatibleCapabilities,
  auth: {
    type: ProviderAuthType.ApiKey,
    description: "Bearer token",
  },
  settingsSchema: {
    type: JsonSchemaType.Object,
    properties: {
      endpointUrl: {
        type: JsonSchemaType.String,
      },
      apiKey: {
        type: JsonSchemaType.String,
      },
    },
    required: ["endpointUrl"],
  },
};

export const customOpenAiCompatibleProviderDescriptor: ProviderDescriptor = {
  ...openAiCompatibleProviderDescriptor,
  id: "custom",
  displayName: "Custom OpenAI-compatible",
};

export const createOpenAiCompatibleProvider = (
  config: OpenAiCompatibleProviderConfig,
): LLMProviderPort => ({
  capabilities: openAiCompatibleCapabilities,
  listModels: async () => config.models ?? [],
  run: async (request: LLMRunRequest): Promise<LLMRunResult> =>
    runOpenAiCompatibleRequest(config, request),
});

const runOpenAiCompatibleRequest = async (
  config: OpenAiCompatibleProviderConfig,
  request: LLMRunRequest,
): Promise<LLMRunResult> => {
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const timeoutMs = normalizeRequestTimeoutMs(config.requestTimeoutMs);
  const abortController = new AbortController();
  let requestTimedOut = false;
  const abortFromRequest = (): void => abortController.abort();
  if (request.signal?.aborted) {
    abortController.abort();
  }
  request.signal?.addEventListener("abort", abortFromRequest, { once: true });
  const timeout = setTimeout(() => {
    requestTimedOut = true;
    abortController.abort();
  }, timeoutMs);
  try {
    const response = await fetchOpenAiCompatibleResponse({
      fetchImplementation,
      config,
      request,
      abortController,
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible provider request failed with status ${response.status.toString()}.`,
      );
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    return {
      message: readMessageContent(payload),
      ...(payload.usage
        ? {
            usage: {
              inputTokens: payload.usage.prompt_tokens ?? 0,
              outputTokens: payload.usage.completion_tokens ?? 0,
              totalTokens: payload.usage.total_tokens ?? 0,
            },
          }
        : {}),
    };
  } catch (error) {
    if (requestTimedOut) {
      throw new Error(
        `OpenAI-compatible provider request timed out after ${timeoutMs.toString()}ms.`,
      );
    }
    if (request.signal?.aborted) {
      throw new Error("OpenAI-compatible provider request canceled.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromRequest);
  }
};

const fetchOpenAiCompatibleResponse = async (input: {
  fetchImplementation: typeof fetch;
  config: OpenAiCompatibleProviderConfig;
  request: LLMRunRequest;
  abortController: AbortController;
}): Promise<Response> => {
  return await input.fetchImplementation(
    buildChatCompletionsUrl(input.config.baseUrl),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: input.abortController.signal,
      body: JSON.stringify({
        model: input.request.modelId,
        messages: buildMessages(input.request),
        ...(input.request.temperature !== undefined
          ? { temperature: input.request.temperature }
          : {}),
      }),
    },
  );
};

const normalizeRequestTimeoutMs = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DefaultRequestTimeoutMs;

const buildChatCompletionsUrl = (baseUrl: string): string => {
  const normalized = baseUrl.trim().replace(/\/+$/u, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}${DefaultChatCompletionsPath}`;
};

const buildMessages = (
  request: LLMRunRequest,
): ReadonlyArray<{
  role: "system" | "user";
  content: string;
}> => [
  ...(request.system
    ? [{ role: "system" as const, content: request.system }]
    : []),
  {
    role: "user" as const,
    content: request.input,
  },
];

const readMessageContent = (payload: OpenAiCompatibleResponse): string => {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => readContentTextPart(entry))
      .join("")
      .trim();
  }

  return "";
};

const readContentTextPart = (entry: unknown): string => {
  if (
    typeof entry === "object" &&
    entry !== null &&
    "type" in entry &&
    entry["type"] === "text" &&
    "text" in entry &&
    typeof entry["text"] === "string"
  ) {
    return entry["text"];
  }

  return "";
};
