import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Docker database startup", () => {
  it("runs database migrations before starting the server process", () => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), "apps/server-api/Dockerfile"),
      "utf8",
    );

    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "node dist/apps/server-api/src/database-migration-cli.js migrate && exec node dist/apps/server-api/src/index.js"]',
    );
  });
});
