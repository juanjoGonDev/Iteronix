import { describe, expect, it } from "vitest";
import {
  McpAssetsUrlMode,
  applyMcpAssetsUrlPatch,
  readMcpAssetsUrlState,
} from "./mcp-assets-url-state.js";

describe("MCP assets URL state", () => {
  it("restores the selected connection editor from a deep link", () => {
    expect(
      readMcpAssetsUrlState(
        "https://iteronix.test/assets/mcp?mode=edit&mcp=mcp-1",
      ),
    ).toEqual({ mode: McpAssetsUrlMode.Edit, mcpId: "mcp-1" });
  });

  it("removes editor state when returning to the catalog", () => {
    expect(
      applyMcpAssetsUrlPatch(
        "https://iteronix.test/assets/mcp?mode=edit&mcp=mcp-1",
        { mode: McpAssetsUrlMode.Catalog, mcpId: null },
      ),
    ).toBe("/assets/mcp");
  });
});
