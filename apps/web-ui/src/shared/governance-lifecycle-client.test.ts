import { describe, expect, it } from "vitest";
import { redactLifecyclePromptBindings } from "./governance-lifecycle-client.js";

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
