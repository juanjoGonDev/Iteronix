import { describe, expect, it } from "vitest";
import { openAiCompatibleProviderDescriptor } from "./provider";

describe("openai-compatible provider descriptor", () => {
  it("declares bearer-style api key auth", () => {
    expect(openAiCompatibleProviderDescriptor.id).toBe("openai");
    expect(openAiCompatibleProviderDescriptor.auth.type).toBe("api_key");
  });
});
