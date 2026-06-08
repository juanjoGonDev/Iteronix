import { readServerConnection } from "./server-config.js";
import {
  installConsoleForwarder,
  type InstalledConsoleForwarder,
  type SharedLogEntry
} from "./logger-core.js";

const EndpointPath = {
  LogsAppend: "/logs/append",
  LogsReset: "/logs/reset"
} as const;

const AuthorizationHeaderValue = {
  BearerPrefix: "Bearer "
} as const;

export const installClientLogForwarder = (): InstalledConsoleForwarder => {
  const config = readClientLogForwarderConfig();

  return installConsoleForwarder({
    includeGlobalErrorEvents: true,
    reset: () => resetRemoteLogs(config),
    shouldReset: shouldResetLogsOnLoad,
    send: (entry) => {
      sendRemoteLogEntry(config, entry);
    }
  });
};

const sendRemoteLogEntry = (
  config: {
    serverUrl: string;
    authToken: string;
  },
  entry: SharedLogEntry
): void => {
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
