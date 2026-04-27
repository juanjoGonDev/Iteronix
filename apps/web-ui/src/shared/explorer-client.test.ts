import { describe, expect, it } from "vitest";
import {
  parseExplorerFileReadResponse,
  parseExplorerFileTreeResponse
} from "./explorer-client.js";

describe("explorer client codecs", () => {
  it("parses file tree and file content responses", () => {
    const entries = parseExplorerFileTreeResponse({
      entries: [
        {
          path: "src",
          name: "src",
          kind: "directory"
        },
        {
          path: "README.md",
          name: "README.md",
          kind: "file"
        }
      ]
    });
    const file = parseExplorerFileReadResponse({
      content: "# Iteronix"
    });

    expect(entries).toEqual([
      {
        path: "src",
        name: "src",
        kind: "directory"
      },
      {
        path: "README.md",
        name: "README.md",
        kind: "file"
      }
    ]);
    expect(file.content).toBe("# Iteronix");
  });
});
