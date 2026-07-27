import { describe, expect, it } from "vitest";
import { selectPromptAssetsNavigationState } from "./PromptAssets.js";
import { PromptAssetsUrlMode } from "./prompt-assets-url-state.js";

const prompt = {
  id: "prompt-support",
  name: "Support reply",
  status: "enabled" as const,
  activeVersion: 2,
  template: "Current {{customer}}",
  variables: [],
  versions: [
    {
      version: 1,
      template: "Legacy {{customer}}",
      variables: [
        {
          name: "customer",
          required: true,
          schema: {
            id: "prompt-variable-customer",
            version: 1,
            schema: { type: "string" as const },
          },
        },
      ],
    },
    {
      version: 2,
      template: "Current {{customer}}",
      variables: [
        {
          name: "customer",
          required: true,
          schema: {
            id: "prompt-variable-customer",
            version: 1,
            schema: { type: "string" as const },
          },
        },
      ],
    },
  ],
  asset: {},
};

describe("prompt asset browser navigation", () => {
  it("replaces a stale editor draft with the URL-pinned version on popstate", () => {
    expect(
      selectPromptAssetsNavigationState({
        prompts: [prompt],
        url: {
          mode: PromptAssetsUrlMode.Edit,
          promptId: "prompt-support",
          version: 1,
        },
      }),
    ).toEqual({
      draftName: "Support reply",
      draftTemplate: "Legacy {{customer}}",
      draftVariables: "customer:string:required",
    });
  });
});
