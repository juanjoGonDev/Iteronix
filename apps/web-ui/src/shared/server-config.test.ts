import { describe, expect, it } from "vitest";
import { readServerConnection } from "./server-config.js";

describe("server config", () => {
  it("routes the local web UI dev origin to the backend dev port by default", () => {
    const connection = readServerConnection(
      createMemoryStorage(),
      createLocation("http://localhost:4000")
    );

    expect(connection.serverUrl).toBe("http://localhost:4001");
    expect(connection.authToken).toBe("dev-token");
  });

  it("migrates a stored local web UI dev origin to the backend dev port", () => {
    const storage = createMemoryStorage({
      iteronix_server_url: "http://localhost:4000/",
      iteronix_auth_token: "custom-token"
    });

    const connection = readServerConnection(
      storage,
      createLocation("http://localhost:4000")
    );

    expect(connection.serverUrl).toBe("http://localhost:4001");
    expect(connection.authToken).toBe("custom-token");
  });

  it("keeps explicit remote values untouched", () => {
    const storage = createMemoryStorage({
      iteronix_server_url: "https://api.example.com/",
      iteronix_auth_token: "remote-token"
    });

    const connection = readServerConnection(
      storage,
      createLocation("https://app.example.com")
    );

    expect(connection.serverUrl).toBe("https://api.example.com");
    expect(connection.authToken).toBe("remote-token");
  });
});

const createMemoryStorage = (
  initialValues: Record<string, string> = {}
): Storage => {
  const values = new Map<string, string>(Object.entries(initialValues));

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
};

const createLocation = (origin: string): Pick<Location, "origin"> => ({
  origin
});
