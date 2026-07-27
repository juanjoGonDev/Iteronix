import { describe, expect, it } from "vitest";
import {
  resolvePinnedPrompt,
  validatePinnedPromptReference,
} from "./prompt-assets";

describe("pinned prompt references", () => {
  it("requires a version pin and exact explicit bindings", () => {
    expect(
      validatePinnedPromptReference(
        { assetId: "greeting", version: 1, bindings: { name: "Ada" } },
        [{ name: "name", required: true }],
      ),
    ).toEqual([]);
    expect(
      validatePinnedPromptReference(
        { assetId: "greeting", version: 0, bindings: { extra: true } },
        [{ name: "name", required: true }],
      ),
    ).toEqual([{ code: "prompt.version-unpinned" }]);
  });

  it("rejects missing and undeclared variable bindings", () => {
    expect(
      validatePinnedPromptReference(
        { assetId: "greeting", version: 1, bindings: { other: true } },
        [{ name: "name", required: true }],
      ),
    ).toEqual([
      { code: "prompt.binding-required-missing", variable: "name" },
      { code: "prompt.binding-undeclared", variable: "other" },
    ]);
  });

  it("rejects bindings that do not satisfy a typed variable schema", () => {
    expect(
      validatePinnedPromptReference(
        { assetId: "greeting", version: 1, bindings: { count: "two" } },
        [
          {
            name: "count",
            required: true,
            schema: {
              id: "prompt-count",
              version: 1,
              schema: { type: "number" },
            },
          },
        ],
      ),
    ).toEqual([{ code: "prompt.binding-schema-invalid", variable: "count" }]);
  });

  it("rejects template tokens absent from the typed variable schema", () => {
    expect(() =>
      resolvePinnedPrompt({
        reference: {
          assetId: "greeting",
          version: 1,
          bindings: { name: "Ada" },
        },
        assets: [
          {
            id: "greeting",
            status: "enabled",
            versions: [
              {
                version: 1,
                template: "Hello {{name}} {{undeclared}}",
                variables: [{ name: "name", required: true }],
              },
            ],
          },
        ],
      }),
    ).toThrow("Prompt template contains undeclared variables.");
  });

  it("resolves an immutable version with deterministic rendering and provenance", () => {
    expect(
      resolvePinnedPrompt({
        reference: {
          assetId: "greeting",
          version: 2,
          bindings: { name: "Ada" },
        },
        assets: [
          {
            id: "greeting",
            status: "enabled",
            versions: [
              {
                version: 1,
                template: "Hello {{name}} from v1",
                variables: [{ name: "name", required: true }],
              },
              {
                version: 2,
                template: "Hello {{name}} from v2",
                variables: [{ name: "name", required: true }],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      rendered: "Hello Ada from v2",
      provenance: {
        assetId: "greeting",
        version: 2,
        bindings: { name: "Ada" },
      },
    });
  });

  it("rejects disabled assets, unavailable versions, and invalid bindings", () => {
    expect(() =>
      resolvePinnedPrompt({
        reference: { assetId: "greeting", version: 1, bindings: {} },
        assets: [
          {
            id: "greeting",
            status: "disabled",
            versions: [
              {
                version: 1,
                template: "Hello {{name}}",
                variables: [{ name: "name", required: true }],
              },
            ],
          },
        ],
      }),
    ).toThrow("Prompt asset greeting is disabled.");
    expect(() =>
      resolvePinnedPrompt({
        reference: { assetId: "greeting", version: 2, bindings: {} },
        assets: [
          {
            id: "greeting",
            status: "enabled",
            versions: [{ version: 1, template: "Hello", variables: [] }],
          },
        ],
      }),
    ).toThrow("Prompt asset greeting version 2 was not found.");
    expect(() =>
      resolvePinnedPrompt({
        reference: { assetId: "greeting", version: 1, bindings: {} },
        assets: [
          {
            id: "greeting",
            status: "enabled",
            versions: [
              {
                version: 1,
                template: "Hello {{name}}",
                variables: [{ name: "name", required: true }],
              },
            ],
          },
        ],
      }),
    ).toThrow("Prompt bindings are invalid.");
  });
});
