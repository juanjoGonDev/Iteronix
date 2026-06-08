import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileContent, resolveSandboxPath, searchFiles } from "./files";
import { ResultType } from "./result";

describe("resolveSandboxPath", () => {
  it("resolves a child path within the root", () => {
    const root = resolve("workspace-root");
    const result = resolveSandboxPath(root, "src/index.ts");

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.root).toBe(root);
      expect(result.value.target).toBe(resolve(root, "src/index.ts"));
    }
  });

  it("rejects a path outside the root", () => {
    const root = resolve("workspace-root");
    const result = resolveSandboxPath(root, "..");

    expect(result.type).toBe(ResultType.Err);
  });

  it("accepts the root when no target is provided", () => {
    const root = resolve("workspace-root");
    const result = resolveSandboxPath(root, undefined);

    expect(result.type).toBe(ResultType.Ok);
    if (result.type === ResultType.Ok) {
      expect(result.value.target).toBe(root);
    }
  });

  it("searches nested file contents with case-insensitive plain text matching", async () => {
    const root = await createSearchFixture();

    try {
      const result = await searchFiles(root, {
        query: "explorer",
        isRegex: false,
        matchCase: false,
        wholeWord: false
      });

      expect(result.type).toBe(ResultType.Ok);
      if (result.type === ResultType.Ok) {
        expect(result.value.map((entry) => entry.path)).toEqual([
          "src/screens/Explorer.ts",
          "README.md"
        ]);
        expect(result.value[0]?.matches[0]?.lineNumber).toBe(1);
        expect(result.value[0]?.matches[0]?.lineText).toContain("Explorer");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports regex search and rejects invalid patterns", async () => {
    const root = await createSearchFixture();

    try {
      const valid = await searchFiles(root, {
        query: "render\\(\\)",
        isRegex: true,
        matchCase: false,
        wholeWord: false
      });

      expect(valid.type).toBe(ResultType.Ok);
      if (valid.type === ResultType.Ok) {
        expect(valid.value.map((entry) => entry.path)).toEqual([
          "src/screens/Explorer.ts"
        ]);
      }

      const invalid = await searchFiles(root, {
        query: "[unterminated",
        isRegex: true,
        matchCase: false,
        wholeWord: false
      });

      expect(invalid.type).toBe(ResultType.Err);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports whole-word and case-sensitive search options", async () => {
    const root = await createSearchFixture();

    try {
      const exactWord = await searchFiles(root, {
        query: "Explorer",
        isRegex: false,
        matchCase: true,
        wholeWord: true
      });

      expect(exactWord.type).toBe(ResultType.Ok);
      if (exactWord.type === ResultType.Ok) {
        expect(exactWord.value.map((entry) => entry.path)).toEqual([
          "src/screens/Explorer.ts",
          "README.md"
        ]);
      }

      const wrongCase = await searchFiles(root, {
        query: "explorer",
        isRegex: false,
        matchCase: true,
        wholeWord: true
      });

      expect(wrongCase.type).toBe(ResultType.Ok);
      if (wrongCase.type === ResultType.Ok) {
        expect(wrongCase.value).toEqual([]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips ignored dependency and vcs directories during search", async () => {
    const root = await createSearchFixture();

    try {
      const result = await searchFiles(root, {
        query: "HiddenExplorer",
        isRegex: false,
        matchCase: false,
        wholeWord: false
      });

      expect(result.type).toBe(ResultType.Ok);
      if (result.type === ResultType.Ok) {
        expect(result.value).toEqual([]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads a bounded line window for large file previews", async () => {
    const root = await createSearchFixture();

    try {
      const result = await readFileContent(root, "src/large.ts", {
        startLine: 3,
        lineCount: 2
      });

      expect(result.type).toBe(ResultType.Ok);
      if (result.type === ResultType.Ok) {
        expect(result.value).toEqual({
          content: [
            "export const line03 = 3;",
            "export const line04 = 4;"
          ].join("\n"),
          startLine: 3,
          endLine: 4,
          totalLines: 8,
          truncated: true
        });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

const createSearchFixture = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "iteronix-files-search-"));
  await mkdir(resolve(root, "src", "screens"), { recursive: true });
  await writeFile(
    resolve(root, "src", "screens", "Explorer.ts"),
    [
      "export class Explorer {",
      "  render() {",
      "    return \"Explorer\";",
      "  }",
      "}"
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    resolve(root, "README.md"),
    "Explorer documentation and usage.\n",
    "utf8"
  );
  await writeFile(
    resolve(root, "src", "ignore.ts"),
    "export const label = \"settings\";\n",
    "utf8"
  );
  await writeFile(
    resolve(root, "src", "large.ts"),
    Array.from({ length: 8 }, (_, index) => `export const line${String(index + 1).padStart(2, "0")} = ${index + 1};`).join("\n"),
    "utf8"
  );
  await mkdir(resolve(root, "node_modules", "demo"), { recursive: true });
  await writeFile(
    resolve(root, "node_modules", "demo", "hidden.ts"),
    "export const value = \"HiddenExplorer\";\n",
    "utf8"
  );
  await mkdir(resolve(root, ".git"), { recursive: true });
  await writeFile(
    resolve(root, ".git", "HEAD"),
    "ref: refs/heads/main HiddenExplorer\n",
    "utf8"
  );

  return root;
};
