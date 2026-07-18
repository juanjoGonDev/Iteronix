import { describe, expect, it } from "vitest";
import {
  PromptAssetsUrlMode,
  applyPromptAssetsUrlPatch,
  readPromptAssetsUrlState,
} from "./prompt-assets-url-state.js";

describe("prompt assets URL state", () => {
  it("preserves the catalog route while opening a selected prompt editor", () => {
    const url = applyPromptAssetsUrlPatch("http://localhost/assets/prompts", {
      mode: PromptAssetsUrlMode.Edit,
      promptId: "prompt-support",
      version: 2,
    });

    expect(url).toBe(
      "/assets/prompts?mode=edit&prompt=prompt-support&version=2",
    );
    expect(readPromptAssetsUrlState(`http://localhost${url}`)).toEqual({
      mode: PromptAssetsUrlMode.Edit,
      promptId: "prompt-support",
      version: 2,
    });
  });

  it("falls back to the catalog when a deep link has no selected prompt", () => {
    expect(
      readPromptAssetsUrlState("http://localhost/assets/prompts?mode=edit"),
    ).toEqual({
      mode: PromptAssetsUrlMode.Catalog,
      promptId: null,
      version: null,
    });
  });
});
