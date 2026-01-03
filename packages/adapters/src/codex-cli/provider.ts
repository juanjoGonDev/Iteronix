import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { CodexCliPromptMode, CodexCliProviderDisplayName, CodexCliProviderId, CodexCliDefaultCommand } from "./constants";
import { codexCliSettingsSchema } from "./schema";
import type { LLMEvent } from "../../../domain/src/llm/events";
import { LLMErrorCode, LLMEventType } from "../../../domain/src/llm/events";
import type { LLMProviderCapabilities } from "../../../domain/src/llm/capabilities";
import { LLMProviderType } from "../../../domain/src/llm/capabilities";
import type { LLMProviderPort } from "../../../domain/src/llm/provider";
import type { LLMRunRequest } from "../../../domain/src/llm/run";
import type { LLMModel } from "../../../domain/src/llm/models";
import type { ProviderDescriptor } from "../../../domain/src/providers/registry";
import { ProviderAuthType } from "../../../domain/src/providers/registry";

export type CodexCliProviderConfig = {
  command?: string;
  args?: ReadonlyArray<string>;
  cwd?: string;
  env?: Record<string, string>;
  promptMode?: CodexCliPromptMode;
  promptArg?: string;
  modelArg?: string;
  systemArg?: string;
  temperatureArg?: string;
  maxTokensArg?: string;
  jsonSchemaArg?: string;
  models?: ReadonlyArray<LLMModel>;
};

type CodexCliProviderConfigResolved = {
  command: string;
  args: ReadonlyArray<string>;
  cwd: string | undefined;
  env: Record<string, string> | undefined;
  promptMode: CodexCliPromptMode;
  promptArg: string | undefined;
  modelArg: string | undefined;
  systemArg: string | undefined;
  temperatureArg: string | undefined;
  maxTokensArg: string | undefined;
  jsonSchemaArg: string | undefined;
  models: ReadonlyArray<LLMModel>;
};

type ProcessOutcome =
  | {
      type: "close";
      code: number | null;
      signal: NodeJS.Signals | null;
    }
  | {
      type: "error";
      error: Error;
    };

export const codexCliCapabilities: LLMProviderCapabilities = {
  streaming: true,
  jsonSchemaEnforcement: false,
  tokenUsage: false,
  toolCalls: false
};

export const codexCliProviderDescriptor: ProviderDescriptor = {
  id: CodexCliProviderId,
  displayName: CodexCliProviderDisplayName,
  type: LLMProviderType.Cli,
  capabilities: codexCliCapabilities,
  auth: {
    type: ProviderAuthType.None
  },
  settingsSchema: codexCliSettingsSchema
};

export const createCodexCliProvider = (
  config: CodexCliProviderConfig
): LLMProviderPort => {
  const resolvedConfig = normalizeConfig(config);

  return {
    capabilities: codexCliCapabilities,
    listModels: async () => resolvedConfig.models,
    run: async (request: LLMRunRequest) => streamCodexCli(resolvedConfig, request)
  };
};

const streamCodexCli = (
  config: CodexCliProviderConfigResolved,
  request: LLMRunRequest
): AsyncIterable<LLMEvent> => {
  const queue = createAsyncQueue<LLMEvent>();
  void runCodexCli(config, request, queue);
  return queue.iterable;
};

const runCodexCli = async (
  config: CodexCliProviderConfigResolved,
  request: LLMRunRequest,
  queue: AsyncQueue<LLMEvent>
): Promise<void> => {
  const args = buildArgs(config, request);
  const child = spawnProcess(config, args);
  let stderrOutput = "";

  child.stderr.on("data", (chunk: unknown) => {
    stderrOutput += toText(chunk);
  });

  child.stdout.on("data", (chunk: unknown) => {
    const text = toText(chunk);
    if (text.length > 0) {
      queue.push({
        type: LLMEventType.Delta,
        delta: text
      });
    }
  });

  if (config.promptMode === CodexCliPromptMode.Stdin) {
    child.stdin.write(request.input);
  }

  child.stdin.end();

  const outcome = await waitForProcess(child);

  if (outcome.type === "error") {
    queue.push(createProviderError(outcome.error.message));
    queue.push({ type: LLMEventType.Done });
    queue.close();
    return;
  }

  if (outcome.code !== 0) {
    queue.push(
      createProviderError(
        formatExitMessage(outcome.code, outcome.signal, stderrOutput)
      )
    );
  }

  queue.push({ type: LLMEventType.Done });
  queue.close();
};

