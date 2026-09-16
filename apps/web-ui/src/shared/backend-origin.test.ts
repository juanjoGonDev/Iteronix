import { describe, expect, it } from "vitest";
import { readBackendOrigin } from "./backend-origin.js";

describe("backend origin", () => {
  it("uses the colocated origin outside local development", () => {
    expect(
      readBackendOrigin(createLocation("https://iteronix.example.com")),
    ).toBe("https://iteronix.example.com");
  });

  it("uses the local backend port only for the web development server", () => {
    expect(readBackendOrigin(createLocation("http://localhost:4000"))).toBe(
      "http://localhost:4001",
    );
  });
});

const createLocation = (origin: string): Pick<Location, "origin"> => ({
  origin,
});
