import { describe, expect, it } from "vitest";
import { validatePinnedPromptReference } from "./prompt-assets";

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
});
