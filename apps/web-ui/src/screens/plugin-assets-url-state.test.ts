import { describe, expect, it } from "vitest";
import {
  PluginAssetsUrlMode,
  applyPluginAssetsUrlPatch,
  readPluginAssetsUrlState,
} from "./plugin-assets-url-state.js";

describe("plugin assets URL state", () => {
  it("restores the selected plugin editor from a deep link", () => {
    expect(
      readPluginAssetsUrlState(
        "https://iteronix.test/assets/plugins?mode=edit&plugin=reference.echo",
      ),
    ).toEqual({ mode: PluginAssetsUrlMode.Edit, pluginId: "reference.echo" });
  });

  it("removes editor state when returning to the catalog", () => {
    expect(
      applyPluginAssetsUrlPatch(
        "https://iteronix.test/assets/plugins?mode=edit&plugin=reference.echo",
        { mode: PluginAssetsUrlMode.Catalog, pluginId: null },
      ),
    ).toBe("/assets/plugins");
  });
});
