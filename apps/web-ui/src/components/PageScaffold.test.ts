import { describe, expect, it } from "vitest";
import {
  readPageFrameClassName,
  readPageIntroClassName,
  readPageTabButtonClassName,
  readPageTabsContainerClassName
} from "./PageScaffold.js";

describe("PageScaffold", () => {
  it("keeps the canonical screen container classes", () => {
    expect(readPageFrameClassName("max-w-[1600px]")).toBe(
      "mx-auto flex w-full max-w-[1480px] flex-col gap-6 p-6 max-w-[1600px]"
    );
    expect(readPageIntroClassName()).toBe(
      "flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
    );
  });

  it("supports sticky tabs without changing the shared underline pattern", () => {
    expect(readPageTabsContainerClassName(true)).toContain("sticky top-0 z-10");
    expect(readPageTabsContainerClassName(true)).toContain("border-b border-border-dark");
    expect(readPageTabButtonClassName(true)).toContain("border-white");
    expect(readPageTabButtonClassName(true)).toContain("text-white");
    expect(readPageTabButtonClassName(false)).toContain("border-transparent");
    expect(readPageTabButtonClassName(false)).toContain("text-text-secondary");
  });
});
