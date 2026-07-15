import type { ServerConnection } from "../shared/server-config.js";

export const readWorkflowBootstrapDecision = (
  _connection: ServerConnection,
): "load" | "configure" => "load";

export const isWorkflowAuthenticationFailure = (value: unknown): boolean => {
  if (!(value instanceof Error)) {
    return false;
  }

  return /(?:unauthorized|\b401\b)/i.test(value.message);
};
