import { describe, expect, it } from "vitest";
import {
  readMetricBadgeClassName,
  readMetricIconClassName,
  readMetricValueClassName,
  readOverviewPanelClassName,
  readOverviewPanelHeaderClassName
} from "./OverviewPrimitives.js";

describe("OverviewPrimitives", () => {
  it("maps metric accents and tones to the shared dashboard styles", () => {
    expect(readMetricIconClassName("blue")).toContain("bg-blue-500/10");
    expect(readMetricIconClassName("emerald")).toContain("text-emerald-500");
    expect(readMetricBadgeClassName("positive")).toContain("text-emerald-400");
    expect(readMetricBadgeClassName("neutral")).toContain("text-text-secondary");
    expect(readMetricValueClassName("mono")).toContain("font-mono");
    expect(readMetricValueClassName("default")).not.toContain("font-mono");
  });

  it("keeps overview panel shells out of the dashboard screen", () => {
    expect(readOverviewPanelClassName("terminal")).toContain("min-h-[400px]");
    expect(readOverviewPanelClassName("default")).toContain("bg-gradient-to-br");
    expect(readOverviewPanelHeaderClassName("terminal")).toContain("border-b");
    expect(readOverviewPanelHeaderClassName("default")).toContain("mb-3");
  });
});
