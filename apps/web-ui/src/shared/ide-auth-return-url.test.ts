import { describe, expect, it } from "vitest";
import { sanitizeIdeAuthReturnUrl } from "./ide-auth-return-url.js";

describe("IDE auth return URLs", () => {
  it("retains an in-app Assets deep link with its route state", () => {
    expect(
      sanitizeIdeAuthReturnUrl(
        "/assets/prompts?dialog=create#details",
        "http://localhost:4000",
      ),
    ).toBe("/assets/prompts?dialog=create#details");
  });

  it("rejects foreign, protocol-relative, and malformed return URLs", () => {
    expect(
      sanitizeIdeAuthReturnUrl(
        "https://forged.example/assets",
        "http://localhost:4000",
      ),
    ).toBe("/workflows");
    expect(
      sanitizeIdeAuthReturnUrl(
        "//forged.example/assets",
        "http://localhost:4000",
      ),
    ).toBe("/workflows");
    expect(
      sanitizeIdeAuthReturnUrl("not a route", "http://localhost:4000"),
    ).toBe("/workflows");
  });
});
