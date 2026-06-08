import { describe, expect, it } from "vitest";
import {
  createQualityGatesValidationFixture,
  encodeQualityGateProgressEvent
} from "./quality-gates-validation-fixture.js";

describe("quality gates browser validation fixture", () => {
  it("exposes a deterministic run progression for polling checks", () => {
    const fixture = createQualityGatesValidationFixture();

    expect(fixture.readRunsForPoll(0)).toEqual([fixture.runningRun]);
    expect(fixture.readRunsForPoll(1)).toEqual([fixture.runningRun]);
    expect(fixture.readRunsForPoll(2)).toEqual([fixture.completedRun]);
    expect(fixture.completedRun.passedCount).toBe(4);
    expect(fixture.completedRun.status).toBe("completed");
  });

  it("encodes streamed events with the quality-gates progress event name", () => {
    const fixture = createQualityGatesValidationFixture();
    const firstEvent = fixture.streamEvents[0];

    expect(firstEvent).toBeDefined();
    expect(encodeQualityGateProgressEvent(firstEvent!)).toContain(
      "event: quality-gates-progress"
    );
    expect(encodeQualityGateProgressEvent(firstEvent!)).toContain(
      '"text":"Running lint"'
    );
    expect(encodeQualityGateProgressEvent(firstEvent!)).toMatch(/\n\n$/u);
  });
});
