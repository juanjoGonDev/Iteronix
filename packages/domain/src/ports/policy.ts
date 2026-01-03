import type { Result } from "../result";

export const PolicyAction = {
  ReadFile: "read_file",
  WriteFile: "write_file",
  ExecuteCommand: "execute_command",
  NetworkRequest: "network_request",
  ReadSecret: "read_secret",
  WriteSecret: "write_secret"
} as const;

export type PolicyAction =
  typeof PolicyAction[keyof typeof PolicyAction];

export type PolicyRequest = {
  action: PolicyAction;
  resource: string;
  context?: Record<string, string>;
};

export const PolicyDecisionType = {
  Allow: "allow",
  Deny: "deny"
} as const;

export type PolicyDecisionType =
  typeof PolicyDecisionType[keyof typeof PolicyDecisionType];

export type PolicyDecision = {
  type: PolicyDecisionType;
  reason?: string;
};

export const PolicyErrorCode = {
  Unavailable: "unavailable",
  InvalidRequest: "invalid_request",
  Unknown: "unknown"
} as const;

export type PolicyErrorCode =
  typeof PolicyErrorCode[keyof typeof PolicyErrorCode];

export type PolicyError = {
  code: PolicyErrorCode;
  message: string;
  retryable: boolean;
};

export type PolicyPort = {
  evaluate: (request: PolicyRequest) => Promise<Result<PolicyDecision, PolicyError>>;
};