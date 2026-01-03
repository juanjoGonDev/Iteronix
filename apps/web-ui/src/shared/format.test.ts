import { describe, expect, it } from "vitest";
import { buildLineNumbers, formatDuration, formatTime, normalizePath } from "./format";

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(1200)).toBe("1s");
    expect(formatDuration(42000)).toBe("42s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(61000)).toBe("1m 1s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });
});

describe("formatTime", () => {
  it("pads hours, minutes, and seconds", () => {
    const date = new Date(2020, 0, 1, 9, 5, 3);
    expect(formatTime(date)).toBe("09:05:03");
  });
});

describe("normalizePath", () => {
  it("trims trailing separators", () => {
    expect(normalizePath("/workspace/iteronix/")).toBe("/workspace/iteronix");
    expect(normalizePath("C:\\\\projects\\\\iteronix\\\\")).toBe("C:\\\\projects\\\\iteronix");
  });
});

describe("buildLineNumbers", () => {
  it("creates a numbered list", () => {
    expect(buildLineNumbers("a\nb\nc")).toBe("1\n2\n3");
  });
});
