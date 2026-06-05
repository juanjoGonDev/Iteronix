const LogLimits = {
  MaxMessageLength: 10000
} as const;

export const SharedLogLevel = {
  Trace: "trace",
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
  Fatal: "fatal"
} as const;

export type SharedLogLevel =
  typeof SharedLogLevel[keyof typeof SharedLogLevel];

export type SharedLogEntry = {
  id: string;
  timestamp: string;
  level: SharedLogLevel;
  message: string;
  runId?: string;
};

export type InstalledConsoleForwarder = {
  uninstall: () => void;
};

type ConsoleMethodName = "log" | "info" | "warn" | "error" | "debug" | "trace";
type GlobalEventListener = (event: unknown) => void;

type ConsoleForwarderConfig = {
  send: (entry: SharedLogEntry) => void | Promise<void>;
  reset?: () => void | Promise<void>;
  shouldReset?: () => boolean;
  createId?: () => string;
  now?: () => string;
  includeGlobalErrorEvents?: boolean;
};

const Separator = {
  Space: " "
} as const;

const ConsoleMethodLevel: Record<ConsoleMethodName, SharedLogLevel> = {
  log: SharedLogLevel.Info,
  info: SharedLogLevel.Info,
  warn: SharedLogLevel.Warn,
  error: SharedLogLevel.Error,
  debug: SharedLogLevel.Debug,
  trace: SharedLogLevel.Trace
};

export const installConsoleForwarder = (
  config: ConsoleForwarderConfig
): InstalledConsoleForwarder => {
  if (config.reset && (config.shouldReset ? config.shouldReset() : true)) {
    void Promise.resolve(config.reset()).catch(() => undefined);
  }

  const original: Record<ConsoleMethodName, (...args: unknown[]) => void> = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace.bind(console)
  };

  const send = (level: SharedLogLevel, args: unknown[]): void => {
    const entry = createSharedLogEntry(buildSharedLogEntryInput(config, level, args));
    void Promise.resolve(config.send(entry)).catch(() => undefined);
  };

  const wrap = (method: ConsoleMethodName): ((...args: unknown[]) => void) => {
    return (...args: unknown[]): void => {
      send(ConsoleMethodLevel[method], args);
      original[method](...args);
    };
  };

  console.log = wrap("log");
  console.info = wrap("info");
  console.warn = wrap("warn");
  console.error = wrap("error");
  console.debug = wrap("debug");
  console.trace = wrap("trace");

  const uninstallGlobalListeners = installGlobalErrorListenersIfNeeded(config, send);

  return {
    uninstall: (): void => {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
      console.trace = original.trace;
      uninstallGlobalListeners();
    }
  };
};

export const createSharedLogEntry = (input: {
  level: SharedLogLevel;
  args: ReadonlyArray<unknown>;
  createId?: () => string;
  now?: () => string;
}): SharedLogEntry => ({
  id: (input.createId ?? createDefaultId)(),
  timestamp: (input.now ?? createTimestamp)(),
  level: input.level,
  message: truncateLogMessage(formatLogArgs(input.args))
});

export const formatLogArgs = (args: ReadonlyArray<unknown>): string =>
  args.map((value) => serializeLogValue(value)).join(Separator.Space);

export const serializeLogValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return formatLogError(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const formatLogError = (error: Error): string => {
  const stack = error.stack;
  return stack ? `${error.name}: ${error.message}\n${stack}` : `${error.name}: ${error.message}`;
};

export const truncateLogMessage = (message: string): string => {
  if (message.length <= LogLimits.MaxMessageLength) {
    return message;
  }

  return message.slice(0, LogLimits.MaxMessageLength);
};

const buildSharedLogEntryInput = (
  config: ConsoleForwarderConfig,
  level: SharedLogLevel,
  args: unknown[]
): {
  level: SharedLogLevel;
  args: ReadonlyArray<unknown>;
  createId?: () => string;
  now?: () => string;
} => ({
  level,
  args,
  ...(config.createId ? { createId: config.createId } : {}),
  ...(config.now ? { now: config.now } : {})
});

const installGlobalErrorListenersIfNeeded = (
  config: ConsoleForwarderConfig,
  send: (level: SharedLogLevel, args: unknown[]) => void
): (() => void) => {
  const globalEventTarget = readGlobalEventTarget();
  if (!config.includeGlobalErrorEvents || !globalEventTarget) {
    return (): void => {
      return;
    };
  }

  const onError = (event: unknown): void => {
    const errorEvent = readErrorEvent(event);
    const message = errorEvent.error instanceof Error ? formatLogError(errorEvent.error) : errorEvent.message;
    send(SharedLogLevel.Error, ["window.error", message]);
  };

  const onUnhandledRejection = (event: unknown): void => {
    const rejectionEvent = readPromiseRejectionEvent(event);
    const message = rejectionEvent.reason instanceof Error
      ? formatLogError(rejectionEvent.reason)
      : serializeLogValue(rejectionEvent.reason);
    send(SharedLogLevel.Error, ["window.unhandledrejection", message]);
  };

  globalEventTarget.addEventListener("error", onError);
  globalEventTarget.addEventListener("unhandledrejection", onUnhandledRejection);

  return (): void => {
    globalEventTarget.removeEventListener("error", onError);
    globalEventTarget.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
};

const readGlobalEventTarget = (): {
  addEventListener: (type: string, listener: GlobalEventListener) => void;
  removeEventListener: (type: string, listener: GlobalEventListener) => void;
} | null => {
  const candidate = globalThis as Record<string, unknown>;
  const value = candidate["window"];
  if (
    typeof value === "object" &&
    value !== null &&
    "addEventListener" in value &&
    typeof value["addEventListener"] === "function" &&
    "removeEventListener" in value &&
    typeof value["removeEventListener"] === "function"
  ) {
    return value as {
      addEventListener: (type: string, listener: GlobalEventListener) => void;
      removeEventListener: (type: string, listener: GlobalEventListener) => void;
    };
  }

  return null;
};

const readErrorEvent = (value: unknown): {
  message: string;
  error: unknown;
} => {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return {
      message: typeof record["message"] === "string" ? record["message"] : "Unknown error",
      error: record["error"]
    };
  }

  return {
    message: "Unknown error",
    error: undefined
  };
};

const readPromiseRejectionEvent = (value: unknown): {
  reason: unknown;
} => {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return {
      reason: record["reason"]
    };
  }

  return {
    reason: value
  };
};

const createDefaultId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createTimestamp = (): string => new Date().toISOString();
