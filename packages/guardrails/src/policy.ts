export const SecurityMode = {
  Block: "block",
  Audit: "audit"
} as const;

export type SecurityMode = typeof SecurityMode[keyof typeof SecurityMode];

export type SecurityViolation = {
  id: string;
  message: string;
  category: "prompt_injection" | "pii" | "tool" | "output";
};

export type SecurityPolicy = {
  mode: SecurityMode;
  toolAllowlistBySkill: Readonly<Record<string, ReadonlyArray<string>>>;
  groundedResponsesRequired: boolean;
};

export type GuardrailResult = {
  allowed: boolean;
  violations: ReadonlyArray<SecurityViolation>;
};

export type GuardrailsEngine = {
  checkInput: (input: {
    skillName: string;
    text: string;
  }) => Promise<GuardrailResult>;
  checkToolCall: (input: {
    skillName: string;
    toolId: string;
    sideEffect: string;
    args: Record<string, unknown>;
  }) => Promise<GuardrailResult>;
  checkOutput: (input: {
    skillName: string;
    citationsCount: number;
    requiresGrounding: boolean;
  }) => Promise<GuardrailResult>;
};

export const createSecurityPolicy = (input: {
  mode?: SecurityMode;
  toolAllowlistBySkill: Readonly<Record<string, ReadonlyArray<string>>>;
  groundedResponsesRequired?: boolean;
}): SecurityPolicy => ({
  mode: input.mode ?? SecurityMode.Block,
  toolAllowlistBySkill: input.toolAllowlistBySkill,
  groundedResponsesRequired: input.groundedResponsesRequired ?? true
});

export const createGuardrailsEngine = (input: {
  policy: SecurityPolicy;
}): GuardrailsEngine => {
  const checkInput = async (request: {
    skillName: string;
    text: string;
  }): Promise<GuardrailResult> => {
    const violations = detectInputViolations(request.text);
    return buildGuardrailResult(input.policy.mode, violations);
  };

  const checkToolCall = async (request: {
    skillName: string;
    toolId: string;
    sideEffect: string;
    args: Record<string, unknown>;
  }): Promise<GuardrailResult> => {
    const violations = detectToolViolations(input.policy, request);
    return buildGuardrailResult(input.policy.mode, violations);
  };

  const checkOutput = async (request: {
    skillName: string;
    citationsCount: number;
    requiresGrounding: boolean;
  }): Promise<GuardrailResult> => {
    const violations = detectOutputViolations(input.policy, request);
    return buildGuardrailResult(input.policy.mode, violations);
  };

  return {
    checkInput,
    checkToolCall,
    checkOutput
  };
};

const buildGuardrailResult = (
  mode: SecurityMode,
  violations: ReadonlyArray<SecurityViolation>
): GuardrailResult => ({
  allowed: mode !== SecurityMode.Block || violations.length === 0,
  violations
});

const detectInputViolations = (text: string): ReadonlyArray<SecurityViolation> => {
  const violations: SecurityViolation[] = [];

  if (matchesPromptInjection(text)) {
    violations.push({
      id: "prompt-injection",
      message: "Prompt injection pattern detected",
      category: "prompt_injection"
    });
  }

  if (containsPii(text)) {
    violations.push({
      id: "pii-detected",
      message: "Potential PII detected",
      category: "pii"
    });
  }

  return violations;
};

const detectToolViolations = (
  policy: SecurityPolicy,
  input: {
    skillName: string;
    toolId: string;
    sideEffect: string;
    args: Record<string, unknown>;
  }
): ReadonlyArray<SecurityViolation> => {
  const allowlist = policy.toolAllowlistBySkill[input.skillName] ?? [];
  if (allowlist.includes(input.toolId)) {
    return [];
  }

  return [
    {
      id: "tool-denied",
      message: `Tool ${input.toolId} is not allowed`,
      category: "tool"
    }
  ];
};

const detectOutputViolations = (
  policy: SecurityPolicy,
  input: {
    skillName: string;
    citationsCount: number;
    requiresGrounding: boolean;
  }
): ReadonlyArray<SecurityViolation> => {
  if (
    policy.groundedResponsesRequired &&
    input.requiresGrounding &&
    input.citationsCount === 0
  ) {
    return [
      {
        id: "grounding-required",
        message: "Grounded output requires citations",
        category: "output"
      }
    ];
  }

  return [];
};

const matchesPromptInjection = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("ignore previous instructions") ||
    normalized.includes("override the system prompt") ||
    normalized.includes("act as root")
  );
};

const containsPii = (text: string): boolean =>
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
  /\b\d{3}-\d{2}-\d{4}\b/.test(text);
