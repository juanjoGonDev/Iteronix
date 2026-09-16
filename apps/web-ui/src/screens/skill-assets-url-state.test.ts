import { describe, expect, it } from "vitest";
import {
  SkillAssetsUrlMode,
  applySkillAssetsUrlPatch,
  readSkillAssetsUrlState,
} from "./skill-assets-url-state.js";

describe("skill assets URL state", () => {
  it("restores a selected skill editor from a deep link", () => {
    const url = applySkillAssetsUrlPatch("http://localhost/assets/skills", {
      mode: SkillAssetsUrlMode.Edit,
      skillId: "skill-support",
    });

    expect(url).toBe("/assets/skills?mode=edit&skill=skill-support");
    expect(readSkillAssetsUrlState(`http://localhost${url}`)).toEqual({
      mode: SkillAssetsUrlMode.Edit,
      skillId: "skill-support",
    });
  });

  it("falls back to the catalog for an editor deep link without a skill", () => {
    expect(
      readSkillAssetsUrlState("http://localhost/assets/skills?mode=edit"),
    ).toEqual({ mode: SkillAssetsUrlMode.Catalog, skillId: null });
  });
});
