import { describe, expect, it } from "vitest";
import {
  isWorkflowAuthenticationFailure,
  readWorkflowBootstrapDecision,
} from "./workflows-auth-bootstrap.js";

describe("workflow authentication bootstrap", () => {
  it("loads settings through the colocated backend without a local bearer token", () => {
    expect(
      readWorkflowBootstrapDecision({
        serverUrl: "http://localhost:4001",
        authToken: "",
      }),
    ).toBe("load");
  });

  it("routes 401 responses to the connection recovery state", () => {
    expect(isWorkflowAuthenticationFailure(new Error("Unauthorized"))).toBe(
      true,
    );
  });
});
