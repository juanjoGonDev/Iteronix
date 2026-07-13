import {
  hasServerAuthToken,
  type ServerConnection,
} from "../shared/server-config.js";

export const readWorkflowBootstrapDecision = (
  connection: ServerConnection,
): "load" | "configure" =>
  hasServerAuthToken(connection) ? "load" : "configure";

export const isWorkflowAuthenticationFailure = (value: unknown): boolean => {
  if (!(value instanceof Error)) {
    return false;
  }

  return /(?:unauthorized|\b401\b)/i.test(value.message);
};
