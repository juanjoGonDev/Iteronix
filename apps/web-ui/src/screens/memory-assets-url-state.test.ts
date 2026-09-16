import { describe, expect, it } from "vitest";
import {
  MemoryAssetsUrlMode,
  applyMemoryAssetsUrlPatch,
  readMemoryAssetsUrlState,
} from "./memory-assets-url-state.js";

describe("memory assets URL state", () => {
  it("restores the selected source and index panel from a deep link", () => {
    expect(
      readMemoryAssetsUrlState(
        "https://iteronix.local/assets/memory?mode=edit&memory=memory-1&panel=documents",
      ),
    ).toEqual({
      mode: MemoryAssetsUrlMode.Edit,
      memoryId: "memory-1",
      panel: "documents",
    });
  });

  it("normalizes an edit route without a selected source", () => {
    expect(
      applyMemoryAssetsUrlPatch("https://iteronix.local/assets/memory", {
        mode: MemoryAssetsUrlMode.Edit,
        memoryId: null,
      }),
    ).toBe("/assets/memory");
  });
});
