import { describe, expect, it } from "vitest";
import {
  createPromptNodeConfig,
  readPromptNodeConfig,
  renderPromptNodePreview,
} from "./prompt-node-config-state.js";

describe("prompt node configuration", () => {
  it("reads immutable prompt references and renders explicit bindings deterministically", () => {
    const config = createPromptNodeConfig({
      assetId: "prompt-greeting",
      version: 3,
      bindings: { name: "Ada", locale: "es" },
    });

    expect(readPromptNodeConfig(config)).toEqual({
      assetId: "prompt-greeting",
      version: 3,
      bindings: { name: "Ada", locale: "es" },
    });
    expect(
      renderPromptNodePreview({
        template: "Hello {{name}} from {{locale}}.",
        variables: ["locale", "name"],
        bindings: { name: "Ada", locale: "es" },
      }),
    ).toEqual({ valid: true, value: "Hello Ada from es.", errors: [] });
  });

  it("rejects missing and undeclared bindings before execution", () => {
    expect(
      renderPromptNodePreview({
        template: "Hello {{name}}.",
        variables: ["name"],
        bindings: { extra: "no" },
      }),
    ).toEqual({
      valid: false,
      value: "Hello {{name}}.",
      errors: ["Missing binding: name", "Undeclared binding: extra"],
    });
  });
});
