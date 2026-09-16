import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStaticUiRequestHandler } from "./static-ui";

describe("static workflow UI", () => {
  it("serves the workflow UI and its deep links without exposing files outside the UI root", async () => {
    const root = await mkdtemp(join(tmpdir(), "iteronix-static-ui-"));
    await writeFile(join(root, "index.html"), "workflow-ui", "utf8");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "app.js"), "export {};", "utf8");
    await writeFile(join(root, "package.json"), "private-ui-metadata", "utf8");
    const server = createServer(createStaticUiRequestHandler(root));

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP server address");
    }
    const origin = `http://127.0.0.1:${address.port.toString()}`;

    try {
      expect(await readResponse(`${origin}/`)).toEqual({
        status: 200,
        body: "workflow-ui",
      });
      expect(await readResponse(`${origin}/workflows/workflow-1`)).toEqual({
        status: 200,
        body: "workflow-ui",
      });
      expect(await readResponse(`${origin}/dist/app.js`)).toEqual({
        status: 200,
        body: "export {};",
      });
      expect(await readResponse(`${origin}/package.json`)).toMatchObject({
        status: 404,
      });
      expect(await readResponse(`${origin}/%ZZ`)).toMatchObject({
        status: 404,
      });
      expect(await readResponse(`${origin}/../package.json`)).toMatchObject({
        status: 404,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
});

const readResponse = async (
  url: string,
): Promise<{
  status: number;
  body: string;
}> => {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
};
