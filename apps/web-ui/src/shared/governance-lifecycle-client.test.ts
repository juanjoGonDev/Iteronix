import { describe, expect, it } from "vitest";
import {
  parseGovernanceLifecycleResponse,
  redactLifecyclePromptBindings,
} from "./governance-lifecycle-client.js";

const OpenAiApiKeyBinding = "OpenAI API Key";

describe("prompt execution binding redaction", () => {
  it("redacts secret-bearing binding values while preserving normal values", () => {
    expect(
      redactLifecyclePromptBindings({
        customerName: "Ada",
        retryCount: 2,
        secret: "secret-value",
        accessToken: "token-value",
        database_password: "password-value",
        apiKey: "api-key-value",
        [OpenAiApiKeyBinding]: "openai-key-value",
      }),
    ).toEqual({
      customerName: "Ada",
      retryCount: 2,
      secret: "[REDACTED]",
      accessToken: "[REDACTED]",
      database_password: "[REDACTED]",
      apiKey: "[REDACTED]",
      [OpenAiApiKeyBinding]: "[REDACTED]",
    });
  });
});

describe("governance lifecycle skill provenance", () => {
  it("parses governed skill provenance for the execution inspector", () => {
    expect(
      parseGovernanceLifecycleResponse({
        lifecycle: {
          id: "lifecycle-1",
          state: "Approved",
          budgets: {},
          transitions: [],
          promptExecutions: [],
          agentExecutions: [
            {
              agentId: "agent-1",
              skillId: "skill-support",
              skillVersion: 2,
              artifactFingerprint: "skill-fingerprint",
            },
          ],
        },
      }),
    ).toMatchObject({
      agentExecutions: [
        {
          agentId: "agent-1",
          skillId: "skill-support",
          skillVersion: 2,
          artifactFingerprint: "skill-fingerprint",
        },
      ],
    });
  });
});