const buildArgs = (
  config: CodexCliProviderConfigResolved,
  request: LLMRunRequest
): string[] => {
  const args = [...config.args];

  appendFlagArg(args, config.modelArg, request.modelId);

  if (request.system) {
    appendFlagArg(args, config.systemArg, request.system);
  }

  if (request.temperature !== undefined) {
    appendFlagArg(args, config.temperatureArg, request.temperature.toString());
  }

  if (request.maxTokens !== undefined) {
    appendFlagArg(args, config.maxTokensArg, request.maxTokens.toString());
  }

  if (request.jsonSchema !== undefined) {
    appendFlagArg(
      args,
      config.jsonSchemaArg,
      JSON.stringify(request.jsonSchema)
    );
  }

  if (config.promptMode === CodexCliPromptMode.Arg) {
    appendPromptArg(args, config.promptArg, request.input);
  }

  return args;
};

const appendFlagArg = (
  args: string[],
  flag: string | undefined,
  value: string
): void => {
  if (hasArg(flag)) {
    args.push(flag, value);
  }
};

const appendPromptArg = (
  args: string[],
  flag: string | undefined,
  value: string
): void => {
  if (hasArg(flag)) {
    args.push(flag, value);
    return;
  }

  args.push(value);
};

const spawnProcess = (
  config: CodexCliProviderConfigResolved,
  args: ReadonlyArray<string>
): ChildProcessWithoutNullStreams => {
  const env: NodeJS.ProcessEnv = config.env
    ? { ...process.env, ...config.env }
    : process.env;

  return spawn(config.command, [...args], {
    cwd: config.cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"]
  });
};

const normalizeConfig = (
  config: CodexCliProviderConfig
): CodexCliProviderConfigResolved => ({
  command: config.command ?? CodexCliDefaultCommand,
  args: config.args ?? [],
  cwd: config.cwd,
  env: config.env,
  promptMode: config.promptMode ?? CodexCliPromptMode.Stdin,
  promptArg: config.promptArg,
  modelArg: config.modelArg,
  systemArg: config.systemArg,
  temperatureArg: config.temperatureArg,
  maxTokensArg: config.maxTokensArg,
  jsonSchemaArg: config.jsonSchemaArg,
  models: config.models ?? []
});

const hasArg = (flag: string | undefined): flag is string =>
  typeof flag === "string" && flag.length > 0;

const waitForProcess = (
  child: ChildProcessWithoutNullStreams
): Promise<ProcessOutcome> =>
  new Promise((resolve) => {
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      resolve({ type: "close", code, signal });
    });

    child.once("error", (error: Error) => {
      resolve({ type: "error", error });
    });
  });

const formatExitMessage = (
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrOutput: string
): string => {
  const codeInfo = code === null ? "null" : code.toString();
  const signalInfo = signal ?? "none";
  const stderrInfo = stderrOutput.length > 0 ? stderrOutput : "no stderr";
  return `codex-cli exited with code ${codeInfo}, signal ${signalInfo}, stderr: ${stderrInfo}`;
};

const createProviderError = (message: string): LLMEvent => ({
  type: LLMEventType.Error,
  error: {
    code: LLMErrorCode.ProviderError,
    message,
    retryable: false
  }
});

const toText = (chunk: unknown): string => {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString("utf8");
  }

  return "";
};

type AsyncQueue<T> = {
  push: (value: T) => void;
  close: () => void;
  iterable: AsyncIterable<T>;
};

const createAsyncQueue = <T>(): AsyncQueue<T> => {
  const values: T[] = [];
  let closed = false;
  const resolvers: Array<(result: IteratorResult<T, void>) => void> = [];

  const push = (value: T): void => {
    if (closed) {
      return;
    }

    const resolver = resolvers.shift();
    if (resolver) {
      resolver({ value, done: false });
      return;
    }

    values.push(value);
  };

  const close = (): void => {
    if (closed) {
      return;
    }

    closed = true;
    while (resolvers.length > 0) {
      const resolver = resolvers.shift();
      if (resolver) {
        resolver({ value: undefined, done: true });
      }
    }
  };

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterator<T, void> {
      return {
        next(): Promise<IteratorResult<T, void>> {
          if (values.length > 0) {
            const value = values.shift();
            if (value === undefined) {
              return Promise.resolve({ value: undefined, done: true });
            }

            return Promise.resolve({ value, done: false });
          }

          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }

          return new Promise<IteratorResult<T, void>>((resolve) => {
            resolvers.push(resolve);
          });
        }
      };
    }
  };

  return { push, close, iterable };
};
