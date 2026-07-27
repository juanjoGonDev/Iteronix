import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./server-api-client.js";

afterEach(() => vi.unstubAllGlobals());

describe("shared server API client", () => {
  it("includes the HttpOnly IDE session when loading editable assets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ assets: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:4000" } });

    const result = await requestJson({
      path: "/assets/list",
      parse: (value) => value,
    });

    expect(result).toEqual({ assets: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4001/assets/list",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
