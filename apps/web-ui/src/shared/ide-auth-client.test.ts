import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getIdeSession,
  loginIdeSession,
  parseIdeSessionResponse,
} from "./ide-auth-client.js";

describe("IDE authentication client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the redacted server admin session user view", () => {
    expect(
      parseIdeSessionResponse({
        user: {
          id: "user-1",
          email: "admin@iteronix.test",
          role: "admin",
          enabled: true,
          bearer: "must-not-reach-the-ui",
        },
      }),
    ).toEqual({
      id: "user-1",
      email: "admin@iteronix.test",
      role: "admin",
      enabled: true,
    });
  });

  it("preserves the member session user role", () => {
    expect(
      parseIdeSessionResponse({
        user: {
          id: "user-2",
          email: "member@iteronix.test",
          role: "member",
          enabled: true,
        },
      }),
    ).toMatchObject({ role: "member" });
  });

  it("uses a credentialed backend session probe and treats 401 as unauthenticated", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });

    await expect(getIdeSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4001/auth/me", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("logs in with an HttpOnly session without creating an authorization header", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              email: "admin@iteronix.test",
              role: "admin",
              enabled: true,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });

    await expect(
      loginIdeSession({
        email: "admin@iteronix.test",
        password: "CorrectHorseBatteryStaple1",
      }),
    ).resolves.toMatchObject({
      email: "admin@iteronix.test",
      role: "admin",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4001/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@iteronix.test",
        password: "CorrectHorseBatteryStaple1",
      }),
    });
  });
});
