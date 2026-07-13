import { describe, expect, it } from "vitest";
import {
  isWorkflowAuthenticationFailure,
  readWorkflowBootstrapDecision,
} from "./workflows-auth-bootstrap.js";

describe("workflow authentication bootstrap", () => {
  it("does not request settings before a local bearer token is configured", () => {
    expect(
      readWorkflowBootstrapDecision({
        serverUrl: "http://localhost:4001",
        authToken: "",
      }),
    ).toBe("configure");
  });

  it("routes 401 responses to the connection recovery state", () => {
    expect(isWorkflowAuthenticationFailure(new Error("Unauthorized"))).toBe(
      true,
    );
  });
});
