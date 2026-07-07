import { describe, expect, it } from "vitest";

import {
  applyHistoryUrlPatch,
  readHistoryUrlState,
} from "./history-url-state.js";

describe("history url state", () => {
  it("reads selected kind, id and evidence source", () => {
    expect(
      readHistoryUrlState(
        "http://localhost/history?kind=eval&id=e1&source=source-1",
      ),
    ).toEqual({
      selectedKind: "eval",
      selectedId: "e1",
      selectedEvidenceSourceId: "source-1",
    });
  });

  it("rejects invalid kind", () => {
    expect(
      readHistoryUrlState("http://localhost/history?kind=bad&id=e1"),
    ).toEqual({
      selectedKind: null,
      selectedId: "e1",
      selectedEvidenceSourceId: null,
    });
  });

  it("applies patches on history route", () => {
    expect(
      applyHistoryUrlPatch("http://localhost/history?kind=run&id=r1", {
        selectedEvidenceSourceId: "s1",
      }),
    ).toBe("/history?kind=run&id=r1&source=s1");
  });
});
