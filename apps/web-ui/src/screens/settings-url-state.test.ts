import { describe, expect, it } from "vitest";

import {
  applySettingsUrlPatch,
  readSettingsUrlState,
} from "./settings-url-state.js";

describe("settings url state", () => {
  it("reads valid tab and provider profile id", () => {
    expect(
      readSettingsUrlState("http://localhost/settings?tab=provider&profile=p1"),
    ).toEqual({
      activeTab: "provider",
      selectedProviderId: "p1",
    });
  });

  it("cleans invalid tab values", () => {
    expect(
      readSettingsUrlState("http://localhost/settings?tab=secrets&profile=p1"),
    ).toEqual({
      activeTab: null,
      selectedProviderId: "p1",
    });
  });

  it("applies patches on the settings route", () => {
    expect(
      applySettingsUrlPatch("http://localhost/workflows", {
        activeTab: "api",
        selectedProviderId: null,
      }),
    ).toBe("/settings?tab=api");
  });
});
