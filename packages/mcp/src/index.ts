import { join } from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";

export const McpTransportKind = {
  Stdio: "stdio",
  Sse: "sse"
} as const;

export type McpTransportKind =
  typeof McpTransportKind[keyof typeof McpTransportKind];

export type StaticMcpServerRegistry = {
  skills: ReadonlyArray<string>;
  memorySessions: ReadonlyArray<string>;
};

export type McpConnectionConfig =
  | {
      name: string;
      transport: typeof McpTransportKind.Stdio;
      command: string;
      args?: ReadonlyArray<string> | undefined;
      cwd?: string | undefined;
      env?: Readonly<Record<string, string>> | undefined;
    }
  | {
      name: string;
      transport: typeof McpTransportKind.Sse;
      url: string;
    };

export type McpTransport = {
  close: () => Promise<void>;
  send: (message: unknown) => Promise<void>;
  start?: () => Promise<void>;
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: unknown, extra?: unknown) => void) | undefined;
};

export type McpClient = {
  connect: (transport: McpTransport) => Promise<void>;
  listTools: () => Promise<{ tools: ReadonlyArray<{ name: string }> }>;
  listResources: () => Promise<{ resources: ReadonlyArray<{ uri: string }> }>;
  listPrompts: () => Promise<{ prompts: ReadonlyArray<{ name: string }> }>;
};

export type McpServerInstance = {
  connect: (transport: McpTransport) => Promise<void>;
  registerResource: (
    name: string,
    uri: string,
    config: {
      title?: string | undefined;
      description?: string | undefined;
    },
    reader: () => Promise<{
      contents: ReadonlyArray<{
        uri: string;
        text: string;
        mimeType?: string | undefined;
      }>;
    }>
  ) => unknown;
  registerTool: (
    name: string,
    config: {
      description?: string | undefined;
      inputSchema?: unknown;
    },
    handler: (args: Record<string, unknown>) => Promise<{
      content: ReadonlyArray<{
        type: "text";
        text: string;
      }>;
    }>
  ) => unknown;
  registerPrompt: (
    name: string,
    config: {
      description?: string | undefined;
      argsSchema?: Record<string, unknown> | undefined;
    },
    handler: (args: Record<string, string>) => Promise<{
      messages: ReadonlyArray<{
        role: "user" | "assistant";
        content: {
          type: "text";
          text: string;
        };
      }>;
    }>
  ) => unknown;
};

type UnknownFunction = (...args: ReadonlyArray<unknown>) => unknown;

type UnknownConstructor = {
  new (...args: ReadonlyArray<unknown>): unknown;
  [key: string]: unknown;
};

const requireModule = createRequire(join(process.cwd(), "package.json"));

export const createStaticMcpServerRegistry = (input: {
  skills: ReadonlyArray<string>;
  memorySessions: ReadonlyArray<string>;
}): StaticMcpServerRegistry => ({
  skills: input.skills,
  memorySessions: input.memorySessions
});

export const createMcpClient = (input: {
  name: string;
  version: string;
}): McpClient => {
  const instance = createClientRuntime(input);
  return ensureMcpClient(instance);
};

export const createInMemoryTransportPair = (): [McpTransport, McpTransport] => {
  const sdk = loadModule("inMemory.js");
  const createLinkedPair = readStaticMethod(sdk, "InMemoryTransport", "createLinkedPair");
  const result = createLinkedPair();
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("Invalid in-memory transport pair");
  }

  return [ensureTransport(result[0]), ensureTransport(result[1])];
};

export const createMcpClientConnection = (config: McpConnectionConfig): {
  client: McpClient;
  transport: McpTransport;
} => {
  const client = createMcpClient({
    name: "iteronix-client",
    version: "0.0.1"
  });

  if (config.transport === McpTransportKind.Stdio) {
    const sdk = loadModule("client/stdio.js");
    const Constructor = readConstructor(sdk, "StdioClientTransport");
    const parameters = buildStdioParameters(config);
    const transport = constructValue(Constructor, [parameters]);
    return {
      client,
      transport: ensureTransport(transport)
    };
  }

  const sdk = loadModule("client/sse.js");
  const Constructor = readConstructor(sdk, "SSEClientTransport");
  const transport = constructValue(Constructor, [new URL(config.url)]);
  return {
    client,
    transport: ensureTransport(transport)
  };
};

