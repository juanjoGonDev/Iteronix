import { describe, expect, it } from "vitest";
import {
  parseExplorerFileSearchResponse,
  parseExplorerFileReadResponse,
  parseExplorerFileTreeResponse
} from "./explorer-client.js";

describe("explorer client codecs", () => {
  it("parses file tree, file content and file search responses", () => {
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
    const search = parseExplorerFileSearchResponse({
      results: [
        {
          path: "src/screens/Explorer.ts",
          name: "Explorer.ts",
          matches: [
            {
              lineNumber: 2,
              lineText: "  render(): string {",
              ranges: [
                {
                  start: 2,
                  end: 8
                }
              ]
            }
          ]
        }
      ]
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
    expect(search).toEqual([
      {
        path: "src/screens/Explorer.ts",
        name: "Explorer.ts",
        matches: [
          {
            lineNumber: 2,
            lineText: "  render(): string {",
            ranges: [
              {
                start: 2,
                end: 8
              }
            ]
          }
        ]
      }
    ]);
  });
});
