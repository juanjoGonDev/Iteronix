import { describe, expect, it } from "vitest";
import {
  createPromptNodeConfig,
  readPromptNodeBindings,
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

  it("preserves JSON bindings and does not require optional variables in previews", () => {
    const config = createPromptNodeConfig({
      assetId: "prompt-json",
      version: 2,
      bindings: {
        payload: { enabled: true, tags: ["governed"] },
      },
    });

    expect(readPromptNodeConfig(config)).toEqual({
      assetId: "prompt-json",
      version: 2,
      bindings: {
        payload: { enabled: true, tags: ["governed"] },
      },
    });
    expect(
      readPromptNodeBindings(
        '{"payload":{"enabled":true,"tags":["governed"]}}',
      ),
    ).toEqual({ payload: { enabled: true, tags: ["governed"] } });
    expect(
      renderPromptNodePreview({
        template: "Payload: {{payload}} {{locale}}",
        variables: [
          { name: "payload", required: true },
          { name: "locale", required: false },
        ],
        bindings: { payload: { enabled: true, tags: ["governed"] } },
      }),
    ).toEqual({
      valid: true,
      value: 'Payload: {"enabled":true,"tags":["governed"]} ',
      errors: [],
    });
  });
});
