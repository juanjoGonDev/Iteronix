import { describe, expect, it } from "vitest";
import "./index";

const SuiteName = "shared package";
const CaseName = "loads without errors";

describe(SuiteName, () => {
  it(CaseName, () => {
    expect(true).toBe(true);
  });
});
