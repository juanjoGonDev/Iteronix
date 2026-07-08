import { describe, expect, it } from "vitest";

import {
  applyUrlStatePatch,
  readBooleanUrlParam,
  readEnumUrlParam,
  readListUrlParam,
  readNonEmptyUrlParam,
  sanitizeUrlStateUrl,
} from "./url-state.js";

describe("url state helpers", () => {
  it("reads typed primitive query values safely", () => {
    expect(readEnumUrlParam("provider", ["general", "provider"])).toBe(
      "provider",
    );
    expect(readEnumUrlParam("secret", ["general", "provider"])).toBeNull();
    expect(readNonEmptyUrlParam("  node-1  ")).toBe("node-1");
    expect(readNonEmptyUrlParam("   ")).toBeNull();
    expect(readBooleanUrlParam("1")).toBe(true);
    expect(readBooleanUrlParam("0")).toBe(false);
    expect(readBooleanUrlParam("yes")).toBeNull();
  });

  it("reads constrained lists and removes invalid entries", () => {
    expect(
      readListUrlParam("lint,typecheck,secret", ["lint", "typecheck"]),
    ).toEqual(["lint", "typecheck"]);
  });

  it("applies query patches while keeping unrelated values", () => {
    expect(
      applyUrlStatePatch("/settings?tab=general&noise=1", "/settings", {
        tab: "provider",
        profile: "abc",
      }),
    ).toBe("/settings?tab=provider&noise=1&profile=abc");

    expect(
      applyUrlStatePatch("/settings?tab=provider&profile=abc", "/settings", {
        profile: null,
      }),
    ).toBe("/settings?tab=provider");
  });

  it("strips sensitive parameter names from URL state operations", () => {
    expect(
      sanitizeUrlStateUrl(
        "/settings?tab=provider&apiKey=secret&token=secret&password=secret",
      ),
    ).toBe("/settings?tab=provider");

    expect(
      applyUrlStatePatch("/settings?secret=1&tab=general", "/settings", {
        profile: "safe-profile",
      }),
    ).toBe("/settings?tab=general&profile=safe-profile");
  });
});