export const discoverMcpCapabilities = async (client: McpClient): Promise<{
  tools: ReadonlyArray<string>;
  resources: ReadonlyArray<string>;
  prompts: ReadonlyArray<string>;
}> => {
  const [tools, resources, prompts] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listPrompts()
  ]);

  return {
    tools: tools.tools.map((tool) => tool.name),
    resources: resources.resources.map((resource) => resource.uri),
    prompts: prompts.prompts.map((prompt) => prompt.name)
  };
};

export const createIteronixMcpServer = (input: {
  registry: StaticMcpServerRegistry;
  handlers: {
    runSkill: (input: {
      skillName: string;
      input?: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    queryMemory: (input: {
      sessionId: string;
      query?: string;
    }) => Promise<Record<string, unknown>>;
    runEvaluation: (input: {
      datasetId: string;
    }) => Promise<Record<string, unknown>>;
  };
}): McpServerInstance => {
  const server = ensureMcpServer(
    constructValue(readConstructor(loadModule("server/mcp.js"), "McpServer"), [
      {
        name: "iteronix-mcp",
        version: "0.0.1"
      }
    ])
  );

  server.registerResource(
    "skills",
    "iteronix://skills",
    {
      title: "Skills",
      description: "Loaded Iteronix skills"
    },
    async () => ({
      contents: [
        {
          uri: "iteronix://skills",
          text: JSON.stringify({ skills: input.registry.skills }),
          mimeType: "application/json"
        }
      ]
    })
  );

  for (const sessionId of input.registry.memorySessions) {
    server.registerResource(
      `memory-${sessionId}`,
      `iteronix://memory/${sessionId}`,
      {
        title: `Memory ${sessionId}`,
        description: "Session memory reference"
      },
      async () => ({
        contents: [
          {
            uri: `iteronix://memory/${sessionId}`,
            text: JSON.stringify({ sessionId }),
            mimeType: "application/json"
          }
        ]
      })
    );
  }

  server.registerTool(
    "skills.run",
    {
      description: "Run an Iteronix skill",
      inputSchema: z.object({
        skillName: z.string(),
        input: z.record(z.string(), z.unknown()).optional()
      })
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await runSkillHandler(input.handlers.runSkill, args))
        }
      ]
    })
  );

  server.registerTool(
    "memory.search",
    {
      description: "Search Iteronix memory",
      inputSchema: z.object({
        sessionId: z.string(),
        query: z.string().optional()
      })
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await runMemoryHandler(input.handlers.queryMemory, args))
        }
      ]
    })
  );

  server.registerTool(
    "eval.run",
    {
      description: "Run an Iteronix evaluation dataset",
      inputSchema: z.object({
        datasetId: z.string()
      })
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await input.handlers.runEvaluation({
            datasetId: readRequiredString(args, "datasetId")
          }))
        }
      ]
    })
  );

  server.registerPrompt(
    "skills.prompt",
    {
      description: "Prompt template for skill execution",
      argsSchema: {
        skillName: z.string(),
        question: z.string()
      }
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Run ${readRequiredString(args, "skillName")} for question: ${readRequiredString(args, "question")}`
          }
        }
      ]
    })
  );

  return server;
};

const runSkillHandler = async (
  handler: (input: {
    skillName: string;
    input?: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const skillName = readRequiredString(args, "skillName");
  const inputValue = readOptionalRecord(args, "input");
  return inputValue === undefined
    ? handler({ skillName })
    : handler({ skillName, input: inputValue });
};

const runMemoryHandler = async (
  handler: (input: {
    sessionId: string;
    query?: string;
  }) => Promise<Record<string, unknown>>,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const sessionId = readRequiredString(args, "sessionId");
  const query = readOptionalString(args, "query");
  return query === undefined ? handler({ sessionId }) : handler({ sessionId, query });
};

const createClientRuntime = (input: {
  name: string;
  version: string;
}): unknown => {
  const sdk = loadModule("client/index.js");
  const Constructor = readConstructor(sdk, "Client");
  return constructValue(Constructor, [input]);
};

const buildStdioParameters = (
  config: Extract<McpConnectionConfig, { transport: "stdio" }>
): {
  command: string;
  args: string[];
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
} => {
  const parameters: {
    command: string;
    args: string[];
    cwd?: string | undefined;
    env?: Record<string, string> | undefined;
  } = {
    command: config.command,
    args: config.args ? [...config.args] : []
  };

  if (config.cwd !== undefined) {
    parameters.cwd = config.cwd;
  }

  if (config.env !== undefined) {
    parameters.env = { ...config.env };
  }

  return parameters;
};

const loadModule = (modulePath: string): Record<string, unknown> => {
  const packageRoot = join(
    process.cwd(),
    "node_modules",
    "@modelcontextprotocol",
    "sdk",
    "dist",
    "cjs"
  );
  const loaded = loadUnknownModule(join(packageRoot, modulePath));
  return isRecord(loaded) ? loaded : {};
};

const readConstructor = (
  moduleValue: Record<string, unknown>,
  exportName: string
): UnknownConstructor => {
  const value = moduleValue[exportName];
  if (!isConstructor(value)) {
    throw new Error(`Missing constructor ${exportName}`);
  }

  return value;
};

const readStaticMethod = (
  moduleValue: Record<string, unknown>,
  exportName: string,
  methodName: string
): () => unknown => {
  const Constructor = readConstructor(moduleValue, exportName);
  const method = Constructor[methodName];
  if (!isFunction(method)) {
    throw new Error(`Missing static method ${methodName}`);
  }

  return () => invokeFunction(method, Constructor, []);
};

const ensureMcpClient = (value: unknown): McpClient => {
  const record = ensureRecord(value, "client");
  return {
    connect: readMethod(record, "connect"),
    listTools: readMethod(record, "listTools"),
    listResources: readMethod(record, "listResources"),
    listPrompts: readMethod(record, "listPrompts")
  };
};

const ensureMcpServer = (value: unknown): McpServerInstance => {
  const record = ensureRecord(value, "server");
  return {
    connect: readMethod(record, "connect"),
    registerResource: readMethod(record, "registerResource"),
    registerTool: readMethod(record, "registerTool"),
    registerPrompt: readMethod(record, "registerPrompt")
  };
};

const ensureTransport = (value: unknown): McpTransport => {
  const record = ensureRecord(value, "transport");
  const transport: McpTransport = {
    close: readMethod(record, "close"),
    send: readMethod(record, "send")
  };
  const start = record["start"];
  if (typeof start === "function") {
    transport.start = async () => {
      await Promise.resolve(Reflect.apply(start, value, []));
    };
  }

  if (typeof record["onclose"] === "function") {
    transport.onclose = record["onclose"] as () => void;
  }

  if (typeof record["onerror"] === "function") {
    transport.onerror = record["onerror"] as (error: Error) => void;
  }

  if (typeof record["onmessage"] === "function") {
    transport.onmessage = record["onmessage"] as (message: unknown, extra?: unknown) => void;
  }

  return transport;
};

const readMethod = <TMethod extends (...args: never[]) => unknown>(
  record: Record<string, unknown>,
  key: string
): TMethod => {
  const value = record[key];
  if (typeof value !== "function") {
    throw new Error(`Missing method ${key}`);
  }

  return ((...args: never[]) => Promise.resolve(Reflect.apply(value, record, args))) as TMethod;
};

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value;
};

const readRequiredString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`Missing ${key}`);
  }

  return value;
};

const readOptionalString = (
  record: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

const readOptionalRecord = (
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined => {
  const value = record[key];
  return isRecord(value) ? value : undefined;
};

const loadUnknownModule = (modulePath: string): unknown => requireModule(modulePath);

const constructValue = (
  Constructor: UnknownConstructor,
  args: ReadonlyArray<unknown>
): unknown => new Constructor(...args);

const invokeFunction = (
  functionValue: UnknownFunction,
  target: unknown,
  args: ReadonlyArray<unknown>
): unknown => Reflect.apply(functionValue, target, args);

const isConstructor = (value: unknown): value is UnknownConstructor =>
  typeof value === "function";

const isFunction = (value: unknown): value is UnknownFunction =>
  typeof value === "function";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
