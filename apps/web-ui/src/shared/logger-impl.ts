import { readServerConnection } from "./server-config.js";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

type LogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  runId?: string;
};

const EndpointPath = {
  LogsAppend: "/logs/append",
  LogsReset: "/logs/reset"
} as const;

const AuthorizationHeaderValue = {
  BearerPrefix: "Bearer "
} as const;

const Separator = {
  Space: " "
} as const;

const LogForwarderLimits = {
  MaxMessageLength: 8000
} as const;

const LogLevelForConsoleMethod: Record<
  "log" | "info" | "warn" | "error" | "debug" | "trace",
  LogLevel
> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
  trace: "trace"
} as const;

type ConsoleMethodName = keyof typeof LogLevelForConsoleMethod;

type InstalledForwarder = {
  uninstall: () => void;
};

export const installClientLogForwarder = (): InstalledForwarder => {
  const config = readClientLogForwarderConfig();

  if (shouldResetLogsOnLoad()) {
    resetRemoteLogs(config);
  }

  const original: Record<ConsoleMethodName, (...args: unknown[]) => void> = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace.bind(console)
  };

  const send = (level: LogLevel, args: unknown[]): void => {
    const entry: LogEntry = {
      id: createId(),
      timestamp: new Date().toISOString(),
      level,
      message: truncateMessage(formatArgs(args))
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    headers["Authorization"] = `${AuthorizationHeaderValue.BearerPrefix}${config.authToken}`;

    void fetch(`${config.serverUrl}${EndpointPath.LogsAppend}`, {
      method: "POST",
      headers,
      body: JSON.stringify(entry)
    }).catch(() => undefined);
  };

  const wrap = (method: ConsoleMethodName): ((...args: unknown[]) => void) => {
    return (...args: unknown[]): void => {
      send(LogLevelForConsoleMethod[method], args);
      original[method](...args);
    };
  };

  console.log = wrap("log");
  console.info = wrap("info");
  console.warn = wrap("warn");
  console.error = wrap("error");
  console.debug = wrap("debug");
  console.trace = wrap("trace");

  const onError = (event: ErrorEvent): void => {
    const message = event.error instanceof Error ? formatError(event.error) : String(event.message);
    send("error", ["window.error", message]);
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const message = event.reason instanceof Error ? formatError(event.reason) : safeSerialize(event.reason);
    send("error", ["window.unhandledrejection", message]);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return {
    uninstall: (): void => {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
      console.trace = original.trace;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
  };
};

const DevHostname = {
  Localhost: "localhost",
  Loopback: "127.0.0.1"
} as const;

const shouldResetLogsOnLoad = (): boolean => {
  return (
    location.hostname === DevHostname.Localhost ||
    location.hostname === DevHostname.Loopback
  );
};

const resetRemoteLogs = (config: {
  serverUrl: string;
  authToken: string;
}): void => {
  const headers: Record<string, string> = {
    "Authorization": `${AuthorizationHeaderValue.BearerPrefix}${config.authToken}`
  };

  void fetch(`${config.serverUrl}${EndpointPath.LogsReset}`, {
    method: "POST",
    headers
  }).catch(() => undefined);
};

const readClientLogForwarderConfig = (): {
  serverUrl: string;
  authToken: string;
} => readServerConnection();

const createId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatArgs = (args: unknown[]): string => {
  return args.map((value) => safeSerialize(value)).join(Separator.Space);
};

const safeSerialize = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return formatError(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatError = (error: Error): string => {
  const stack = error.stack;
  return stack ? `${error.name}: ${error.message}\n${stack}` : `${error.name}: ${error.message}`;
};

const truncateMessage = (message: string): string => {
  if (message.length <= LogForwarderLimits.MaxMessageLength) {
    return message;
  }

  return message.slice(0, LogForwarderLimits.MaxMessageLength);
};
