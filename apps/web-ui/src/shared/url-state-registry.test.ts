import { describe, expect, it } from "vitest";

import { ROUTES } from "./constants.js";
import {
  listUrlStateRoutePolicies,
  validateUrlStateRegistryCoverage,
} from "./url-state-registry.js";

describe("url state registry", () => {
  it("documents every application route with an explicit URL-state decision", () => {
    expect(validateUrlStateRegistryCoverage()).toEqual([]);
    expect(listUrlStateRoutePolicies().map((policy) => policy.route)).toEqual([
      ROUTES.WORKFLOWS,
      ROUTES.WORKFLOW_EDITOR,
      ROUTES.PROMPT_ASSETS,
      ROUTES.SETTINGS,
    ]);
  });

  it("keeps sensitive parameter names out of every allowed route policy", () => {
    for (const policy of listUrlStateRoutePolicies()) {
      expect(policy.allowedParams).not.toContain("token");
      expect(policy.allowedParams).not.toContain("apiKey");
      expect(policy.allowedParams).not.toContain("secret");
      expect(policy.allowedParams).not.toContain("password");
      expect(policy.forbiddenState).toContain("secrets");
    }
  });
});
