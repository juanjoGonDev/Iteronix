import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepositoryEnvPath } from "./environment";

describe("server environment path", () => {
  it("resolves the repository .env from the server source directory", () => {
    expect(resolveRepositoryEnvPath(__dirname)).toBe(
      join(dirname(dirname(dirname(__dirname))), ".env"),
    );
  });

  it("resolves the repository .env from the compiled server directory", () => {
    const repositoryRoot = dirname(dirname(dirname(__dirname)));

    expect(
      resolveRepositoryEnvPath(
        join(repositoryRoot, "dist", "apps", "server-api", "src"),
      ),
    ).toBe(join(repositoryRoot, ".env"));
  });
});
