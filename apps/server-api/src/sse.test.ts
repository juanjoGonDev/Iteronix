import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { HeaderName, MimeType } from "./constants";
import { createSseStream, type SseStream } from "./sse";

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

describe("sse stream escaping", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(closeServer));
  });

  const startSseServer = async (
    send: (stream: SseStream) => void,
  ): Promise<string> => {
    const server = createServer((_request, response) => {
      const stream = createSseStream(response);
      send(stream);
      stream.close();
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Unexpected server address");
    }

    return `http://127.0.0.1:${address.port.toString()}`;
  };

  it("escapes html meta characters and line breaks before writing", async () => {
    const url = await startSseServer((stream) => {
      stream.send({
        id: "event\nid",
        event: "node",
        data: { text: "<script>alert('x')</script>" },
      });
    });

    const response = await fetch(url);
    const body = await response.text();

    expect(response.headers.get(HeaderName.ContentType)).toBe(
      MimeType.EventStream,
    );
    expect(body).toContain("id: event\\u000aid");
    expect(body).toContain(
      'data: {"text":"\\u003cscript\\u003ealert(\\u0027x\\u0027)\\u003c/script\\u003e"}',
    );
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("id: event\n");
  });
});
